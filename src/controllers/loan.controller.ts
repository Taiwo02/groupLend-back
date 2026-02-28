import { Context } from "hono";
import { UserDao } from "../dao/user.dao";
import { ApprovalService } from "../services/approval.service";
import { LoanService } from "../services/loan.service";
import { verifyLoanPin } from "../utils/loan-pin";
import { LoanPurpose } from "../models/enums";
import {
  approveLoanBodySchema,
  groupLoanSchema,
  individualLoanSchema,
  loanIdParamSchema
} from "../validators/loan.validator";
import { parseWithSchema, readJsonBody } from "../utils/request";

export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly approvalService: ApprovalService,
    private readonly userDao: UserDao
  ) {}

  async requestIndividual(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(individualLoanSchema, body);
    await verifyLoanPin(c.get("userId"), payload.loanPin, this.userDao);
    const loan = await this.loanService.requestIndividualLoan({
      borrowerId: c.get("userId"),
      amount: payload.amount,
      interestRate: payload.interestRate,
      tenorMonths: payload.tenorMonths,
      loanPurpose: (payload.loanPurpose as LoanPurpose | undefined) ?? null
    });
    return c.json(loan, 201);
  }

  async requestGroup(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(groupLoanSchema, body);
    await verifyLoanPin(c.get("userId"), payload.loanPin, this.userDao);
    const loan = await this.loanService.requestGroupLoan({
      borrowerId: c.get("userId"),
      groupId: payload.groupId,
      amount: payload.amount,
      interestRate: payload.interestRate,
      tenorMonths: payload.tenorMonths,
      loanPurpose: (payload.loanPurpose as LoanPurpose | undefined) ?? null
    });
    return c.json(loan, 201);
  }

  async approveLoan(c: Context): Promise<Response> {
    const params = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const body = await readJsonBody<Record<string, unknown>>(c).catch(() => ({}));
    const payload = parseWithSchema(approveLoanBodySchema, body);
    await verifyLoanPin(c.get("userId"), payload.loanPin, this.userDao);
    const loan = await this.approvalService.approveLoan(params.id, c.get("userId"));
    return c.json(loan);
  }

  async rejectLoan(c: Context): Promise<Response> {
    const params = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const body = await readJsonBody<Record<string, unknown>>(c).catch(() => ({}));
    const payload = parseWithSchema(approveLoanBodySchema, body);
    await verifyLoanPin(c.get("userId"), payload.loanPin, this.userDao);
    const loan = await this.approvalService.rejectLoan(params.id, c.get("userId"));
    return c.json(loan);
  }

  async getLoan(c: Context): Promise<Response> {
    const params = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const loan = await this.loanService.getLoanById(params.id, c.get("userId"));
    return c.json(loan);
  }

  /** Partner callback: continue group approval process after institutional approval. */
  async institutionalApprovalCallback(c: Context): Promise<Response> {
    const params = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const loan = await this.loanService.continueInstitutionalLoan(params.id);
    return c.json(loan);
  }
}
