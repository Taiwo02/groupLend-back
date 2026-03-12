import type { MigrationContext } from "./types.js";

/**
 * user_kyc_data: add id (UUID) as new PK so a user can have multiple KYC records.
 * Add status (PENDING, SUBMITTED, APPROVED, REJECTED, FLAGGED, RESUBMITTED).
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "user_kyc_data"
      ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid(),
      ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'SUBMITTED';
  `);

  await q(`UPDATE "user_kyc_data" SET "id" = gen_random_uuid() WHERE "id" IS NULL;`);
  await q(`UPDATE "user_kyc_data" SET "status" = 'SUBMITTED' WHERE "status" IS NULL AND "submittedAt" IS NOT NULL;`);
  await q(`UPDATE "user_kyc_data" SET "status" = 'PENDING' WHERE "status" IS NULL;`);

  await q(`ALTER TABLE "user_kyc_data" ALTER COLUMN "id" SET NOT NULL;`);
  await q(`ALTER TABLE "user_kyc_data" ALTER COLUMN "status" SET NOT NULL;`);

  await q(`ALTER TABLE "user_kyc_data" DROP CONSTRAINT IF EXISTS "user_kyc_data_pkey";`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS "user_kyc_data_id_key" ON "user_kyc_data" ("id");`);
  await q(`ALTER TABLE "user_kyc_data" ADD PRIMARY KEY ("id");`);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "user_kyc_data" DROP CONSTRAINT IF EXISTS "user_kyc_data_pkey";`);
  await q(`DROP INDEX IF EXISTS "user_kyc_data_id_key";`);
  await q(`ALTER TABLE "user_kyc_data" ADD PRIMARY KEY ("userId");`);
  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "id";`);
  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "status";`);
}
