/** Minimal data shape of one HTTP response, so tests can inject fakes. */
export interface FetchResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}
