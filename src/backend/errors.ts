import { t } from '../i18n/index.ts';
/**
 * Gjør feil fra Supabase om til norske, RIKTIGE meldinger.
 * Viktig: «brukernavnet er tatt» sies KUN når databasen faktisk melder om navnekonflikt.
 * Alt annet får sin egen melding, slik at en feil i oppsettet aldri forkles som noe annet.
 */
export function translate(message: string, code?: string): string {
  const m = message.toLowerCase();
  const c = (code ?? '').toLowerCase();

  if (m.includes('invalid login credentials') || c === 'invalid_credentials') return t('Feil e-post eller passord.');
  if (m.includes('email not confirmed') || c === 'email_not_confirmed') {
    return t('E-posten er ikke bekreftet ennå. Trykk på lenken i e-posten vi sendte deg.');
  }
  if (m.includes('already registered') || m.includes('already been registered') || c === 'user_already_exists' || c === 'email_exists') {
    return t('Denne e-posten er allerede registrert. Logg inn i stedet.');
  }
  if (c === 'email_address_not_authorized' || m.includes('email address not authorized')) {
    return t('Appen kan ikke sende e-post til denne adressen ennå (e-postutsending er ikke ferdig satt opp). Kontakt den som drifter appen.');
  }
  if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || m.includes('rate limit') || m.includes('security purposes')) {
    return t('For mange forsøk på kort tid. Vent litt og prøv igjen.');
  }
  if (c === 'otp_expired' || c === 'otp_disabled' || (m.includes('token') && (m.includes('expired') || m.includes('invalid')))) {
    return t('Koden er feil eller utløpt. Be om en ny kode.');
  }
  if (c === 'weak_password' || (m.includes('password') && (m.includes('weak') || m.includes('at least')))) {
    return t('Passordet er for svakt. Bruk minst 6 tegn.');
  }
  if (m.includes('same password') || m.includes('different from the old') || c === 'same_password') {
    return t('Det nye passordet må være forskjellig fra det gamle.');
  }
  if (c === 'email_address_invalid' || (m.includes('email address') && m.includes('invalid'))) {
    return t('E-postadressen ser ikke gyldig ut.');
  }
  if (c === 'signup_disabled' || m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return t('Registrering er slått av i Supabase (Authentication → Providers → Email må være på).');
  }

  // Ekte navnekonflikt: den unike indeksen på profiles.name, eller vår egen melding
  if (
    m.includes('profiles_name_key') ||
    m.includes('brukernavnet er allerede') ||
    (m.includes('duplicate key') && m.includes('profiles') && m.includes('name'))
  ) {
    return t('Brukernavnet er allerede tatt. Velg et annet.');
  }

  // Supabase bruker denne generelle meldingen for ALLE feil i databasen under registrering
  // (manglende tabell/kolonne, trigger som feiler, rettigheter …). Det betyr IKKE at navnet er tatt.
  if (m.includes('database error saving new user') || c === 'unexpected_failure') {
    return t('Kontoen kunne ikke opprettes fordi databasen avviste den (dette gjelder ikke brukernavnet). Kjør hele supabase/schema.sql i Supabase SQL Editor og prøv igjen.');
  }

  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return t('Får ikke kontakt med serveren. Sjekk nettforbindelsen.');
  }
  // Våre egne feilmeldinger fra databasefunksjoner er allerede på norsk
  if (/[æøåÆØÅ]/.test(message) || message.startsWith('Du ') || message.startsWith('Alle ') || message.startsWith('Bare ')) {
    return t(message);
  }
  // Ukjent feil: vis den faktiske årsaken i stedet for å gjette
  const detail = message.trim().slice(0, 140);
  return detail ? t('Noe gikk galt: {detail}', { detail }) : t('Noe gikk galt. Prøv igjen om litt.');
}
