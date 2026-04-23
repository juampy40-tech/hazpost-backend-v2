import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "eco-col-social-manager";

function getDerivedKey(): Buffer {
  const rawKey = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!rawKey) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required in production. Set it before starting the server.");
    }
    // Development-only fallback: logs a warning so developers know to set the var
    console.warn("[WARN] TOKEN_ENCRYPTION_KEY is not set. Using an insecure development fallback. Set this env var before deploying.");
  }
  return scryptSync(rawKey ?? "dev-fallback-key-do-not-use-in-prod", SALT, KEY_LENGTH) as Buffer;
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  try {
    const buf = Buffer.from(ciphertext, "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      return ciphertext;
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = getDerivedKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return ciphertext;
  }
}

export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
