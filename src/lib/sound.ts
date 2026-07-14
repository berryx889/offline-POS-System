// Scan feedback tones via the Web Audio API — no asset files (pos-prd.md §9.6).
// A short high blip on success, a lower buzz on failure. Honors the sound setting.

let ctx: AudioContext | null = null;

function tone(freq: number, durationMs: number, type: OscillatorType = "sine"): void {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio can fail before any user gesture; feedback is non-critical.
  }
}

export function beepSuccess(enabled = true): void {
  if (enabled) tone(880, 90, "sine");
}

export function beepError(enabled = true): void {
  if (enabled) tone(220, 200, "square");
}
