import { describe, expect, it } from 'vitest';
import type { Memento } from 'vscode';
import { WorkspaceDraft } from '../../packages/vscode/src/extension/WorkspaceDraft.js';

describe('workspace composer recovery', () => {
  it('restores after a new extension session and consumes only the submitted draft', async () => {
    const values = new Map<string, unknown>();
    const state = {
      get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
      update: async (key: string, value: unknown) => {
        values.set(key, value);
      },
    } as unknown as Memento;
    const draft = new WorkspaceDraft(state);
    await draft.set('Original prompt');
    const restored = new WorkspaceDraft(state);
    expect(restored.text).toBe('Original prompt');
    await restored.set('Next prompt typed during submission');
    await restored.consume('Original prompt');
    expect(restored.text).toBe('Next prompt typed during submission');
    await restored.consume('Next prompt typed during submission');
    expect(new WorkspaceDraft(state).text).toBe('');
  });
});
