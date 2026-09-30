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

export class WriteFileTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'write_file',
    description:
      'Create or replace a workspace file after preview and optimistic concurrency checks.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
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
    const content = this.stringArgument(call, 'content', true);
    const path = await this.guard.resolve(
      workspaceId,
      this.stringArgument(call, 'path'),
      'Write',
      cancellation,
    );
    const before = path.exists ? await this.reader.read(path, null, cancellation) : null;
    return this.ready(call, workspaceId, [{ access: 'Write', path }], {
      kind: 'FileChanges',
      changes: [
        {
          relativePath: path.relativePath,
          operation: path.exists ? 'Replace' : 'Create',
          beforeContent: before?.content ?? null,
          afterContent: content,
          expectedVersion: before?.version ?? null,
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
    if (!path || !change) throw new Error('Missing write preview');
    const result = await this.writer.replace(
      path,
      change.afterContent,
      change.expectedVersion,
      cancellation,
    );
    return result.status === 'Error'
      ? this.error(prepared.call, result.code, result.message)
      : this.success(prepared.call, `Wrote ${path.relativePath}`);
  }
}
