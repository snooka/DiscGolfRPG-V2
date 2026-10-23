interface ProgressBarProps {
  /** 0–1 */
  value: number;
  /** Tailwind-klasse for fyllfargen (standard grønn/turkis gradient) */
  fillClass?: string;
  label?: string;
  heightClass?: string;
}

export function ProgressBar({
  value,
  fillClass = 'bar-fill-emerald',
  label,
  heightClass = 'h-2.5',
}: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full border border-sky-400/20 bg-slate-950/80 ${heightClass}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
