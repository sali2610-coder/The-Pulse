"use client";

// Phase 226 — apply the persisted text-scale preference at mount.
// Mounted once near the top of providers so every page sees the
// data-text-scale attribute before any of its UI renders.

import { useEffect } from "react";

import { bootstrapTextScale } from "@/lib/use-text-scale";

export function TextScaleBootstrap(): null {
  useEffect(() => {
    bootstrapTextScale();
  }, []);
  return null;
}
