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

export class UserKycData extends Model<
  InferAttributes<UserKycData>,
  InferCreationAttributes<UserKycData>
> {
  declare userId: string;
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
    userId: {
      type: DataTypes.UUID,
      primaryKey: true
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
