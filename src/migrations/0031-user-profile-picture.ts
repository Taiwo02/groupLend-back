import type { MigrationContext } from "./types.js";

/** users: add profile_picture (URL) for user-managed profile photo. */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);

  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "profile_picture" VARCHAR(500);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_picture";`);
}
