import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import { BuiltInTool } from './BuiltInTool.js';

export class ListDirectoryTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'list_directory',
    description: 'List direct children in a workspace directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  };
  constructor(
    private readonly guard: WorkspacePathGuard,
    private readonly reader: WorkspaceReader,
  ) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    const path = await this.guard.resolve(
      workspaceId,
      call.arguments.path === undefined ? '.' : this.stringArgument(call, 'path'),
      'Read',
      cancellation,
    );
    return this.ready(call, workspaceId, [{ access: 'Read', path }]);
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const path = prepared.paths[0]?.path;
    if (!path) throw new Error('Missing prepared path');
    return this.success(
      prepared.call,
      (await this.reader.list(path, cancellation))
        .map((entry) => `${entry.kind}\t${entry.name}`)
        .join('\n'),
    );
  }
}
