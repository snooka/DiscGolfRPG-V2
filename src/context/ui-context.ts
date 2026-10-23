import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface ToastOptions {
  /** F.eks. «Angre»-knapp */
  action?: { label: string; onClick: () => void };
  /** Millisekunder før varselet forsvinner */
  duration?: number;
  tone?: 'success' | 'info' | 'danger';
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rød bekreft-knapp for destruktive handlinger */
  danger?: boolean;
}

export interface UiApi {
  toast: (message: string, options?: ToastOptions) => void;
  /** Viser en bekreftelsesboks. Løses til true hvis brukeren bekrefter. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi må brukes innenfor <UiProvider>');
  return ctx;
}
