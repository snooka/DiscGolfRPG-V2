/** Kjører vi inne i Android-appen (Capacitor)? Da trengs verken service worker eller «installer»-hint. */
export const isNativeApp = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Registrerer service worker for PWA (kun i produksjon, over https, og ikke i Capacitor). */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || isNativeApp()) return;
  if (!window.isSecureContext || location.hostname === 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
