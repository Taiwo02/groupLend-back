import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";

export type GroupInviteStatus = "pending" | "accepted" | "expired";

export class GroupInvite extends Model<
  InferAttributes<GroupInvite>,
  InferCreationAttributes<GroupInvite>
> {
  declare id: CreationOptional<string>;
  declare groupId: string;
  declare email: string;
  declare fullName: string;
  declare phone: string | null;
  declare invitedBy: string;
  declare status: GroupInviteStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GroupInvite.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    groupId: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(25), allowNull: true },
    invitedBy: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending"
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "group_invites",
    timestamps: true
  }
);
