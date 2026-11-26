import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KovaSettings } from '../../packages/vscode/src/extension/kovaSettings.js';

const fixture = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  updates: [] as { key: string; value: unknown; target: unknown }[],
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => fixture.values[key],
      update: async (key: string, value: unknown, target: unknown) => {
        fixture.updates.push({ key, value, target });
        fixture.values[key] = value;
      },
    }),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

describe('chat-editable Kova settings', () => {
  beforeEach(() => {
    fixture.values = { 'ui.language': 'en', 'context.maxTokens': 200000 };
    fixture.updates = [];
  });

  it('reads only the allowlisted keys', () => {
    const view = new KovaSettings().read();
    expect(Object.keys(view).sort()).toEqual(
      [
        'ui.language',
        'ui.textSize',
        'chat.openIn',
        'context.maxTokens',
        'context.reservedOutputTokens',
        'ollama.maxContextTokens',
        'ollama.baseUrl',
        'ollama.model',
        'ollama.think',
        'ollama.keepAliveSeconds',
        'commands.allow',
      ].sort(),
    );
    expect(view['ui.language']).toBe('en');
  });

  it('applies valid values to the global configuration', async () => {
    await new KovaSettings().apply({
      'ui.language': 'sr',
      'chat.openIn': 'sidebar',
      'context.maxTokens': 128000,
      'ollama.think': true,
      'commands.allow': [' git status ', 'dotnet test'],
    });
    expect(fixture.updates.map((entry) => entry.key)).toEqual([
      'ui.language',
      'chat.openIn',
      'context.maxTokens',
      'ollama.think',
      'commands.allow',
    ]);
    expect(fixture.values['commands.allow']).toEqual(['git status', 'dotnet test']);
    expect(fixture.updates.every((entry) => entry.target === 1)).toBe(true);
  });

  it('rejects unknown keys and invalid values without touching the configuration', async () => {
    const settings = new KovaSettings();
    await expect(settings.apply({ 'ollama.apiKey': 'secret' } as never)).rejects.toThrow(
      'not editable',
    );
    await expect(settings.apply({ 'ui.language': 'fr' })).rejects.toThrow();
    await expect(settings.apply({ 'context.maxTokens': 12.5 })).rejects.toThrow();
    await expect(settings.apply({ 'context.maxTokens': 10 })).rejects.toThrow();
    await expect(settings.apply({ 'ollama.baseUrl': 'ftp://x' })).rejects.toThrow();
    await expect(settings.apply({ 'ollama.think': 'yes' })).rejects.toThrow();
    await expect(settings.apply({ 'commands.allow': [''] })).rejects.toThrow();
    expect(fixture.updates).toEqual([]);
  });
});
