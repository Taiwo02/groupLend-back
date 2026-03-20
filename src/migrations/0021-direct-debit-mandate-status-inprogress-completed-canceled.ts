import { QueryTypes } from "sequelize";
import type { MigrationContext } from "./types.js";

const NEW_VALUES = ["INPROGRESS", "COMPLETED", "CANCELED"] as const;

/**
 * Sequelize model uses MandateStatus: INACTIVE, ACTIVE, FAILED, INPROGRESS, COMPLETED, CANCELED.
 * Older DBs only had ACTIVE/FAILED (VARCHAR) or enum + INACTIVE from 0019.
 * This migration adds missing enum labels or extends the CHECK constraint.
 * (Requires PostgreSQL 15+ for ADD VALUE IF NOT EXISTS — same as migration 0019.)
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  const rows = (await context.sequelize.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direct_debit_mandates' AND column_name = 'status' LIMIT 1`,
    { type: QueryTypes.SELECT }
  )) as { data_type: string }[];
  const isEnum = rows[0]?.data_type === "USER-DEFINED";

  if (isEnum) {
    for (const label of NEW_VALUES) {
      await q(`ALTER TYPE enum_direct_debit_mandates_status ADD VALUE IF NOT EXISTS '${label}';`);
    }
  } else {
    await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
    await q(`
      ALTER TABLE "direct_debit_mandates"
        ADD CONSTRAINT "direct_debit_mandates_status_check"
        CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED','INPROGRESS','COMPLETED','CANCELED'));
    `);
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  const rows = (await context.sequelize.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direct_debit_mandates' AND column_name = 'status' LIMIT 1`,
    { type: QueryTypes.SELECT }
  )) as { data_type: string }[];
  const isEnum = rows[0]?.data_type === "USER-DEFINED";
  if (!isEnum) {
    await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
    await q(`
      ALTER TABLE "direct_debit_mandates"
        ADD CONSTRAINT "direct_debit_mandates_status_check"
        CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED'));
    `);
  }
}
