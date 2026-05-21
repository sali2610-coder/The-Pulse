// Local JSON export/import — offline lifeline for the backup system.
//
// Packages the current Zustand store into a versioned envelope with a
// checksum and downloads it as a .json file. Import validates the
// envelope shape + checksum before exposing the parsed state to the
// caller. Caller decides whether/how to merge into the live store.

const ENVELOPE_VERSION = 1;

export type ExportEnvelope = {
  envelopeVersion: number;
  exportedAt: number;
  app: "sally";
  schemaVersion: number;
  source?: string;
  checksum: string;
  payload: unknown;
};

/** djb2 hash, hex-encoded. Stable across runtimes, fast, plenty for
 *  detecting accidental tampering in a JSON export. Not crypto. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildEnvelope(args: {
  payload: unknown;
  schemaVersion: number;
  source?: string;
}): ExportEnvelope {
  const payloadJson = JSON.stringify(args.payload ?? {});
  return {
    envelopeVersion: ENVELOPE_VERSION,
    exportedAt: Date.now(),
    app: "sally",
    schemaVersion: args.schemaVersion,
    source: args.source,
    checksum: hash(payloadJson),
    payload: args.payload,
  };
}

export function downloadEnvelope(env: ExportEnvelope): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(env, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date(env.exportedAt)
    .toISOString()
    .replace(/[:.]/g, "-");
  a.href = url;
  a.download = `sally-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ParseResult =
  | { ok: true; envelope: ExportEnvelope }
  | { ok: false; reason: string };

export function parseEnvelope(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "not_object" };
  }
  const env = parsed as Partial<ExportEnvelope>;
  if (env.app !== "sally") return { ok: false, reason: "wrong_app" };
  if (typeof env.envelopeVersion !== "number") {
    return { ok: false, reason: "missing_envelope_version" };
  }
  if (typeof env.checksum !== "string") {
    return { ok: false, reason: "missing_checksum" };
  }
  if (env.payload === undefined) {
    return { ok: false, reason: "missing_payload" };
  }
  const expected = hash(JSON.stringify(env.payload));
  if (expected !== env.checksum) {
    return { ok: false, reason: "checksum_mismatch" };
  }
  return { ok: true, envelope: env as ExportEnvelope };
}
