import { z } from "../utils/request.js";

export const accountLookupSchema = z.object({
  accountNumber: z.string().trim().min(1, "accountNumber is required"),
  bankCode: z.string().trim().min(1, "bankCode is required")
});
