/**
 * The new-message bell (developer request, 21 Nov 2026): a short two-note
 * chime made with the Web Audio API, so there is no sound file to load.
 *
 * Browsers only allow sound after the person has clicked or typed on the
 * page; until then the bell stays silent (no error). `unlockBell` is called
 * on the first click or key press.
 */

let context: AudioContext | null = null;
let lastRing = 0;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

/** Call from a click or key press: lets the bell play later. */
export function unlockBell(): void {
  const ctx = audio();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
}

/** One bell-like note: a sine with a soft overtone, quick attack, long fade. */
function note(ctx: AudioContext, frequency: number, start: number, volume: number) {
  for (const [ratio, gainScale] of [
    [1, 1],
    [2.01, 0.25],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * gainScale, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.95);
  }
}

/** Ring once; several messages within 1.5 s ring only once. */
export function ringBell(): void {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return;
  const now = Date.now();
  if (now - lastRing < 1500) return;
  lastRing = now;
  const t = ctx.currentTime + 0.01;
  note(ctx, 1046.5, t, 0.12); // C6
  note(ctx, 1318.5, t + 0.13, 0.1); // E6
}
