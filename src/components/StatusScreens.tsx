import type { ReactNode } from 'react';
import { FancyDiscLogo } from './ui/FancyDiscLogo.tsx';
import { t } from '../i18n/index.ts';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center">
      <FancyDiscLogo size="lg" />
      {children}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <Frame>
      <p className="text-sm font-bold text-slate-400" role="status">
        {t('Laster…')}</p>
    </Frame>
  );
}

export function LoadErrorScreen({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return (
    <Frame>
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-black text-white">{t('Fikk ikke hentet profilen din')}</h1>
        <p role="alert" className="text-sm text-slate-400">
          {message}
        </p>
        <button type="button" className="btn btn-primary w-full" onClick={onRetry}>
          {t('Prøv igjen')}</button>
        <button type="button" className="btn btn-ghost w-full" onClick={onLogout}>
          {t('Logg ut')}</button>
      </div>
    </Frame>
  );
}

/** Vises hvis appen er bygget uten Supabase-nøkler. */
export function ConfigMissingScreen() {
  return (
    <Frame>
      <div className="max-w-md space-y-3 text-left">
        <h1 className="text-center text-lg font-black text-white">{t('Skyen er ikke satt opp ennå')}</h1>
        <p className="text-sm text-slate-300">
          {t('Appen lagrer brukere, venner, topplister og runder i en Supabase-database. Slik kobler du den til:')}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>{t('Opprett et gratis prosjekt på supabase.com.')}</li>
          <li>{t('Åpne SQL Editor, lim inn innholdet i supabase/schema.sql og trykk Run.')}</li>
          <li>{t('Kopier .env.example til .env og fyll inn Project URL og anon key (Project Settings → API).')}</li>
          <li>{t('Start på nytt (npm run dev) eller bygg på nytt.')}</li>
        </ol>
        <p className="text-xs text-slate-500">{t('Se README.md for hele veiledningen, inkludert e-postinnstillinger.')}</p>
      </div>
    </Frame>
  );
}
