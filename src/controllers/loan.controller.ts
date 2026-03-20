import { Context } from "hono";
import { UserDao } from "../dao/user.dao.js";
import { ApprovalService } from "../services/approval.service.js";
import { LoanService } from "../services/loan.service.js";
import { verifyLoanPin } from "../utils/loan-pin.js";
import { LoanPurpose } from "../models/enums.js";
import {
  approveLoanBodySchema,
  groupLoanSchema,
  individualLoanSchema,
  loanIdParamSchema
} from "../validators/loan.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

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

  /** GET /loans/individual — current user's individual (non-group) loans. */
  async listIndividualLoans(c: Context): Promise<Response> {
    const loans = await this.loanService.listMyIndividualLoans(c.get("userId"));
    return c.json({ loans });
  }

  /** GET /loans/group — current user's group loans (as borrower). */
  async listGroupLoans(c: Context): Promise<Response> {
    const loans = await this.loanService.listMyGroupLoans(c.get("userId"));
    return c.json({ loans });
  }

  /** Partner callback: continue group approval process after institutional approval. */
  async institutionalApprovalCallback(c: Context): Promise<Response> {
    const params = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const loan = await this.loanService.continueInstitutionalLoan(params.id);
    return c.json(loan);
  }
}
