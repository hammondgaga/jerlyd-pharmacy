import { createHash, randomBytes } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + EXPIRY_MS).toISOString();
  const createdAt = new Date(now).toISOString();

  const db = getDb();
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
    createdAt,
  });

  return token;
}

export async function findUserIdByResetToken(token: string): Promise<number | null> {
  const tokenHash = hashResetToken(token);
  const db = getDb();
  const now = new Date().toISOString();

  const rows = await db
    .select({ userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);

  return rows[0]?.userId ?? null;
}

export async function consumeResetToken(token: string): Promise<number | null> {
  const userId = await findUserIdByResetToken(token);
  if (!userId) return null;

  const db = getDb();
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  return userId;
}

export async function findUserByEmail(email: string) {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}
