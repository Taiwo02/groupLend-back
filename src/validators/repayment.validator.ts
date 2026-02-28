import { z } from "../utils/request.js";

export const recordRepaymentSchema = z.object({
  loanId: z.uuid("loanId must be a valid uuid"),
  amount: z.coerce.number().positive("amount must be > 0")
});
