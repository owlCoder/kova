import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import type { ContextPreview } from '../../../protocol/src/ContextAttachmentView.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';

export function previewContext(
  conversationId: string,
  items: readonly ContextAttachment[],
  request: Extract<WebviewMessage, { type: 'PreviewContext' }>,
): ContextPreview {
  if (request.conversationId !== conversationId)
    throw new Error('This conversation is no longer selected.');
  const item = items.find((item) => item.id === request.attachmentId);
  if (!item) throw new Error('This context attachment is no longer available.');
  return {
    conversationId,
    id: item.id,
    label: item.label,
    source: item.source,
    characters: item.content.length,
    image: item.image ? { mimeType: item.image.mimeType } : null,
    content: item.content.slice(0, 50_000),
    truncated: item.content.length > 50_000,
    imageDataUrl: item.image ? `data:${item.image.mimeType};base64,${item.image.base64}` : null,
  };
}
