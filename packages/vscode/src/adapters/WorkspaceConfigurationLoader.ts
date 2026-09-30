import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { HookCommand, HookConfiguration } from '../../../core/src/hooks/HookConfiguration.js';
import type {
  McpConfiguration,
  McpServerConfiguration,
} from '../../../core/src/mcp/McpConfiguration.js';
import type { RiskLevel } from '../../../core/src/permissions/RiskLevel.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

export class WorkspaceConfigurationLoader {
  constructor(
    private readonly root: string,
    private readonly guard: NodeWorkspacePathGuard,
  ) {}
  async load(cancellation: CancellationToken): Promise<{
    mcpHash: string;
    hooksHash: string;
    mcp: McpConfiguration;
    hooks: HookConfiguration;
  }> {
    const mcpText = await this.text('.kova/mcp.json', cancellation),
      hooksText = await this.text('.kova/hooks.json', cancellation);
    return {
      mcpHash: createHash('sha256').update(mcpText).digest('hex'),
      hooksHash: createHash('sha256').update(hooksText).digest('hex'),
      mcp: this.mcp(mcpText),
      hooks: this.hooks(hooksText),
    };
  }
  private async text(name: string, cancellation: CancellationToken): Promise<string> {
    const path = await this.guard.resolve(this.root, name, 'Write', cancellation);
    if (!path.exists) return '';
    const information = await stat(path.canonicalPath);
    if (!information.isFile() || information.size > 100000)
      throw new Error(`${name} exceeds configuration size limit or is not a file`);
    const text = await readFile(path.canonicalPath, 'utf8');
    if (text.length > 100000) throw new Error(`${name} exceeds configuration size limit`);
    return text;
  }
  private parse(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Configuration contains invalid JSON');
    }
  }
  private object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Configuration must be a JSON object');
    return value as Record<string, unknown>;
  }
  private mcp(text: string): McpConfiguration {
    if (!text) return { servers: {} };
    const object = this.object(this.parse(text)),
      servers = this.object(object.servers),
      parsed: Record<string, McpServerConfiguration> = {};
    if (Object.keys(servers).length > 8) throw new Error('MCP configuration exceeds 8 servers');
    for (const [id, value] of Object.entries(servers)) {
      const server = this.object(value);
      if (
        !/^[a-zA-Z0-9_-]+$/.test(id) ||
        server.transport !== 'stdio' ||
        typeof server.command !== 'string' ||
        !server.command ||
        server.command.length > 4096 ||
        !Array.isArray(server.args) ||
        server.args.length > 64 ||
        !server.args.every((arg) => typeof arg === 'string' && arg.length <= 4096)
      )
        throw new Error(`Invalid stdio MCP configuration: ${id}`);
      const toolRisks: Record<string, RiskLevel> = {};
      if (server.toolRisks !== undefined)
        for (const [tool, risk] of Object.entries(this.object(server.toolRisks))) {
          if (
            !['ReadOnly', 'WorkspaceWrite', 'ProcessExecution', 'Destructive'].includes(
              String(risk),
            )
          )
            throw new Error(`Invalid tool risk: ${id}/${tool}`);
          toolRisks[tool] = risk as RiskLevel;
        }
      parsed[id] = {
        transport: 'stdio',
        command: server.command,
        args: server.args as string[],
        ...(server.toolRisks !== undefined ? { toolRisks } : {}),
      };
    }
    return { servers: parsed };
  }
  private hooks(text: string): HookConfiguration {
    if (!text) return { BeforeToolExecution: [], AfterToolExecution: [] };
    const object = this.object(this.parse(text));
    const parse = (event: string): readonly HookCommand[] => {
      const entries = object[event] ?? [];
      if (!Array.isArray(entries) || entries.length > 20)
        throw new Error(`Invalid hooks: ${event}`);
      const ids = new Set<string>();
      return entries.map((entry: unknown) => {
        const hook = this.object(entry);
        if (
          typeof hook.id !== 'string' ||
          !hook.id ||
          ids.has(hook.id) ||
          typeof hook.command !== 'string' ||
          !hook.command ||
          !Array.isArray(hook.args) ||
          !hook.args.every((arg) => typeof arg === 'string') ||
          typeof hook.timeoutMs !== 'number' ||
          !Number.isInteger(hook.timeoutMs) ||
          hook.timeoutMs < 1 ||
          hook.timeoutMs > 30000
        )
          throw new Error(`Invalid hook with required timeout: ${event}`);
        ids.add(hook.id);
        return {
          id: hook.id,
          command: hook.command,
          args: hook.args as string[],
          timeoutMs: hook.timeoutMs,
        };
      });
    };
    return {
      BeforeToolExecution: parse('BeforeToolExecution'),
      AfterToolExecution: parse('AfterToolExecution'),
    };
  }
}
