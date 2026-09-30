import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspaceSearch } from '../../../core/src/workspace/WorkspaceSearch.js';
import { BuiltInTool } from './BuiltInTool.js';

export class SearchFilesTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'search_files',
    description:
      'Find literal text in workspace files, optionally restricted by a glob and result count.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        glob: { type: 'string' },
        max_results: { type: 'integer', minimum: 1, maximum: 500 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  };
  constructor(private readonly search: WorkspaceSearch) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    cancellation.throwIfCancellationRequested();
    this.stringArgument(call, 'query');
    if (call.arguments.glob !== undefined) this.stringArgument(call, 'glob');
    this.integerArgument(call, 'max_results', 100, 500);
    return this.ready(call, workspaceId);
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const rows = await this.search.search(
      prepared.workspaceId,
      this.stringArgument(prepared.call, 'query'),
      typeof prepared.call.arguments.glob === 'string' ? prepared.call.arguments.glob : null,
      this.integerArgument(prepared.call, 'max_results', 100, 500),
      cancellation,
    );
    return this.success(
      prepared.call,
      rows.map((row) => `${row.relativePath}:${row.line}: ${row.text}`).join('\n'),
    );
  }
}
