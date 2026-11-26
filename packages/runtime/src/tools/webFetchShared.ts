import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { FetchLike } from './FetchLike.js';
import type { FetchResponse } from './FetchResponse.js';

export const MAX_DOWNLOAD_BYTES = 200_000;

/** Wraps globalThis.fetch into the injectable FetchLike shape. */
export function defaultFetch(): FetchLike {
  return {
    async fetch(url, signal) {
      const response = await fetch(url, {
        signal,
        redirect: 'follow',
        headers: { 'user-agent': 'kova-local-agent/1.0 (+https://github.com/owlCoder/kova)' },
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        body: await response.text(),
      };
    },
  };
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.host);
  } catch {
    return false;
  }
}

/** Fetches a URL with a hard download cap and timeout; returns the raw response. */
export async function fetchBounded(
  fetchImpl: FetchLike,
  url: string,
  options: { readonly maxBytes?: number; readonly timeoutMs?: number },
  cancellation: CancellationToken,
): Promise<FetchResponse> {
  if (!isHttpUrl(url)) throw new Error('Only absolute http(s) URLs are allowed.');
  const controller = new AbortController();
  const onCancel = cancellation.onCancellationRequested(() => controller.abort());
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetchImpl.fetch(url, controller.signal);
    if (response.body.length > (options.maxBytes ?? MAX_DOWNLOAD_BYTES))
      throw new Error(
        `Response exceeds the ${options.maxBytes ?? MAX_DOWNLOAD_BYTES} byte download cap.`,
      );
    return response;
  } finally {
    clearTimeout(timer);
    onCancel.dispose();
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Converts HTML to plain text: drops script/style, tags become whitespace, entities decode. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface SearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/** Parses DuckDuckGo HTML results into plain hits; no API key needed. */
export function parseSearchHits(html: string, maxResults: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const block =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = block.exec(html)) !== null && hits.length < maxResults) {
    const url = decodeURIComponent(match[1] ?? '')
      .replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '')
      .replace(/&amp;/g, '&')
      .split('&rut=')[0]!;
    if (!isHttpUrl(url)) continue;
    hits.push({
      title: htmlToText(match[2] ?? ''),
      url,
      snippet: htmlToText(match[3] ?? ''),
    });
  }
  return hits;
}
