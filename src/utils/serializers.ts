import { User } from "../models/index.js";

export const sanitizeUser = (user: User): Record<string, unknown> => {
  const raw = user.toJSON() as Record<string, unknown>;
  delete raw.passwordHash;
  delete raw.loanPinHash;
  delete raw.emailVerificationToken;
  delete raw.emailVerificationTokenExpiresAt;
  delete raw.passwordResetToken;
  delete raw.passwordResetTokenExpiresAt;
  return raw;
};
