import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // KYC flow is now 5 steps (0–4), step 5 = submitted
  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";`);
  await q(`UPDATE "users" SET "kycStep" = 5 WHERE "kycStep" > 5;`);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 5);
  `);

  await q(`
    ALTER TABLE "user_kyc_data"
      ADD COLUMN IF NOT EXISTS "ninData" JSONB;
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS "user_kyc_otp" (
      "userId" UUID PRIMARY KEY,
      "ninData" JSONB NOT NULL,
      "otpHash" VARCHAR(255) NOT NULL,
      "phone" VARCHAR(25) NOT NULL,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_kyc_otp_userId_users_fk') THEN
        ALTER TABLE "user_kyc_otp" ADD CONSTRAINT "user_kyc_otp_userId_users_fk"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "user_kyc_otp" DROP CONSTRAINT IF EXISTS "user_kyc_otp_userId_users_fk";`);
  await context.sequelize.getQueryInterface().dropTable("user_kyc_otp");

  await q(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "ninData";`);

  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";`);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 6);
  `);
}
