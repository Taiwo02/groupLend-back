import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // KYC flow is now 3 steps (0, 1, 2), step 3 = submitted
  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";`);
  await q(`UPDATE "users" SET "kycStep" = 3 WHERE "kycStep" > 3;`);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 3);
  `);

  await q(`
    ALTER TABLE "user_kyc_data"
      ADD COLUMN IF NOT EXISTS "bvnEncrypted" TEXT,
      ADD COLUMN IF NOT EXISTS "ninLookupKey" VARCHAR(64);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "bvnEncrypted";`);
  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "ninLookupKey";`);

  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";`);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 5);
  `);
}
