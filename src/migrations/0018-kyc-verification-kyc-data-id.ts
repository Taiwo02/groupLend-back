import type { MigrationContext } from "./types.js";

/**
 * kyc_verifications: add kycDataId FK to user_kyc_data(id).
 * One verification per KYC record (kycId). Drop unique on userId.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "kyc_verifications"
      ADD COLUMN IF NOT EXISTS "kycDataId" UUID;
  `);

  await q(`
    UPDATE "kyc_verifications" kv
    SET "kycDataId" = (
      SELECT uk.id FROM "user_kyc_data" uk WHERE uk."userId" = kv."userId" ORDER BY uk."createdAt" DESC LIMIT 1
    );
  `);

  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_verifications_kycDataId_user_kyc_data_fk') THEN
        ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_kycDataId_user_kyc_data_fk"
          FOREIGN KEY ("kycDataId") REFERENCES "user_kyc_data" ("id")
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await q(`ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "kyc_verifications_userId_key";`);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "kyc_verifications_kycDataId_user_kyc_data_fk";`);
  await q(`ALTER TABLE "kyc_verifications" DROP COLUMN IF EXISTS "kycDataId";`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS "kyc_verifications_userId_key" ON "kyc_verifications" ("userId");`);
}
