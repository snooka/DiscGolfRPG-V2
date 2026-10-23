import { useEffect, useRef } from 'react';

const STEP_THRESHOLD = 12.3; // m/s² (inkl. tyngdekraft)
const MIN_STEP_GAP_MS = 360;

/** iOS krever tillatelse til bevegelsessensorer, og det må skje etter et trykk. */
export async function requestMotionPermission(): Promise<void> {
  try {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === 'function') await DME.requestPermission();
  } catch {
    // Brukeren sa nei eller enheten støtter det ikke – vi anslår distanse i stedet
  }
}

/**
 * Enkel skritteller basert på akselerometeret. Antall skritt lagres i en ref
 * (ingen re-render per skritt); `onFlush` kalles med jevne mellomrom slik at
 * tallet kan lagres sammen med den pågående runden.
 */
export function useStepCounter(
  active: boolean,
  initialSteps: number,
  onFlush: (steps: number) => void
) {
  const steps = useRef(initialSteps);
  const lastStep = useRef(0);
  const flush = useRef(onFlush);

  useEffect(() => {
    flush.current = onFlush;
  });

  useEffect(() => {
    if (!active) return;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      if (magnitude > STEP_THRESHOLD && now - lastStep.current > MIN_STEP_GAP_MS) {
        lastStep.current = now;
        steps.current += 1;
        if (steps.current % 25 === 0) flush.current(steps.current);
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [active]);

  return steps;
}
