/**
 * Loads DATABASE_URL from .env.local or .env, then runs `drizzle-kit migrate`.
 * Step 3 on a machine where you pasted the same DATABASE_URL as Vercel uses.
 */
const path = require("path");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const root = path.join(__dirname, "..");
const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error(
    "DATABASE_URL is not set. Create .env.local in the project root (copy from .env.example) and paste the same\n" +
      "Postgres connection string you use in Vercel (Neon: Dashboard → Connection string → copy)."
  );
  process.exit(1);
}

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status === 0 ? 0 : result.status ?? 1);
