import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';

export class OpenAiCompatibleConnection {
  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 120_000,
  ) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Provider endpoint must be an HTTP(S) URL without embedded credentials.');
  }

  async open(path: string, body: unknown | null, cancellation: CancellationToken) {
    cancellation.throwIfCancellationRequested();
    const controller = new AbortController();
    const subscription = cancellation.onCancellationRequested(() => controller.abort());
    const timer = setTimeout(
      () => controller.abort(new Error('Provider request timed out.')),
      this.timeoutMs,
    );
    const dispose = () => {
      clearTimeout(timer);
      subscription.dispose();
    };
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: body === null ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Provider returned HTTP ${response.status}. Check the endpoint, API key and model.`,
        );
      return { response, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  }

  async json(
    path: string,
    body: unknown | null,
    cancellation: CancellationToken,
  ): Promise<unknown> {
    const handle = await this.open(path, body, cancellation);
    try {
      const text = await handle.response.text();
      if (text.length > 2_000_000) throw new Error('Provider metadata exceeds the response limit.');
      cancellation.throwIfCancellationRequested();
      return JSON.parse(text) as unknown;
    } finally {
      handle.dispose();
    }
  }
}
