import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";

/**
 * Two-factor login for admins (22 Nov 2026): time-based one-time codes
 * (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps), the codes shown
 * by Google Authenticator, Microsoft Authenticator, 1Password and others.
 * Written on node:crypto, no dependency.
 *
 * The key is stored encrypted (AES-256-GCM) with a key derived from
 * JWT_SECRET, so a leaked database row alone cannot produce codes.
 * Changing JWT_SECRET makes every stored key unreadable: set two-factor up
 * again with `pnpm admin 2fa`.
 */

export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
/** Codes from one step before and after are accepted too (phone clocks drift). */
const DRIFT_STEPS = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Not a base32 key");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random key (160 bits, the RFC's recommended length). */
export function generateTotpKey(): Buffer {
  return randomBytes(20);
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one time step (RFC 4226 dynamic truncation). */
export function totpCode(key: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(binary).padStart(digits, "0");
}

/**
 * The step a right code belongs to, or null. A step at or before
 * `lastStep` (already used) never counts, so a code cannot be replayed.
 */
export function matchTotp(key: Buffer, code: string, now: Date, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  let matched: number | null = null;
  for (let step = current - DRIFT_STEPS; step <= current + DRIFT_STEPS; step++) {
    // Compare every candidate (constant work), keep the match.
    const equal = timingSafeEqual(Buffer.from(totpCode(key, step)), Buffer.from(code));
    if (equal && (lastStep === null || step > lastStep)) matched = step;
  }
  return matched;
}

/** The link an authenticator app reads (also typed in by hand as the base32 key). */
export function otpauthUri(key: Buffer, accountEmail: string): string {
  const label = encodeURIComponent(`Muhrak Admin:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${base32Encode(key)}&issuer=${encodeURIComponent("Muhrak Admin")}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

// ---------------------------------------------------------------- storage

const storageKey = createHash("sha256").update(`muhrak-totp-key:${env.JWT_SECRET}`).digest();

/** "v1.<iv>.<tag>.<ciphertext>", base64url parts. */
export function sealTotpKey(key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", storageKey, iv);
  const sealed = Buffer.concat([cipher.update(key), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(".");
}

/** The key, or null if the value is damaged or was sealed under another JWT_SECRET. */
export function openTotpKey(stored: string): Buffer | null {
  const [version, iv, tag, sealed] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !sealed) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", storageKey, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(sealed, "base64url")), decipher.final()]);
  } catch {
    return null;
  }
}
