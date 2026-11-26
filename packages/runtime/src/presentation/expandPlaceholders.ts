const MAX_SELECTION = 50_000;

/**
 * Expands composer placeholders before the prompt is sent: `{selection}` is
 * the active editor's selected text, `{file}` its workspace-relative path.
 */
export function expandPlaceholders(
  prompt: string,
  selection: { readonly text: string; readonly label: string } | null,
): string {
  if (!prompt.includes('{')) return prompt;
  const text = selection ? selection.text.slice(0, MAX_SELECTION) : '';
  const file = selection ? selection.label : '';
  return prompt.replaceAll('{selection}', text).replaceAll('{file}', file);
}
