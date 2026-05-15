import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export type JwtPayload = { sub: number; role: "patient" | "pharmacist"; email: string };

export function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET must be set to at least 16 characters. In Vercel: Project → Settings → Environment Variables → add JWT_SECRET, then redeploy."
    );
  }
  return s;
}

/** Fail fast before writing to the database so registration does not half-succeed without a token. */
export function assertServerAuthEnv(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. In Vercel: Project → Settings → Environment Variables → add your Postgres connection string (e.g. from Neon), then redeploy."
    );
  }
  requireJwtSecret();
}

export function signToken(user: { id: number; role: "patient" | "pharmacist"; email: string }) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, requireJwtSecret(), {
    expiresIn: "14d",
  });
}

export function verifyBearer(authorization: string | null): JwtPayload {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header.");
  }
  const token = authorization.slice(7);
  const payload = jwt.verify(token, requireJwtSecret()) as Record<string, unknown>;
  const sub = Number(payload.sub);
  if (!Number.isFinite(sub)) {
    throw new Error("Session expired or invalid. Please sign in again.");
  }
  const role = payload.role === "pharmacist" ? "pharmacist" : "patient";
  const email = String(payload.email || "");
  return { sub, role, email };
}

export async function getUserRow(id: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const role: "patient" | "pharmacist" = row.role === "pharmacist" ? "pharmacist" : "patient";
  return {
    id: row.id,
    email: row.email,
    role,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}
