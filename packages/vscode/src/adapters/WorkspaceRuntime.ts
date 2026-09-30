import type { AgentEventSink } from '../../../core/src/agents/AgentEventSink.js';
import type { AgentMode } from '../../../core/src/agents/AgentMode.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import { HookPipeline } from '../../../core/src/hooks/HookPipeline.js';
import type { Guardrail } from '../../../core/src/permissions/Guardrail.js';
import type { ApprovalPort } from '../../../core/src/permissions/ApprovalPort.js';
import { GuardrailEvaluator } from '../../../core/src/permissions/GuardrailEvaluator.js';
import { ProtectedPathGuardrail } from '../../../core/src/permissions/ProtectedPathGuardrail.js';
import { DefaultToolRuntime } from '../../../core/src/tools/DefaultToolRuntime.js';
import { ToolRegistry } from '../../../core/src/tools/ToolRegistry.js';
import type { ToolRuntime } from '../../../core/src/tools/ToolRuntime.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import { StdioMcpClient } from '../../../mcp/src/StdioMcpClient.js';
import { EditFileTool } from '../tools/EditFileTool.js';
import { GetGitDiffTool } from '../tools/GetGitDiffTool.js';
import { ListDirectoryTool } from '../tools/ListDirectoryTool.js';
import { ReadFileTool } from '../tools/ReadFileTool.js';
import { RunCommandTool } from '../tools/RunCommandTool.js';
import { SearchFilesTool } from '../tools/SearchFilesTool.js';
import { WriteFileTool } from '../tools/WriteFileTool.js';
import { CommandHook } from './CommandHook.js';
import { NodeGitReader } from './NodeGitReader.js';
import { NodeProcessRunner } from './NodeProcessRunner.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';
import { NodeWorkspaceSearch } from './NodeWorkspaceSearch.js';
import { VsCodeWorkspaceReader } from './VsCodeWorkspaceReader.js';
import { VsCodeWorkspaceWriter } from './VsCodeWorkspaceWriter.js';
import { WorkspaceConfigurationLoader } from './WorkspaceConfigurationLoader.js';

export class WorkspaceRuntime implements ToolRuntime {
  private readonly registry = new ToolRegistry();
  private readonly mcp = new StdioMcpClient();
  private readonly runner: NodeProcessRunner;
  private readonly loader: WorkspaceConfigurationLoader;
  private runtime: DefaultToolRuntime;
  private mcpHash: string | null = null;
  private hooksHash: string | null = null;
  private serverKeys: Readonly<Record<string, string>> = {};
  private mcpNames: readonly string[] = [];
  private executing = false;
  constructor(
    private readonly root: string,
    private readonly approval: ApprovalPort,
    private readonly events: AgentEventSink,
    private readonly extraGuardrails: readonly Guardrail[] = [],
  ) {
    const guard = new NodeWorkspacePathGuard(root),
      reader = new VsCodeWorkspaceReader(guard),
      writer = new VsCodeWorkspaceWriter(guard);
    this.runner = new NodeProcessRunner(root);
    this.loader = new WorkspaceConfigurationLoader(root, guard);
    for (const tool of [
      new ReadFileTool(guard, reader),
      new ListDirectoryTool(guard, reader),
      new SearchFilesTool(new NodeWorkspaceSearch(guard)),
      new GetGitDiffTool(new NodeGitReader(this.runner, guard), guard),
      new WriteFileTool(guard, reader, writer),
      new EditFileTool(guard, reader, writer),
      new RunCommandTool(guard, this.runner),
    ])
      this.registry.register(tool);
    this.runtime = this.compose(new HookPipeline());
  }
  /** Called once while idle at each run start; never from inside a run or tool call. */
  async initialize(cancellation: CancellationToken): Promise<void> {
    if (this.executing) throw new Error('Cannot reload configuration during execution');
    try {
      const config = await this.loader.load(cancellation);
      const hooksChanged = this.hooksHash !== config.hooksHash;
      const keys = Object.fromEntries(
        Object.entries(config.mcp.servers).map(([id, server]) => [id, JSON.stringify(server)]),
      );
      const changedServers = [
        ...new Set([...Object.keys(this.serverKeys), ...Object.keys(keys)]),
      ].filter((id) => this.serverKeys[id] !== keys[id]);
      // The client reconciles only changed/removed/dead servers; unchanged sessions stay alive.
      const tools = await this.mcp.start(this.root, config.mcp, this.events, cancellation);
      for (const name of this.mcpNames) this.registry.unregister(name);
      for (const tool of tools) this.registry.register(tool);
      this.mcpNames = tools.map((tool) => tool.definition.name);
      if (hooksChanged)
        this.runtime = this.compose(
          new HookPipeline(
            config.hooks.BeforeToolExecution.map(
              (hook) => new CommandHook(hook, this.runner, this.root),
            ),
            config.hooks.AfterToolExecution.map(
              (hook) => new CommandHook(hook, this.runner, this.root),
            ),
          ),
        );
      if (config.mcpHash !== this.mcpHash || hooksChanged)
        this.events.emit({ type: 'ConfigurationReloaded', changedServers, hooksChanged });
      this.mcpHash = config.mcpHash;
      this.hooksHash = config.hooksHash;
      this.serverKeys = keys;
    } catch (failure) {
      cancellation.throwIfCancellationRequested();
      this.events.emit({
        type: 'ErrorOccurred',
        code: 'InvalidConfiguration',
        message: failure instanceof Error ? failure.message : 'Configuration could not be loaded',
        recoverable: true,
      });
      throw failure;
    }
  }
  definitions(mode: AgentMode): readonly ToolDefinition[] {
    return this.runtime.definitions(mode);
  }
  async execute(
    call: ToolCall,
    mode: AgentMode,
    commandAllowlist: readonly string[],
    cancellation: CancellationToken,
    events: AgentEventSink,
    runId: string,
  ): Promise<ToolResult> {
    if (this.executing) throw new Error('Tool execution is sequential');
    this.executing = true;
    try {
      return await this.runtime.execute(call, mode, commandAllowlist, cancellation, events, runId);
    } finally {
      this.executing = false;
    }
  }
  async dispose(): Promise<void> {
    await this.mcp.stop();
  }
  private compose(hooks: HookPipeline): DefaultToolRuntime {
    return new DefaultToolRuntime(
      this.root,
      this.registry,
      this.approval,
      hooks,
      new GuardrailEvaluator([new ProtectedPathGuardrail(), ...this.extraGuardrails]),
    );
  }
}
