import type { Language } from '../i18n/I18n.js';

/** BCP-47 tag handed to the Web Speech API for each UI language. */
export const speechLanguage: Record<Language, string> = {
  en: 'en-US',
  sr: 'sr-RS',
  de: 'de-DE',
};
