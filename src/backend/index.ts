import { createSupabaseBackend, FALLBACK_SUPABASE_KEY, FALLBACK_SUPABASE_URL } from './supabase.ts';
import type { Backend } from './types.ts';

// ==========================================
// HVILKEN BACKEND BRUKES?
// ==========================================
// Appen trenger et Supabase-prosjekt. URL og «anon key» settes i .env
// (se .env.example og README). Uten dem vises en veiledning i stedet for appen.

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || FALLBACK_SUPABASE_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || FALLBACK_SUPABASE_KEY;

export type ExtendedBackend = Backend;
const publicUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() || undefined;

let current: ExtendedBackend | null = null;

export const isCloudConfigured = (): boolean => current !== null || (url !== '' && anonKey !== '');

/** Brukes av tester og verifikasjon for å sette inn en annen backend. */
export function setBackend(backend: ExtendedBackend | null): void {
  current = backend;
}

export function getBackend(): ExtendedBackend {
  if (!current) {
    if (!url || !anonKey) throw new Error('Supabase er ikke konfigurert');
    current = createSupabaseBackend({ url, anonKey, publicUrl });
  }
  return current;
}
