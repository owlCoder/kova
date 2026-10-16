import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import type { WorkspaceWriter } from '../../../core/src/workspace/WorkspaceWriter.js';
import { BuiltInTool } from './BuiltInTool.js';

export class EditFileTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'edit_file',
    description:
      'Replace one exact nonempty old_string in a workspace file. Zero or multiple matches leave the file unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', minLength: 1 },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
    risk: 'WorkspaceWrite',
    origin: { kind: 'BuiltIn' },
  };
  constructor(
    private readonly guard: WorkspacePathGuard,
    private readonly reader: WorkspaceReader,
    private readonly writer: WorkspaceWriter,
  ) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    const oldString = this.stringArgument(call, 'old_string'),
      newString = this.stringArgument(call, 'new_string', true);
    const path = await this.guard.resolve(
      workspaceId,
      this.stringArgument(call, 'path'),
      'Write',
      cancellation,
    );
    if (!path.exists)
      return {
        status: 'Error',
        result: this.error(call, 'FileNotFound', 'edit_file requires an existing file'),
      };
    const before = await this.reader.read(path, null, cancellation);
    let matchCount = 0,
      offset = 0;
    for (;;) {
      const index = before.content.indexOf(oldString, offset);
      if (index < 0) break;
      matchCount++;
      offset = index + 1;
    }
    if (matchCount !== 1)
      return {
        status: 'Error',
        result: this.error(
          call,
          'EditMatchCount',
          `old_string matched ${matchCount} locations; provide enough surrounding context to match exactly once`,
          { matchCount },
        ),
      };
    const afterContent = before.content.replace(oldString, () => newString);
    return this.ready(call, workspaceId, [{ access: 'Write', path }], {
      kind: 'FileChanges',
      changes: [
        {
          relativePath: path.relativePath,
          operation: 'Replace',
          beforeContent: before.content,
          afterContent,
          expectedVersion: before.version,
        },
      ],
    });
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const path = prepared.paths[0]?.path,
      change = prepared.preview?.kind === 'FileChanges' ? prepared.preview.changes[0] : null;
    if (!path || !change) throw new Error('Missing edit preview');
    const result = await this.writer.replace(
      path,
      change.afterContent,
      change.expectedVersion,
      cancellation,
    );
    return result.status === 'Error'
      ? this.error(prepared.call, result.code, result.message)
      : this.success(prepared.call, `Edited ${path.relativePath}`);
  }
}
