import { describe, expect, it } from "vitest";

import { recommendBackup } from "@/lib/backup-recommender";

describe("recommendBackup", () => {
  it("returns null on an empty list", () => {
    expect(recommendBackup([])).toBeNull();
  });

  it("returns null when every backup is empty", () => {
    expect(
      recommendBackup([
        { capturedAt: 1, reason: "auto", richness: 0 },
        { capturedAt: 2, reason: "manual", richness: 0 },
      ]),
    ).toBeNull();
  });

  it("prefers richer over newer", () => {
    const out = recommendBackup([
      { capturedAt: 2000, reason: "auto", richness: 3 },
      { capturedAt: 1000, reason: "manual", richness: 25 },
    ]);
    expect(out?.capturedAt).toBe(1000);
  });

  it("breaks richness tie by recency", () => {
    const out = recommendBackup([
      { capturedAt: 1000, reason: "auto", richness: 10 },
      { capturedAt: 2000, reason: "manual", richness: 10 },
    ]);
    expect(out?.capturedAt).toBe(2000);
  });

  it("skips empty backups when others are non-empty", () => {
    const out = recommendBackup([
      { capturedAt: 3000, reason: "auto", richness: 0 },
      { capturedAt: 2000, reason: "manual", richness: 5 },
    ]);
    expect(out?.capturedAt).toBe(2000);
  });
});
