import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { GitReader } from '../../../core/src/workspace/GitReader.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import { BuiltInTool } from './BuiltInTool.js';

export class GetGitDiffTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'get_git_diff',
    description: 'Read workspace Git diff, optionally staged and scoped to a file.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, staged: { type: 'boolean' } },
      required: [],
      additionalProperties: false,
    },
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  };
  constructor(
    private readonly git: GitReader,
    private readonly guard: WorkspacePathGuard,
  ) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    if (call.arguments.staged !== undefined && typeof call.arguments.staged !== 'boolean')
      throw new Error('staged must be boolean');
    const path =
      call.arguments.path === undefined
        ? null
        : await this.guard.resolve(
            workspaceId,
            this.stringArgument(call, 'path'),
            'Read',
            cancellation,
          );
    return this.ready(call, workspaceId, path ? [{ access: 'Read', path }] : []);
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    return this.success(
      prepared.call,
      await this.git.diff(
        prepared.workspaceId,
        prepared.call.arguments.staged === true,
        typeof prepared.call.arguments.path === 'string' ? prepared.call.arguments.path : null,
        cancellation,
      ),
    );
  }
}
