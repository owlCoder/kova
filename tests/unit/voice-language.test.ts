import { describe, expect, it } from 'vitest';
import { speechLanguage } from '../../webview/src/components/speechLanguage.js';

describe('speechLanguage', () => {
  it('maps every UI language to a BCP-47 speech tag', () => {
    expect(speechLanguage).toEqual({
      en: 'en-US',
      sr: 'sr-RS',
      de: 'de-DE',
    });
    for (const tag of Object.values(speechLanguage)) expect(tag).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });
});
