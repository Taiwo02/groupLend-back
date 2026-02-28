import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "groupId" VARCHAR(60);`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS "groups_groupId_unique" ON "groups" ("groupId") WHERE "groupId" IS NOT NULL;`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "minimumAmount" DECIMAL(14,2);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "maximumAmount" DECIMAL(14,2);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "repaymentPeriod" INTEGER;`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "repaymentType" VARCHAR(20);`);
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_repaymentType_check') THEN
        ALTER TABLE "groups" ADD CONSTRAINT "groups_repaymentType_check"
          CHECK ("repaymentType" IS NULL OR "repaymentType" IN ('daily','weekly','monthly','quarterly','yearly'));
      END IF;
    END $$;
  `);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "description" TEXT;`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "interestType" VARCHAR(20);`);
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_interestType_check') THEN
        ALTER TABLE "groups" ADD CONSTRAINT "groups_interestType_check"
          CHECK ("interestType" IS NULL OR "interestType" IN ('flat','reducingBalance'));
      END IF;
    END $$;
  `);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "interest" DECIMAL(8,4);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "penalCharges" DECIMAL(8,4);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "gracePeriod" INTEGER;`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "gracePeriodType" VARCHAR(20);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "overGracePenalCharges" DECIMAL(8,4);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "ageRange" JSONB DEFAULT '[]';`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "states" JSONB DEFAULT '[]';`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "expectedLoan" DECIMAL(14,2);`);
  await q(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';`);
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_status_check') THEN
        ALTER TABLE "groups" ADD CONSTRAINT "groups_status_check"
          CHECK ("status" IN ('ACTIVE','INACTIVE','PENDING'));
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_status_check";`);
  await q(`ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_interestType_check";`);
  await q(`ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_repaymentType_check";`);
  await q(`DROP INDEX IF EXISTS "groups_groupId_unique";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "groupId";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "minimumAmount";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "maximumAmount";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "repaymentPeriod";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "repaymentType";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "description";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "interestType";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "interest";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "penalCharges";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "gracePeriod";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "gracePeriodType";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "overGracePenalCharges";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "ageRange";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "states";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "expectedLoan";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "status";`);
}
