// En felles AudioContext gjenbrukes (nettlesere begrenser antallet).
let ctx: AudioContext | null = null;

export function playTone(
  freqs: number[],
  type: OscillatorType = 'sine',
  step = 0.08,
  dur = 0.25
): void {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, now + i * step);
      gain.gain.setValueAtTime(0.12, now + i * step);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * step + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * step);
      osc.stop(now + i * step + dur);
    });
  } catch {
    // lyd er valgfritt
  }
}

export const sounds = {
  success: () => playTone([523.25, 659.25, 783.99]),
  finish: () => playTone([880, 1100, 1320, 1760, 2200], 'triangle', 0.03, 0.15),
  spinResult: () => playTone([392, 523.25, 659.25, 784], 'triangle', 0.09, 0.2),
  tick: () => playTone([900], 'square', 0, 0.04),
  /** Episk achievement: kort, heroisk fanfare. */
  epic: () => {
    playTone([392, 493.88, 587.33, 783.99, 987.77], 'sawtooth', 0.1, 0.35);
    playTone([196, 246.94, 293.66], 'triangle', 0.2, 0.5);
  },
  /** Legendarisk achievement: lang fanfare med glitrende topp. */
  legendary: () => {
    playTone([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093], 'triangle', 0.11, 0.55);
    playTone([261.63, 329.63, 392, 523.25], 'sawtooth', 0.22, 0.7);
    window.setTimeout(() => playTone([2093, 2637, 3136, 4186], 'sine', 0.05, 0.3), 900);
  },
  notify: () => playTone([660, 880], 'sine', 0.12, 0.2),
};
