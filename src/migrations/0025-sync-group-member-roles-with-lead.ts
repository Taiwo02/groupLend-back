import type { MigrationContext } from "./types.js";

/**
 * Align `group_members.role` with `groups.createdBy`: the lead must be CREATOR,
 * everyone else MEMBER (fixes rows where invite auto-join stored MEMBER for the lead).
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    UPDATE "group_members" gm
    SET "role" = 'CREATOR'
    FROM "groups" g
    WHERE g.id = gm."groupId"
      AND g."createdBy" = gm."userId"
      AND gm."role" <> 'CREATOR';
  `);
  await q(`
    UPDATE "group_members" gm
    SET "role" = 'MEMBER'
    FROM "groups" g
    WHERE g.id = gm."groupId"
      AND g."createdBy" <> gm."userId"
      AND gm."role" = 'CREATOR';
  `);
}

export async function down(): Promise<void> {
  /* Data repair; no safe rollback. */
}
