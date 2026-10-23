import { Disc, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '../context/auth-context.ts';
import { useUi } from '../context/ui-context.ts';
import type { DiscItem } from '../types.ts';
import { DiscFormSheet } from './DiscFormSheet.tsx';
import { t } from '../i18n/index.ts';

const insertAt = <T,>(list: T[], index: number, item: T): T[] => {
  const i = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
};

/** Diskbagen til innlogget bruker: legg til, rediger og slett (med sikkerhet). */
export function BagSection() {
  const { profile, updateProfile } = useSession();
  const { toast, confirm } = useUi();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiscItem | null>(null);
  const bag = profile.bag;

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (disc: DiscItem) => {
    setEditing(disc);
    setFormOpen(true);
  };

  const saveDisc = (disc: DiscItem) => {
    const isEdit = bag.some((d) => d.id === disc.id);
    updateProfile((p) => ({
      ...p,
      bag: isEdit ? p.bag.map((d) => (d.id === disc.id ? disc : d)) : [...p.bag, disc],
    }));
    setFormOpen(false);
    toast(isEdit ? `${disc.name} oppdatert` : t('La til {name} i bagen 🥏', { name: disc.name }));
  };

  const removeDisc = async (disc: DiscItem) => {
    const ok = await confirm({
      title: t('Slette {name}?', { name: disc.name }),
      message: t('Er du sikker på at du vil slette denne disken fra bagen?'),
      confirmLabel: t('Ja, slett'),
      cancelLabel: t('Behold'),
      danger: true,
    });
    if (!ok) return;

    const index = bag.findIndex((d) => d.id === disc.id);
    updateProfile((p) => ({ ...p, bag: p.bag.filter((d) => d.id !== disc.id) }));
    toast(t('{name} er slettet', { name: disc.name }), {
      tone: 'info',
      action: {
        label: t('Angre'),
        onClick: () =>
          updateProfile((p) =>
            p.bag.some((d) => d.id === disc.id)
              ? p
              : { ...p, bag: insertAt(p.bag, index, disc) }
          ),
      },
    });
  };

  return (
    <section className="card space-y-3" aria-labelledby="bag-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="bag-title" className="flex items-center gap-2 text-sm font-black text-white">
          <Disc className="h-4 w-4 text-emerald-400" aria-hidden />
          {t('Diskbagen din ({length})', { length: bag.length })}</h2>
        <button type="button" onClick={openAdd} className="btn btn-secondary btn-sm">
          <Plus className="h-4 w-4" aria-hidden />
          {t('Legg til disk')}</button>
      </div>

      {bag.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center">
          <p className="text-sm font-bold text-slate-200">{t('Bagen er tom')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('Legg til diskene dine med flight-tall. Under Disc Roulette foreslår vi disker fra bagen som passer hjulets disktype.')}</p>
          <button type="button" onClick={openAdd} className="btn btn-primary mt-3">
            <Plus className="h-4 w-4" aria-hidden />
            {t('Legg til første disk')}</button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {bag.map((d) => (
            <li
              key={d.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: d.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{d.name}</div>
                  <div className="truncate text-xs text-slate-400">
                    {[d.brand, d.plastic].filter(Boolean).join(' • ') || t('Ukjent merke')}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(d)}
                    aria-label={t('Rediger {name}', { name: d.name })}
                    className="btn btn-ghost btn-sm btn-icon"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeDisc(d)}
                    aria-label={t('Slett {name}', { name: d.name })}
                    className="btn btn-ghost btn-sm btn-icon hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                <span className="text-xs text-slate-400">{d.type}</span>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {d.speed} | {d.glide} | {d.turn} | {d.fade}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <DiscFormSheet
          key={editing?.id ?? 'new'}
          initial={editing}
          onSave={saveDisc}
          onClose={() => setFormOpen(false)}
        />
      )}
    </section>
  );
}
