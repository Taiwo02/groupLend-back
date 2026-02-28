import { Context } from "hono";
import { RepaymentService } from "../services/repayment.service.js";
import { recordRepaymentSchema } from "../validators/repayment.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

export class RepaymentController {
  constructor(private readonly repaymentService: RepaymentService) {}

  async recordRepayment(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(recordRepaymentSchema, body);
    const loan = await this.repaymentService.recordRepayment({
      loanId: payload.loanId,
      amount: payload.amount,
      userId: c.get("userId")
    });
    return c.json(loan);
  }
}
