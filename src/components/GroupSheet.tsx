import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_PLAYERS } from '../lib/round.ts';
import { makeId } from '../lib/random.ts';
import type { Group, PublicProfile } from '../types.ts';
import { Sheet } from './ui/Sheet.tsx';
import { t } from '../i18n/index.ts';

const GROUP_NAME_MAX = 24;
const GUEST_NAME_MAX = 20;

interface GroupSheetProps {
  /** Gruppen som redigeres; null = ny gruppe */
  initial: Group | null;
  /** Venner som kan legges til (registrerte spillere) */
  friends: PublicProfile[];
  onSave: (group: Group) => void;
  onClose: () => void;
}

/** Opprett eller rediger en gruppe av venner og gjestespillere. */
export function GroupSheet({ initial, friends, onSave, onClose }: GroupSheetProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(
    (initial?.memberIds ?? []).filter((id) => friends.some((f) => f.id === id))
  );
  const [guests, setGuests] = useState<string[]>(initial?.guests ?? []);
  const [guestInput, setGuestInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const maxOthers = MAX_PLAYERS - 1; // du selv er alltid med
  const count = memberIds.length + guests.length;
  const full = count >= maxOthers;

  const toggleFriend = (id: string) => {
    setError(null);
    setMemberIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : full ? cur : [...cur, id]
    );
  };

  const addGuest = () => {
    const g = guestInput.trim().slice(0, GUEST_NAME_MAX);
    if (!g || full) return;
    if (guests.some((x) => x.toLowerCase() === g.toLowerCase())) {
      setGuestInput('');
      return;
    }
    setGuests((cur) => [...cur, g]);
    setGuestInput('');
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t('Gi gruppen et navn.'));
    if (count === 0) return setError(t('Legg til minst én venn eller gjest.'));
    onSave({
      id: initial?.id ?? makeId('g'),
      name: trimmed,
      memberIds,
      guests,
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? t('Rediger gruppe') : t('Ny gruppe')}
      footer={
        <button type="submit" form="group-form" className="btn btn-primary w-full">
          {initial ? t('Lagre gruppe') : t('Opprett gruppe')}
        </button>
      }
    >
      <form id="group-form" onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="group-name" className="field-label">
            {t('Gruppenavn')}</label>
          <input
            id="group-name"
            className="field"
            value={name}
            maxLength={GROUP_NAME_MAX}
            placeholder={t('F.eks. Torsdagsrunden')}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoFocus={!initial}
          />
        </div>

        <div>
          <span className="field-label">{t('Venner i gruppen')}</span>
          {friends.length === 0 ? (
            <p className="text-xs text-slate-500">
              {t('Du har ingen venner ennå. Legg til venner under «Venner», eller bruk gjestespillere under.')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {friends.map((f) => {
                const on = memberIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggleFriend(f.id)}
                  >
                    {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {f.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="group-guest" className="field-label">
            {t('Gjestespillere (uten konto)')}</label>
          <div className="flex gap-2">
            <input
              id="group-guest"
              className="field"
              value={guestInput}
              maxLength={GUEST_NAME_MAX}
              placeholder={t('Navn på gjest')}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGuest();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              onClick={addGuest}
              disabled={!guestInput.trim() || full}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('Legg til')}</button>
          </div>
          {guests.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {guests.map((g) => (
                <li key={g} className="chip" aria-label={t('Gjest {g}', { g })}>
                  🎟️ {g}
                  <button
                    type="button"
                    aria-label={t('Fjern {g}', { g })}
                    onClick={() => setGuests((cur) => cur.filter((x) => x !== g))}
                    className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-500">
          {t('{count}/{maxOthers} spillere i tillegg til deg.', { count, maxOthers })}</p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
