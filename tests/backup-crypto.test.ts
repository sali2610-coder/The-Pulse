// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  decryptEnvelope,
  encryptPayload,
  isEncryptedEnvelope,
} from "@/lib/backup-crypto";

describe("backup-crypto", () => {
  it("round-trips an arbitrary payload", async () => {
    const payload = {
      entries: [{ id: "e1", amount: 42 }],
      monthlyBudget: 5000,
      label: "סלי",
    };
    const env = await encryptPayload(payload, "correct-horse-battery");
    expect(env.encrypted).toBe(true);
    expect(env.algo).toBe("AES-GCM");
    const result = await decryptEnvelope(env, "correct-horse-battery");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });

  it("rejects passphrases shorter than 4 chars", async () => {
    await expect(
      encryptPayload({ a: 1 }, "xy"),
    ).rejects.toThrow("passphrase_too_short");
  });

  it("returns wrong_passphrase on a bad key", async () => {
    const env = await encryptPayload({ a: 1 }, "real-passphrase");
    const result = await decryptEnvelope(env, "wrong-passphrase");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_passphrase");
  });

  it("returns corrupted when base64 fields are mangled", async () => {
    const env = await encryptPayload({ a: 1 }, "key12345");
    const tampered = { ...env, salt: "%%%not-base64%%%" };
    const result = await decryptEnvelope(tampered, "key12345");
    expect(result.ok).toBe(false);
  });

  it("isEncryptedEnvelope recognizes valid shapes", async () => {
    const env = await encryptPayload({ a: 1 }, "key12345");
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(isEncryptedEnvelope({ app: "other" })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
  });

  it("each encryption uses a fresh salt + IV", async () => {
    const a = await encryptPayload({ x: 1 }, "key12345");
    const b = await encryptPayload({ x: 1 }, "key12345");
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
