import { useMemo, useState } from 'react';
import { DISC_TYPES, ROULETTE_SEGMENT_BY_ID } from '../../data/gameModes.ts';
import type { RouletteSegment } from '../../data/gameModes.ts';
import { useSession } from '../../context/auth-context.ts';
import type { DiscItem, DiscType, RoundState } from '../../types.ts';
import { DiscRouletteWheel } from './DiscRouletteWheel.tsx';
import { t } from '../../i18n/index.ts';

interface RouletteHolePanelProps {
  round: RoundState;
  /** segmentId = disktype-utfall (for statistikken), disc = disk fra bagen (hvis bag-hjul) */
  onSpin: (segmentId: string, disc: DiscItem | null) => void;
  onSource: (source: string) => void;
}

const MAX_BAG_SEGMENTS = 12;
const DISC_PREFIX = 'disc:';

/** Segment-id (for statistikken) for en disktype. */
const SEGMENT_FOR_TYPE: Record<DiscType, string> = {
  Putter: 'putter',
  Midrange: 'midrange',
  'Fairway Driver': 'fairway',
  'Distance Driver': 'distance',
};

const sourceDiscs = (source: string, bag: DiscItem[]): DiscItem[] => {
  if (source === 'bag:all') return bag.length <= MAX_BAG_SEGMENTS ? bag : [];
  if (source.startsWith('bag:')) {
    const type = source.slice(4);
    return bag.filter((d) => d.type === type).slice(0, MAX_BAG_SEGMENTS);
  }
  return [];
};

const PALETTE = ['#f59e0b', '#06b6d4', '#10b981', '#ef4444', '#a855f7', '#ec4899', '#84cc16', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#8b5cf6'];

function discSegment(d: DiscItem, index: number): RouletteSegment {
  return {
    id: DISC_PREFIX + d.id,
    label: d.name,
    icon: '🥏',
    // Fargerike felt i tur og orden, slik at naboene alltid skiller seg fra hverandre
    color: PALETTE[index % PALETTE.length],
    discType: d.type,
    rule: t('Alle kast på hullet må kastes med {name} ({type}).', { name: d.name, type: d.type.toLowerCase() }),
  };
}

/** Hjul + resultat for nåværende hull. Monteres på nytt for hvert hull (key). */
export function RouletteHolePanel({ round, onSpin, onSource }: RouletteHolePanelProps) {
  const { profile } = useSession();
  const hole = round.currentHole;
  const result = round.spins[hole];
  const resultDiscId = round.spinDiscs[hole];
  const [revealed, setRevealed] = useState(result !== null);
  const bag = profile.bag;

  // Alternativer i nedtrekksmenyen
  const options = useMemo(() => {
    const list: { value: string; label: string }[] = [
      { value: 'generic', label: t('🎲 Tilfeldig – disktyper (generisk)') },
    ];
    if (bag.length >= 2 && bag.length <= MAX_BAG_SEGMENTS) {
      list.push({ value: 'bag:all', label: t('🎒 Fra bagen min ({length} disker)', { length: bag.length }) });
    }
    for (const type of DISC_TYPES) {
      const n = bag.filter((d) => d.type === type).length;
      if (n >= 2) list.push({ value: `bag:${type}`, label: t('🎒 Bagen – kun {type} ({n})', { type: type.toLowerCase(), n }) });
    }
    return list;
  }, [bag]);

  // Et allerede spunnet hull viser hjulet det ble spunnet på
  const source = resultDiscId ? (round.wheelSource === 'generic' ? 'bag:all' : round.wheelSource) : round.wheelSource;
  const effectiveSource = options.some((o) => o.value === source) ? source : 'generic';

  const discs = useMemo(() => {
    let list = sourceDiscs(effectiveSource, bag);
    // Sikre at disken som ble trukket fortsatt er på hjulet (f.eks. hvis bagen er endret)
    if (resultDiscId && !list.some((d) => d.id === resultDiscId)) {
      const found = bag.find((d) => d.id === resultDiscId);
      if (found) list = [...list.slice(0, MAX_BAG_SEGMENTS - 1), found];
    }
    return list;
  }, [effectiveSource, bag, resultDiscId]);

  const useBag = discs.length >= 2 && effectiveSource !== 'generic';
  const segments: RouletteSegment[] = useBag
    ? discs.map((d, i) => discSegment(d, i))
    : round.segments.flatMap((id) => {
        const s = ROULETTE_SEGMENT_BY_ID[id];
        return s ? [s] : [];
      });

  const wheelResult = useBag && resultDiscId ? DISC_PREFIX + resultDiscId : result;
  const outcomeSegment = result ? ROULETTE_SEGMENT_BY_ID[result] : undefined;
  const drawnDisc = resultDiscId
    ? (bag.find((d) => d.id === resultDiscId) ?? round.spinDiscItems[hole] ?? undefined)
    : undefined;
  const drawnIndex = drawnDisc ? Math.max(0, discs.findIndex((d) => d.id === drawnDisc.id)) : 0;
  const outcome = drawnDisc ? discSegment(drawnDisc, drawnIndex) : outcomeSegment;
  // Statistikk føres på disktypen
  const typeSegment = outcome?.discType ? ROULETTE_SEGMENT_BY_ID[SEGMENT_FOR_TYPE[outcome.discType]] : outcomeSegment;
  const suggestions =
    !drawnDisc && outcome?.discType ? bag.filter((d) => d.type === outcome.discType) : [];

  const handleSpin = (segmentId: string) => {
    if (segmentId.startsWith(DISC_PREFIX)) {
      const id = segmentId.slice(DISC_PREFIX.length);
      const disc = bag.find((d) => d.id === id) ?? null;
      onSpin(SEGMENT_FOR_TYPE[disc?.type ?? 'Midrange'], disc);
    } else {
      onSpin(segmentId, null);
    }
  };

  return (
    <section className="card space-y-4" aria-label={t('Disc Roulette')}>
      <div>
        <label htmlFor="wheel-source" className="field-label">
          {t('Hjulet trekker fra')}</label>
        <select
          id="wheel-source"
          className="field"
          value={effectiveSource}
          disabled={result !== null}
          onChange={(e) => onSource(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {bag.length < 2 && (
          <p className="mt-1 text-[11px] text-slate-500">
            {t('Legg minst to disker i bagen under Profil for å kunne trekke direkte fra den.')}</p>
        )}
      </div>

      <DiscRouletteWheel
        key={`${effectiveSource}:${segments.length}`}
        segments={segments}
        result={wheelResult}
        onSpin={handleSpin}
        onSettled={() => setRevealed(true)}
      />

      {revealed && outcome && (
        <div
          className="anim-pop rounded-2xl border-2 p-4 text-center"
          style={{ borderColor: outcome.color, backgroundColor: `${outcome.color}1f` }}
          aria-live="polite"
        >
          <div className="text-4xl" aria-hidden>
            {outcome.icon}
          </div>
          <div className="eyebrow mt-1">{t('Hull {n} – kast med', { n: hole + 1 })}</div>
          <div className="text-2xl font-black text-white">{outcome.label}</div>
          <p className="mt-1 text-sm text-slate-200">{outcome.rule}</p>
          {drawnDisc && typeSegment && (
            <p className="mt-1 text-xs text-slate-400">{t('Føres i statistikken som {label}.', { label: typeSegment.label })}</p>
          )}

          {outcome.discType && !drawnDisc && (
            <div className="mt-3 text-left">
              <div className="eyebrow mb-1 text-center">{t('Fra bagen din')}</div>
              {suggestions.length > 0 ? (
                <ul className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((d) => (
                    <li key={d.id} className="chip">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                        aria-hidden
                      />
                      {d.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-xs text-slate-400">
                  {t('Ingen {type} i bagen. Lån en av en venn, eller legg til en under Profil.', { type: outcome.discType.toLowerCase() })}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
