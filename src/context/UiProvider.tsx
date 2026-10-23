import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import { Toast } from '../components/ui/Toast.tsx';
import { UiContext } from './ui-context.ts';
import type { ConfirmOptions, ToastOptions, UiApi } from './ui-context.ts';
import { t } from '../i18n/index.ts';

interface ToastState {
  id: number;
  message: string;
  options?: ToastOptions;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastCounter = useRef(0);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    window.clearTimeout(toastTimer.current);
    const id = ++toastCounter.current;
    setToastState({ id, message, options });
    const duration = options?.duration ?? (options?.action ? 6000 : 3500);
    toastTimer.current = window.setTimeout(() => {
      setToastState((cur) => (cur?.id === id ? null : cur));
    }, duration);
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setConfirmOptions(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    // En allerede åpen boks avbrytes hvis en ny åpnes
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setConfirmOptions(options);
    });
  }, []);

  const api = useMemo<UiApi>(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UiContext.Provider value={api}>
      {children}
      {toastState && (
        <Toast
          key={toastState.id}
          message={toastState.message}
          options={toastState.options}
          onDismiss={() => setToastState(null)}
        />
      )}
      {confirmOptions && (
        <ConfirmDialog
          title={confirmOptions.title}
          message={confirmOptions.message}
          confirmLabel={confirmOptions.confirmLabel ?? t('Bekreft')}
          cancelLabel={confirmOptions.cancelLabel ?? t('Avbryt')}
          danger={confirmOptions.danger ?? false}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </UiContext.Provider>
  );
}
