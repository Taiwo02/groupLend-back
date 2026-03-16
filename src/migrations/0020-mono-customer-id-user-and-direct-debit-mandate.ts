import type { MigrationContext } from "./types.js";

/**
 * users: add mono_customer_id for Mono customer reference.
 * direct_debit_mandates: add mono_customer_id for authorize flow.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "mono_customer_id" VARCHAR(120);
  `);

  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD COLUMN IF NOT EXISTS "mono_customer_id" VARCHAR(120);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "mono_customer_id";`);
  await q(`ALTER TABLE "direct_debit_mandates" DROP COLUMN IF EXISTS "mono_customer_id";`);
}
