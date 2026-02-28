import { Sequelize } from "sequelize";
import { env } from "./env";

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: "postgres",
  logging: env.dbLogging ? console.log : false,
});