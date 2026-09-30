import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => ({}));
import { WorkspaceRuntime } from '../../packages/vscode/src/adapters/WorkspaceRuntime.js';
import type { ApprovalPort } from '../../packages/core/src/permissions/ApprovalPort.js';
import { CancellationSource, EventLog } from './helpers.js';
let root: string, runtime: WorkspaceRuntime, log: EventLog;
const cancel = new CancellationSource();
const approval: ApprovalPort = {
  request: async (request) => ({
    approvalId: request.approvalId,
    preparationKey: request.preparationKey,
    decision: 'AllowOnce',
  }),
};
const fixture = fileURLToPath(new URL('./fixtures/mcp-server.mjs', import.meta.url));
const server = (suffix?: string) => ({
  transport: 'stdio',
  command: process.execPath,
  args: [fixture, ...(suffix ? [suffix] : [])],
});
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kova-reload-'));
  await mkdir(join(root, '.kova'));
  log = new EventLog();
  runtime = new WorkspaceRuntime(root, approval, log);
});
afterEach(async () => {
  await runtime.dispose();
  await rm(root, { recursive: true, force: true });
});

describe('configuration has an idle run-start effective point', () => {
  it('emits a visible reload row only when either loaded hash changes', async () => {
    await runtime.initialize(cancel);
    const rows = () => log.events.filter((event) => event.type === 'ConfigurationReloaded');
    expect(rows()).toHaveLength(1);
    await runtime.initialize(cancel);
    expect(rows()).toHaveLength(1);
    await writeFile(join(root, '.kova/hooks.json'), '{}');
    await runtime.initialize(cancel);
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toMatchObject({ changedServers: [], hooksChanged: true });
  });
  it('hook-only changes keep MCP servers alive and changed server config restarts only that server', async () => {
    await writeFile(
      join(root, '.kova/mcp.json'),
      JSON.stringify({ servers: { a: server(), b: server() } }),
    );
    await runtime.initialize(cancel);
    const a = runtime.definitions('Manual').find((tool) => tool.name === 'mcp__a__echo'),
      b = runtime.definitions('Manual').find((tool) => tool.name === 'mcp__b__echo');
    await writeFile(join(root, '.kova/hooks.json'), '{}');
    await runtime.initialize(cancel);
    expect(runtime.definitions('Manual').find((tool) => tool.name === 'mcp__a__echo')).toBe(a);
    await writeFile(
      join(root, '.kova/mcp.json'),
      JSON.stringify({ servers: { a: server('changed'), b: server() } }),
    );
    await runtime.initialize(cancel);
    expect(runtime.definitions('Manual').find((tool) => tool.name === 'mcp__b__echo')).toBe(b);
    expect(
      log.events.filter((event) => event.type === 'McpServerStarted' && event.serverId === 'a'),
    ).toHaveLength(2);
    expect(
      log.events.filter((event) => event.type === 'McpServerStarted' && event.serverId === 'b'),
    ).toHaveLength(1);
    expect(log.events).toContainEqual({
      type: 'ConfigurationReloaded',
      changedServers: ['a'],
      hooksChanged: false,
    });
  });
  it('never reloads during execution, and applies changed hooks at the next idle start', async () => {
    await runtime.initialize(cancel);
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const command = `"${process.execPath}" -e "setTimeout(()=>{},150)"`;
    const execution = runtime.execute(
      { id: 'c', name: 'run_command', arguments: { command } },
      'Auto',
      [command],
      cancel,
      {
        emit: (event) => {
          log.emit(event);
          if (event.type === 'ToolStarted') started();
        },
      },
      'run',
    );
    await ready;
    await writeFile(
      join(root, '.kova/hooks.json'),
      JSON.stringify({
        BeforeToolExecution: [
          {
            id: 'new-hook',
            command: process.execPath,
            args: ['-e', "console.log(JSON.stringify({decision:'veto',message:'new config'}))"],
            timeoutMs: 1000,
          },
        ],
      }),
    );
    await expect(runtime.initialize(cancel)).rejects.toThrow('during execution');
    expect((await execution).status).toBe('Success');
    await runtime.initialize(cancel);
    expect(
      (
        await runtime.execute(
          { id: 'c2', name: 'list_directory', arguments: {} },
          'Auto',
          [],
          cancel,
          log,
          'next-run',
        )
      ).status,
    ).toBe('Blocked');
    expect(log.events).toContainEqual(
      expect.objectContaining({
        type: 'HookObserved',
        report: expect.objectContaining({ hookId: 'new-hook', message: 'new config' }),
      }),
    );
  });
  it('rejects invalid changed configuration visibly before the run', async () => {
    await runtime.initialize(cancel);
    await writeFile(join(root, '.kova/hooks.json'), '{secret');
    await expect(runtime.initialize(cancel)).rejects.toThrow('invalid JSON');
    expect(log.events).toContainEqual(
      expect.objectContaining({
        type: 'ErrorOccurred',
        code: 'InvalidConfiguration',
        message: 'Configuration contains invalid JSON',
      }),
    );
  });
});
