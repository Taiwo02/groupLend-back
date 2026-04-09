import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { sequelize } from "./config/database.js";
import { initModelAssociations } from "./models/index.js";
import { createApp } from "./app.js";
import { collectConnectionErrorCodes, waitForDatabase } from "./utils/wait-for-db.js";

const bootstrap = async (): Promise<void> => {
  await waitForDatabase(sequelize, {
    maxAttempts: env.dbConnectMaxAttempts,
    delayMs: env.dbConnectRetryMs
  });
  initModelAssociations();

  const app = createApp();
  serve({
    fetch: app.fetch,
    port: env.port
  });

  console.log(`Enlace Lending API running on port ${env.port}`);
};

bootstrap().catch((error: unknown) => {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: string }).name)
      : "";
  const codes = collectConnectionErrorCodes(error);

  if (name === "SequelizeHostNotFoundError" || codes.includes("ENOTFOUND")) {
    console.error("Database host could not be resolved (ENOTFOUND).");
    console.error("");
    console.error("Options:");
    console.error("  1. Use local Postgres: run 'docker compose up -d' then in .env set:");
    console.error("     DATABASE_URL=postgres://postgres:postgres@localhost:5432/group_loan");
    console.error("  2. If using Supabase: resume the project in the dashboard or use the");
    console.error("     'Session pooler' connection string (Database → Connection string).");
  } else if (codes.includes("ETIMEDOUT")) {
    console.error("Database connection timed out (ETIMEDOUT) after all retries.");
    console.error("Check that Postgres is running, DATABASE_URL host/port are correct, and firewalls/VPN allow the connection.");
    console.error(
      `You can increase wait time via DB_CONNECT_MAX_ATTEMPTS (current ${env.dbConnectMaxAttempts}) and DB_CONNECT_RETRY_MS (current ${env.dbConnectRetryMs}).`
    );
  } else if (codes.includes("ECONNREFUSED")) {
    console.error("Database refused the connection (ECONNREFUSED). Is Postgres listening on that port?");
  } else {
    console.error("Failed to bootstrap application", error);
  }
  process.exit(1);
});
