import type { MigrationContext } from "./types.js";

/** Admin "freeze credit" without full group deactivation. */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "groups"
    ADD COLUMN IF NOT EXISTS "creditFrozen" BOOLEAN NOT NULL DEFAULT false;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "creditFrozen";`);
}
