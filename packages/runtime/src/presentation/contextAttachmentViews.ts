import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import type { ContextAttachmentView } from '../../../protocol/src/ContextAttachmentView.js';

/** Metadata only; captured file contents are sent to the UI on explicit preview requests. */
export function contextAttachmentViews(
  items: readonly ContextAttachment[],
): readonly ContextAttachmentView[] {
  return items.map(({ id, label, source, content }) => ({
    id,
    label,
    source,
    characters: content.length,
  }));
}
