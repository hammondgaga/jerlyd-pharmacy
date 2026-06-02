import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypt a private key using AES-256-GCM with JWT_SECRET as the key.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 */
export function encryptPrivateKey(privateKey: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  // Use first 32 bytes of JWT_SECRET as AES-256 key
  const key = Buffer.from(secret.slice(0, 32).padEnd(32, "0"));
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(privateKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Return IV + authTag + ciphertext, all base64 encoded
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]).toString("base64");
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
    // Use first 32 bytes of JWT_SECRET as AES-256 key
    const key = Buffer.from(secret.slice(0, 32).padEnd(32, "0"));
    const buffer = Buffer.from(encrypted, "base64");

    // Extract IV (16 bytes), authTag (16 bytes), and ciphertext
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const ciphertext = buffer.slice(32);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext.toString("hex"), "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (e) {
    throw new Error(
      `Failed to decrypt private key: ${e instanceof Error ? e.message : "Unknown error"}`
    );
  }
}
