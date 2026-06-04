// Phase 358 / D — TimeScreen audio cue.
//
// Short, soft click when the scrubber snaps to a checkpoint. Sits at
// 6% master gain, ~25ms — feels like a hardware dial. Honors the
// existing audioEnabled store flag.
//
// Implemented with Web Audio (Safari + iOS PWA). No external file
// fetched; oscillator + envelope only.

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
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}
