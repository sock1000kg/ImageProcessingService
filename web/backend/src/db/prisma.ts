/**
 * Prisma client instance configuration with connection pool adapter.
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { config } from "../config";

const pool = new Pool({ connectionString: config.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

/**
 * Closes the Prisma client connection and terminates the PostgreSQL connection pool.
 */
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}

/**
 * Runs `SELECT 1` so startup logs say whether PostgreSQL is reachable. Throws on failure; the caller decides what to do.
 */
export async function verifyDatabase(): Promise<void> {
  // The pool, not Prisma: its errors are one line ("connect ECONNREFUSED 127.0.0.1:5432") instead of a long trace.
  await pool.query("SELECT 1");
}

/**
 * Migration folders that the database has not applied yet. Both `npm run dev:backend` and the image run from the
 * folder holding `backend/prisma/migrations`. An unapplied migration otherwise only shows up later as a 500
 * ("column … does not exist").
 */
export async function pendingMigrations(dir = join(process.cwd(), "backend/prisma/migrations")): Promise<string[]> {
  const local = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const applied = await pool.query<{ migration_name: string }>(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
  );
  const done = new Set(applied.rows.map((row) => row.migration_name));
  return local.filter((name) => !done.has(name)).sort();
}
