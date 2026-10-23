import { useState } from 'react';
import type { FormEvent } from 'react';
import { DISC_TYPES } from '../data/gameModes.ts';
import { makeId } from '../lib/random.ts';
import type { DiscItem, DiscType } from '../types.ts';
import { Sheet } from './ui/Sheet.tsx';
import { NumberStepper } from './ui/NumberStepper.tsx';
import { t } from '../i18n/index.ts';

const COLORS = [
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#e2e8f0',
];

interface FormState {
  name: string;
  brand: string;
  type: DiscType;
  plastic: string;
  color: string;
  speed: number;
  glide: number;
  turn: number;
  fade: number;
}

const EMPTY: FormState = {
  name: '',
  brand: '',
  type: 'Fairway Driver',
  plastic: '',
  color: COLORS[0],
  speed: 7,
  glide: 5,
  turn: -1,
  fade: 1,
};

const fromDisc = (d: DiscItem): FormState => ({
  name: d.name,
  brand: d.brand,
  type: d.type,
  plastic: d.plastic,
  color: d.color,
  speed: d.speed,
  glide: d.glide,
  turn: d.turn,
  fade: d.fade,
});

interface DiscFormSheetProps {
  /** Disken som redigeres; null = legg til ny */
  initial: DiscItem | null;
  onSave: (disc: DiscItem) => void;
  onClose: () => void;
}

/**
 * Skjema for å legge til eller redigere en disk. Monteres bare når det er
 * åpent (se BagSection), så skjemaet starter alltid friskt.
 */
export function DiscFormSheet({ initial, onSave, onClose }: DiscFormSheetProps) {
  const [form, setForm] = useState<FormState>(initial ? fromDisc(initial) : EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError(t('Skriv inn navnet på disken, f.eks. «River».'));
      return;
    }
    onSave({
      id: initial?.id ?? makeId('d'),
      name,
      brand: form.brand.trim(),
      type: form.type,
      plastic: form.plastic.trim(),
      color: form.color,
      speed: form.speed,
      glide: form.glide,
      turn: form.turn,
      fade: form.fade,
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? t('Rediger disk') : t('Legg til disk')}
      footer={
        <button type="submit" form="disc-form" className="btn btn-primary w-full">
          {initial ? t('Lagre endringer') : t('Legg i bagen')}
        </button>
      }
    >
      <form id="disc-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="disc-brand" className="field-label">
              {t('Merke')}</label>
            <input
              id="disc-brand"
              className="field"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              placeholder={t('Latitude 64')}
              maxLength={30}
            />
          </div>
          <div>
            <label htmlFor="disc-name" className="field-label">
              {t('Modell *')}</label>
            <input
              id="disc-name"
              className="field"
              value={form.name}
              onChange={(e) => {
                set('name', e.target.value);
                setError(null);
              }}
              placeholder={t('River')}
              maxLength={30}
              aria-invalid={!!error}
              autoFocus={!initial}
            />
          </div>
        </div>
        {error && <p className="field-error -mt-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="disc-type" className="field-label">
              {t('Type')}</label>
            <select
              id="disc-type"
              className="field"
              value={form.type}
              onChange={(e) => set('type', e.target.value as DiscType)}
            >
              {DISC_TYPES.map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="disc-plastic" className="field-label">
              {t('Plast')}</label>
            <input
              id="disc-plastic"
              className="field"
              value={form.plastic}
              onChange={(e) => set('plastic', e.target.value)}
              placeholder={t('Opto')}
              maxLength={24}
            />
          </div>
        </div>

        <div>
          <span className="field-label">{t('Flight-tall')}</span>
          <div className="grid grid-cols-2 gap-2">
            <NumberStepper label={t('Speed')} value={form.speed} min={1} max={15} step={1} onChange={(v) => set('speed', v)} />
            <NumberStepper label={t('Glide')} value={form.glide} min={1} max={7} step={1} onChange={(v) => set('glide', v)} />
            <NumberStepper label={t('Turn')} value={form.turn} min={-5} max={2} step={0.5} onChange={(v) => set('turn', v)} />
            <NumberStepper label={t('Fade')} value={form.fade} min={0} max={6} step={0.5} onChange={(v) => set('fade', v)} />
          </div>
        </div>

        <fieldset>
          <legend className="field-label">{t('Farge')}</legend>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('Farge {c}', { c })}
                aria-pressed={form.color === c}
                onClick={() => set('color', c)}
                className={`h-10 w-10 rounded-full border-2 transition-transform ${
                  form.color === c ? 'scale-110 border-white' : 'border-slate-700'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}
