"use client";

// Tiny luxury fintech chime synthesized in Web Audio. No asset, no library.
// Two oscillators (E5 + B5, perfect-fifth) with a quick exponential decay,
// gated through a master gain at 8% so it stays unobtrusive.
//
// We lazy-init the AudioContext on first call to satisfy iOS Safari's user-
// gesture autoplay rules, and bail out cleanly if the browser blocks audio.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Plays a short two-tone chime. Resolves once the tones have decayed.
 * Silently no-ops if audio is unavailable or the user hasn't interacted yet.
 */
export async function playSyncChime(): Promise<void> {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      return;
    }
  }

  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.08;
  master.connect(audio.destination);

  const tone = (freq: number, start: number, length = 0.45) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(1.0, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    osc.connect(gain).connect(master);
    osc.start(now + start);
    osc.stop(now + start + length + 0.05);
  };

  // E5 → B5, a calm perfect-fifth flourish.
  tone(659.25, 0, 0.5);
  tone(987.77, 0.07, 0.55);
}
