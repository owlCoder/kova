import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import { BuiltInTool } from './BuiltInTool.js';

export class ReadFileTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'read_file',
    description: 'Read a workspace file, optionally narrowing to a one-based line range.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
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
    this.range(call);
    const path = await this.guard.resolve(
      workspaceId,
      this.stringArgument(call, 'path'),
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
    const result = await this.reader.read(path, this.range(prepared.call), cancellation);
    return this.success(prepared.call, result.content);
  }
  private range(call: ToolCall): { startLine: number; endLine: number } | null {
    if (call.arguments.start_line === undefined && call.arguments.end_line === undefined)
      return null;
    const startLine = this.integerArgument(call, 'start_line', 1, Number.MAX_SAFE_INTEGER),
      endLine = this.integerArgument(
        call,
        'end_line',
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      );
    if (endLine < startLine)
      throw new Error('end_line must be greater than or equal to start_line');
    return { startLine, endLine };
  }
}
