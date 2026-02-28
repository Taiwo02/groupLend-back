import type { MigrationContext } from "./types";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "kycStep" INTEGER NOT NULL DEFAULT 0
        CHECK ("kycStep" >= 0 AND "kycStep" <= 5);
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS "user_kyc_data" (
      "userId" UUID PRIMARY KEY,
      "bioData" JSONB,
      "contact" JSONB,
      "employmentDetails" JSONB,
      "profilePicture" VARCHAR(500),
      "submittedAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_kyc_data_userId_users_fk') THEN
        ALTER TABLE "user_kyc_data" ADD CONSTRAINT "user_kyc_data_userId_users_fk"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "user_kyc_data" DROP CONSTRAINT IF EXISTS "user_kyc_data_userId_users_fk";`);
  await context.sequelize.getQueryInterface().dropTable("user_kyc_data");
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "kycStep";`);
}
