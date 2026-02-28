import type { MigrationContext } from "./types.js";

/** Run ADD CONSTRAINT only if the constraint does not exist (idempotent for existing DBs). */
async function addFkIfNotExists(
  context: MigrationContext,
  constraintName: string,
  table: string,
  column: string,
  refTable: string,
  refColumn: string
): Promise<void> {
  await context.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraintName}"
          FOREIGN KEY ("${column}") REFERENCES "${refTable}" ("${refColumn}")
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
}

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "fullName" VARCHAR(120) NOT NULL,
      "email" VARCHAR(150) NOT NULL UNIQUE,
      "phone" VARCHAR(25),
      "passwordHash" VARCHAR(255) NOT NULL,
      "location" VARCHAR(120),
      "employmentStatus" VARCHAR(80),
      "monthlyIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
      "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
      "kycStatus" VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK ("kycStatus" IN ('PENDING','APPROVED','REJECTED')),
      "creditStatus" VARCHAR(10) NOT NULL DEFAULT 'LOCKED' CHECK ("creditStatus" IN ('LOCKED','ACTIVE')),
      "loanPinHash" VARCHAR(255),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS "groups" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" VARCHAR(120) NOT NULL,
      "targetCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
      "currentCreditPool" DECIMAL(14,2) NOT NULL DEFAULT 0,
      "credibilityScore" DECIMAL(6,2) NOT NULL DEFAULT 0,
      "createdBy" UUID NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "groups_createdBy_users_fk", "groups", "createdBy", "users", "id");

  await q(`
    CREATE TABLE IF NOT EXISTS "group_members" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL,
      "groupId" UUID NOT NULL,
      "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER' CHECK ("role" IN ('CREATOR','MEMBER')),
      "status" VARCHAR(10) NOT NULL DEFAULT 'INVITED' CHECK ("status" IN ('INVITED','ACTIVE','ISOLATED','EXITED')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "group_members_userId_users_fk", "group_members", "userId", "users", "id");
  await addFkIfNotExists(context, "group_members_groupId_groups_fk", "group_members", "groupId", "groups", "id");
  await q(
    'CREATE UNIQUE INDEX IF NOT EXISTS "group_members_user_id_group_id" ON "group_members" ("userId", "groupId")'
  );

  await q(`
    CREATE TABLE IF NOT EXISTS "loans" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "borrowerId" UUID NOT NULL,
      "groupId" UUID,
      "amount" DECIMAL(14,2) NOT NULL,
      "interestRate" DECIMAL(6,4) NOT NULL,
      "tenorMonths" INTEGER NOT NULL,
      "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','PENDING_APPROVAL','APPROVED','DISBURSED','ACTIVE','REPAID','DEFAULTED')),
      "outstandingBalance" DECIMAL(14,2) NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "loans_borrowerId_users_fk", "loans", "borrowerId", "users", "id");
  await addFkIfNotExists(context, "loans_groupId_groups_fk", "loans", "groupId", "groups", "id");

  await q(`
    CREATE TABLE IF NOT EXISTS "loan_approvals" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "loanId" UUID NOT NULL,
      "approverId" UUID NOT NULL,
      "decision" VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK ("decision" IN ('PENDING','APPROVED','REJECTED')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "loan_approvals_loanId_loans_fk", "loan_approvals", "loanId", "loans", "id");
  await addFkIfNotExists(context, "loan_approvals_approverId_users_fk", "loan_approvals", "approverId", "users", "id");
  await q(
    'CREATE UNIQUE INDEX IF NOT EXISTS "loan_approvals_loan_id_approver_id" ON "loan_approvals" ("loanId", "approverId")'
  );

  await q(`
    CREATE TABLE IF NOT EXISTS "repayments" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "loanId" UUID NOT NULL,
      "amount" DECIMAL(14,2) NOT NULL,
      "dueDate" TIMESTAMP WITH TIME ZONE NOT NULL,
      "paidAt" TIMESTAMP WITH TIME ZONE,
      "status" VARCHAR(10) NOT NULL DEFAULT 'DUE' CHECK ("status" IN ('DUE','PAID','LATE')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "repayments_loanId_loans_fk", "repayments", "loanId", "loans", "id");

  await q(`
    CREATE TABLE IF NOT EXISTS "direct_debit_mandates" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL,
      "groupId" UUID,
      "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','FAILED')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "direct_debit_mandates_userId_users_fk", "direct_debit_mandates", "userId", "users", "id");
  await addFkIfNotExists(context, "direct_debit_mandates_groupId_groups_fk", "direct_debit_mandates", "groupId", "groups", "id");
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const qi = context.sequelize.getQueryInterface();
  await qi.dropTable("direct_debit_mandates");
  await qi.dropTable("repayments");
  await qi.dropTable("loan_approvals");
  await qi.dropTable("loans");
  await qi.dropTable("group_members");
  await qi.dropTable("groups");
  await qi.dropTable("users");
}
