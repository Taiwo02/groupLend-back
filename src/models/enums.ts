export enum KycStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUBMITTED = "SUBMITTED"
}

export enum CreditStatus {
  LOCKED = "LOCKED",
  ACTIVE = "ACTIVE"
}

export enum GroupMemberRole {
  CREATOR = "CREATOR",
  MEMBER = "MEMBER"
}

export enum GroupMemberStatus {
  INVITED = "INVITED",
  ACTIVE = "ACTIVE",
  ISOLATED = "ISOLATED",
  EXITED = "EXITED"
}

export enum LoanStatus {
  REQUESTED = "REQUESTED",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  INSTITUTIONAL_PENDING = "INSTITUTIONAL_PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  DISBURSED = "DISBURSED",
  ACTIVE = "ACTIVE",
  REPAID = "REPAID",
  DEFAULTED = "DEFAULTED"
}

export enum ApprovalDecision {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED"
}

export enum MandateStatus {
  ACTIVE = "ACTIVE",
  FAILED = "FAILED"
}

/** Group-level mandate (yearly); status of the mandate period. */
export enum GroupMandateStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED"
}

export enum AccountStatus {
  INACTIVE = "inactive",
  ACTIVE = "active",
  CANCELED = "canceled"
}

export enum RepaymentStatus {
  DUE = "DUE",
  PAID = "PAID",
  LATE = "LATE"
}

export enum TrustLevel {
  BRONZE = "BRONZE",
  SILVER = "SILVER",
  GOLD = "GOLD"
}

export enum CredibilityLevel {
  STANDARD = "STANDARD",
  VERIFIED_TRUST_GROUP = "VERIFIED_TRUST_GROUP"
}

export enum RepaymentType {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  YEARLY = "yearly"
}

export enum InterestType {
  FLAT = "flat",
  REDUCING_BALANCE = "reducingBalance"
}

export enum GroupStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING"
}

export enum LoanPurpose {
  PERSONAL = "PERSONAL",
  BUSINESS = "BUSINESS",
  EDUCATION = "EDUCATION",
  EMERGENCY = "EMERGENCY",
  OTHER = "OTHER"
}

export enum NotificationType {
  GROUP_INVITE = "GROUP_INVITE",
  LOAN_REQUEST = "LOAN_REQUEST",
  LOAN_APPROVAL = "LOAN_APPROVAL",
  LOAN_REJECTION = "LOAN_REJECTION",
  REPAYMENT_REMINDER = "REPAYMENT_REMINDER",
  DEFAULT_ALERT = "DEFAULT_ALERT",
  /** Notify member who was debited for default recovery (debit was for defaulter X). */
  DEFAULT_RECOVERY_DEBIT = "DEFAULT_RECOVERY_DEBIT"
}
