// Phase 358 / 359 — TimeScreen audio cues.
//
// Two cues, both ≤ 100ms, both gated by the existing audioEnabled
// store flag at call-sites. Engineered to feel like fine hardware:
//
//   playTimeTick()        — dial-snap during scrub. Soft 880→660 Hz.
//   playCheckpointTone()  — premium checkpoint confirm. Two
//                           detuned sines with a glass-bell decay.
//
// Web Audio only — no fetched assets. Works inside iOS PWA.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function playTimeTick(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
  }
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.04);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

// Phase 359 — premium checkpoint tone. Two slightly-detuned sines
// (root + fifth) summed through a master gain with a slow decay.
// Aims for the "glass bell" feel of Apple Watch / Vision Pro.
export function playCheckpointTone(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
  }
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.07, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  master.connect(c.destination);

  const a = c.createOscillator();
  a.type = "sine";
  a.frequency.setValueAtTime(932, now); // ~B♭5
  a.frequency.exponentialRampToValueAtTime(880, now + 0.5);
  a.connect(master);
  a.start(now);
  a.stop(now + 0.6);

  const b = c.createOscillator();
  b.type = "sine";
  b.frequency.setValueAtTime(1396, now); // ~F6 (perfect fifth)
  b.frequency.exponentialRampToValueAtTime(1318, now + 0.5);
  const bGain = c.createGain();
  bGain.gain.setValueAtTime(0.55, now);
  b.connect(bGain).connect(master);
  b.start(now);
  b.stop(now + 0.6);
}
