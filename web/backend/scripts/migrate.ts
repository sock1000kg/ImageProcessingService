import "dotenv/config";

import { pool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";

async function migrate(): Promise<void> {
  await runMigrations();
  await pool.end();
}

migrate().catch(async (error) => {
  console.error("Database migration failed", error);
  await pool.end();
  process.exitCode = 1;
});
