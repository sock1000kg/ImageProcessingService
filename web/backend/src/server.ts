/**
 * HTTP server bootstrap and graceful shutdown lifecycle coordinator.
 */
import { createApp } from "./app";
import { config } from "./config";
import { closeDatabase } from "./db";
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

async function start(): Promise<void> {
  // Every API route needs a signed access token, so without a secret the app would only answer 500s.
  if (!config.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set (at least 32 characters); see web/.env.example");
  }
  await verifyBuckets();
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
