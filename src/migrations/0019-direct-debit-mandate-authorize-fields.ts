import type { MigrationContext } from "./types.js";

/**
 * direct_debit_mandates: add mono_session_id, last_resend_at for BVN authorize flow;
 * allow status INACTIVE (pending authorization).
 * If the column uses a PostgreSQL enum (e.g. from Sequelize), add 'INACTIVE' to the enum.
 * If the column uses VARCHAR + CHECK, update the check constraint.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "direct_debit_mandates"
      ADD COLUMN IF NOT EXISTS "mono_session_id" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "last_resend_at" TIMESTAMP WITH TIME ZONE;
  `);

  const [rows] = await context.sequelize.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns WHERE table_name = 'direct_debit_mandates' AND column_name = 'status';`
  );
  const isEnum = rows?.[0]?.data_type === "USER-DEFINED";

  if (isEnum) {
    await q(`ALTER TYPE enum_direct_debit_mandates_status ADD VALUE IF NOT EXISTS 'INACTIVE';`);
  } else {
    await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
    await q(`
      ALTER TABLE "direct_debit_mandates"
        ADD CONSTRAINT "direct_debit_mandates_status_check"
        CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED'));
    `);
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  const [rows] = await context.sequelize.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns WHERE table_name = 'direct_debit_mandates' AND column_name = 'status';`
  );
  const isEnum = rows?.[0]?.data_type === "USER-DEFINED";
  if (!isEnum) {
    await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
    await q(`
      ALTER TABLE "direct_debit_mandates"
        ADD CONSTRAINT "direct_debit_mandates_status_check"
        CHECK ("status" IN ('ACTIVE','FAILED'));
    `);
  }
  await q(`ALTER TABLE "direct_debit_mandates" DROP COLUMN IF EXISTS "mono_session_id";`);
  await q(`ALTER TABLE "direct_debit_mandates" DROP COLUMN IF EXISTS "last_resend_at";`);
}
