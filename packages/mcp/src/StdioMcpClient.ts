import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { AgentEventSink } from '../../core/src/agents/AgentEventSink.js';
import type { CancellationToken } from '../../core/src/common/CancellationToken.js';
import type { JsonObject } from '../../core/src/common/JsonValue.js';
import type { McpClient } from '../../core/src/mcp/McpClient.js';
import type {
  McpConfiguration,
  McpServerConfiguration,
} from '../../core/src/mcp/McpConfiguration.js';
import type { Tool } from '../../core/src/tools/Tool.js';
import { McpTool } from './McpTool.js';

export class StdioMcpClient implements McpClient {
  private readonly servers = new Map<
    string,
    {
      key: string;
      client: Client;
      transport: StdioClientTransport;
      tools: readonly Tool[];
      alive: boolean;
      events: AgentEventSink;
    }
  >();
  async start(
    workspaceId: string,
    configuration: McpConfiguration,
    events: AgentEventSink,
    cancellation: CancellationToken,
  ): Promise<readonly Tool[]> {
    for (const [id, running] of this.servers) {
      const config = configuration.servers[id];
      if (!config || running.key !== JSON.stringify(config) || !running.alive)
        await this.stopServer(id, config ? 'Configuration changed' : 'Configuration removed');
    }
    for (const [serverId, config] of Object.entries(configuration.servers)) {
      cancellation.throwIfCancellationRequested();
      const existing = this.servers.get(serverId);
      if (existing) {
        try {
          existing.tools = await this.discover(
            serverId,
            config,
            existing.client,
            events,
            cancellation,
            existing.tools,
          );
        } catch {
          cancellation.throwIfCancellationRequested();
          await this.stopServer(serverId, 'Tool discovery refresh failed');
          events.emit({
            type: 'ErrorOccurred',
            code: 'McpServerFailed',
            message: `MCP ${serverId} failed to refresh its tool list`,
            recoverable: true,
          });
        }
        continue;
      }
      const client = new Client({ name: 'kova', version: '0.1.0' }, { capabilities: {} });
      const transport = new StdioClientTransport({
        command: config.command,
        args: [...config.args],
        cwd: workspaceId,
        stderr: 'pipe',
        maxBufferSize: 2 * 1024 * 1024,
      });
      // Drain stderr, without logging possible secrets or full result contents.
      transport.stderr?.on('data', () => {});
      const abort = new AbortController(),
        subscription = cancellation.onCancellationRequested(() => {
          abort.abort();
          void client.close();
        });
      try {
        await client.connect(transport, { signal: abort.signal, timeout: 15000 });
        const tools = await this.discover(serverId, config, client, events, cancellation);
        const state = {
          key: JSON.stringify(config),
          client,
          transport,
          tools,
          alive: true,
          events,
        };
        this.servers.set(serverId, state);
        client.onclose = () => {
          state.alive = false;
          events.emit({ type: 'McpServerStopped', serverId, reason: 'Server connection closed' });
        };
        events.emit({
          type: 'McpServerStarted',
          serverId,
          command: config.command,
          args: config.args,
        });
      } catch {
        await client.close().catch(() => {});
        await transport.close().catch(() => {});
        if (cancellation.isCancellationRequested) cancellation.throwIfCancellationRequested();
        events.emit({
          type: 'ErrorOccurred',
          code: 'McpServerFailed',
          message: `MCP ${serverId} failed to start or list tools`,
          recoverable: true,
        });
      } finally {
        subscription.dispose();
      }
    }
    return [...this.servers.values()]
      .filter((server) => server.alive)
      .flatMap((server) => server.tools);
  }
  async stop(): Promise<void> {
    for (const id of this.servers.keys()) await this.stopServer(id, 'Workspace closed');
  }
  private async discover(
    serverId: string,
    config: McpServerConfiguration,
    client: Client,
    events: AgentEventSink,
    cancellation: CancellationToken,
    previous: readonly Tool[] = [],
  ): Promise<readonly Tool[]> {
    const abort = new AbortController(),
      subscription = cancellation.onCancellationRequested(() => abort.abort());
    const deadline = setTimeout(() => abort.abort(), 30000);
    deadline.unref();
    const tools: Tool[] = [],
      seenCursors = new Set<string>();
    let cursor: string | undefined;
    try {
      do {
        // Use one protocol page per request so tool/page bounds apply before SDK aggregation.
        const listed = await client.request(
          { method: 'tools/list', params: cursor ? { cursor } : {} },
          { signal: abort.signal, timeout: 15000 },
        );
        for (const remote of listed.tools) {
          const name = `mcp__${serverId}__${remote.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          if (
            name.length > 128 ||
            JSON.stringify(remote.inputSchema).length > 32768 ||
            (remote.description?.length ?? 0) > 4000
          )
            throw new Error('MCP tool definition exceeds the size limit');
          if (tools.some((tool) => tool.definition.name === name))
            throw new Error('MCP tool names collide after normalization');
          const definition = {
            name,
            description: remote.description ?? `MCP tool ${remote.name}`,
            inputSchema: JSON.parse(JSON.stringify(remote.inputSchema)) as JsonObject,
            risk: config.toolRisks?.[remote.name] ?? 'ProcessExecution',
            origin: { kind: 'Mcp' as const, serverId, remoteName: remote.name },
          };
          const old = previous.find(
            (tool) => JSON.stringify(tool.definition) === JSON.stringify(definition),
          );
          tools.push(old ?? new McpTool(definition, client, events, remote));
        }
        cursor = listed.nextCursor;
        const otherCount = [...this.servers.entries()]
          .filter(([id]) => id !== serverId)
          .reduce((sum, [, server]) => sum + server.tools.length, 0);
        if (tools.length + otherCount > 64 || seenCursors.size >= 64)
          throw new Error('MCP discovery exceeds the tool/page limit');
        if (cursor) {
          if (seenCursors.has(cursor)) throw new Error('MCP pagination repeats a cursor');
          seenCursors.add(cursor);
        }
      } while (cursor);
      return tools;
    } finally {
      clearTimeout(deadline);
      subscription.dispose();
    }
  }
  private async stopServer(id: string, reason: string): Promise<void> {
    const state = this.servers.get(id);
    if (!state) return;
    this.servers.delete(id);
    state.client.onclose = () => {};
    await state.client.close().catch(() => {});
    await state.transport.close().catch(() => {});
    state.events.emit({ type: 'McpServerStopped', serverId: id, reason });
  }
}
