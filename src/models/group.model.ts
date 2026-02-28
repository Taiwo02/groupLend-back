import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database";
import { CredibilityLevel, GroupStatus, InterestType, RepaymentType } from "./enums";

export class Group extends Model<InferAttributes<Group>, InferCreationAttributes<Group>> {
  declare id: CreationOptional<string>;
  declare groupId: string | null;
  declare name: string;
  declare targetCredit: number;
  declare currentCreditPool: number;
  declare credibilityScore: number;
  declare credibilityLevel: CredibilityLevel;
  declare quarterlyStartDate: Date | null;
  declare quarterlyEndDate: Date | null;
  declare createdBy: string;
  declare minimumAmount: number | null;
  declare maximumAmount: number | null;
  declare repaymentPeriod: number | null;
  declare repaymentType: string | null;
  declare description: string | null;
  declare interestType: string | null;
  declare interest: number | null;
  declare penalCharges: number | null;
  declare gracePeriod: number | null;
  declare gracePeriodType: string | null;
  declare overGracePenalCharges: number | null;
  declare ageRange: string[];
  declare states: string[];
  declare expectedLoan: number | null;
  declare status: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Group.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    groupId: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    targetCredit: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    currentCreditPool: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    credibilityScore: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0
    },
    credibilityLevel: {
      type: DataTypes.ENUM(...Object.values(CredibilityLevel)),
      allowNull: false,
      defaultValue: CredibilityLevel.STANDARD
    },
    quarterlyStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    quarterlyEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    minimumAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    maximumAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    repaymentPeriod: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 3
    },
    repaymentType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: RepaymentType.MONTHLY
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    interestType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: InterestType.FLAT
    },
    interest: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      defaultValue:5
    },
    penalCharges: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true
    },
    gracePeriod: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 2
    },
    gracePeriodType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: RepaymentType.DAILY
    },
    overGracePenalCharges: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      defaultValue: 10
    },
    ageRange: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    states: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ["Lagos"]
    },
    expectedLoan: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: GroupStatus.ACTIVE
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "groups",
    timestamps: true
  }
);
