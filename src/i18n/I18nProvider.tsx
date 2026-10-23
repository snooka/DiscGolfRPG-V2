import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { applyDocumentLang, getLang, setLang as setGlobalLang, subscribeLang, t } from './index.ts';
import type { Lang } from './index.ts';
import { I18nContext } from './i18n-context.ts';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang);
  useEffect(() => {
    applyDocumentLang();
    return subscribeLang(setLangState);
  }, []);
  const setLang = useCallback((l: Lang) => setGlobalLang(l), []);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
