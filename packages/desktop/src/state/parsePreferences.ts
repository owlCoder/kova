import type { DesktopPreferences } from './DesktopPreferences.js';
import { defaultPreferences } from './DesktopPreferences.js';

export function parsePreferences(raw: unknown): DesktopPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid settings.');
  const input = raw as Record<string, unknown>;
  const provider = input.provider as Record<string, unknown> | undefined;
  const defaults = defaultPreferences.provider;
  const kind = provider?.kind ?? defaults.kind;
  const baseUrl = provider?.baseUrl ?? defaults.baseUrl;
  if (
    !['ollama', 'deepseek', 'openaiCompatible'].includes(String(kind)) ||
    typeof baseUrl !== 'string'
  )
    throw new Error('Invalid provider settings.');
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid provider endpoint.');
  const string = (value: unknown, fallback: string, max: number) =>
    typeof value === 'string' ? value.slice(0, max) : fallback;
  const boolean = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const themes = ['dark', 'light', 'system'];
  const tokens = input.contextMaxTokens;
  return {
    provider: {
      kind: kind as DesktopPreferences['provider']['kind'],
      label: string(provider?.label, defaults.label, 100),
      baseUrl,
      model: string(provider?.model, defaults.model, 256),
      supportsTools: boolean(provider?.supportsTools, true),
      discoverModels: boolean(provider?.discoverModels, true),
    },
    thinking: boolean(input.thinking, false),
    contextMaxTokens:
      typeof tokens === 'number' && Number.isInteger(tokens) && tokens >= 512 && tokens <= 1_048_576
        ? tokens
        : defaultPreferences.contextMaxTokens,
    theme: themes.includes(String(input.theme))
      ? (input.theme as DesktopPreferences['theme'])
      : 'dark',
    language: ['en', 'sr', 'de'].includes(String(input.language))
      ? (input.language as DesktopPreferences['language'])
      : 'en',
    textSize: ['standard', 'large', 'larger'].includes(String(input.textSize))
      ? (input.textSize as DesktopPreferences['textSize'])
      : 'standard',
    recentWorkspaces: Array.isArray(input.recentWorkspaces)
      ? input.recentWorkspaces
          .filter((path): path is string => typeof path === 'string' && path.length <= 4096)
          .slice(0, 10)
      : [],
    lastConversationId:
      typeof input.lastConversationId === 'string' &&
      /^[a-f0-9-]{36}$/.test(input.lastConversationId)
        ? input.lastConversationId
        : null,
    setupCompleted: boolean(input.setupCompleted, false),
    commandAllowlist: Array.isArray(input.commandAllowlist)
      ? input.commandAllowlist
          .filter(
            (command): command is string => typeof command === 'string' && command.length <= 1000,
          )
          .slice(0, 200)
      : defaultPreferences.commandAllowlist,
  };
}
