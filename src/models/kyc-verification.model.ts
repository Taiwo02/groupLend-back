import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";

export type KycVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export class KycVerification extends Model<
  InferAttributes<KycVerification>,
  InferCreationAttributes<KycVerification>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare kycDataId: string | null;
  declare ninApproved: boolean;
  declare bvnApproved: boolean;
  declare addressApproved: boolean;
  declare creditHistoryApproved: boolean;
  declare overallStatus: KycVerificationStatus;
  /** Admin comment for the user (e.g. what to update). */
  declare comment: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

KycVerification.init(
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
    kycDataId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    ninApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    bvnApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    addressApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    creditHistoryApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    overallStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "PENDING"
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "kyc_verifications",
    timestamps: true
  }
);
