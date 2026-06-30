"use client";

// Phase 430 · AURORA v1 — AuroraCanvas
//
// Fixed full-bleed background layer. Three drifting blobs at low
// opacity over Charcoal (dark) or Cream (light), plus a top scrim
// to guarantee AA contrast for Cinema hero text. CSS-only motion;
// honors prefers-reduced-motion via the shared --aurora-dur-aurora
// duration token (collapsed to 0ms under reduced motion).
//
// Rendered ONCE by AuroraShell. Sub-pages should NOT mount their
// own canvas — one ambient field per app.

export function AuroraCanvas() {
  return (
    <div
      aria-hidden
      className="aurora-canvas pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <span className="aurora-blob aurora-blob-1" />
      <span className="aurora-blob aurora-blob-2" />
      <span className="aurora-blob aurora-blob-3" />
      <span className="aurora-scrim-top" />
    </div>
  );
}
