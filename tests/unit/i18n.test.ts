import { describe, expect, it } from 'vitest';
import { sr } from '../../webview/src/i18n/sr.js';
import { de } from '../../webview/src/i18n/de.js';
import { translate } from '../../webview/src/i18n/I18n.js';

describe('interface languages', () => {
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
});
