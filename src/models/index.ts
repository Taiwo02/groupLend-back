import { DirectDebitMandate } from "./direct-debit-mandate.model";
import { Group } from "./group.model";
import { GroupInvite } from "./group-invite.model";
import { GroupMember } from "./group-member.model";
import { LoanApproval } from "./loan-approval.model";
import { Loan } from "./loan.model";
import { Notification } from "./notification.model";
import { Repayment } from "./repayment.model";
import { Statement } from "./statement.model";
import { User } from "./user.model";
import { UserKycData } from "./user-kyc-data.model";
import { UserKycOtp } from "./user-kyc-otp.model";

export const initModelAssociations = (): void => {
  User.hasOne(UserKycData, { foreignKey: "userId", as: "kycData" });
  UserKycData.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasOne(UserKycOtp, { foreignKey: "userId", as: "kycOtp" });
  UserKycOtp.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasOne(Statement, { foreignKey: "userId", as: "statement" });
  Statement.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasMany(Loan, { foreignKey: "borrowerId", as: "loans" });
  Loan.belongsTo(User, { foreignKey: "borrowerId", as: "borrower" });

  Group.hasMany(GroupMember, { foreignKey: "groupId", as: "members" });
  GroupMember.belongsTo(Group, { foreignKey: "groupId", as: "group" });
  GroupMember.belongsTo(User, { foreignKey: "userId", as: "user" });

  Group.hasMany(Loan, { foreignKey: "groupId", as: "loans" });
  Loan.belongsTo(Group, { foreignKey: "groupId", as: "group" });

  Loan.hasMany(LoanApproval, { foreignKey: "loanId", as: "approvals" });
  LoanApproval.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });
  LoanApproval.belongsTo(User, { foreignKey: "approverId", as: "approver" });

  Loan.hasMany(Repayment, { foreignKey: "loanId", as: "repayments" });
  Repayment.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  DirectDebitMandate.belongsTo(User, { foreignKey: "userId", as: "user" });
  DirectDebitMandate.belongsTo(Group, { foreignKey: "groupId", as: "group" });

  User.hasMany(Notification, { foreignKey: "userId", as: "notifications" });
  Notification.belongsTo(User, { foreignKey: "userId", as: "user" });
};

export {
  User,
  UserKycData,
  UserKycOtp,
  Statement,
  Group,
  GroupInvite,
  GroupMember,
  Loan,
  LoanApproval,
  Repayment,
  DirectDebitMandate,
  Notification
};
