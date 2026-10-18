import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopStore } from '../../packages/desktop/src/state/DesktopStore.js';
import { DesktopSession } from '../../packages/desktop/src/main/DesktopSession.js';
import type { DesktopKeyStore } from '../../packages/desktop/src/state/DesktopKeyStore.js';
import { validateDesktopMessage } from '../../packages/desktop/src/main/validateDesktopMessage.js';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kova-sessions-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe('session organization', () => {
  it('locks session changes while archiving the current conversation and preserves a late draft flush', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ models: [] })),
    );
    const store = new DesktopStore(directory);
    await store.load();
    const session = new DesktopSession(
      store,
      { get: async () => undefined } as unknown as DesktopKeyStore,
      () => {},
    );
    await session.initialize();
    await session.newConversation();
    const id = session.conversationId;
    const archive = session.archiveConversation(id);
    expect(session.busy).toBe(true);
    await expect(session.newConversation()).rejects.toThrow('Stop');
    await archive;
    expect(session.busy).toBe(false);
    expect(session.conversationId).not.toBe(id);
    expect(store.preferences.lastConversationId).toBe(session.conversationId);
    expect(store.contains(id)).toBe(true);
    expect(store.list({ archived: true })[0]?.id).toBe(id);
    await store.updateDraft(id, 'Final flush after archive');
    await store.restore(id);
    await session.selectConversation(id);
    expect(store.getDraft(id)).toBe('Final flush after archive');
    await session.dispose();
  });
  it('preserves pins, titles, history and drafts through archive, restart, restore and index recovery', async () => {
    const first = randomUUID(),
      second = randomUUID();
    const store = new DesktopStore(directory);
    await store.load();
    for (const id of [first, second])
      await store.save({ id, workspaceId: '/project', entries: [], summary: null });
    await store.pin(first, true);
    await store.rename(first, 'Keep this session');
    await store.updateDraft(first, 'Unsent work');
    expect(store.list()[0]).toMatchObject({ id: first, pinned: true });
    await store.remove(first);
    expect(store.list().map((item) => item.id)).toEqual([second]);
    const reopened = new DesktopStore(directory);
    await reopened.load();
    expect(reopened.list({ archived: true })).toEqual([
      expect.objectContaining({ id: first, pinned: true, title: 'Keep this session' }),
    ]);
    expect(reopened.getDraft(first)).toBe('Unsent work');
    await reopened.restore(first);
    await reopened.save((await reopened.get(first))!);
    expect(reopened.list()[0]).toMatchObject({ id: first, pinned: true });
    await writeFile(join(directory, 'session-index.json'), '{damaged');
    const recovered = new DesktopStore(directory);
    await recovered.load();
    expect(recovered.list()[0]).toMatchObject({
      id: first,
      pinned: true,
      title: 'Keep this session',
    });
    await recovered.pin(first, false);
    expect(recovered.list().find((item) => item.id === first)?.pinned).toBe(false);
    expect(
      JSON.parse(await readFile(join(directory, 'sessions', `${first}.json`), 'utf8')).pinned,
    ).toBe(false);
  });
  it('applies the session limit after workspace filtering and migrates older metadata', async () => {
    const id = randomUUID();
    await writeFile(
      join(directory, 'session-index.json'),
      JSON.stringify([
        ...Array.from({ length: 205 }, () => ({
          id: randomUUID(),
          title: 'Other project',
          updatedAt: '2026-10-18',
          workspaceId: '/other',
          archived: false,
        })),
        {
          id,
          title: 'Older session',
          updatedAt: '2025-01-01',
          workspaceId: '/project',
          archived: false,
        },
      ]),
    );
    const store = new DesktopStore(directory);
    await store.load();
    expect(store.list({ workspaceId: '/other' })).toHaveLength(200);
    expect(store.list({ workspaceId: '/project' })).toEqual([
      expect.objectContaining({ id, pinned: false }),
    ]);
    expect(store.contains(id, '/project')).toBe(true);
    expect(store.contains(id, '/other')).toBe(false);
  });
  it('validates archive/restore/pin intents and rejects coercion, extra fields and invalid IDs', () => {
    const envelope = { protocolVersion: 1, requestId: 'test', conversationId: randomUUID() };
    for (const type of ['ArchiveConversation', 'RestoreConversation'])
      expect(validateDesktopMessage({ ...envelope, type }).type).toBe(type);
    expect(
      validateDesktopMessage({ ...envelope, type: 'PinConversation', pinned: false }).type,
    ).toBe('PinConversation');
    for (const invalid of [
      { type: 'PinConversation', pinned: 'false' },
      { type: 'PinConversation', pinned: true, workspaceId: '/injected' },
      { type: 'RestoreConversation', conversationId: '../outside' },
      { type: 'ArchiveConversation', deleteFiles: true },
    ])
      expect(() => validateDesktopMessage({ ...envelope, ...invalid })).toThrow();
  });
});
