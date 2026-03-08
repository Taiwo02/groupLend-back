import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { GroupMandateStatus } from "./enums.js";

/**
 * Group-level mandate for a year. The group access amount (totalAccessAmount)
 * is the sum of 40% of each member's annual income for that year.
 */
export class Mandate extends Model<InferAttributes<Mandate>, InferCreationAttributes<Mandate>> {
  declare id: CreationOptional<string>;
  declare groupId: string;
  /** Year this mandate covers (e.g. 2025). */
  declare year: number;
  /** Total access amount = sum(40% of each member's annual income). */
  declare totalAccessAmount: number;
  declare status: GroupMandateStatus;
  declare startDate: Date;
  declare endDate: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Mandate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    totalAccessAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(GroupMandateStatus)),
      allowNull: false,
      defaultValue: GroupMandateStatus.ACTIVE
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "mandates",
    timestamps: true,
    indexes: [{ unique: true, fields: ["groupId", "year"] }]
  }
);
