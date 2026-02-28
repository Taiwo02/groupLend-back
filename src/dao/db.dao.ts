import { Transaction } from "sequelize";
import { sequelize } from "../config/database.js";

export class DbDao {
  async withTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return sequelize.transaction(work);
  }
}
