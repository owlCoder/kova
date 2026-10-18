/** Insert beside existing text; never silently replace or truncate a user's draft. */
export function insertComposerText(current: string, incoming: string, position = current.length) {
  if (!incoming.trim()) return null;
  const at = Math.max(0, Math.min(current.length, position));
  const before = current.slice(0, at);
  const after = current.slice(at);
  const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n\n' : '';
  const inserted = prefix + incoming + suffix;
  const text = before + inserted + after;
  return text.length <= 16_000 ? { text, caret: before.length + inserted.length } : null;
}
