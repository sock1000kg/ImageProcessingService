/**
 * Prisma client instance configuration with connection pool adapter.
 */
import "dotenv/config";
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
