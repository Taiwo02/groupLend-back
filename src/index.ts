import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { serve } from "bun";
import { env } from "./config/env";
import { sequelize } from "./config/database";
import { initModelAssociations } from "./models";
import { createApp } from "./app";

const bootstrap = async (): Promise<void> => {
  await sequelize.authenticate();
  initModelAssociations();

  const app = createApp();
  serve({
    port: env.port,
    fetch: app.fetch
  });

  console.log(`Enlace Lending API running on port ${env.port}`);
};

bootstrap().catch((error: unknown) => {
  const isHostNotFound =
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "SequelizeHostNotFoundError";
  if (isHostNotFound) {
    console.error("Database host could not be resolved (ENOTFOUND).");
    console.error("");
    console.error("Options:");
    console.error("  1. Use local Postgres: run 'docker compose up -d' then in .env set:");
    console.error("     DATABASE_URL=postgres://postgres:postgres@localhost:5432/group_loan");
    console.error("  2. If using Supabase: resume the project in the dashboard or use the");
    console.error("     'Session pooler' connection string (Database → Connection string).");
  } else {
    console.error("Failed to bootstrap application", error);
  }
  process.exit(1);
});
