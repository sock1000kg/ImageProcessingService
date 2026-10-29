import { readdir, readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

import { pool } from "./pool";

export async function runMigrations(): Promise<void> {
  const migrationsDirectory = fs.existsSync(path.resolve(process.cwd(), "backend", "migrations"))
    ? path.resolve(process.cwd(), "backend", "migrations")
    : path.resolve(__dirname, "..", "..", "migrations");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedResult = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  const applied = new Set(appliedResult.rows.map((row) => row.name));

  const allFiles = await readdir(migrationsDirectory);
  const sqlFiles = allFiles.filter((file) => file.endsWith(".sql")).sort();

  for (const file of sqlFiles) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDirectory, file);
    const sql = await readFile(filePath, "utf8");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }
}
