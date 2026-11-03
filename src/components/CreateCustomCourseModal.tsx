import { useState } from 'react';
import { PlusCircle, X, Loader2 } from 'lucide-react';
import type { CourseItem } from '../types.ts';
import { t } from '../i18n/index.ts';
import { createCourseWithLayout } from '../lib/coursesDb.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated: (course: CourseItem) => void;
  initialName?: string;
  userPosition: { lat: number; lng: number } | null;
}

export function CreateCustomCourseModal({
  isOpen,
  onClose,
  onCourseCreated,
  initialName = '',
  userPosition,
}: Props) {
  const [name, setName] = useState(initialName);
  const [holes, setHoles] = useState(18);
  const [locationName, setLocationName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    const parsedHoles = Number(holes) || 18;
    const lat = userPosition?.lat ?? 0;
    const lng = userPosition?.lng ?? 0;

    let createdId = `custom_${Date.now()}`;

    // 1. Forsøk å lagre direkte til Supabase
    try {
      const savedDbCourse = await createCourseWithLayout({
        name: name.trim(),
        city: locationName.trim() || undefined,
        lat,
        lng,
        holes_count: parsedHoles,
      });
      if (savedDbCourse?.id) {
        createdId = savedDbCourse.id;
      }
    } catch (err) {
      console.warn('Kunne ikke lagre til sky, fortsetter lokalt:', err);
    } finally {
      setSaving(false);
    }

    // 2. Opprett CourseItem for lokal spilløkt
    const customCourse: CourseItem = {
      id: createdId,
      name: name.trim(),
      location: locationName.trim() || t('Egendefinert sted'),
      holes: parsedHoles,
      par: parsedHoles * 3,
      image: '⛳',
      lat,
      lng,
      isCustom: true,
      layout: Array.from({ length: parsedHoles }, (_, idx) => ({
        number: idx + 1,
        par: 3,
      })),
    };

    onCourseCreated(customCourse);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="card card-hi w-full max-w-md space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-black text-white">{t('Opprett manuell bane')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {t('Banenavn')}
            </label>
            <input
              type="text"
              required
              disabled={saving}
              className="field w-full"
              placeholder={t('f.eks. Buråsen Discgolf')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {t('Sted / Område (valgfritt)')}
            </label>
            <input
              type="text"
              disabled={saving}
              className="field w-full"
              placeholder={t('f.eks. Mandal')}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {t('Antall hull')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[9, 12, 18, 27].map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={saving}
                  onClick={() => setHoles(num)}
                  className={`btn py-2 text-xs font-bold ${
                    holes === num ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {num} {t('hull')}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">{t('Eller eget antall:')}</span>
              <input
                type="number"
                min={1}
                max={36}
                disabled={saving}
                value={holes}
                onChange={(e) => setHoles(Math.max(1, parseInt(e.target.value, 10) || 18))}
                className="field w-20 py-1 text-center text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="btn btn-secondary w-1/2 text-xs"
            >
              {t('Avbryt')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary flex w-1/2 items-center justify-center gap-2 text-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Lagrer...')}
                </>
              ) : (
                t('Lagre og velg bane')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}