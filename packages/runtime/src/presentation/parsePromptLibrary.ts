import type { PromptLibrary } from '../../../protocol/src/PromptLibrary.js';

/** Refuse damaged data instead of silently dropping saved prompts on the next write. */
export function parsePromptLibrary(value: unknown): PromptLibrary {
  const library = value as PromptLibrary | null;
  if (
    !library ||
    library.version !== 1 ||
    typeof library.revision !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(library.revision) ||
    !Array.isArray(library.prompts) ||
    library.prompts.length > 40 ||
    library.prompts.some(
      (prompt) =>
        !prompt ||
        typeof prompt.id !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(prompt.id) ||
        typeof prompt.title !== 'string' ||
        !prompt.title.trim() ||
        prompt.title.length > 80 ||
        typeof prompt.text !== 'string' ||
        !prompt.text.trim() ||
        prompt.text.length > 16_000 ||
        prompt.title.includes('\0') ||
        prompt.text.includes('\0'),
    ) ||
    new Set(library.prompts.map((prompt) => prompt.id)).size !== library.prompts.length
  )
    throw new Error('The prompt library could not be read. Its saved data has been preserved.');
  return {
    version: 1,
    revision: library.revision,
    prompts: library.prompts.map(({ id, title, text }) => ({ id, title, text })),
  };
}
