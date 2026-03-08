import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { MandateStatus } from "./enums.js";

/**
 * A member's mandate for a group/year. Tied to the group Mandate; each user
 * in the group has one MemberMandate per Mandate (per year).
 */
export class MemberMandate extends Model<
  InferAttributes<MemberMandate>,
  InferCreationAttributes<MemberMandate>
> {
  declare id: CreationOptional<string>;
  declare mandateId: string;
  declare userId: string;
  declare status: MandateStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MemberMandate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mandateId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(MandateStatus)),
      allowNull: false,
      defaultValue: MandateStatus.ACTIVE
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "member_mandates",
    timestamps: true,
    indexes: [{ unique: true, fields: ["mandateId", "userId"] }]
  }
);
