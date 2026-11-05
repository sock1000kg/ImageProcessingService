/**
 * HTTP server bootstrap and graceful shutdown lifecycle coordinator.
 */
import { createApp } from "./app";
import { config } from "./config";
import { closeDatabase, pendingMigrations, verifyDatabase } from "./db";
import { closeMessaging, connectMessaging } from "./messaging";
import { verifyBuckets } from "./storage";
import { cleanupExpiredBatches } from "./services/batch.service";

let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanupTimer(): void {
  cleanupTimer = setInterval(() => {
    cleanupExpiredBatches().catch((error) => {
      console.error("Cleanup expired batches failed", error);
    });
  }, config.CLEANUP_INTERVAL_MS);
}

function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/** Where a dependency lives, without credentials, for the startup log. */
function describeDatabase(): string {
  try {
    const url = new URL(config.DATABASE_URL);
    return `${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    return "DATABASE_URL";
  }
}

/**
 * Logs whether PostgreSQL and MinIO answer, so a failed start says which one is down. MinIO stays fatal (uploads
 * cannot work without the buckets); a PostgreSQL failure is logged and requests fail until it comes back.
 */
async function checkDependencies(): Promise<void> {
  const minio = `${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`;
  try {
    await verifyDatabase();
    console.log(`PostgreSQL OK (${describeDatabase()})`);
  } catch (error) {
    console.error(`PostgreSQL unreachable (${describeDatabase()}): ${(error as Error).message}`);
  }
  try {
    const pending = await pendingMigrations();
    if (pending.length > 0) {
      console.warn(
        `PostgreSQL has ${pending.length} unapplied migration(s): ${pending.join(", ")}. Run npm run db:deploy`,
      );
    }
  } catch (error) {
    // Database down (already logged above), or no migrations table yet on a fresh database.
    console.warn(`Could not check migrations: ${(error as Error).message}`);
  }
  try {
    await verifyBuckets();
    console.log(`MinIO OK (${minio}, buckets present)`);
  } catch (error) {
    console.error(`MinIO unreachable or buckets missing (${minio}): ${(error as Error).message}`);
    throw error;
  }
}

async function start(): Promise<void> {
  // Every API route needs a signed access token, so without a secret the app would only answer 500s.
  if (!config.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set (at least 32 characters); see web/.env.example");
  }
  await checkDependencies();
  await connectMessaging();
  startCleanupTimer();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`Web API listening on http://localhost:${config.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopCleanupTimer();
    server.close();
    await closeMessaging();
    await closeDatabase();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Web API failed to start", error);
  process.exitCode = 1;
});
