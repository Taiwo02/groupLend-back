import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // 1. Individual yearly mandate table (mirrors group mandates, scoped to one user)
  await q(`
    CREATE TABLE IF NOT EXISTS "user_mandates" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
      "year" INTEGER NOT NULL,
      "totalAccessAmount" DECIMAL(14,2) NOT NULL,
      "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','EXPIRED')),
      "startDate" DATE NOT NULL,
      "endDate" DATE NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await q(
    'CREATE UNIQUE INDEX IF NOT EXISTS "user_mandates_user_id_year" ON "user_mandates" ("userId", "year")'
  );

  // 2. Individual loans link to user_mandates instead of group mandates
  await q(`
    ALTER TABLE "loans"
      ADD COLUMN IF NOT EXISTS "userMandateId" UUID
        REFERENCES "user_mandates" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
  `);

  // 3. Make accounts.mandateId nullable so individual direct-debit accounts
  //    (which have no group mandate) can be stored in the same table.
  await q(`ALTER TABLE "accounts" ALTER COLUMN "mandateId" DROP NOT NULL;`);

  // 4. Individual direct-debit accounts link to user_mandates
  await q(`
    ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "userMandateId" UUID
        REFERENCES "user_mandates" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "userMandateId";`);
  await q(`ALTER TABLE "accounts" ALTER COLUMN "mandateId" SET NOT NULL;`);
  await q(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "userMandateId";`);
  await q(`DROP INDEX IF EXISTS "user_mandates_user_id_year";`);
  await q(`DROP TABLE IF EXISTS "user_mandates";`);
}
