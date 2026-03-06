import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "passwordResetToken" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "passwordResetTokenExpiresAt" TIMESTAMP WITH TIME ZONE;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordResetTokenExpiresAt";`);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordResetToken";`);
}
