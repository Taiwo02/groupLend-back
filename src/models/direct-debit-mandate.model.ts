import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { MandateStatus } from "./enums.js";

export class DirectDebitMandate extends Model<
  InferAttributes<DirectDebitMandate>,
  InferCreationAttributes<DirectDebitMandate>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare groupId: string | null;
  declare status: MandateStatus;
  declare monoSessionId: string | null;
  declare monoCustomerId: string | null;
  declare lastResendAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DirectDebitMandate.init(
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
    groupId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(...Object.values(MandateStatus)),
      allowNull: false,
      defaultValue: MandateStatus.INACTIVE
    },
    monoSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "mono_session_id"
    },
    monoCustomerId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: "mono_customer_id"
    },
    lastResendAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_resend_at"
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "direct_debit_mandates",
    timestamps: true
  }
);
