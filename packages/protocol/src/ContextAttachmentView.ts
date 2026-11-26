export interface ContextAttachmentView {
  readonly id: string;
  readonly label: string;
  readonly source: 'Selection' | 'CurrentFile' | 'ExplicitFile';
  readonly characters: number;
  readonly image: { readonly mimeType: string } | null;
}

export interface ContextPreview extends ContextAttachmentView {
  readonly conversationId: string;
  readonly content: string;
  readonly truncated: boolean;
  readonly imageDataUrl: string | null;
}
