import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database";
import { LoanPurpose, LoanStatus } from "./enums";

export class Loan extends Model<InferAttributes<Loan>, InferCreationAttributes<Loan>> {
  declare id: CreationOptional<string>;
  declare borrowerId: string;
  declare groupId: string | null;
  declare amount: number;
  declare interestRate: number;
  declare tenorMonths: number;
  declare loanPurpose: LoanPurpose | null;
  declare status: LoanStatus;
  declare outstandingBalance: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Loan.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    borrowerId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    interestRate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: false
    },
    tenorMonths: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    loanPurpose: {
      type: DataTypes.ENUM(...Object.values(LoanPurpose)),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(...Object.values(LoanStatus)),
      allowNull: false,
      defaultValue: LoanStatus.REQUESTED
    },
    outstandingBalance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "loans",
    timestamps: true
  }
);
