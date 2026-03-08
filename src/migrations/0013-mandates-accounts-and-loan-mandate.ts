import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    CREATE TABLE IF NOT EXISTS "mandates" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "groupId" UUID NOT NULL REFERENCES "groups" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
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
    'CREATE UNIQUE INDEX IF NOT EXISTS "mandates_group_id_year" ON "mandates" ("groupId", "year")'
  );

  await q(`
    CREATE TABLE IF NOT EXISTS "member_mandates" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "mandateId" UUID NOT NULL REFERENCES "mandates" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
      "userId" UUID NOT NULL REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
      "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','FAILED')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await q(
    'CREATE UNIQUE INDEX IF NOT EXISTS "member_mandates_mandate_id_user_id" ON "member_mandates" ("mandateId", "userId")'
  );

  await q(`
    CREATE TABLE IF NOT EXISTS "accounts" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "mandateId" UUID NOT NULL REFERENCES "mandates" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
      "memberMandateId" UUID REFERENCES "member_mandates" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
      "reference" VARCHAR(120),
      "monoCustomerId" VARCHAR(120),
      "accountNumber" VARCHAR(20),
      "bankCode" VARCHAR(20),
      "isRequired" BOOLEAN NOT NULL DEFAULT false,
      "status" VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK ("status" IN ('inactive','active','canceled')),
      "mandateData" JSONB NOT NULL DEFAULT '{}',
      "initiateMandateData" JSONB NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    ALTER TABLE "loans"
      ADD COLUMN IF NOT EXISTS "mandateId" UUID REFERENCES "mandates" ("id") ON UPDATE CASCADE ON DELETE SET NULL;
  `);

  await q(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`);
  await q(`
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN ('GROUP_INVITE','LOAN_REQUEST','LOAN_APPROVAL','LOAN_REJECTION','REPAYMENT_REMINDER','DEFAULT_ALERT','DEFAULT_RECOVERY_DEBIT'));
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`);
  await q(`
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN ('GROUP_INVITE','LOAN_REQUEST','LOAN_APPROVAL','LOAN_REJECTION','REPAYMENT_REMINDER','DEFAULT_ALERT'));
  `);
  await q(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "mandateId";`);
  await q(`DROP TABLE IF EXISTS "accounts";`);
  await q(`DROP TABLE IF EXISTS "member_mandates";`);
  await q(`DROP TABLE IF EXISTS "mandates";`);
}
