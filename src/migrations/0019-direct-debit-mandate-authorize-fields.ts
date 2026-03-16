import type { MigrationContext } from "./types.js";

/**
 * direct_debit_mandates: add mono_session_id, last_resend_at for BVN authorize flow;
 * allow status INACTIVE (pending authorization).
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD COLUMN IF NOT EXISTS "mono_session_id" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "last_resend_at" TIMESTAMP WITH TIME ZONE;
  `);

  await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD CONSTRAINT "direct_debit_mandates_status_check"
      CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED'));
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD CONSTRAINT "direct_debit_mandates_status_check"
      CHECK ("status" IN ('ACTIVE','FAILED'));
  `);
  await q(`ALTER TABLE "direct_debit_mandates" DROP COLUMN IF EXISTS "mono_session_id";`);
  await q(`ALTER TABLE "direct_debit_mandates" DROP COLUMN IF EXISTS "last_resend_at";`);
}
