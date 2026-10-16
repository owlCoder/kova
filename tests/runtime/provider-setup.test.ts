import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';

const fixture = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  writes: [] as [string, unknown][],
  choices: [] as (string | undefined)[],
  inputs: [] as (string | undefined)[],
  secrets: new Map<string, string>(),
  warnings: [] as string[],
  cancelProgress: false,
  workspaceOverride: false,
  targets: [] as number[],
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  ProgressLocation: { Notification: 15 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => fixture.settings[key] ?? fallback,
      inspect: () => (fixture.workspaceOverride ? { workspaceValue: 'existing' } : {}),
      update: async (key: string, value: unknown, target: number) => {
        fixture.writes.push([key, value]);
        fixture.targets.push(target);
        fixture.settings[key] = value;
      },
    }),
  },
  window: {
    showQuickPick: async (items: { label: string }[]) => {
      const choice = fixture.choices.shift();
      if (choice === 'Save and use provider') expect(fixture.writes).toHaveLength(0);
      return items.find((item) => item.label === choice);
    },
    showInputBox: async () => fixture.inputs.shift(),
    showWarningMessage: async (message: string) => {
      fixture.warnings.push(message);
      return undefined;
    },
    withProgress: async (_options: unknown, task: (progress: unknown, token: unknown) => unknown) =>
      task(
        {},
        {
          isCancellationRequested: fixture.cancelProgress,
          onCancellationRequested: () => ({ dispose() {} }),
        },
      ),
  },
}));

import { ProviderApiKeyStore } from '../../packages/vscode/src/providers/ProviderApiKeyStore.js';
import { ProviderManager } from '../../packages/vscode/src/providers/ProviderManager.js';
import {
  ProviderSetupWizard,
  validateEndpoint,
} from '../../packages/vscode/src/providers/ProviderSetupWizard.js';

let keys: ProviderApiKeyStore;
let manager: ProviderManager;
let wizard: ProviderSetupWizard;
beforeEach(() => {
  fixture.settings = {};
  fixture.writes = [];
  fixture.choices = [];
  fixture.inputs = [];
  fixture.secrets.clear();
  fixture.warnings = [];
  fixture.cancelProgress = false;
  fixture.workspaceOverride = false;
  fixture.targets = [];
  keys = new ProviderApiKeyStore({
    get: async (key: string) => fixture.secrets.get(key),
    store: async (key: string, value: string) => {
      fixture.secrets.set(key, value);
    },
    delete: async (key: string) => {
      fixture.secrets.delete(key);
    },
  } as unknown as vscode.SecretStorage);
  manager = new ProviderManager(keys);
  wizard = new ProviderSetupWizard(manager, keys);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [{ id: 'model-x' }] })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('guided provider configuration', () => {
  it('discovers a cloud model and saves credentials only in endpoint-scoped secret storage', async () => {
    fixture.choices = [
      'OpenRouter',
      'Discover models',
      'model-x',
      'Enable tools',
      'Save and use provider',
    ];
    fixture.inputs = ['https://openrouter.ai/api/v1', 'private-test-key'];
    expect(await wizard.run()).toBe(true);
    expect(manager.configuration()).toMatchObject({
      label: 'OpenRouter',
      model: 'model-x',
      kind: 'openaiCompatible',
    });
    expect(await keys.get('openaiCompatible', 'https://openrouter.ai/api/v1')).toBe(
      'private-test-key',
    );
    expect(await keys.get('openaiCompatible', 'https://other.example/v1')).toBeUndefined();
    expect(JSON.stringify(fixture.settings)).not.toContain('private-test-key');
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer private-test-key' }),
      }),
    );
    expect(fixture.targets.every((target) => target === 1)).toBe(true);
  });

  it.each([
    { choices: [undefined], inputs: [] },
    { choices: ['OpenAI'], inputs: [undefined] },
    { choices: ['OpenAI'], inputs: ['https://api.openai.com/v1', undefined] },
    { choices: ['OpenAI', undefined], inputs: ['https://api.openai.com/v1', 'key'] },
    {
      choices: ['OpenAI', 'Discover models', undefined],
      inputs: ['https://api.openai.com/v1', 'key'],
    },
    {
      choices: ['OpenAI', 'Discover models', 'model-x', 'Enable tools', undefined],
      inputs: ['https://api.openai.com/v1', 'key'],
    },
  ])(
    'leaves settings and credentials unchanged on cancellation: $choices',
    async ({ choices, inputs }) => {
      fixture.choices = choices;
      fixture.inputs = inputs;
      expect(await wizard.run()).toBe(false);
      expect(fixture.writes).toHaveLength(0);
      expect(fixture.secrets.size).toBe(0);
    },
  );

  it('supports a manual model without requesting /models and honors workspace overrides', async () => {
    fixture.workspaceOverride = true;
    fixture.choices = [
      'Custom provider',
      'Enter model ID manually',
      'Chat only',
      'Save and use provider',
    ];
    fixture.inputs = ['http://localhost:9000/v1/', '', 'private-model'];
    expect(await wizard.run()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(manager.configuration()).toMatchObject({ discoverModels: false, supportsTools: false });
    expect((await manager.discover(new CancellationSource())).models).toEqual([
      expect.objectContaining({ id: 'private-model', tools: 'Unsupported' }),
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.targets.every((target) => target === 2)).toBe(true);
  });

  it('does not save or show an error when connection checking is cancelled', async () => {
    fixture.cancelProgress = true;
    fixture.choices = ['OpenAI', 'Discover models'];
    fixture.inputs = ['https://api.openai.com/v1', 'key'];
    expect(await wizard.run()).toBe(false);
    expect(fixture.writes).toHaveLength(0);
    expect(fixture.warnings).toHaveLength(0);
  });

  it('does not save a failed connection or an empty model list', async () => {
    fixture.choices = ['OpenAI', 'Discover models'];
    fixture.inputs = ['https://api.openai.com/v1', 'key'];
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
    expect(await wizard.run()).toBe(false);
    expect(fixture.writes).toHaveLength(0);
    expect(fixture.secrets.size).toBe(0);
    expect(fixture.warnings[0]).toContain('Could not load');
  });

  it.each([
    'ftp://host',
    'https://user:key@host/v1',
    'https://host/v1?key=secret',
    'https://host/#key',
    'invalid',
  ])('rejects invalid or credential-bearing endpoints: %s', (endpoint) => {
    expect(validateEndpoint(endpoint)).toBeTypeOf('string');
  });
});

describe('provider metadata cache', () => {
  it('reuses discovery for a minute, refreshes on retry, and invalidates changed configuration', async () => {
    vi.useFakeTimers();
    fixture.settings = { provider: 'openaiCompatible', 'openaiCompatible.model': 'model-x' };
    const source = new CancellationSource();
    await manager.discover(source);
    await manager.discover(source);
    expect(fetch).toHaveBeenCalledTimes(1);
    await manager.discover(source, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await manager.discover(source);
    expect(fetch).toHaveBeenCalledTimes(3);
    fixture.settings['openaiCompatible.baseUrl'] = 'https://another.example/v1';
    await manager.discover(source);
    expect(fetch).toHaveBeenCalledTimes(4);
    manager.clear();
    await manager.discover(source);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('migrates the previous credential once and never reuses it on another endpoint', async () => {
    await keys.set('openaiCompatible', 'legacy-secret');
    expect(await keys.get('openaiCompatible', 'https://first.example/v1')).toBe('legacy-secret');
    expect(await keys.get('openaiCompatible', 'https://second.example/v1')).toBeUndefined();
    await keys.delete('openaiCompatible', 'https://first.example/v1');
    expect(await keys.get('openaiCompatible', 'https://first.example/v1')).toBeUndefined();
  });
});
