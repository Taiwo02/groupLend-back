import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database";
import { RepaymentStatus } from "./enums";

export class Repayment extends Model<InferAttributes<Repayment>, InferCreationAttributes<Repayment>> {
  declare id: CreationOptional<string>;
  declare loanId: string;
  declare amount: number;
  declare dueDate: Date;
  declare paidAt: Date | null;
  declare status: RepaymentStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Repayment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    loanId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(...Object.values(RepaymentStatus)),
      allowNull: false,
      defaultValue: RepaymentStatus.DUE
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "repayments",
    timestamps: true
  }
);
