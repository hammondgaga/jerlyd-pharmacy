import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encrypt a private key using AES-256-GCM with JWT_SECRET.
 * Uses scryptSync for stronger key derivation.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 */
export function encryptPrivateKey(privateKey: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  // Derive 32-byte key from JWT_SECRET using scryptSync
  const key = scryptSync(secret, "salt", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Return IV + authTag + ciphertext, all base64 encoded
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a private key that was encrypted with encryptPrivateKey.
 * Expects a base64-encoded string containing IV + authTag + ciphertext.
 */
export function decryptPrivateKey(encrypted: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  try {
    // Derive 32-byte key from JWT_SECRET using scryptSync
    const key = scryptSync(secret, "salt", 32);
    const buf = Buffer.from(encrypted, "base64");

    // Extract IV (16 bytes), authTag (16 bytes), and ciphertext
    const iv = buf.subarray(0, 16);
    const tag = buf.subarray(16, 32);
    const data = buf.subarray(32);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(data) + decipher.final("utf8");
  } catch (e) {
    throw new Error(
      `Failed to decrypt private key: ${e instanceof Error ? e.message : "Unknown error"}`
    );
  }
}
