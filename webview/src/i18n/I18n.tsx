import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { sr } from './sr.js';
import { de } from './de.js';

export type Language = 'en' | 'sr' | 'de';
export function translate(
  language: Language,
  text: string,
  values: Record<string, string | number> = {},
): string {
  const dictionary: Readonly<Record<string, string>> =
    language === 'sr' ? sr : language === 'de' ? de : {};
  return (dictionary[text] ?? text).replace(/\{(\w+)\}/g, (match, name: string) =>
    String(values[name] ?? match),
  );
}
const Locale = createContext<Language>('en');
export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = language === 'sr' ? 'sr-Latn' : language;
  }, [language]);
  return <Locale.Provider value={language}>{children}</Locale.Provider>;
}
export function useI18n() {
  const language = useContext(Locale);
  return {
    language,
    t: (text: string, values?: Record<string, string | number>) =>
      translate(language, text, values),
  };
}
