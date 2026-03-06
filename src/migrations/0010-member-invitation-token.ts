import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "group_invites"
      ADD COLUMN IF NOT EXISTS "invitationToken" VARCHAR(20) UNIQUE;
  `);
  await q(`
    ALTER TABLE "group_members"
      ADD COLUMN IF NOT EXISTS "invitationToken" VARCHAR(20) UNIQUE;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "group_invites" DROP COLUMN IF EXISTS "invitationToken";`);
  await q(`ALTER TABLE "group_members" DROP COLUMN IF EXISTS "invitationToken";`);
}
