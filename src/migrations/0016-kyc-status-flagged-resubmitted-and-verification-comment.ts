import type { MigrationContext } from "./types.js";

/**
 * Adds FLAGGED and RESUBMITTED to users.kycStatus.
 * Adds comment column to kyc_verifications for admin feedback to users.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // Add FLAGGED and RESUBMITTED to users.kycStatus (enum or CHECK)
  await q(`
    DO $$
    DECLARE
      type_exists boolean;
      tname text;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('enum_users_kycStatus', 'enum_users_kycstatus')) INTO type_exists;
      IF type_exists THEN
        SELECT typname INTO tname FROM pg_type WHERE typname IN ('enum_users_kycStatus', 'enum_users_kycstatus') LIMIT 1;
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = tname AND e.enumlabel = 'FLAGGED') THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', tname, 'FLAGGED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = tname AND e.enumlabel = 'RESUBMITTED') THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', tname, 'RESUBMITTED');
        END IF;
      END IF;
    END $$;
  `);

  await q(`
    DO $$
    DECLARE
      conname text;
    BEGIN
      SELECT c.conname INTO conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
      WHERE t.relname = 'users' AND a.attname = 'kycStatus' AND c.contype = 'c'
      LIMIT 1;
      IF conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS %I', conname);
        ALTER TABLE "users" ADD CONSTRAINT "users_kycStatus_check"
          CHECK ("kycStatus" IN ('PENDING','SUBMITTED','RESUBMITTED','FLAGGED','APPROVED','REJECTED'));
      END IF;
    END $$;
  `);

  await q(`
    ALTER TABLE "kyc_verifications"
      ADD COLUMN IF NOT EXISTS "comment" TEXT;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`ALTER TABLE "kyc_verifications" DROP COLUMN IF EXISTS "comment";`);

  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStatus_check";`);
  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kycStatus' AND data_type = 'character varying') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_kycStatus_check"
          CHECK ("kycStatus" IN ('PENDING','APPROVED','REJECTED','SUBMITTED'));
      END IF;
    END $$;
  `);
}
