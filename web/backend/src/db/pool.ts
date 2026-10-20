import { Pool } from "pg";

import { config } from "../config";

export const pool = new Pool({ connectionString: config.DATABASE_URL });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
