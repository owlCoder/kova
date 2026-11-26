import type { FetchResponse } from './FetchResponse.js';

/** Injectable HTTP client; production uses globalThis.fetch, tests use fakes. */
export interface FetchLike {
  fetch(url: string, signal: AbortSignal): Promise<FetchResponse>;
}
