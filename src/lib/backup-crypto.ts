// Phase C — Security hardening: encrypted backup envelope.
//
// Augments the Phase 126 JSON export with an OPTIONAL AES-GCM
// passphrase layer. A user can export sensitive financial data
// from a public laptop without exposing every entry in plaintext.
//
// Cryptography: Web Crypto API only. PBKDF2-SHA256 / 200_000
// iterations / 16-byte salt → AES-GCM-256 / 12-byte IV. All
// recommended ranges per OWASP 2023.
//
// Output format (still valid JSON):
//   {
//     app: "sally",
//     envelopeVersion: 1,
//     encrypted: true,
//     algo: "AES-GCM",
//     kdf: "PBKDF2-SHA256",
//     iterations: 200000,
//     salt: <base64>,
//     iv: <base64>,
//     ciphertext: <base64>,
//     exportedAt: <ms>,
//   }
//
// Decryption requires the same passphrase. There is NO key recovery
// path by design — losing the passphrase means the export is
// useless. Users keep their encrypted file alongside a printed copy
// of the passphrase (or a password manager entry).

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ENVELOPE_VERSION = 1;

export type EncryptedEnvelope = {
  app: "sally";
  envelopeVersion: number;
  encrypted: true;
  algo: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  exportedAt: number;
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt an arbitrary JSON-serializable payload with the given
 *  passphrase. Returns a JSON-string envelope ready to write to a
 *  file. Throws on empty passphrase. */
export async function encryptPayload(
  payload: unknown,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("passphrase_too_short");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  return {
    app: "sally",
    envelopeVersion: ENVELOPE_VERSION,
    encrypted: true,
    algo: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    exportedAt: Date.now(),
  };
}

/** Detect whether a parsed JSON object is an encrypted envelope. */
export function isEncryptedEnvelope(
  v: unknown,
): v is EncryptedEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<EncryptedEnvelope>;
  return (
    o.app === "sally" &&
    o.encrypted === true &&
    o.algo === "AES-GCM" &&
    typeof o.salt === "string" &&
    typeof o.iv === "string" &&
    typeof o.ciphertext === "string"
  );
}

export type DecryptResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: "wrong_passphrase" | "corrupted" | "bad_format" };

/** Decrypt an envelope using the supplied passphrase. Returns
 *  structured success/failure so callers can show user-friendly
 *  errors. */
export async function decryptEnvelope(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<DecryptResult> {
  if (!isEncryptedEnvelope(envelope)) {
    return { ok: false, reason: "bad_format" };
  }
  if (!passphrase) {
    return { ok: false, reason: "wrong_passphrase" };
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = fromBase64(envelope.salt);
    iv = fromBase64(envelope.iv);
    ciphertext = fromBase64(envelope.ciphertext);
  } catch {
    return { ok: false, reason: "corrupted" };
  }
  try {
    const key = await deriveKey(
      passphrase,
      salt,
      envelope.iterations || PBKDF2_ITERATIONS,
    );
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    const text = new TextDecoder().decode(plaintextBuf);
    try {
      return { ok: true, payload: JSON.parse(text) };
    } catch {
      return { ok: false, reason: "corrupted" };
    }
  } catch {
    // AES-GCM throws OperationError on auth-tag mismatch — wrong
    // passphrase OR tampered ciphertext. Same code path.
    return { ok: false, reason: "wrong_passphrase" };
  }
}
