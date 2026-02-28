import type { MigrationContext } from "./types.js";

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
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    CREATE TABLE IF NOT EXISTS "group_invites" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "groupId" UUID NOT NULL,
      "email" VARCHAR(150) NOT NULL,
      "fullName" VARCHAR(120) NOT NULL,
      "phone" VARCHAR(25),
      "invitedBy" UUID NOT NULL,
      "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','accepted','expired')),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await addFkIfNotExists(context, "group_invites_groupId_fk", "group_invites", "groupId", "groups", "id");
  await addFkIfNotExists(context, "group_invites_invitedBy_fk", "group_invites", "invitedBy", "users", "id");
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "group_invites_invitedBy_fk";`);
  await q(`ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "group_invites_groupId_fk";`);
  await context.sequelize.getQueryInterface().dropTable("group_invites");
}
