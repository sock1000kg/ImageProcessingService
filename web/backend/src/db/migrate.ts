import { readFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "./pool";

export async function runMigrations(): Promise<void> {
  const migrationsDirectory = path.resolve(process.cwd(), "backend", "migrations");
  const migration = await readFile(path.join(migrationsDirectory, "001_create_jobs.sql"), "utf8");
  await pool.query(migration);
}
