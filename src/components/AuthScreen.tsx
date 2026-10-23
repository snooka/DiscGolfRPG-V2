import { Eye, EyeOff, Lock, LogIn, Mail, User } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../context/auth-context.ts';
import { isValidEmail, NAME_MAX, PASSWORD_MIN, validateRegistration } from '../lib/auth.ts';
import type { FieldErrors } from '../lib/auth.ts';
import { FancyDiscLogo } from './ui/FancyDiscLogo.tsx';
import { SegmentedControl } from './ui/SegmentedControl.tsx';
import { LanguagePicker } from './LanguagePicker.tsx';
import { t } from '../i18n/index.ts';

type Mode = 'login' | 'register';
type View = Mode | 'forgot' | 'reset' | 'sent';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6">
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <FancyDiscLogo size="lg" />
          </div>
          <h1 className="sr-only">{t('DISC GOLF RPG')}</h1>
          <p className="text-sm font-semibold text-emerald-400">{t('🇳🇴 Runder, titler, achievements & emblemer')}</p>
        </div>
        {children}
        <div className="flex justify-center">
          <LanguagePicker compact />
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
      {children}
    </p>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  show,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  error?: string;
  show: boolean;
  onToggle?: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error}
          className={`field ${onToggle ? 'pr-12' : ''}`}
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={show ? t('Skjul passord') : t('Vis passord')}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400"
          >
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Innlogging, registrering og «glemt passord». Brukerne ligger i skyen (Supabase Auth). */
export function AuthScreen() {
  const { login, register, requestPasswordReset, resetPasswordWithCode, resendConfirmation } = useAuth();
  const [view, setView] = useState<View>('login');
  const mode: Mode = view === 'register' ? 'register' : 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors & { code?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const go = (next: View) => {
    setView(next);
    setNotice(null);
    setErrors({});
    setFormError(null);
    setPassword('');
    setConfirm('');
    setCode('');
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isValidEmail(email)) {
      setErrors({ email: t('Skriv inn en gyldig e-postadresse.') });
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      const res = await requestPasswordReset(email);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setNotice(null);
      setView('reset');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (res.ok) setNotice(t('Ny kode er sendt.'));
    else setFormError(res.error);
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found: FieldErrors & { code?: string } = {};
    if (!/^\d{6,10}$/.test(code.replace(/\s/g, ''))) found.code = t('Skriv inn den 6-sifrede koden fra e-posten.');
    if (password.length < PASSWORD_MIN) found.password = t('Passordet må ha minst {PASSWORD_MIN} tegn.', { PASSWORD_MIN });
    else if (password !== confirm) found.confirm = t('Passordene er ikke like.');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    // Ved suksess logges brukeren inn og appen åpnes av seg selv
    const res = await resetPasswordWithCode(email, code.replace(/\s/g, ''), password);
    setBusy(false);
    if (!res.ok) setFormError(res.error);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    setNotice(null);

    if (mode === 'register') {
      const found = validateRegistration({ name, email, password, confirm });
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    } else {
      const found: FieldErrors = {};
      if (!email.trim()) found.email = t('Skriv inn e-posten din.');
      if (!password) found.password = t('Skriv inn passordet ditt.');
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const res = await register({ name, email, password });
        if (!res.ok) setFormError(res.error);
        else if (res.needsConfirmation) {
          setView('sent');
        }
        // Uten bekreftelseskrav logges man inn automatisk
      } else {
        const res = await login(email, password);
        if (!res.ok) setFormError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    const res = await resendConfirmation(email);
    setBusy(false);
    if (res.ok) setNotice(t('Ny bekreftelses-e-post er sendt.'));
    else setFormError(res.error);
  };

  if (view === 'sent') {
    return (
      <Shell>
        <div className="card space-y-3 text-center" role="status">
          <div className="text-4xl" aria-hidden>
            📬
          </div>
          <h2 className="text-lg font-black text-white">{t('Sjekk e-posten din')}</h2>
          <p className="text-sm text-slate-300">
            {t('Vi har sendt en e-post til')}{' '}<strong className="text-white">{email.trim()}</strong>{t('. Trykk på lenken i den for å bekrefte profilen din, og logg deretter inn her. Se også i søppelposten.')}</p>
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}
          {formError && <ErrorBox>{formError}</ErrorBox>}
          <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => void resend()}>
            {t('Send e-posten på nytt')}</button>
          <button type="button" className="btn btn-primary w-full" onClick={() => go('login')}>
            {t('Til innlogging')}</button>
        </div>
      </Shell>
    );
  }

  if (view === 'reset') {
    return (
      <Shell>
        <form onSubmit={(e) => void onReset(e)} noValidate className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-white">
            <Lock className="h-5 w-5 text-emerald-400" aria-hidden />
            {t('Skriv inn koden fra e-posten')}</h2>
          <p className="text-sm text-slate-400">
            {t('Hvis {email} er registrert hos oss, har vi sendt en 6-sifret kode. Koden gjelder en kort stund. Se også i søppelposten.', { email: email.trim() })}</p>
          <div>
            <label htmlFor="auth-code" className="field-label">
              {t('Kode fra e-posten')}</label>
            <input
              id="auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="123456"
              aria-invalid={!!errors.code}
              className="field text-center font-mono text-xl tracking-[0.4em]"
            />
            {errors.code && <p className="field-error">{errors.code}</p>}
          </div>
          <PasswordField
            id="reset-password"
            label={t('Nytt passord')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={t('Minst {PASSWORD_MIN} tegn', { PASSWORD_MIN })}
            error={errors.password}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
          <PasswordField
            id="reset-confirm"
            label={t('Gjenta nytt passord')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={errors.confirm}
            show={showPassword}
          />
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}
          {formError && <ErrorBox>{formError}</ErrorBox>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? t('Lagrer…') : t('Endre passord')}
          </button>
          <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => void resendCode()}>
            {t('Send ny kode')}</button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => go('login')}>
            {t('Tilbake til innlogging')}</button>
        </form>
      </Shell>
    );
  }

  if (view === 'forgot') {
    return (
      <Shell>
        <form onSubmit={(e) => void onForgot(e)} noValidate className="space-y-4">
          <h2 className="text-lg font-black text-white">{t('Glemt passord?')}</h2>
          <p className="text-sm text-slate-400">
            {t('Skriv inn e-posten du registrerte deg med, så sender vi en 6-sifret kode du kan skrive inn her for å velge nytt passord.')}</p>
          <div>
            <label htmlFor="auth-email" className="field-label">
              {t('E-postadresse')}</label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('din@epost.no')}
              aria-invalid={!!errors.email}
              className="field"
            />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
          {formError && <ErrorBox>{formError}</ErrorBox>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            <Mail className="h-4 w-4" />
            {busy ? t('Sender…') : t('Send kode')}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => go('login')}>
            {t('Tilbake til innlogging')}</button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <SegmentedControl
        label={t('Innlogging eller registrering')}
        value={mode}
        onChange={go}
        options={[
          { value: 'login', label: t(t('Logg inn')) },
          { value: 'register', label: t('Opprett profil') },
        ]}
      />

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
        {mode === 'register' && (
          <div>
            <label htmlFor="auth-name" className="field-label">
              {t('Spillernavn (vennene dine søker etter dette)')}</label>
            <input
              id="auth-name"
              type="text"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Hva skal vi kalle deg?')}
              aria-invalid={!!errors.name}
              className="field"
            />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="field-label">
            {t('E-postadresse')}</label>
          <input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('din@epost.no')}
            aria-invalid={!!errors.email}
            className="field"
          />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div>
          <PasswordField
            id="auth-password"
            label={t('Passord')}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? t('Minst {PASSWORD_MIN} tegn', { PASSWORD_MIN }) : '••••••••'}
            error={errors.password}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
          <button
            type="button"
            onClick={() => go('forgot')}
            className="mt-1.5 text-xs font-bold text-emerald-400 underline-offset-2 hover:underline"
          >
            {t('Glemt passord?')}</button>
        </div>

        {mode === 'register' && (
          <PasswordField
            id="auth-confirm"
            label={t('Gjenta passord')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={errors.confirm}
            show={showPassword}
          />
        )}

        {formError && <ErrorBox>{formError}</ErrorBox>}
        {formError?.includes('ikke bekreftet') && (
          <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => void resend()}>
            {t('Send bekreftelses-e-post på nytt')}</button>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {mode === 'login' ? <LogIn className="h-4 w-4" /> : <User className="h-4 w-4" />}
          {busy ? t('Et øyeblikk…') : mode === 'login' ? t('Logg inn') : t('Opprett profil & start')}
        </button>
      </form>

      <p className="text-center text-xs text-slate-500">
        {t('Profilen din ligger trygt i skyen. Logg inn fra hvilken som helst telefon, og spill sammen med vennene dine i sanntid.')}</p>
    </Shell>
  );
}
