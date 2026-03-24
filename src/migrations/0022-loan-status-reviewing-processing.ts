import type { MigrationContext } from "./types.js";

const VARCHAR_CHECK = `'REQUESTED','PENDING_APPROVAL','INSTITUTIONAL_PENDING','APPROVED','REVIEWING','PROCESSING','REJECTED','DISBURSED','ACTIVE','REPAID','DEFAULTED'`;

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_loans_status') THEN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'enum_loans_status' AND e.enumlabel = 'REVIEWING'
        ) THEN
          ALTER TYPE enum_loans_status ADD VALUE 'REVIEWING';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'enum_loans_status' AND e.enumlabel = 'PROCESSING'
        ) THEN
          ALTER TYPE enum_loans_status ADD VALUE 'PROCESSING';
        END IF;
      END IF;
    END $$;
  `);

  await q(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_status_check";`);
  await q(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'status'
          AND data_type = 'character varying'
      ) THEN
        ALTER TABLE "loans" ADD CONSTRAINT "loans_status_check"
          CHECK ("status" IN (${VARCHAR_CHECK}));
      END IF;
    END $$;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`UPDATE "loans" SET "status" = 'APPROVED' WHERE "status" IN ('REVIEWING','PROCESSING');`);

  await q(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_status_check";`);
  await q(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'status'
          AND data_type = 'character varying'
      ) THEN
        ALTER TABLE "loans" ADD CONSTRAINT "loans_status_check"
          CHECK ("status" IN ('REQUESTED','PENDING_APPROVAL','INSTITUTIONAL_PENDING','APPROVED','REJECTED','DISBURSED','ACTIVE','REPAID','DEFAULTED'));
      END IF;
    END $$;
  `);
}
