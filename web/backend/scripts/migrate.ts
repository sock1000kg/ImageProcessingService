import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "../src/db/pool";

async function migrate(): Promise<void> {
  const file = path.resolve(__dirname, "..", "migrations", "001_create_jobs.sql");
  await pool.query(await readFile(file, "utf8"));
  await pool.end();
}

migrate().catch(async (error) => {
  console.error("Database migration failed", error);
  await pool.end();
  process.exitCode = 1;
});
