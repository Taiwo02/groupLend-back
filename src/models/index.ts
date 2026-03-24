import { Account } from "./account.model.js";
import { DirectDebitMandate } from "./direct-debit-mandate.model.js";
import { Group } from "./group.model.js";
import { GroupInvite } from "./group-invite.model.js";
import { GroupMember } from "./group-member.model.js";
import { LoanApproval } from "./loan-approval.model.js";
import { Loan } from "./loan.model.js";
import { Mandate } from "./mandate.model.js";
import { MemberMandate } from "./member-mandate.model.js";
import { Notification } from "./notification.model.js";
import { Repayment } from "./repayment.model.js";
import { Statement } from "./statement.model.js";
import { User } from "./user.model.js";
import { UserKycData } from "./user-kyc-data.model.js";
import { UserKycOtp } from "./user-kyc-otp.model.js";
import { KycVerification } from "./kyc-verification.model.js";

export const initModelAssociations = (): void => {
  User.hasMany(UserKycData, { foreignKey: "userId", as: "kycDataRecords" });
  UserKycData.belongsTo(User, { foreignKey: "userId", as: "user" });

  UserKycData.hasOne(KycVerification, { foreignKey: "kycDataId", as: "verification" });
  KycVerification.belongsTo(UserKycData, { foreignKey: "kycDataId", as: "kycData" });
  User.hasMany(KycVerification, { foreignKey: "userId", as: "kycVerifications" });
  KycVerification.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasOne(UserKycOtp, { foreignKey: "userId", as: "kycOtp" });
  UserKycOtp.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasOne(Statement, { foreignKey: "userId", as: "statement" });
  Statement.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasMany(Loan, { foreignKey: "borrowerId", as: "loans" });
  Loan.belongsTo(User, { foreignKey: "borrowerId", as: "borrower" });

  User.hasMany(GroupMember, { foreignKey: "userId", as: "groups" });
  Group.hasMany(GroupMember, { foreignKey: "groupId", as: "members" });
  GroupMember.belongsTo(Group, { foreignKey: "groupId", as: "group" });
  GroupMember.belongsTo(User, { foreignKey: "userId", as: "user" });
  User.hasMany(Group, { foreignKey: "createdBy", as: "createdGroups" });
  Group.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

  Group.hasMany(Loan, { foreignKey: "groupId", as: "loans" });
  Loan.belongsTo(Group, { foreignKey: "groupId", as: "group" });

  Mandate.belongsTo(Group, { foreignKey: "groupId", as: "group" });
  Group.hasMany(Mandate, { foreignKey: "groupId", as: "mandates" });
  Mandate.hasMany(MemberMandate, { foreignKey: "mandateId", as: "memberMandates" });
  MemberMandate.belongsTo(Mandate, { foreignKey: "mandateId", as: "mandate" });
  MemberMandate.belongsTo(User, { foreignKey: "userId", as: "user" });
  User.hasMany(MemberMandate, { foreignKey: "userId", as: "memberMandates" });
  Mandate.hasMany(Account, { foreignKey: "mandateId", as: "accounts" });
  Account.belongsTo(Mandate, { foreignKey: "mandateId", as: "mandate" });
  MemberMandate.hasMany(Account, { foreignKey: "memberMandateId", as: "accounts" });
  Account.belongsTo(MemberMandate, { foreignKey: "memberMandateId", as: "memberMandate" });
  Loan.belongsTo(Mandate, { foreignKey: "mandateId", as: "mandate" });
  Mandate.hasMany(Loan, { foreignKey: "mandateId", as: "loans" });

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
  Account,
  User,
  UserKycData,
  UserKycOtp,
  KycVerification,
  Statement,
  Group,
  GroupInvite,
  GroupMember,
  Loan,
  LoanApproval,
  Mandate,
  MemberMandate,
  Repayment,
  DirectDebitMandate,
  Notification
};
