import { describe, expect, it } from "vitest";

import { buildEnvelope, parseEnvelope } from "@/lib/backup-export";

describe("backup envelope", () => {
  it("round-trips a payload via JSON", () => {
    const env = buildEnvelope({
      payload: { entries: [{ id: "e1" }], monthlyBudget: 5000 },
      schemaVersion: 1,
    });
    const text = JSON.stringify(env);
    const parsed = parseEnvelope(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.payload).toEqual({
        entries: [{ id: "e1" }],
        monthlyBudget: 5000,
      });
    }
  });

  it("rejects non-JSON input", () => {
    expect(parseEnvelope("not-json").ok).toBe(false);
  });

  it("rejects an envelope from a different app", () => {
    const out = parseEnvelope(
      JSON.stringify({
        app: "other",
        envelopeVersion: 1,
        checksum: "x",
        payload: {},
      }),
    );
    expect(out.ok).toBe(false);
  });

  it("detects a tampered payload via checksum mismatch", () => {
    const env = buildEnvelope({
      payload: { entries: [] },
      schemaVersion: 1,
    });
    const tampered = { ...env, payload: { entries: [{ id: "x" }] } };
    const out = parseEnvelope(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("checksum_mismatch");
  });

  it("rejects an envelope missing required fields", () => {
    const out = parseEnvelope(JSON.stringify({ app: "sally" }));
    expect(out.ok).toBe(false);
  });
});
