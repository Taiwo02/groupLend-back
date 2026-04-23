import type { MigrationContext } from "./types.js";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "groups"
      ALTER COLUMN "interest" TYPE DECIMAL(8,2) USING ROUND("interest"::numeric, 2),
      ALTER COLUMN "penalCharges" TYPE DECIMAL(8,2) USING ROUND("penalCharges"::numeric, 2),
      ALTER COLUMN "overGracePenalCharges" TYPE DECIMAL(8,2) USING ROUND("overGracePenalCharges"::numeric, 2);
  `);
  await q(`
    ALTER TABLE "loans"
      ALTER COLUMN "interestRate" TYPE DECIMAL(6,2) USING ROUND("interestRate"::numeric, 2);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const q = context.sequelize.query.bind(context.sequelize);
  await q(`
    ALTER TABLE "groups"
      ALTER COLUMN "interest" TYPE DECIMAL(8,4),
      ALTER COLUMN "penalCharges" TYPE DECIMAL(8,4),
      ALTER COLUMN "overGracePenalCharges" TYPE DECIMAL(8,4);
  `);
  await q(`
    ALTER TABLE "loans"
      ALTER COLUMN "interestRate" TYPE DECIMAL(6,4);
  `);
}
