import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import { sequelize } from "../config/database.js";
import { ApprovalDecision } from "./enums.js";

export class LoanApproval extends Model<
  InferAttributes<LoanApproval>,
  InferCreationAttributes<LoanApproval>
> {
  declare id: CreationOptional<string>;
  declare loanId: string;
  declare approverId: string;
  declare decision: ApprovalDecision;
  declare respondedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

LoanApproval.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    loanId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    approverId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    decision: {
      type: DataTypes.ENUM(...Object.values(ApprovalDecision)),
      allowNull: false,
      defaultValue: ApprovalDecision.PENDING
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
  {
    sequelize,
    tableName: "loan_approvals",
    timestamps: true,
    indexes: [{ unique: true, fields: ["loanId", "approverId"] }]
  }
);
