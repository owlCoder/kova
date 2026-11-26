import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import { BuiltInTool } from './BuiltInTool.js';
import { defaultFetch, fetchBounded, htmlToText, isHttpUrl } from './webFetchShared.js';
import type { FetchLike } from './FetchLike.js';

/** Read-only URL fetch with scheme allowlist, download cap and HTML-to-text conversion. */
export class WebFetchTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'web_fetch',
    description:
      'Fetch an http(s) URL and return its text content. HTML pages are converted to readable text. Downloads are capped at 200 KB.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http:// or https:// URL' },
        max_characters: {
          type: 'integer',
          description: 'Max characters of text to return (default 20000, max 50000)',
        },
      },
      required: ['url'],
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
    const url = this.stringArgument(call, 'url');
    if (!isHttpUrl(url)) throw new Error('web_fetch accepts only absolute http(s) URLs.');
    this.integerArgument(call, 'max_characters', 20_000, 50_000);
    return this.ready(call, workspaceId, [], {
      kind: 'Description',
      text: `Fetch ${url}`,
    });
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const url = this.stringArgument(prepared.call, 'url');
    const maxCharacters = this.integerArgument(prepared.call, 'max_characters', 20_000, 50_000);
    const response = await fetchBounded(this.fetchImpl, url, {}, cancellation);
    if (response.status >= 400)
      return this.error(prepared.call, 'HttpError', `HTTP ${response.status} for ${url}`, {
        status: response.status,
      });
    const raw =
      response.contentType.includes('html') || response.body.trimStart().startsWith('<')
        ? htmlToText(response.body)
        : response.body;
    const output = raw.slice(0, maxCharacters);
    return this.success(
      prepared.call,
      `${output}${raw.length > maxCharacters ? `\n[truncated: ${raw.length - maxCharacters} more characters]` : ''}`,
    );
  }
}
