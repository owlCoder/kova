import type {
  PromptLibrary,
  PromptLibraryMessage,
} from '../../../packages/protocol/src/PromptLibrary.js';
import type { PromptEdit } from './PromptEdit.js';

/** An editor keeps its opening revision even as broadcasts refresh the library behind it. */
export function savePromptIntent(
  library: PromptLibrary,
  edit: PromptEdit,
): Extract<PromptLibraryMessage, { type: 'SavePrompt' }> {
  if (edit.id && edit.revision !== library.revision)
    throw new Error('The library changed in another view. Review it and try again.');
  return {
    type: 'SavePrompt',
    revision: library.revision,
    id: edit.id,
    title: edit.title,
    text: edit.text,
  };
}
