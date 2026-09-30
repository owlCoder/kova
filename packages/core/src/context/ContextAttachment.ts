/** Content is read explicitly by the host, never by the ContextBuilder. */
export interface ContextAttachment {
  readonly id: string;
  readonly source: 'Selection' | 'CurrentFile' | 'ExplicitFile';
  readonly label: string;
  readonly content: string;
}
