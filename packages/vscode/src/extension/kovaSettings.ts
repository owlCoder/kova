import * as vscode from 'vscode';
import type { KovaSettingsView } from '../../../protocol/src/KovaSettingsView.js';

type SettingKind =
  'language' | 'textSize' | 'openIn' | 'string' | 'url' | 'int' | 'boolean' | 'commandList';

interface SettingSpec {
  readonly kind: SettingKind;
  readonly min?: number;
  readonly max?: number;
}

/**
 * The only settings the chat dialog may change. Keys are configuration paths
 * without the `kova.` prefix; every value is re-validated here because webview
 * messages are untrusted input.
 */
const EDITABLE: Readonly<Record<string, SettingSpec>> = {
  'ui.language': { kind: 'language' },
  'ui.textSize': { kind: 'textSize' },
  'chat.openIn': { kind: 'openIn' },
  'context.maxTokens': { kind: 'int', min: 1024, max: 2_000_000 },
  'context.reservedOutputTokens': { kind: 'int', min: 256, max: 65_536 },
  'ollama.maxContextTokens': { kind: 'int', min: 1024, max: 1_000_000 },
  'ollama.baseUrl': { kind: 'url' },
  'ollama.model': { kind: 'string' },
  'ollama.think': { kind: 'boolean' },
  'ollama.keepAliveSeconds': { kind: 'int', min: 0, max: 86_400 },
  'commands.allow': { kind: 'commandList' },
};

const LANGUAGES = ['en', 'sr', 'de'] as const;
const TEXT_SIZES = ['standard', 'large', 'larger'] as const;
const OPEN_IN = ['editor', 'sidebar'] as const;

function coerce(key: string, spec: SettingSpec, value: unknown): unknown {
  switch (spec.kind) {
    case 'language':
      if (!LANGUAGES.includes(value as (typeof LANGUAGES)[number]))
        throw new Error(`${key} must be one of ${LANGUAGES.join(', ')}.`);
      return value;
    case 'textSize':
      if (!TEXT_SIZES.includes(value as (typeof TEXT_SIZES)[number]))
        throw new Error(`${key} must be one of ${TEXT_SIZES.join(', ')}.`);
      return value;
    case 'openIn':
      if (!OPEN_IN.includes(value as (typeof OPEN_IN)[number]))
        throw new Error(`${key} must be one of ${OPEN_IN.join(', ')}.`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${key} must be true or false.`);
      return value;
    case 'int': {
      if (typeof value !== 'number' || !Number.isInteger(value))
        throw new Error(`${key} must be a whole number.`);
      if (value < (spec.min ?? 0) || value > (spec.max ?? Number.MAX_SAFE_INTEGER))
        throw new Error(`${key} must be between ${spec.min} and ${spec.max}.`);
      return value;
    }
    case 'url': {
      if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\/\S+$/i.test(value))
        throw new Error(`${key} must be an HTTP(S) URL.`);
      return value;
    }
    case 'string':
      if (typeof value !== 'string' || value.length > 256 || value.includes('\0'))
        throw new Error(`${key} must be a short text value.`);
      return value;
    case 'commandList': {
      if (
        !Array.isArray(value) ||
        value.length > 50 ||
        value.some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 200)
      )
        throw new Error(`${key} must be up to 50 non-empty commands.`);
      return value.map((entry) => entry.trim());
    }
  }
}

/** Reads and validates the chat-editable Kova settings. */
export class KovaSettings {
  read(): KovaSettingsView {
    const config = vscode.workspace.getConfiguration('kova');
    const view: Record<string, string | number | boolean | readonly string[]> = {};
    for (const key of Object.keys(EDITABLE)) view[key] = config.get(key) as never;
    return view;
  }
  async apply(values: KovaSettingsView): Promise<void> {
    // Validate everything before touching the configuration.
    const updates = Object.entries(values).map(([key, value]) => {
      const spec = EDITABLE[key];
      if (!spec) throw new Error(`Setting ${key} is not editable from the chat.`);
      return [key, coerce(key, spec, value)] as const;
    });
    const config = vscode.workspace.getConfiguration('kova');
    for (const [key, value] of updates)
      await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
