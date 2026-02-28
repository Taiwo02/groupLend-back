import type { Sequelize } from "sequelize";

export type MigrationContext = {
  sequelize: Sequelize;
};
