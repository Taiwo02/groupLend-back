import { QueryTypes } from "sequelize";
import type { MigrationContext } from "./types.js";

/**
 * Adds APPROVED to direct_debit_mandates.status enum/check.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  const rows = (await context.sequelize.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direct_debit_mandates' AND column_name = 'status' LIMIT 1`,
    { type: QueryTypes.SELECT }
  )) as { data_type: string }[];
  const isEnum = rows[0]?.data_type === "USER-DEFINED";

  if (isEnum) {
    await q(`ALTER TYPE enum_direct_debit_mandates_status ADD VALUE IF NOT EXISTS 'APPROVED';`);
  } else {
    await q(`ALTER TABLE "direct_debit_mandates" DROP CONSTRAINT IF EXISTS "direct_debit_mandates_status_check";`);
    await q(`
      ALTER TABLE "direct_debit_mandates"
        ADD CONSTRAINT "direct_debit_mandates_status_check"
        CHECK ("status" IN ('ACTIVE','APPROVED','INACTIVE','FAILED','INPROGRESS','COMPLETED','CANCELED'));
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
        CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED','INPROGRESS','COMPLETED','CANCELED'));
    `);
  }
}
