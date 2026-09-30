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
}));

vi.mock('vscode', () => ({
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
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
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
  });
  session = new ChatSession({} as vscode.ExtensionContext, '/fixture-workspace', {
    appendLine: (line: string) => {
      fixture.logs.push(line);
    },
  } as unknown as vscode.OutputChannel);
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
  it('resynchronizes both views with the current prompt and streamed text, preserving captured settings', async () => {
    await session.initialize();
    const secondView: HostMessage[] = [];
    session.connect((message) => secondView.push(message));
    await beginStream();
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
      contextMaxTokens: 8192,
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
});
