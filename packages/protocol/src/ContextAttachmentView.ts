export interface ContextAttachmentView {
  readonly id: string;
  readonly label: string;
  readonly source: 'Selection' | 'CurrentFile' | 'ExplicitFile';
  readonly characters: number;
}

export interface ContextPreview extends ContextAttachmentView {
  readonly conversationId: string;
  readonly content: string;
  readonly truncated: boolean;
}
