// ==========================================
// GEOMETRI FOR DISC ROULETTE-HJULET
// ==========================================
// Vinkler måles i grader, med klokken, fra toppen (12-tiden). Pekeren
// står alltid på toppen. Hjulet roteres med `rotate(R deg)`.

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Hvilket felt som står under pekeren ved gitt rotasjon. */
export function segmentAtPointer(rotation: number, count: number): number {
  const angle = mod(-rotation, 360);
  return Math.floor(angle / (360 / count)) % count;
}

/**
 * Rotasjonen som lander midt i felt `index` (pluss litt jitter) etter
 * `turns` hele omdreininger. Roterer alltid fremover (med klokken).
 * `jitter` er en andel av feltets bredde i området [-0.35, 0.35].
 */
export function spinTarget(
  current: number,
  index: number,
  count: number,
  jitter: number,
  turns: number
): number {
  const seg = 360 / count;
  const angleOnWheel = index * seg + seg / 2 + jitter * seg;
  const delta = mod(-angleOnWheel - current, 360);
  return current + turns * 360 + delta;
}

/** SVG-sti for et kakestykke fra vinkel a0 til a1 (grader fra toppen). */
export function slicePath(radius: number, a0: number, a1: number): string {
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [radius * Math.sin(rad), -radius * Math.cos(rad)] as const;
  };
  const [x0, y0] = toXY(a0);
  const [x1, y1] = toXY(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M 0 0 L ${x0.toFixed(3)} ${y0.toFixed(3)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
}
