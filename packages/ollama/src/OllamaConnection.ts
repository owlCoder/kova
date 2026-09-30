import type { CancellationToken } from '../../core/src/common/CancellationToken.js';

export class OllamaConnection {
  constructor(
    readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 120_000,
  ) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Ollama endpoint must be an HTTP(S) URL without credentials.');
  }
  async open(path: string, body: unknown | null, cancellation: CancellationToken) {
    cancellation.throwIfCancellationRequested();
    const controller = new AbortController();
    const subscription = cancellation.onCancellationRequested(() => controller.abort());
    const timer = setTimeout(
      () => controller.abort(new Error('Ollama request timed out.')),
      this.timeoutMs,
    );
    const dispose = () => {
      clearTimeout(timer);
      subscription.dispose();
    };
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: body === null ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Ollama returned HTTP ${response.status}. Check the runtime and installed model.`,
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
      if (!handle.response.body) throw new Error('Ollama metadata response has no body.');
      const reader = handle.response.body.getReader(),
        decoder = new TextDecoder();
      let text = '',
        bytes = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) {
            text += decoder.decode();
            break;
          }
          bytes += part.value.length;
          if (bytes > 2_000_000) throw new Error('Ollama metadata exceeds the response limit.');
          text += decoder.decode(part.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      cancellation.throwIfCancellationRequested();
      return JSON.parse(text) as unknown;
    } finally {
      handle.dispose();
    }
  }
}
