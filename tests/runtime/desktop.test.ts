import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopStore } from '../../packages/desktop/src/state/DesktopStore.js';
import { DesktopSession } from '../../packages/desktop/src/main/DesktopSession.js';
import { DesktopProviderManager } from '../../packages/desktop/src/main/DesktopProviderManager.js';
import type { DesktopKeyStore } from '../../packages/desktop/src/state/DesktopKeyStore.js';
import { validateDesktopMessage } from '../../packages/desktop/src/main/validateDesktopMessage.js';
import { NodeWorkspacePathGuard } from '../../packages/runtime/src/adapters/NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from '../../packages/runtime/src/adapters/NodeWorkspaceReader.js';
import { NodeWorkspaceWriter } from '../../packages/runtime/src/adapters/NodeWorkspaceWriter.js';
import { NodeWorkspaceFileFinder } from '../../packages/runtime/src/adapters/NodeWorkspaceFileFinder.js';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import type { Conversation } from '../../packages/core/src/conversations/Conversation.js';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kova-desktop-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe('desktop session storage', () => {
  it('restores independent drafts, serializes writes, clears sent text and bounds retained drafts', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    const first = randomUUID(),
      second = randomUUID();
    await Promise.all([
      store.updateDraft(first, 'First project draft'),
      store.updateDraft(second, 'Second project draft'),
    ]);
    const restored = new DesktopStore(directory);
    await restored.load();
    expect(restored.getDraft(first)).toBe('First project draft');
    expect(restored.getDraft(second)).toBe('Second project draft');
    await restored.updateDraft(first, 'Next prompt');
    await restored.updateDraft(first, '', 'First project draft');
    expect(restored.getDraft(first)).toBe('Next prompt');
    await restored.updateDraft(first, '', 'Next prompt');
    expect(restored.getDraft(first)).toBe('');
    for (let i = 0; i < 21; i++) await restored.updateDraft(randomUUID(), 'bounded draft');
    const disk = JSON.parse(await readFile(join(directory, 'drafts.json'), 'utf8'));
    expect(Object.keys(disk)).toHaveLength(20);
    expect(disk[first]).toBeUndefined();
    await expect(restored.updateDraft('../escape', 'no')).rejects.toThrow('Invalid draft');
    await expect(restored.updateDraft(first, 'a'.repeat(16001))).rejects.toThrow('Invalid draft');
    await writeFile(join(directory, 'drafts.json'), '{broken');
    const recovered = new DesktopStore(directory);
    await recovered.load();
    expect(recovered.getDraft(first)).toBe('');
  });

  it('restores conversations, generates titles, and preserves renamed titles on later saves', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    const id = randomUUID();
    const conversation: Conversation = { id, workspaceId: '/project', entries: [], summary: null };
    await store.save(conversation);
    await store.save({
      ...conversation,
      entries: [
        {
          id: 'u',
          turnId: 'r',
          stepId: null,
          message: { role: 'user', content: 'Explain the project' },
          toolResultOrigin: null,
          omitted: false,
        },
      ],
    });
    expect(store.list()[0]?.title).toBe('Explain the project');
    await store.rename(id, 'Architecture');
    await store.save((await store.get(id))!);
    const reloaded = new DesktopStore(directory);
    await reloaded.load();
    expect(reloaded.list()[0]?.title).toBe('Architecture');
    await reloaded.markPartial(id, true);
    await reloaded.save((await reloaded.get(id))!);
    const status = new DesktopStore(directory);
    await status.load();
    expect(status.isPartial(id)).toBe(true);
    expect((await reloaded.get(id))?.entries[0]?.message.content).toBe('Explain the project');
    await reloaded.remove(id);
    expect(reloaded.list()).toEqual([]);
    expect(await reloaded.get(id)).not.toBeNull();
  });

  it('serializes preference updates without losing concurrent changes', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    await Promise.all([
      store.updatePreferences({ theme: 'light' }),
      store.updatePreferences({ setupCompleted: true }),
    ]);
    const loaded = new DesktopStore(directory);
    await loaded.load();
    expect(loaded.preferences).toMatchObject({ theme: 'light', setupCompleted: true });
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('apiKey');
  });

  it('preserves a damaged settings file and reports an actionable failure', async () => {
    await writeFile(join(directory, 'settings.json'), '{broken');
    await expect(new DesktopStore(directory).load()).rejects.toThrow('preserved');
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe('{broken');
  });
  it('loads metadata without reading every conversation body', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    const id = randomUUID();
    await store.save({ id, workspaceId: '/project', entries: [], summary: null });
    await writeFile(join(directory, 'sessions', `${id}.json`), '{broken body');
    const reopened = new DesktopStore(directory);
    await reopened.load();
    expect(reopened.list()).toHaveLength(1);
    await expect(reopened.get(id)).rejects.toThrow();
  });
  it('does not preserve unknown or credential fields in ordinary settings', async () => {
    await writeFile(
      join(directory, 'settings.json'),
      JSON.stringify({ apiKey: 'not-a-setting', provider: { apiKey: 'not-a-provider-setting' } }),
    );
    const store = new DesktopStore(directory);
    await store.load();
    await store.updatePreferences({ theme: 'light' });
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('apiKey');
  });
});

describe('bounded project file lookup', () => {
  it('finds nested paths without traversing dependencies or symlinks outside the project', async () => {
    const root = join(directory, 'project');
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'src', 'ChatPanel.tsx'), '');
    await writeFile(join(root, 'node_modules', 'ChatHidden.ts'), '');
    await writeFile(join(directory, 'ChatSecret.ts'), '');
    await symlink(
      directory,
      join(root, 'outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const result = await new NodeWorkspaceFileFinder(root).find('chat', new CancellationSource());
    expect(result).toEqual({
      entries: [{ name: 'ChatPanel.tsx', path: 'src/ChatPanel.tsx', kind: 'File' }],
      truncated: false,
    });
  });
  it('caps matches and honors cancellation', async () => {
    await Promise.all(
      Array.from({ length: 110 }, (_, i) => writeFile(join(directory, `match-${i}.ts`), '')),
    );
    const finder = new NodeWorkspaceFileFinder(directory);
    const result = await finder.find('match', new CancellationSource());
    expect(result.entries).toHaveLength(100);
    expect(result.truncated).toBe(true);
    const source = new CancellationSource();
    source.cancel();
    await expect(finder.find('match', source)).rejects.toThrow();
  });
});

describe('native desktop file writer', () => {
  it('atomically creates and updates files, refusing stale or raced previews', async () => {
    const guard = new NodeWorkspacePathGuard(directory);
    const writer = new NodeWorkspaceWriter(guard);
    const reader = new NodeWorkspaceReader(guard);
    const source = new CancellationSource();
    const path = await guard.resolve(directory, 'src/file.txt', 'Write', source);
    expect((await writer.replace(path, 'original', null, source)).status).toBe('Applied');
    expect((await writer.replace(path, 'overwrite', null, source)).status).toBe('Error');
    const current = await guard.resolve(directory, 'src/file.txt', 'Read', source);
    const before = await reader.read(current, null, source);
    expect((await writer.replace(current, 'updated', before.version, source)).status).toBe(
      'Applied',
    );
    expect((await writer.replace(current, 'stale', before.version, source)).status).toBe('Error');
    expect(await readFile(join(directory, 'src/file.txt'), 'utf8')).toBe('updated');
  });

  it('keeps symlink escapes and cancelled writes outside the write path', async () => {
    const root = join(directory, 'project');
    await mkdir(root);
    await symlink(
      directory,
      join(root, 'outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const guard = new NodeWorkspacePathGuard(root);
    const source = new CancellationSource();
    await expect(guard.resolve(root, 'outside/escape.txt', 'Write', source)).rejects.toThrow(
      'outside',
    );
    const path = await guard.resolve(root, 'new.txt', 'Write', source);
    source.cancel();
    await expect(
      new NodeWorkspaceWriter(guard).replace(path, 'no write', null, source),
    ).rejects.toThrow();
    await expect(readFile(join(root, 'new.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('desktop agent integration', () => {
  it('bounds inactive provider sessions while retaining recently used conversation state', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    const keys = { get: async () => undefined } as unknown as DesktopKeyStore;
    const providers = new DesktopProviderManager(store, keys);
    const first = await providers.forConversation('first');
    const second = await providers.forConversation('second');
    for (let i = 0; i < 6; i++) await providers.forConversation(`other-${i}`);
    expect(await providers.forConversation('first')).toBe(first);
    await providers.forConversation('ninth');
    expect(await providers.forConversation('first')).toBe(first);
    expect(await providers.forConversation('second')).not.toBe(second);
    providers.clear();
    expect(await providers.forConversation('first')).not.toBe(first);
  });
  it('opens setup with actionable guidance when the default local server is unavailable', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const messages: HostMessage[] = [];
    const keys = { get: async () => undefined } as unknown as DesktopKeyStore;
    const session = new DesktopSession(store, keys, (message) => messages.push(message));
    await session.initialize();
    expect(
      messages.some(
        (message) =>
          message.type === 'Notice' && message.message.includes('Check that the server is running'),
      ),
    ).toBe(true);
    const final = messages.filter((message) => message.type === 'Snapshot').at(-1);
    expect(final?.type === 'Snapshot' && final.snapshot).toMatchObject({
      providerStatus: 'Unavailable',
      setupCompleted: false,
    });
    await session.dispose();
  });
  it('persists an interrupted streamed response and its partial status across restart', async () => {
    const store = new DesktopStore(directory);
    await store.load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/tags'))
          return Response.json({
            models: [{ name: 'qwen3:4b', size: 100, capabilities: ['tools'] }],
          });
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ message: { content: 'Interrupted answer' } }) + '\n',
                ),
              );
              options!.signal!.addEventListener(
                'abort',
                () => controller.error(new Error('Aborted')),
                { once: true },
              );
            },
          }),
        );
      }),
    );
    const messages: HostMessage[] = [];
    const keys = { get: async () => undefined } as unknown as DesktopKeyStore;
    const session = new DesktopSession(store, keys, (message) => messages.push(message));
    await session.initialize();
    await session.submit({
      protocolVersion: 1,
      requestId: 'cancel-test',
      type: 'SubmitPrompt',
      prompt: 'Long answer',
      modelId: 'qwen3:4b',
      mode: 'Plan',
      skillId: null,
      attachmentIds: [],
    });
    await vi.waitFor(() =>
      expect(
        messages.some(
          (message) => message.type === 'Event' && message.event.type === 'ResponseDelta',
        ),
      ).toBe(true),
    );
    session.cancel();
    await vi.waitFor(() => expect(session.busy).toBe(false));
    const id = session.conversationId;
    await session.dispose();
    const reloaded = new DesktopStore(directory);
    await reloaded.load();
    const snapshots: HostMessage[] = [];
    const restored = new DesktopSession(reloaded, keys, (message) => snapshots.push(message));
    await restored.initialize();
    expect(restored.conversationId).toBe(id);
    const snapshot = snapshots.filter((message) => message.type === 'Snapshot').at(-1);
    expect(snapshot?.type === 'Snapshot' && snapshot.snapshot.messages.at(-1)).toMatchObject({
      content: 'Interrupted answer',
      partial: true,
    });
    await restored.dispose();
  });
  it('uses the shared approval pipeline to edit a file, persists history, and restores its project', async () => {
    const root = join(directory, 'project');
    await mkdir(root);
    await writeFile(join(root, 'note.txt'), 'old');
    const store = new DesktopStore(join(directory, 'data'));
    await store.load();
    const messages: HostMessage[] = [];
    const keys = { get: async () => undefined } as unknown as DesktopKeyStore;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/tags'))
          return Response.json({
            models: [{ name: 'qwen3:4b', size: 100, capabilities: ['tools'] }],
          });
        expect(url).toContain('/api/chat');
        calls++;
        const body = JSON.parse(options!.body as string);
        const message =
          calls === 1
            ? {
                content: 'I will update the note.',
                tool_calls: [
                  {
                    function: {
                      name: 'edit_file',
                      arguments: { path: 'note.txt', old_string: 'old', new_string: 'new' },
                    },
                  },
                ],
              }
            : { content: 'Updated the note.' };
        if (calls === 2)
          expect(body.messages.some((item: { role: string }) => item.role === 'tool')).toBe(true);
        return new Response(
          `${JSON.stringify({ message, done: true, prompt_eval_count: 30, eval_count: 10 })}\n`,
        );
      }),
    );
    const session = new DesktopSession(store, keys, (message) => messages.push(message));
    await session.initialize();
    await session.openWorkspace(root);
    await session.submit({
      protocolVersion: 1,
      requestId: 'submit',
      type: 'SubmitPrompt',
      prompt: 'Update note',
      modelId: 'qwen3:4b',
      mode: 'Manual',
      skillId: null,
      attachmentIds: [],
    });
    await vi.waitFor(() => expect(session.approval.requestPending).not.toBeNull());
    expect(await readFile(join(root, 'note.txt'), 'utf8')).toBe('old');
    await expect(session.newConversation()).rejects.toThrow('Stop');
    const pending = session.approval.requestPending!;
    session.approval.resolve(
      {
        approvalId: pending.approvalId,
        preparationKey: pending.preparationKey,
        decision: 'AllowOnce',
      },
      pending.runId,
    );
    await vi.waitFor(() =>
      expect(
        messages.some(
          (message) => message.type === 'Snapshot' && message.requestId.startsWith('completed-'),
        ),
      ).toBe(true),
    );
    expect(await readFile(join(root, 'note.txt'), 'utf8')).toBe('new');
    const id = session.conversationId;
    await session.dispose();
    const reopened = new DesktopStore(join(directory, 'data'));
    await reopened.load();
    const restored = new DesktopSession(reopened, keys, () => {});
    await restored.initialize();
    expect(restored.conversationId).toBe(id);
    expect(restored.root).toBe(await import('node:fs/promises').then((fs) => fs.realpath(root)));
    expect(
      (await reopened.get(id))?.entries.some(
        (entry) => entry.message.content === 'Updated the note.',
      ),
    ).toBe(true);
    await restored.dispose();
  });
});

describe('desktop boundary validation', () => {
  const draft = {
    kind: 'openaiCompatible',
    label: 'Custom',
    baseUrl: 'http://localhost:8000/v1',
    model: 'model',
    supportsTools: true,
    discoverModels: false,
    thinking: false,
    apiKey: '',
    keyAction: 'keep',
    rememberKey: true,
  };
  it('accepts explicit provider drafts and rejects injected fields, unsafe URLs and native execution requests', () => {
    expect(
      validateDesktopMessage({ protocolVersion: 1, requestId: 'x', type: 'SaveProvider', draft })
        .type,
    ).toBe('SaveProvider');
    for (const message of [
      { type: 'SaveProvider', draft: { ...draft, command: 'rm -rf' } },
      { type: 'SaveProvider', draft: { ...draft, baseUrl: 'https://user:key@example.com' } },
      { type: 'SaveProvider', draft: { ...draft, baseUrl: 'file:///secret' } },
      { type: 'SaveProvider', draft: { ...draft, baseUrl: 'https://example.com?key=secret' } },
      { type: 'ExecuteCommand', command: 'git status' },
      { type: 'OpenWorkspaceFile', path: 12 },
      { type: 'SelectConversation', conversationId: '../../data' },
    ])
      expect(() =>
        validateDesktopMessage({ protocolVersion: 1, requestId: 'x', ...message }),
      ).toThrow();
  });
});
