import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "user_kyc_data"
      ADD COLUMN IF NOT EXISTS "meter" VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "meterType" VARCHAR(20);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "meter";`);
  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "meterType";`);
}
