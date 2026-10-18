import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { HostMessage } from '../../packages/protocol/src/HostMessage.js';

const fixture = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  initializationBlock: null as Promise<void> | null,
  initializationCount: 0,
  concurrentInitializations: 0,
  maxConcurrentInitializations: 0,
  controllers: [] as ReadableStreamDefaultController<Uint8Array>[],
  chatBodies: [] as Record<string, unknown>[],
  logs: [] as string[],
  onboarding: new Map<string, boolean>(),
  drafts: new Map<string, unknown>(),
  clipboard: [] as string[],
  clipboardWrite: null as Promise<void> | null,
}));

vi.mock('vscode', () => ({
  env: {
    clipboard: {
      writeText: async (text: string) => {
        await fixture.clipboardWrite;
        fixture.clipboard.push(text);
      },
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => fixture.settings[key] ?? fallback,
    }),
  },
}));
vi.mock('../../packages/vscode/src/adapters/WorkspaceRuntime.js', () => ({
  WorkspaceRuntime: class {
    async initialize(cancellation: { throwIfCancellationRequested(): void }) {
      fixture.initializationCount++;
      fixture.concurrentInitializations++;
      fixture.maxConcurrentInitializations = Math.max(
        fixture.maxConcurrentInitializations,
        fixture.concurrentInitializations,
      );
      try {
        await fixture.initializationBlock;
        cancellation.throwIfCancellationRequested();
      } finally {
        fixture.concurrentInitializations--;
      }
    }
    definitions() {
      return [];
    }
    async dispose() {}
  },
}));

import { ChatSession } from '../../packages/vscode/src/extension/ChatSession.js';

let session: ChatSession;
let messages: HostMessage[];
beforeEach(() => {
  fixture.settings = {};
  fixture.initializationBlock = null;
  fixture.initializationCount = 0;
  fixture.concurrentInitializations = 0;
  fixture.maxConcurrentInitializations = 0;
  fixture.controllers = [];
  fixture.chatBodies = [];
  fixture.logs = [];
  fixture.onboarding.clear();
  fixture.drafts.clear();
  fixture.clipboard = [];
  fixture.clipboardWrite = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/tags'))
        return Response.json({
          models: [{ name: 'qwen3:4b', size: 100, capabilities: ['tools', 'thinking'] }],
        });
      expect(String(input)).toMatch(/\/api\/chat$/);
      fixture.chatBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          fixture.controllers.push(controller);
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Stopped', 'AbortError')),
          );
        },
      });
      return new Response(stream);
    }),
  );
  session = new ChatSession(
    {
      workspaceState: {
        get: (key: string, fallback: string) => fixture.drafts.get(key) ?? fallback,
        update: async (key: string, value: string) => {
          fixture.drafts.set(key, value);
        },
      },
      globalState: {
        get: (key: string, fallback: boolean) => fixture.onboarding.get(key) ?? fallback,
        update: async (key: string, value: boolean) => {
          fixture.onboarding.set(key, value);
        },
      },
    } as unknown as vscode.ExtensionContext,
    '/fixture-workspace',
    {
      appendLine: (line: string) => {
        fixture.logs.push(line);
      },
    } as unknown as vscode.OutputChannel,
  );
  messages = [];
  session.connect((message) => messages.push(message));
});
afterEach(async () => {
  fixture.initializationBlock = null;
  await session.dispose();
  vi.unstubAllGlobals();
});

const submit = (requestId = 'submit') =>
  session.handle({
    protocolVersion: 1,
    requestId,
    type: 'SubmitPrompt',
    prompt: 'A public test prompt',
    modelId: 'qwen3:4b',
    mode: 'Plan',
    skillId: null,
    attachmentIds: [],
  });
const send = (record: Record<string, unknown>) =>
  fixture.controllers[0]!.enqueue(new TextEncoder().encode(`${JSON.stringify(record)}\n`));
const finish = async () => {
  send({ done: true, prompt_eval_count: 43, eval_count: 2 });
  await vi.waitFor(() =>
    expect(
      messages.some(
        (message) => message.type === 'Snapshot' && message.requestId.startsWith('completed-'),
      ),
    ).toBe(true),
  );
};
const latestSnapshot = () =>
  messages.filter((message) => message.type === 'Snapshot').at(-1)!.snapshot;
const beginStream = async () => {
  await submit();
  await vi.waitFor(() => expect(fixture.controllers).toHaveLength(1));
};

describe('shared chat session synchronization', () => {
  it('persists workspace drafts, excludes reasoning from export and refuses active/stale exports', async () => {
    await session.initialize();
    await session.snapshot('draft-start');
    const conversationId = latestSnapshot().conversationId;
    await session.handle({
      protocolVersion: 1,
      requestId: 'draft',
      type: 'UpdateDraft',
      conversationId,
      prompt: 'Unsent draft',
    });
    await session.snapshot('draft-restored');
    expect(latestSnapshot().draft).toBe('Unsent draft');
    expect(fixture.drafts.get('kova.composerDraft')).toBe('Unsent draft');
    await beginStream();
    const exportRequest = {
      protocolVersion: 1 as const,
      requestId: 'export-active',
      type: 'ExportConversation' as const,
      conversationId,
      action: 'copy' as const,
    };
    await expect(session.handle(exportRequest)).rejects.toThrow('Stop the active task');
    send({ message: { content: 'Public answer', thinking: 'private reasoning' } });
    await finish();
    await session.handle({ ...exportRequest, requestId: 'export-complete' });
    expect(fixture.clipboard[0]).toContain('Public answer');
    expect(fixture.clipboard[0]).not.toContain('private reasoning');
    await session.newConversation();
    await session.snapshot('draft-new');
    expect(latestSnapshot().draft).toBe('');
    expect(fixture.drafts.get('kova.composerDraft')).toBe('');
    await expect(session.handle({ ...exportRequest, requestId: 'export-stale' })).rejects.toThrow();
  });

  it('persists onboarding dismissal and serializes configuration against submission', async () => {
    await session.initialize();
    await session.handle({ protocolVersion: 1, requestId: 'setup-state', type: 'Ready' });
    expect(latestSnapshot().setupCompleted).toBe(false);
    await session.handle({ protocolVersion: 1, requestId: 'finish-setup', type: 'CompleteSetup' });
    expect(latestSnapshot().setupCompleted).toBe(true);
    let finishSetup!: () => void;
    const configuring = session.configureProvider(async () => {
      await new Promise<void>((resolve) => {
        finishSetup = resolve;
      });
      return false;
    });
    await vi.waitFor(() => expect(finishSetup).toBeTypeOf('function'));
    expect(latestSnapshot().configuringProvider).toBe(true);
    await expect(submit()).rejects.toThrow('already generating');
    await expect(session.configureProvider(async () => true)).rejects.toThrow('current setup');
    finishSetup();
    await configuring;
    expect(latestSnapshot().configuringProvider).toBe(false);
    expect(fixture.chatBodies).toHaveLength(0);
  });

  it('defers provider refresh until generation stops and rejects setup during a run', async () => {
    await session.initialize();
    await beginStream();
    await expect(session.configureProvider(async () => true)).rejects.toThrow('Stop generation');
    fixture.settings['ollama.baseUrl'] = 'http://localhost:11435';
    await session.configurationChanged();
    expect(fetch).not.toHaveBeenCalledWith('http://localhost:11435/api/tags', expect.anything());
    await finish();
    expect(fetch).toHaveBeenCalledWith('http://localhost:11435/api/tags', expect.anything());
    expect(latestSnapshot().providerStatus).toBe('Available');
  });

  it('resynchronizes both views with the current prompt and streamed text, preserving captured settings', async () => {
    await session.initialize();
    const secondView: HostMessage[] = [];
    session.connect((message) => secondView.push(message));
    await beginStream();
    expect(fixture.chatBodies[0]?.options).toMatchObject({ num_ctx: 32768, num_predict: 4096 });
    expect(
      secondView.find(
        (message) => message.type === 'Snapshot' && message.requestId.startsWith('started-'),
      ),
    ).toMatchObject({
      snapshot: {
        state: 'BuildingContext',
        messages: [{ role: 'user', content: 'A public test prompt' }],
      },
    });
    send({ message: { content: 'Hello', thinking: 'private transient reasoning' } });
    await vi.waitFor(() =>
      expect(
        messages.some(
          (message) => message.type === 'Event' && message.event.type === 'ResponseDelta',
        ),
      ).toBe(true),
    );
    fixture.settings['context.maxTokens'] = 16384;
    fixture.settings['ollama.think'] = true;
    await session.initialize();
    await session.handle({ protocolVersion: 1, requestId: 'second-view-ready', type: 'Ready' });
    expect(latestSnapshot()).toMatchObject({
      state: 'Streaming',
      thinkingEnabled: false,
      contextMaxTokens: 32768,
      messages: [
        { role: 'user', content: 'A public test prompt', partial: false },
        { role: 'assistant', content: 'Hello', partial: true },
      ],
    });
    expect(secondView.filter((message) => message.type === 'Snapshot').at(-1)?.snapshot).toEqual(
      latestSnapshot(),
    );
    expect(JSON.stringify(latestSnapshot())).not.toContain('private transient reasoning');
    expect(fixture.initializationCount).toBe(2);
    await finish();
    expect(latestSnapshot().usage).toMatchObject({ actualInputTokens: 43, actualOutputTokens: 2 });
    expect(latestSnapshot().messages.at(-1)).toMatchObject({ content: 'Hello', partial: false });
    await session.handle({ protocolVersion: 1, requestId: 'final-ready', type: 'Ready' });
    expect(latestSnapshot().messages.at(-1)).toMatchObject({ content: 'Hello', partial: false });
  });

  it('serializes an idle initialization and submission, without granting two simultaneous runs', async () => {
    await session.initialize();
    let unblock!: () => void;
    fixture.initializationBlock = new Promise<void>((resolve) => (unblock = resolve));
    const initializing = session.initialize();
    const submitting = submit();
    await expect(submit('duplicate-submit')).rejects.toThrow('already generating');
    expect(fixture.chatBodies).toHaveLength(0);
    expect(fixture.initializationCount).toBe(2);
    fixture.initializationBlock = null;
    unblock();
    await Promise.all([initializing, submitting]);
    await vi.waitFor(() => expect(fixture.controllers).toHaveLength(1));
    expect(fixture.maxConcurrentInitializations).toBe(1);
    expect(fixture.initializationCount).toBe(3);
    await finish();
  });

  it('keeps a failed or disposed view from interrupting generation in the other view', async () => {
    await session.initialize();
    session.connect(() => {
      throw new Error('View has closed');
    });
    await beginStream();
    send({ message: { content: 'Still delivered' } });
    await finish();
    expect(latestSnapshot().state).toBe('Completed');
    expect(latestSnapshot().messages.at(-1)?.content).toBe('Still delivered');
    expect(fixture.logs).toContain('[WebviewDeliveryFailed]');
    expect(fixture.logs.join('\n')).not.toContain('Still delivered');
  });

  it('cancels submission waiting for initialization when its editor tab closes', async () => {
    await session.initialize();
    let unblock!: () => void;
    fixture.initializationBlock = new Promise<void>((resolve) => (unblock = resolve));
    const initializing = session.initialize();
    const submitting = expect(submit()).rejects.toThrow('Generation cancelled');
    session.cancelActiveRun();
    fixture.initializationBlock = null;
    unblock();
    await Promise.all([initializing, submitting]);
    expect(fixture.chatBodies).toHaveLength(0);
    await session.snapshot('cancelled-preparation');
    expect(latestSnapshot().activeRunId).toBeNull();
    expect(latestSnapshot().state).toBe('Idle');
  });

  it('preserves an interrupted partial answer on later Ready snapshots without inventing final usage', async () => {
    await session.initialize();
    await beginStream();
    send({ message: { content: 'Interrupted answer' } });
    fixture.controllers[0]!.close();
    await vi.waitFor(() => expect(latestSnapshot().state).toBe('Failed'));
    expect(latestSnapshot().usage?.actualInputTokens).toBeNull();
    await session.handle({ protocolVersion: 1, requestId: 'failed-view-ready', type: 'Ready' });
    expect(latestSnapshot().messages.at(-1)).toMatchObject({
      content: 'Interrupted answer',
      partial: true,
    });
    expect(fixture.logs).toContain('[ErrorOccurred] AgentFailed');
    expect(fixture.logs.join('\n')).not.toContain('Interrupted answer');
  });

  it('shares a workspace prompt library across views, keeps it across new chats and out of model context', async () => {
    const secondView: HostMessage[] = [];
    const disconnect = session.connect((message) => secondView.push(message));
    await session.handle({
      protocolVersion: 1,
      requestId: 'library-read',
      type: 'GetPromptLibrary',
    });
    const empty = messages.filter((message) => message.type === 'PromptLibrary').at(-1)!.library;
    await session.handle({
      protocolVersion: 1,
      requestId: 'library-save',
      type: 'SavePrompt',
      revision: empty.revision,
      id: null,
      title: 'Private saved prompt',
      text: 'UNSENT_LIBRARY_TEXT',
    });
    const saved = messages.filter((message) => message.type === 'PromptLibrary').at(-1)!.library;
    expect(saved.prompts[0]?.text).toBe('UNSENT_LIBRARY_TEXT');
    expect(
      secondView.filter((message) => message.type === 'PromptLibrary').at(-1)?.library,
    ).toEqual(saved);
    expect(fixture.drafts.get('kova.promptLibrary')).toEqual(saved);
    await session.newConversation();
    await session.handle({
      protocolVersion: 1,
      requestId: 'library-after-new',
      type: 'GetPromptLibrary',
    });
    expect(messages.filter((message) => message.type === 'PromptLibrary').at(-1)!.library).toEqual(
      saved,
    );
    await session.initialize();
    await beginStream();
    expect(JSON.stringify(fixture.chatBodies)).not.toContain('UNSENT_LIBRARY_TEXT');
    expect(JSON.stringify(messages.filter((message) => message.type === 'Snapshot'))).not.toContain(
      'UNSENT_LIBRARY_TEXT',
    );
    await finish();
    disconnect();
  });

  it('acknowledges only completed clipboard writes and never reports success for a failed write', async () => {
    let finishWrite!: () => void;
    fixture.clipboardWrite = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const copying = session.handle({
      protocolVersion: 1,
      requestId: 'copy-ack',
      type: 'CopyText',
      text: 'Copied text',
    });
    expect(messages.some((message) => message.type === 'ClipboardCopied')).toBe(false);
    finishWrite();
    await copying;
    expect(fixture.clipboard).toEqual(['Copied text']);
    expect(
      messages
        .filter((message) => message.type === 'ClipboardCopied')
        .map((message) => message.requestId),
    ).toEqual(['copy-ack']);
    fixture.clipboardWrite = Promise.reject(new Error('Clipboard unavailable'));
    await expect(
      session.handle({
        protocolVersion: 1,
        requestId: 'copy-failed',
        type: 'CopyText',
        text: 'Not copied',
      }),
    ).rejects.toThrow('Clipboard unavailable');
    expect(fixture.clipboard).toEqual(['Copied text']);
    expect(messages.filter((message) => message.type === 'ClipboardCopied')).toHaveLength(1);
  });
});
