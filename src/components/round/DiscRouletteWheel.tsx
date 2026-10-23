import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouletteSegment } from '../../data/gameModes.ts';
import { randomInt } from '../../lib/random.ts';
import { sounds } from '../../lib/sound.ts';
import { slicePath, spinTarget } from '../../lib/wheel.ts';
import { t } from '../../i18n/index.ts';

const RADIUS = 150;
const SPIN_MS = 4800;
const REDUCED_SPIN_MS = 600;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface DiscRouletteWheelProps {
  segments: RouletteSegment[];
  /** Utfallet som allerede er trukket for dette hullet (id), ellers null */
  result: string | null;
  /** Kalles med en gang hjulet trekker – før animasjonen er ferdig */
  onSpin: (segmentId: string) => void;
  /** Kalles når animasjonen er ferdig og resultatet kan vises */
  onSettled: () => void;
}

/**
 * Animert spinnhjul. Utfallet trekkes (kryptografisk tilfeldig) i det man
 * trykker, og lagres umiddelbart via `onSpin` – hjulet animeres bare frem til
 * det allerede trukne feltet. Dermed kan man ikke «trekke på nytt» ved å
 * forlate skjermen midt i spinnet.
 */
export function DiscRouletteWheel({
  segments,
  result,
  onSpin,
  onSettled,
}: DiscRouletteWheelProps) {
  const count = segments.length;
  const seg = 360 / count;
  const timer = useRef<number | undefined>(undefined);

  const resultIndex = useMemo(() => {
    if (!result) return -1;
    return Math.max(0, segments.findIndex((s) => s.id === result));
  }, [result, segments]);

  // Hvis hullet allerede er spunnet når komponenten monteres, vises det ferdig
  const [rotation, setRotation] = useState(() =>
    resultIndex >= 0 ? spinTarget(0, resultIndex, count, 0, 0) : 0
  );
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(SPIN_MS);
  const settled = result !== null && !spinning;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const spin = () => {
    if (spinning || result !== null) return;
    const index = randomInt(count);
    const jitter = (randomInt(1000) / 1000 - 0.5) * 0.7; // ±0.35 av feltbredden
    const reduced = prefersReducedMotion();
    const ms = reduced ? REDUCED_SPIN_MS : SPIN_MS;
    const turns = reduced ? 1 : 5 + randomInt(3);

    setDuration(ms);
    setSpinning(true);
    setRotation((cur) => spinTarget(cur, index, count, jitter, turns));
    onSpin(segments[index].id);

    timer.current = window.setTimeout(() => {
      setSpinning(false);
      sounds.spinResult();
      try {
        navigator.vibrate?.(40);
      } catch {
        // vibrasjon er valgfritt
      }
      onSettled();
    }, ms + 80);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[19rem]">
        {/* Peker */}
        <svg
          viewBox="0 0 40 40"
          className={`absolute left-1/2 -top-3 z-10 h-9 w-9 -translate-x-1/2 drop-shadow-lg ${
            spinning ? 'wheel-pointer-spinning' : ''
          }`}
          aria-hidden
        >
          <polygon points="20,38 6,6 34,6" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" />
        </svg>

        <div
          className="aspect-square w-full rounded-full shadow-[0_0_40px_rgba(16,185,129,0.25)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.08, 1)`
              : 'none',
            willChange: 'transform',
          }}
        >
          <svg
            viewBox={`${-RADIUS - 6} ${-RADIUS - 6} ${(RADIUS + 6) * 2} ${(RADIUS + 6) * 2}`}
            className="h-full w-full"
            role="img"
            aria-label={t('Spinnhjul med {count} felt: {fields}', { count, fields: segments.map((s) => s.label).join(', ') })}
          >
            <circle r={RADIUS + 5} fill="#0f172a" stroke="#334155" strokeWidth="2" />
            {segments.map((s, i) => {
              const a0 = i * seg;
              const mid = a0 + seg / 2;
              return (
                <g key={s.id}>
                  <path
                    d={slicePath(RADIUS, a0, a0 + seg)}
                    fill={s.color}
                    stroke="#020617"
                    strokeWidth="2.5"
                  />
                  <g transform={`rotate(${mid})`}>
                    <text y={-RADIUS + 38} textAnchor="middle" fontSize="30">
                      {s.icon}
                    </text>
                    <text
                      y={-RADIUS + 66}
                      textAnchor="middle"
                      fontSize={count > 4 ? 13 : 15}
                      fontWeight="800"
                      fill="#020617"
                    >
                      {s.label}
                    </text>
                  </g>
                </g>
              );
            })}
            <circle r="26" fill="#020617" stroke="#f8fafc" strokeWidth="3" />
            <text textAnchor="middle" y="9" fontSize="24">
              🥏
            </text>
          </svg>
        </div>
      </div>

      {result === null ? (
        <button type="button" onClick={spin} disabled={spinning} className="btn btn-primary w-full max-w-[19rem] text-base">
          {t('🎡 Spinn hjulet!')}</button>
      ) : (
        <p className="text-xs text-slate-400" aria-live="polite">
          {settled ? t('Hjulet har talt.') : t('Hjulet spinner…')}
        </p>
      )}
    </div>
  );
}
