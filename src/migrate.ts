import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Umzug } from "umzug";
import { SequelizeStorage } from "umzug";
import { sequelize } from "./config/database.js";
import type { MigrationContext } from "./migrations/types.js";
import { initModelAssociations } from "./models/index.js";

async function loadMigrations(context: MigrationContext) {
  initModelAssociations();
  const dir = path.join(import.meta.dir, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && f !== "types.ts")
    .sort();
  const runnable = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(dir, file);
      const name = file.replace(/\.ts$/, "");
      const mod = await import(pathToFileURL(fullPath).href);
      const up = mod.up ?? mod.default?.up;
      const down = mod.down ?? mod.default?.down;
      if (!up) throw new Error(`Migration ${name} must export up`);
      return {
        name,
        path: fullPath,
        up: () => up({ name, path: fullPath, context }),
        down: down ? () => down({ name, path: fullPath, context }) : undefined
      };
    })
  );
  return runnable;
}

export async function runMigrations(): Promise<void> {
  const umzug = new Umzug<MigrationContext>({
    migrations: (context) => loadMigrations(context),
    context: { sequelize },
    storage: new SequelizeStorage({ sequelize }),
    logger: console
  });
  await umzug.up();
}

export async function undoMigrations(): Promise<void> {
  const umzug = new Umzug<MigrationContext>({
    migrations: (context) => loadMigrations(context),
    context: { sequelize },
    storage: new SequelizeStorage({ sequelize }),
    logger: console
  });
  await umzug.down({ to: 0 });
}

if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log("Migrations completed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migrations failed", err);
      process.exit(1);
    });
}
