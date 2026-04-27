import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD COLUMN IF NOT EXISTS "admin_review_comment" TEXT;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "direct_debit_mandates"
      DROP COLUMN IF EXISTS "admin_review_comment";
  `);
}
