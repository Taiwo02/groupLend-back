import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { CreditStatus, KycStatus, TrustLevel } from "./enums.js";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare fullName: string;
  declare email: string;
  declare phone: string | null;
  declare passwordHash: string;
  declare location: string | null;
  declare employmentStatus: string | null;
  declare monthlyIncome: number | null;
  declare creditLimit: number;
  declare kycStatus: KycStatus;
  declare kycStep: number;
  declare creditStatus: CreditStatus;
  declare loanPinHash: string | null;
  declare trustScore: number;
  declare trustLevel: TrustLevel;
  declare emailVerified: boolean;
  declare emailVerificationToken: string | null;
  declare emailVerificationTokenExpiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    fullName: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },
    phone: {
      type: DataTypes.STRING(25),
      allowNull: true
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    location: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    employmentStatus: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    monthlyIncome: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    creditLimit: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    kycStatus: {
      type: DataTypes.ENUM(...Object.values(KycStatus)),
      allowNull: false,
      defaultValue: KycStatus.PENDING
    },
    kycStep: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    creditStatus: {
      type: DataTypes.ENUM(...Object.values(CreditStatus)),
      allowNull: false,
      defaultValue: CreditStatus.LOCKED
    },
    loanPinHash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    trustScore: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      defaultValue: 0
    },
    trustLevel: {
      type: DataTypes.ENUM(...Object.values(TrustLevel)),
      allowNull: false,
      defaultValue: TrustLevel.BRONZE
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    emailVerificationToken: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    emailVerificationTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true
  }
);
