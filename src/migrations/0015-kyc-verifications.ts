import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    CREATE TABLE IF NOT EXISTS "kyc_verifications" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL UNIQUE,
      "ninApproved" BOOLEAN NOT NULL DEFAULT false,
      "bvnApproved" BOOLEAN NOT NULL DEFAULT false,
      "addressApproved" BOOLEAN NOT NULL DEFAULT false,
      "creditHistoryApproved" BOOLEAN NOT NULL DEFAULT false,
      "overallStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_verifications_userId_users_fk') THEN
        ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_userId_users_fk"
          FOREIGN KEY ("userId") REFERENCES "users" ("id")
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "kyc_verifications_userId_users_fk";`);
  await q(`DROP TABLE IF EXISTS "kyc_verifications";`);
}
