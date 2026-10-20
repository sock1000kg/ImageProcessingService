import { createApp } from "./app";
import { config } from "./config";
import { closeDatabase } from "./db";
import { runMigrations } from "./db/migrate";
import { closeMessaging, connectMessaging } from "./messaging";
import { verifyBuckets } from "./storage";

async function start(): Promise<void> {
  await runMigrations();
  await verifyBuckets();
  await connectMessaging();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`Web API listening on http://localhost:${config.PORT}`);
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
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
