"use client";

// Phase 433 · AURORA v1 — /aurora-preview
//
// Public reviewer page. Mounts the shared AuroraAppShell so the
// preview shows the same routing, add flow and screens the auth-
// gated dashboard ships in production.

import { AuroraAppShell } from "@/components/aurora/aurora-app-shell";

export default function AuroraPreviewPage() {
  return <AuroraAppShell />;
}
