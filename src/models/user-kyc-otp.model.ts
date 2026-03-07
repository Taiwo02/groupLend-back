import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import type { NinLookupData } from "../types/nin.js";

export class UserKycOtp extends Model<
  InferAttributes<UserKycOtp>,
  InferCreationAttributes<UserKycOtp>
> {
  declare userId: string;
  declare ninData: NinLookupData;
  declare otpHash: string;
  declare phone: string;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserKycOtp.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true
    },
    ninData: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    otpHash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(25),
      allowNull: false
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "user_kyc_otp",
    timestamps: true
  }
);


