import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// WebSocket driver required for Drizzle transactions (neon-http does not support them).
neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add a Postgres connection string for Neon or Vercel Postgres.");
  }
  if (!cached) {
    pool = new Pool({ connectionString: url });
    cached = drizzle(pool, { schema });
  }
  return cached;
}
