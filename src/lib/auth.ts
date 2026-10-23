import { t } from '../i18n/index.ts';
// ==========================================
// VALIDERING AV INNLOGGING OG REGISTRERING
// ==========================================
// Selve kontoene og passordene håndteres av Supabase Auth (passord hashes på
// serveren, aldri i appen). Her ligger bare skjemavalideringen.

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(normalizeEmail(email));

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const PASSWORD_MIN = 6;

export interface RegistrationInput {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export type FieldErrors = Partial<Record<keyof RegistrationInput, string>>;

export function validateRegistration(input: RegistrationInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.name = t('Navnet må være {NAME_MIN}–{NAME_MAX} tegn.', { NAME_MIN, NAME_MAX });
  }
  if (!isValidEmail(input.email)) {
    errors.email = t('Skriv inn en gyldig e-postadresse.');
  }
  if (input.password.length < PASSWORD_MIN) {
    errors.password = t('Passordet må ha minst {PASSWORD_MIN} tegn.', { PASSWORD_MIN });
  }
  if (input.password !== input.confirm) {
    errors.confirm = t('Passordene er ikke like.');
  }
  return errors;
}
