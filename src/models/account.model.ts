import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { AccountStatus } from "./enums.js";

/**
 * Bank account where direct debit is set.
 * Group members: mandateId (group Mandate) + memberMandateId set; userMandateId null.
 * Individual users: userMandateId (UserMandate) set; mandateId + memberMandateId null.
 */
export class Account extends Model<InferAttributes<Account>, InferCreationAttributes<Account>> {
  declare id: CreationOptional<string>;
  /** Group mandate FK — set for group members, null for individual direct-debit accounts. */
  declare mandateId: string | null;
  declare memberMandateId: string | null;
  /** Individual mandate FK — set for individual users, null for group members. */
  declare userMandateId: string | null;
  declare reference: string | null;
  declare monoCustomerId: string | null;
  declare accountNumber: string | null;
  declare bankCode: string | null;
  declare isRequired: boolean;
  declare status: AccountStatus;
  declare mandateData: Record<string, unknown>;
  declare initiateMandateData: Record<string, unknown>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Account.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mandateId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    memberMandateId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    userMandateId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    reference: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    monoCustomerId: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    accountNumber: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    bankCode: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    isRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(AccountStatus)),
      allowNull: false,
      defaultValue: AccountStatus.INACTIVE
    },
    mandateData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    initiateMandateData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "accounts",
    timestamps: true
  }
);
