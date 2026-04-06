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
 * Individual (non-group) yearly mandate period.
 * Mirrors the group Mandate concept but scoped to a single user.
 * totalAccessAmount = 40% of the user's annual income.
 */
export class UserMandate extends Model<
  InferAttributes<UserMandate>,
  InferCreationAttributes<UserMandate>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  /**
   * Period identifier for UNIQUE(userId, year): encoded as YYYYMMDD of period start.
   * Same convention as the group Mandate.year column.
   */
  declare year: number;
  /** 40% of user's annual income. */
  declare totalAccessAmount: number;
  declare status: GroupMandateStatus;
  declare startDate: Date;
  declare endDate: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserMandate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
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
    tableName: "user_mandates",
    timestamps: true,
    indexes: [{ unique: true, fields: ["userId", "year"] }]
  }
);
