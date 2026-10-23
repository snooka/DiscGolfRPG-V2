// Adressen i bekreftelses-e-posten for nye kontoer. «Glemt passord» bruker ingen lenke (6-sifret kode i stedet),
// så det finnes ikke lenger noen dyp lenke eller omdirigering for nullstilling.
// Inne i Capacitor-appen er origin https://localhost, som e-postappen ikke kan åpne: da sendes ingen redirectTo,
// og Supabase bruker Site URL (sett den til PWA-adressen, ikke localhost).

export interface RedirectEnv {
  /** Kjører vi i Capacitor-appen? */
  native: boolean;
  /** Fast offentlig adresse til nettversjonen (VITE_PUBLIC_APP_URL). */
  publicUrl?: string;
  origin: string;
  pathname: string;
}

const isLocal = (url: string): boolean => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);

export function signupRedirectUrl(env: RedirectEnv): string | undefined {
  const pub = (env.publicUrl ?? '').trim().replace(/\/+$/, '');
  if (pub && !isLocal(pub)) return `${pub}/`;
  if (env.native) return undefined;
  return `${env.origin}${env.pathname}`;
}
