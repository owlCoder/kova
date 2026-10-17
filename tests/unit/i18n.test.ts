import { describe, expect, it } from 'vitest';
import { sr } from '../../webview/src/i18n/sr.js';
import { de } from '../../webview/src/i18n/de.js';
import { translate } from '../../webview/src/i18n/I18n.js';
import { parsePreferences } from '../../packages/desktop/src/state/parsePreferences.js';
import { validateDesktopMessage } from '../../packages/desktop/src/main/validateDesktopMessage.js';

describe('desktop language and readability preferences', () => {
  it('translates complete matching catalogs with placeholder parity and an English fallback', () => {
    expect(Object.keys(sr).sort()).toEqual(Object.keys(de).sort());
    expect(Object.keys(sr).length).toBeGreaterThan(250);
    for (const [key, value] of Object.entries(sr)) {
      const placeholders = (text: string) => text.match(/\{\w+\}/g)?.sort() ?? [];
      expect(value.trim(), key).not.toBe('');
      expect(placeholders(value), key).toEqual(placeholders(key));
      expect(placeholders(de[key]!), key).toEqual(placeholders(key));
    }
    expect(translate('sr', 'Settings')).toBe('Podešavanja');
    expect(translate('de', 'Settings')).toBe('Einstellungen');
    expect(translate('sr', 'Project: {name}', { name: 'my-code' })).toBe('Projekat: my-code');
    expect(translate('en', 'User content {name}', { name: '<keep-as-text>' })).toBe(
      'User content <keep-as-text>',
    );
    expect(translate('de', 'Untranslated provider output')).toBe('Untranslated provider output');
  });
  it('preserves valid language/text settings, migrates old settings and rejects malformed terminal/window intents', () => {
    expect(parsePreferences({ language: 'sr', textSize: 'large' })).toMatchObject({
      language: 'sr',
      textSize: 'large',
    });
    expect(parsePreferences({ language: 'fr', textSize: 'huge' })).toMatchObject({
      language: 'en',
      textSize: 'standard',
    });
    const valid = { protocolVersion: 1, requestId: 'test' };
    expect(
      validateDesktopMessage({ ...valid, type: 'OpenTerminal', cols: 80, rows: 24 }).type,
    ).toBe('OpenTerminal');
    for (const intent of [
      { type: 'SetLanguage', language: 'fr' },
      { type: 'SetTextSize', textSize: 500 },
      { type: 'OpenTerminal', cols: 0, rows: 24 },
      { type: 'OpenTerminal', cols: 80, rows: NaN },
      { type: 'OpenTerminal', cols: 80, rows: 24, command: 'injected' },
      { type: 'TerminalInput', terminalId: '../escape', data: 'x' },
      { type: 'TerminalInput', terminalId: 'a'.repeat(36), data: 'x'.repeat(17000) },
      { type: 'TerminalAck', terminalId: 'a'.repeat(36), characters: -1 },
      { type: 'WindowAction', action: 'execute' },
    ])
      expect(() => validateDesktopMessage({ ...valid, ...intent })).toThrow();
  });
});
