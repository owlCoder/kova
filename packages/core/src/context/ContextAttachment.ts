/** Content is read explicitly by the host, never by the ContextBuilder. */
export interface ContextAttachment {
  readonly id: string;
  readonly source: 'Selection' | 'CurrentFile' | 'ExplicitFile';
  readonly label: string;
  readonly content: string;
  /** Pasted/attached image, base64; sent to the model only when it supports vision. */
  readonly image?: { readonly mimeType: string; readonly base64: string };
}
