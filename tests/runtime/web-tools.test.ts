import { describe, expect, it } from 'vitest';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { WebFetchTool } from '../../packages/runtime/src/tools/WebFetchTool.js';
import { WebSearchTool } from '../../packages/runtime/src/tools/WebSearchTool.js';
import {
  htmlToText,
  isHttpUrl,
  parseSearchHits,
} from '../../packages/runtime/src/tools/webFetchShared.js';
import type { FetchLike } from '../../packages/runtime/src/tools/FetchLike.js';
import type { ToolCall } from '../../packages/core/src/tools/ToolCall.js';
import type { JsonObject } from '../../packages/core/src/common/JsonValue.js';

const call = (name: string, args: JsonObject): ToolCall => ({
  id: `${name}-1`,
  name,
  arguments: args,
});

const fakeFetch = (body: string, status = 200, contentType = 'text/plain'): FetchLike => ({
  async fetch() {
    return { status, contentType, body };
  },
});

const DDG_HTML = `
<html><body>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example Docs</a>
<a class="result__snippet" href="#">How to use the <b>example</b> library &amp; more</a>
<a class="result__a" href="https://other.org/page">Other Page</a>
<a class="result__snippet" href="#">Second snippet</a>
<a class="result__a" href="javascript:alert(1)">Bad Link</a>
</body></html>`;

describe('web_fetch tool', () => {
  it('rejects non-http URLs at prepare time', async () => {
    const tool = new WebFetchTool(fakeFetch('x'));
    const result = await tool.prepare(
      call('web_fetch', { url: 'file:///etc/passwd' }),
      'ws',
      new CancellationSource(),
    );
    expect(result.status).toBe('Error');
  });

  it('fetches plain text and caps the output', async () => {
    const tool = new WebFetchTool(fakeFetch('hello world', 200));
    const prepared = await tool.prepare(
      call('web_fetch', { url: 'https://example.com/a.txt', max_characters: 5 }),
      'ws',
      new CancellationSource(),
    );
    expect(prepared.status).toBe('Ready');
    if (prepared.status !== 'Ready') return;
    const result = await tool.execute(prepared.prepared, new CancellationSource());
    expect(result.status).toBe('Success');
    expect(result.output).toContain('hello');
    expect(result.output).toContain('truncated');
  });

  it('converts HTML to readable text', async () => {
    const tool = new WebFetchTool(
      fakeFetch('<h1>Title</h1><p>Some <b>bold</b> text &amp; more</p>', 200, 'text/html'),
    );
    const prepared = await tool.prepare(
      call('web_fetch', { url: 'https://example.com' }),
      'ws',
      new CancellationSource(),
    );
    if (prepared.status !== 'Ready') throw new Error('prepare failed');
    const result = await tool.execute(prepared.prepared, new CancellationSource());
    expect(result.output).toContain('Title');
    expect(result.output).toContain('Some bold text & more');
    expect(result.output).not.toContain('<h1>');
  });

  it('reports HTTP errors', async () => {
    const tool = new WebFetchTool(fakeFetch('nope', 404));
    const prepared = await tool.prepare(
      call('web_fetch', { url: 'https://example.com/missing' }),
      'ws',
      new CancellationSource(),
    );
    if (prepared.status !== 'Ready') throw new Error('prepare failed');
    const result = await tool.execute(prepared.prepared, new CancellationSource());
    expect(result.status).toBe('Error');
    expect(result.error?.code).toBe('HttpError');
  });
});

describe('web_search tool', () => {
  it('parses results and formats them', async () => {
    const requested: string[] = [];
    const fetchImpl: FetchLike = {
      async fetch(url) {
        requested.push(url);
        return { status: 200, contentType: 'text/html', body: DDG_HTML };
      },
    };
    const tool = new WebSearchTool(fetchImpl);
    const prepared = await tool.prepare(
      call('web_search', { query: 'kova agent', max_results: 5 }),
      'ws',
      new CancellationSource(),
    );
    if (prepared.status !== 'Ready') throw new Error('prepare failed');
    const result = await tool.execute(prepared.prepared, new CancellationSource());
    expect(result.status).toBe('Success');
    expect(requested[0]).toContain('q=kova%20agent');
    expect(result.output).toContain('1. Example Docs');
    expect(result.output).toContain('https://example.com/docs');
    expect(result.output).toContain('How to use the example library & more');
    expect(result.output).toContain('2. Other Page');
    expect(result.output).not.toContain('javascript:');
  });

  it('returns a friendly message when nothing is found', async () => {
    const tool = new WebSearchTool(fakeFetch('<html><body></body></html>', 200, 'text/html'));
    const prepared = await tool.prepare(
      call('web_search', { query: 'nothing' }),
      'ws',
      new CancellationSource(),
    );
    if (prepared.status !== 'Ready') throw new Error('prepare failed');
    const result = await tool.execute(prepared.prepared, new CancellationSource());
    expect(result.output).toBe('No results for: nothing');
  });
});

describe('web helpers', () => {
  it('allows only http(s) URLs', () => {
    expect(isHttpUrl('https://example.com/x')).toBe(true);
    expect(isHttpUrl('http://127.0.0.1:11434/api')).toBe(true);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('ftp://x')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('strips tags, scripts and entities', () => {
    expect(htmlToText('<script>evil()</script><p>a &lt;b&gt; c</p>')).toBe('a <b> c');
  });

  it('parses hits with decoded URLs and skips non-http links', () => {
    const hits = parseSearchHits(DDG_HTML, 10);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.url).toBe('https://example.com/docs');
    expect(hits[1]?.title).toBe('Other Page');
  });
});
