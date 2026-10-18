import { randomUUID } from 'node:crypto';
import type { PromptLibrary, PromptLibraryMessage } from '../../../protocol/src/PromptLibrary.js';
import { parsePromptLibrary } from './parsePromptLibrary.js';

/** Serialize writes and reject edits based on another view's stale library revision. */
export class PromptLibraryService {
  private value: PromptLibrary | null = null;
  private queue = Promise.resolve();
  constructor(
    private readonly storage: {
      read(): Promise<unknown>;
      write(library: PromptLibrary): Promise<void>;
    },
  ) {}
  handle(message: PromptLibraryMessage): Promise<PromptLibrary> {
    const task = this.queue.then(async () => {
      if (!this.value) {
        const saved = await this.storage.read();
        this.value =
          saved === undefined
            ? { version: 1, revision: randomUUID(), prompts: [] }
            : parsePromptLibrary(saved);
      }
      if (message.type === 'GetPromptLibrary') return structuredClone(this.value);
      if (message.revision !== this.value.revision)
        throw new Error('The library changed in another view. Review it and try again.');
      const previous = this.value.prompts.find((prompt) => prompt.id === message.id);
      if (message.id !== null && !previous) throw new Error('This saved prompt no longer exists.');
      const prompts = this.value.prompts.filter((prompt) => prompt.id !== message.id);
      if (message.type === 'SavePrompt') {
        if (!previous && prompts.length >= 40)
          throw new Error('Your library is full. Remove a prompt before saving another.');
        prompts.unshift({
          id: previous?.id ?? randomUUID(),
          title: message.title.trim(),
          text: message.text,
        });
      }
      const next = parsePromptLibrary({ version: 1, revision: randomUUID(), prompts });
      await this.storage.write(structuredClone(next));
      this.value = next;
      return structuredClone(next);
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  async flush(): Promise<void> {
    await this.queue;
  }
}
