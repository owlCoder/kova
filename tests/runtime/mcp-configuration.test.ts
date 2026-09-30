import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StdioMcpClient } from '../../packages/mcp/src/StdioMcpClient.js';
import { WorkspaceConfigurationLoader } from '../../packages/vscode/src/adapters/WorkspaceConfigurationLoader.js';
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { CancellationSource, EventLog } from './helpers.js';
const fixture = fileURLToPath(new URL('./fixtures/mcp-server.mjs', import.meta.url));
const config = (args: readonly string[] = [fixture]) => ({
  transport: 'stdio' as const,
  command: process.execPath,
  args,
});
let root: string, client: StdioMcpClient;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kova-mcp-'));
  client = new StdioMcpClient();
});
afterEach(async () => {
  await client.stop();
  await rm(root, { recursive: true, force: true });
});

describe('real stdio MCP adapter', () => {
  it('discovers tools from a legacy stdio server, ignores readOnlyHint and executes through Tool', async () => {
    const log = new EventLog(),
      cancel = new CancellationSource();
    const tools = await client.start(root, { servers: { fixture: config() } }, log, cancel);
    expect(tools).toHaveLength(2);
    expect(tools[0]?.definition.risk).toBe('ProcessExecution');
    expect(log.events).toContainEqual(
      expect.objectContaining({
        type: 'McpServerStarted',
        serverId: 'fixture',
        command: process.execPath,
      }),
    );
    const tool = tools[0];
    if (!tool) throw new Error('no tool');
    const prepared = await tool.prepare(
      { id: 'call', name: tool.definition.name, arguments: { text: 'hello' } },
      root,
      cancel,
    );
    if (prepared.status !== 'Ready') throw new Error('prepare');
    expect((await tool.execute(prepared.prepared, cancel)).output).toBe('hello');
    expect(log.events).toContainEqual(
      expect.objectContaining({ type: 'McpToolCalled', toolName: 'echo' }),
    );
  });
  it('permits only explicitly configured risk overrides and surfaces remote tool errors', async () => {
    const cancel = new CancellationSource(),
      tools = await client.start(
        root,
        { servers: { fixture: { ...config(), toolRisks: { echo: 'ReadOnly' } } } },
        new EventLog(),
        cancel,
      );
    expect(tools[0]?.definition.risk).toBe('ReadOnly');
    const tool = tools[1];
    if (!tool) throw new Error('no tool');
    const prepared = await tool.prepare(
      { id: 'call', name: tool.definition.name, arguments: {} },
      root,
      cancel,
    );
    if (prepared.status !== 'Ready') throw new Error('prepare');
    expect((await tool.execute(prepared.prepared, cancel)).error?.code).toBe('McpToolError');
  });
  it('reuses unchanged servers, restarts only changed servers, and stops removed ones', async () => {
    const log = new EventLog(),
      cancel = new CancellationSource();
    const original = await client.start(
      root,
      { servers: { a: config(), b: config() } },
      log,
      cancel,
    );
    const again = await client.start(root, { servers: { a: config(), b: config() } }, log, cancel);
    expect(again[0]).toBe(original[0]);
    expect(again[2]).toBe(original[2]);
    const changed = await client.start(
      root,
      { servers: { a: config([fixture, 'changed']), b: config() } },
      log,
      cancel,
    );
    expect(changed[0]).toBe(original[2]); // insertion order: unchanged b survives, new a follows
    expect(
      log.events.filter((event) => event.type === 'McpServerStarted' && event.serverId === 'a'),
    ).toHaveLength(2);
    expect(
      log.events.filter((event) => event.type === 'McpServerStarted' && event.serverId === 'b'),
    ).toHaveLength(1);
    await client.start(root, { servers: { b: config() } }, log, cancel);
    expect(log.events).toContainEqual(
      expect.objectContaining({
        type: 'McpServerStopped',
        serverId: 'a',
        reason: 'Configuration removed',
      }),
    );
  });
  it('refreshes tools only at the next start without restarting the server', async () => {
    const marker = join(root, 'extra-tool'),
      log = new EventLog(),
      cancel = new CancellationSource();
    const configuration = { servers: { fixture: config([fixture, 'dynamic', marker]) } };
    const original = await client.start(root, configuration, log, cancel);
    expect(original).toHaveLength(2);
    await writeFile(marker, 'extra');
    const refreshed = await client.start(root, configuration, log, cancel);
    expect(refreshed).toHaveLength(3);
    expect(refreshed[0]).toBe(original[0]);
    expect(log.events.filter((event) => event.type === 'McpServerStarted')).toHaveLength(1);
  });
  it('rejects tool discovery beyond the 64 total limit visibly', async () => {
    const log = new EventLog();
    expect(
      await client.start(
        root,
        { servers: { fixture: config([fixture, 'overflow']) } },
        log,
        new CancellationSource(),
      ),
    ).toEqual([]);
    expect(log.events).toContainEqual(
      expect.objectContaining({ type: 'ErrorOccurred', code: 'McpServerFailed' }),
    );
  });
  it('reports an unreachable server while keeping other configured servers available', async () => {
    const log = new EventLog();
    const tools = await client.start(
      root,
      {
        servers: {
          bad: { transport: 'stdio', command: '/missing/executable', args: [] },
          good: config(),
        },
      },
      log,
      new CancellationSource(),
    );
    expect(tools).toHaveLength(2);
    expect(log.events).toContainEqual(
      expect.objectContaining({ type: 'ErrorOccurred', code: 'McpServerFailed' }),
    );
  });
});

describe('MCP and hook configuration loader', () => {
  it('hashes both files and validates only stdio with explicit timeout hooks', async () => {
    await mkdir(join(root, '.kova'));
    const loader = new WorkspaceConfigurationLoader(root, new NodeWorkspacePathGuard(root));
    const first = await loader.load(new CancellationSource());
    await writeFile(join(root, '.kova/mcp.json'), JSON.stringify({ servers: { demo: config() } }));
    await writeFile(
      join(root, '.kova/hooks.json'),
      JSON.stringify({
        BeforeToolExecution: [{ id: 'hook', command: 'node', args: [], timeoutMs: 100 }],
      }),
    );
    const changed = await loader.load(new CancellationSource());
    expect(changed.mcpHash).not.toBe(first.mcpHash);
    expect(changed.hooksHash).not.toBe(first.hooksHash);
    expect(changed.hooks.BeforeToolExecution[0]?.timeoutMs).toBe(100);
    const same = await loader.load(new CancellationSource());
    expect(same.mcpHash).toBe(changed.mcpHash);
    expect(same.hooksHash).toBe(changed.hooksHash);
  });
  it('rejects hook configurations without timeout and unsupported transports', async () => {
    await mkdir(join(root, '.kova'));
    const loader = new WorkspaceConfigurationLoader(root, new NodeWorkspacePathGuard(root));
    await writeFile(
      join(root, '.kova/hooks.json'),
      JSON.stringify({ BeforeToolExecution: [{ id: 'hook', command: 'node', args: [] }] }),
    );
    await expect(loader.load(new CancellationSource())).rejects.toThrow('timeout');
    await writeFile(join(root, '.kova/hooks.json'), '{}');
    await writeFile(
      join(root, '.kova/mcp.json'),
      JSON.stringify({ servers: { remote: { transport: 'http', command: 'node', args: [] } } }),
    );
    await expect(loader.load(new CancellationSource())).rejects.toThrow('stdio');
  });
});
