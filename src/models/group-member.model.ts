import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { GroupMemberRole, GroupMemberStatus } from "./enums.js";

export class GroupMember extends Model<
  InferAttributes<GroupMember>,
  InferCreationAttributes<GroupMember>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare groupId: string;
  declare role: GroupMemberRole;
  declare status: GroupMemberStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GroupMember.init(
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
    groupId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM(...Object.values(GroupMemberRole)),
      allowNull: false,
      defaultValue: GroupMemberRole.MEMBER
    },
    status: {
      type: DataTypes.ENUM(...Object.values(GroupMemberStatus)),
      allowNull: false,
      defaultValue: GroupMemberStatus.INVITED
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "group_members",
    timestamps: true,
    indexes: [{ unique: true, fields: ["userId", "groupId"] }]
  }
);
