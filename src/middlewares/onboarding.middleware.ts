import { Context, Next } from "hono";
import { UserDao } from "../dao/user.dao.js";
import { KycStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";

export type OnboardingContext = Context & {
  var: {
    userId: string;
    userEmail: string;
  };
};

function hasEmploymentDetails(employmentStatus: string | null): boolean {
  return employmentStatus != null && employmentStatus.trim().length > 0;
}

/**
 * Requires user to have completed onboarding:
 * - monthlyIncome set
 * - employment details set
 * - KYC approved
 * - Loan PIN set
 * Use on routes: credit eligibility, loan request, loan approval.
 */
export function requireOnboardingComplete(userDao: UserDao) {
  return async (c: OnboardingContext, next: Next): Promise<void> => {
    const userId = c.get("userId");
    const user = await userDao.findById(userId);
    if (!user) throw new HttpError(401, "User not found");

    if (user.monthlyIncome == null) {
      throw new HttpError(403, "Complete income capture before accessing this resource");
    }
    if (!hasEmploymentDetails(user.employmentStatus)) {
      throw new HttpError(403, "Complete employment details before accessing this resource");
    }
    if (user.kycStatus !== KycStatus.APPROVED) {
      throw new HttpError(403, "Complete KYC verification before accessing this resource");
    }
    if (!user.loanPinHash) {
      throw new HttpError(403, "Set up your loan PIN before accessing this resource");
    }

    await next();
  };
}
