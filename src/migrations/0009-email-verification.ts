import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "emailVerificationToken" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "emailVerificationTokenExpiresAt" TIMESTAMP WITH TIME ZONE;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerificationTokenExpiresAt";`);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerificationToken";`);
  await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerified";`);
}
