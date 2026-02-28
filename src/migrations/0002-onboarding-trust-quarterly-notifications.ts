import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "trustScore" DECIMAL(8,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "trustLevel" VARCHAR(20) NOT NULL DEFAULT 'BRONZE'
        CHECK ("trustLevel" IN ('BRONZE','SILVER','GOLD'));
  `);
  await q(`ALTER TABLE "users" ALTER COLUMN "monthlyIncome" DROP NOT NULL;`);
  await q(`ALTER TABLE "users" ALTER COLUMN "monthlyIncome" DROP DEFAULT;`);

  await q(`
    ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "credibilityLevel" VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK ("credibilityLevel" IN ('STANDARD','VERIFIED_TRUST_GROUP')),
      ADD COLUMN IF NOT EXISTS "quarterlyStartDate" DATE,
      ADD COLUMN IF NOT EXISTS "quarterlyEndDate" DATE;
  `);

  await q(`
    ALTER TABLE "loans"
      ADD COLUMN IF NOT EXISTS "loanPurpose" VARCHAR(20)
        CHECK ("loanPurpose" IS NULL OR "loanPurpose" IN ('PERSONAL','BUSINESS','EDUCATION','EMERGENCY','OTHER'));
  `);

  // If DB uses native PG enum (e.g. from Sequelize sync), add new value first
  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_loans_status') THEN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'enum_loans_status' AND e.enumlabel = 'INSTITUTIONAL_PENDING'
        ) THEN
          ALTER TYPE enum_loans_status ADD VALUE 'INSTITUTIONAL_PENDING';
        END IF;
      END IF;
    END $$;
  `);
  await q(`
    ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_status_check";
  `);
  // Only add CHECK when column is VARCHAR (initial migration); enum columns don't need it
  await q(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'status'
          AND data_type = 'character varying'
      ) THEN
        ALTER TABLE "loans" ADD CONSTRAINT "loans_status_check"
          CHECK ("status" IN ('REQUESTED','PENDING_APPROVAL','INSTITUTIONAL_PENDING','APPROVED','DISBURSED','ACTIVE','REPAID','DEFAULTED'));
      END IF;
    END $$;
  `);

  await q(`
    ALTER TABLE "loan_approvals"
      ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP WITH TIME ZONE;
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS "notifications" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL,
      "type" VARCHAR(30) NOT NULL CHECK ("type" IN ('GROUP_INVITE','LOAN_REQUEST','LOAN_APPROVAL','LOAN_REJECTION','REPAYMENT_REMINDER','DEFAULT_ALERT')),
      "message" TEXT NOT NULL,
      "readStatus" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_userId_users_fk') THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_fk"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const qi = context.sequelize.getQueryInterface();
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_users_fk";`);
  await qi.dropTable("notifications");

  await q(`ALTER TABLE "loan_approvals" DROP COLUMN IF EXISTS "respondedAt";`);

  await q(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_status_check";`);
  await q(`
    ALTER TABLE "loans" ADD CONSTRAINT "loans_status_check"
      CHECK ("status" IN ('REQUESTED','PENDING_APPROVAL','APPROVED','DISBURSED','ACTIVE','REPAID','DEFAULTED'));
  `);
  await q(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "loanPurpose";`);

  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "credibilityLevel";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "quarterlyStartDate";`);
  await q(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "quarterlyEndDate";`);

  await q(`ALTER TABLE "users" ALTER COLUMN "monthlyIncome" SET DEFAULT 0;`);
  await q(`ALTER TABLE "users" ALTER COLUMN "monthlyIncome" SET NOT NULL;`);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "trustScore";`);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "trustLevel";`);
}
