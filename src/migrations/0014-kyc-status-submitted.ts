import type { MigrationContext } from "./types.js";

/**
 * Adds 'SUBMITTED' to allowed kycStatus values.
 * Handles both: (1) PostgreSQL enum enum_users_kycStatus (e.g. from Sequelize sync),
 *              (2) VARCHAR + CHECK constraint (from migration 0001).
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // (1) If column uses PostgreSQL enum type, add 'SUBMITTED' to the enum.
  // Type name must be quoted so PostgreSQL does not lowercase it (e.g. enum_users_kycStatus).
  await q(`
    DO $$
    DECLARE
      type_exists boolean;
      tname text;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('enum_users_kycStatus', 'enum_users_kycstatus')) INTO type_exists;
      IF type_exists THEN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname IN ('enum_users_kycStatus', 'enum_users_kycstatus') AND e.enumlabel = 'SUBMITTED'
        ) THEN
          SELECT typname INTO tname FROM pg_type WHERE typname IN ('enum_users_kycStatus', 'enum_users_kycstatus') LIMIT 1;
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', tname, 'SUBMITTED');
        END IF;
      END IF;
    END $$;
  `);

  // (2) If column uses VARCHAR + CHECK, update the constraint to include SUBMITTED
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
          CHECK ("kycStatus" IN ('PENDING','APPROVED','REJECTED','SUBMITTED'));
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  // Only revert CHECK if present (VARCHAR schema). Enum type cannot be reverted easily.
  await q(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kycStatus_check";`);
  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kycStatus' AND data_type = 'character varying') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_kycStatus_check"
          CHECK ("kycStatus" IN ('PENDING','APPROVED','REJECTED'));
      END IF;
    END $$;
  `);
}
