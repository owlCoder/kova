import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PromptLibrary } from '../../packages/protocol/src/PromptLibrary.js';
import { PromptLibraryService } from '../../packages/runtime/src/presentation/PromptLibraryService.js';
import { createPromptLibrary } from '../../packages/desktop/src/state/createPromptLibrary.js';
import { validateMessage } from '../../packages/runtime/src/presentation/validateMessage.js';
import { validateDesktopMessage } from '../../packages/desktop/src/main/validateDesktopMessage.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const read = { type: 'GetPromptLibrary' } as const;
const save = (
  revision: string,
  text = 'Keep every character.\n  <code>\n',
  title = 'A reusable prompt',
) => ({ type: 'SavePrompt', revision, id: null, title, text }) as const;

describe('personal prompt libraries', () => {
  it('persists exact text across restarts and refreshes an edited prompt without duplicating it', async () => {
    const path = await mkdtemp(join(tmpdir(), 'kova-prompt-library-'));
    directories.push(path);
    const store = createPromptLibrary(path);
    const empty = await store.handle(read);
    expect(empty.prompts).toEqual([]);
    await expect(readFile(join(path, 'prompt-library.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const first = await store.handle(save(empty.revision));
    const prompt = first.prompts[0]!;
    expect(prompt.text).toBe('Keep every character.\n  <code>\n');
    const reopened = createPromptLibrary(path);
    expect(await reopened.handle(read)).toEqual(first);
    const updated = await reopened.handle({
      ...save(first.revision, '\n  Updated\n'),
      id: prompt.id,
      title: '  Renamed  ',
    });
    expect(updated.prompts).toEqual([{ id: prompt.id, title: 'Renamed', text: '\n  Updated\n' }]);
    expect(updated.revision).not.toBe(first.revision);
    const removed = await reopened.handle({
      type: 'DeletePrompt',
      revision: updated.revision,
      id: prompt.id,
    });
    expect(removed.prompts).toEqual([]);
    const restored = await reopened.handle(save(removed.revision, prompt.text, prompt.title));
    expect(restored.prompts[0]?.text).toBe(prompt.text);
    await reopened.flush();
  });

  it('serializes concurrent views, refuses stale revisions and keeps failed writes out of memory', async () => {
    let saved: PromptLibrary | undefined;
    let fail = false;
    let writes = 0;
    const store = new PromptLibraryService({
      read: async () => saved,
      write: async (value) => {
        writes++;
        if (fail) throw new Error('Disk full');
        saved = value;
      },
    });
    const empty = await store.handle(read);
    const results = await Promise.allSettled([
      store.handle(save(empty.revision, 'first')),
      store.handle(save(empty.revision, 'second')),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(writes).toBe(1);
    const current = await store.handle(read);
    fail = true;
    await expect(store.handle(save(current.revision, 'never committed'))).rejects.toThrow(
      'Disk full',
    );
    expect(await store.handle(read)).toEqual(current);
    fail = false;
    expect(
      (await store.handle(save(current.revision, 'retry'))).prompts.map((prompt) => prompt.text),
    ).toEqual(['retry', 'first']);
  });

  it('bounds the library, permits edits at capacity and never returns mutable internal data', async () => {
    const prompts = Array.from({ length: 40 }, (_, index) => ({
      id: randomUUID(),
      title: `Prompt ${index}`,
      text: 'x'.repeat(16000),
    }));
    const original: PromptLibrary = { version: 1, revision: randomUUID(), prompts };
    const store = new PromptLibraryService({ read: async () => original, write: async () => {} });
    const current = await store.handle(read);
    (current.prompts as unknown as { text: string }[])[0]!.text = 'external mutation';
    expect((await store.handle(read)).prompts[0]?.text.length).toBe(16000);
    await expect(store.handle(save(current.revision))).rejects.toThrow('full');
    const changed = await store.handle({
      ...save(current.revision, 'edited'),
      id: prompts[39]!.id,
    });
    expect(changed.prompts).toHaveLength(40);
    expect(changed.prompts[0]?.id).toBe(prompts[39]!.id);
    await expect(
      store.handle({ type: 'DeletePrompt', revision: changed.revision, id: randomUUID() }),
    ).rejects.toThrow('no longer exists');
  });

  it('preserves corrupt or over-limit data and retries reads without erasing saved files', async () => {
    const path = await mkdtemp(join(tmpdir(), 'kova-prompt-library-'));
    directories.push(path);
    const file = join(path, 'prompt-library.json');
    await writeFile(file, '{broken data');
    const store = createPromptLibrary(path);
    await expect(store.handle(read)).rejects.toThrow('preserved');
    expect(await readFile(file, 'utf8')).toBe('{broken data');
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        revision: randomUUID(),
        prompts: [{ id: randomUUID(), title: 'Too long', text: 'x'.repeat(16001) }],
      }),
    );
    await expect(store.handle(read)).rejects.toThrow('preserved');
    await writeFile(file, JSON.stringify({ version: 1, revision: randomUUID(), prompts: [] }));
    expect((await store.handle(read)).prompts).toEqual([]);
  });

  it('validates both host boundaries and refuses injected paths, content overflow and invalid references', () => {
    const revision = randomUUID();
    for (const validate of [validateMessage, validateDesktopMessage]) {
      const envelope = { protocolVersion: 1, requestId: 'library' };
      expect(
        validate({ ...envelope, ...save(revision, 'x'.repeat(16000), 'T'.repeat(80)) }).type,
      ).toBe('SavePrompt');
      expect(validate({ ...envelope, ...read }).type).toBe('GetPromptLibrary');
      for (const intent of [
        { ...read, path: '/injected' },
        { ...save(revision), revision: '../escape' },
        { ...save(revision), id: 'unexpected' },
        save(revision, 'x'.repeat(16001)),
        save(revision, ' '),
        save(revision, 'null\0byte'),
        save(revision, 'valid', 'T'.repeat(81)),
        { type: 'DeletePrompt', revision, id: null },
        { type: 'DeletePrompt', revision, id: randomUUID(), title: 'Injected' },
      ])
        expect(() => validate({ ...envelope, ...intent })).toThrow();
    }
  });
});
