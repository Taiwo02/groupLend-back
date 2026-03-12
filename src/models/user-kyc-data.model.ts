import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";

export interface BioDataPayload {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  idType?: string;
  idNumber?: string;
}

export interface ContactPayload {
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface EmploymentDetailsPayload {
  employerName?: string;
  jobTitle?: string;
  employmentStatus?: string;
  monthlyIncome?: number;
  workAddress?: string;
  workEmail?: string;
  /** Optional meter number (e.g. utility meter). */
  meterNumber?: string;
}

export interface ConfirmedAddressPayload {
  addressLine1?: string;
  town?: string;
  lga?: string;
  state?: string;
}

export type KycRecordStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "FLAGGED" | "RESUBMITTED";

export class UserKycData extends Model<
  InferAttributes<UserKycData>,
  InferCreationAttributes<UserKycData>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare status: KycRecordStatus;
  declare bioData: BioDataPayload | null;
  declare contact: ContactPayload | null;
  declare employmentDetails: EmploymentDetailsPayload | null;
  declare profilePicture: string | null;
  declare ninData: Record<string, unknown> | null;
  declare bvnEncrypted: string | null;
  declare ninLookupKey: string | null;
  declare submittedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserKycData.init(
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
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "PENDING"
    },
    bioData: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    contact: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    employmentDetails: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    profilePicture: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    ninData: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    bvnEncrypted: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ninLookupKey: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "user_kyc_data",
    timestamps: true
  }
);
