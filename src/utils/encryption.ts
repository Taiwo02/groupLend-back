import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = env.encryptionKey;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 bytes (hex or base64) for BVN encryption");
  }
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  return Buffer.from(key, "utf8").subarray(0, KEY_LENGTH);
}

function getNinLookupSecret(): Buffer {
  const secret = env.ninLookupSecret ?? env.jwtSecret;
  return Buffer.from(secret, "utf8");
}

/** Encrypt BVN for storage. Returns iv:tag:ciphertext (hex). */
export function encryptBvn(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

/** Decrypt BVN (for server-side use only). */
export function decryptBvn(encrypted: string): string {
  const [ivHex, tagHex, encHex] = encrypted.split(":");
  if (!ivHex || !tagHex || !encHex) throw new Error("Invalid BVN cipher format");
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(encHex, "hex", "utf8") + decipher.final("utf8");
}

/** Deterministic key from NIN for server-side lookup only. Never sent to frontend. */
export function ninLookupKey(nin: string): string {
  const secret = getNinLookupSecret();
  return createHmac("sha256", secret).update(nin.trim().toLowerCase()).digest("hex");
}
