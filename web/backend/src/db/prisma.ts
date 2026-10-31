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
