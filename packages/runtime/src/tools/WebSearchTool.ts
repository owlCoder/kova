import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import { BuiltInTool } from './BuiltInTool.js';
import { defaultFetch, fetchBounded, parseSearchHits } from './webFetchShared.js';
import type { FetchLike } from './FetchLike.js';

const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/';

/** Keyless web search via the DuckDuckGo HTML endpoint; read-only and bounded. */
export class WebSearchTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'web_search',
    description:
      'Search the web and return result titles, URLs and snippets. Uses DuckDuckGo HTML, no API key required.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: {
          type: 'integer',
          description: 'Number of results (default 5, max 10)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  };
  constructor(private readonly fetchImpl: FetchLike = defaultFetch()) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    cancellation.throwIfCancellationRequested();
    const query = this.stringArgument(call, 'query');
    this.integerArgument(call, 'max_results', 5, 10);
    return this.ready(call, workspaceId, [], {
      kind: 'Description',
      text: `Search the web: ${query}`,
    });
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const query = this.stringArgument(prepared.call, 'query');
    const maxResults = this.integerArgument(prepared.call, 'max_results', 5, 10);
    const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
    const response = await fetchBounded(this.fetchImpl, url, {}, cancellation);
    if (response.status >= 400)
      return this.error(prepared.call, 'HttpError', `Search HTTP ${response.status}`, {
        status: response.status,
      });
    const hits = parseSearchHits(response.body, maxResults);
    if (!hits.length) return this.success(prepared.call, `No results for: ${query}`);
    const output = hits
      .map((hit, index) => `${index + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`)
      .join('\n');
    return this.success(prepared.call, output);
  }
}
