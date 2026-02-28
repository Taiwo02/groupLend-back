import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // Allow kycStep 0..6 (step 6 = submitted)
  await q(`
    ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";
  `);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 6);
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS "statements" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL,
      "accountId" VARCHAR(255),
      "code" VARCHAR(255),
      "comment" VARCHAR(255),
      "extraData" JSONB NOT NULL DEFAULT '{}',
      "income" JSONB NOT NULL DEFAULT '{}',
      "statement" JSONB NOT NULL DEFAULT '{}',
      "details" JSONB NOT NULL DEFAULT '{}',
      "identities" JSONB NOT NULL DEFAULT '{}',
      "bvn_identities" JSONB NOT NULL DEFAULT '{}',
      "nin_identities" JSONB NOT NULL DEFAULT '{}',
      "status" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statements_userId_users_fk') THEN
        ALTER TABLE "statements" ADD CONSTRAINT "statements_userId_users_fk"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await q(`
    CREATE UNIQUE INDEX IF NOT EXISTS "statements_userId_unique" ON "statements" ("userId");
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`DROP INDEX IF EXISTS "statements_userId_unique";`);
  await q(`ALTER TABLE "statements" DROP CONSTRAINT IF EXISTS "statements_userId_users_fk";`);
  await context.sequelize.getQueryInterface().dropTable("statements");

  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStep_check";`);
  await q(`
    ALTER TABLE "users" ADD CONSTRAINT "users_kycStep_check"
      CHECK ("kycStep" >= 0 AND "kycStep" <= 5);
  `);
}
