import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database";

export class Statement extends Model<
  InferAttributes<Statement>,
  InferCreationAttributes<Statement>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare accountId: string | null;
  declare code: string | null;
  declare comment: string | null;
  declare extraData: Record<string, unknown>;
  declare income: Record<string, unknown>;
  declare statement: Record<string, unknown>;
  declare details: Record<string, unknown>;
  declare identities: Record<string, unknown>;
  declare bvn_identities: Record<string, unknown>;
  declare nin_identities: Record<string, unknown>;
  declare status: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

const jsonColumn = (defaultVal: Record<string, unknown> = {}) => ({
  type: DataTypes.JSONB,
  allowNull: false,
  defaultValue: defaultVal
});

Statement.init(
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
    accountId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    comment: {
      type: DataTypes.STRING,
      allowNull: true
    },
    extraData: jsonColumn({}),
    income: jsonColumn({}),
    statement: jsonColumn({}),
    details: jsonColumn({}),
    identities: jsonColumn({}),
    bvn_identities: jsonColumn({}),
    nin_identities: jsonColumn({}),
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "statements",
    timestamps: true
  }
);
