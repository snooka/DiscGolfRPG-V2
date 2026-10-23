import { createContext, useContext } from 'react';
import { DEFAULT_LANG, t } from './index.ts';
import type { Lang, Vars } from './index.ts';

export interface I18nApi {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (source: string, vars?: Vars) => string;
}

export const I18nContext = createContext<I18nApi>({ lang: DEFAULT_LANG, setLang: () => undefined, t });

export const useI18n = (): I18nApi => useContext(I18nContext);
