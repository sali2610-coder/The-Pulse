// HMAC-SHA256 verification for incoming webhook payloads.
// Edge runtime: uses Web Crypto API only (no Node "crypto" module).

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyHmac(args: {
  rawBody: string;
  signatureHex: string;
  secret: string;
}): Promise<boolean> {
  if (!args.signatureHex || !args.secret) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(args.rawBody));
  const expected = new Uint8Array(sigBuf);
  const provided = hexToBytes(args.signatureHex);

  return constantTimeEqual(expected, provided);
}

export function hmacHex(rawBody: string, signature: ArrayBuffer): string {
  return bytesToHex(new Uint8Array(signature));
}
