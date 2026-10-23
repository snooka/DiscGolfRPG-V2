import { useI18n } from '../i18n/i18n-context.ts';
import { LANGS } from '../i18n/index.ts';

/** Enkel Norsk / English-velger. Teksten på knappene oversettes ikke (hvert språk heter sitt eget navn). */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('Språk')}
      className={`inline-flex rounded-xl border border-slate-700 bg-slate-900/60 p-0.5 ${compact ? 'text-xs' : 'text-sm'}`}
    >
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id === 'no' ? 'nb' : 'en'}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          className={`rounded-[10px] px-3 py-1.5 font-semibold transition-colors ${
            lang === l.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
