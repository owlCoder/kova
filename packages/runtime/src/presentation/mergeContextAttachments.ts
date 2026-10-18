import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';

/** Build an atomic collection; files refresh in place, distinct text selections remain separate. */
export function mergeContextAttachments(
  existing: readonly ContextAttachment[],
  captured: readonly ContextAttachment[],
): ContextAttachment[] {
  const result = [...existing];
  for (const item of captured) {
    if (!item.content || item.content.length > 100_000 || item.content.includes('\0'))
      throw new Error(
        'Attach nonempty text under 100,000 characters. Binary files are not supported.',
      );
    const index = result.findIndex(
      (previous) =>
        previous.label === item.label &&
        (previous.source === 'Selection' || item.source === 'Selection'
          ? previous.source === item.source && previous.content === item.content
          : true),
    );
    if (index >= 0) result[index] = { ...item, id: result[index]!.id };
    else result.push(item);
    if (result.length > 10) throw new Error('Attach up to 10 files or selections.');
  }
  return result;
}
