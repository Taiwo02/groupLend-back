import { Context } from "hono";
import { AdminLoanService } from "../services/admin-loan.service.js";
import { LoanStatus } from "../models/enums.js";
import {
  adminLoanOperationsExportQuerySchema,
  adminLoanOperationsListQuerySchema
} from "../validators/admin-loan-operations.validator.js";
import { parseWithSchema } from "../utils/request.js";
import { z } from "zod";

const listQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim().toUpperCase()) : undefined)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional()
});

const loanIdParamSchema = z.object({ id: z.string().uuid() });

const patchStatusSchema = z.object({
  status: z.union([
    z.literal(LoanStatus.APPROVED),
    z.literal(LoanStatus.REVIEWING),
    z.literal(LoanStatus.PROCESSING),
    z.literal(LoanStatus.DISBURSED)
  ])
});

const ALL_LOAN_STATUSES = new Set<string>(Object.values(LoanStatus));

export class AdminLoanController {
  constructor(private readonly adminLoanService: AdminLoanService) {}

  /**
   * GET /admin/loan-requests
   * Query: status (comma-separated LoanStatus), dateFrom, dateTo (ISO dates), limit, offset
   */
  async listLoanRequests(c: Context): Promise<Response> {
    const q = parseWithSchema(listQuerySchema, {
      status: c.req.query("status"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset")
    });
    const statuses =
      q.status?.filter((s) => ALL_LOAN_STATUSES.has(s)).map((s) => s as LoanStatus) ?? undefined;
    const data = await this.adminLoanService.listLoanRequests({
      status: statuses && statuses.length > 0 ? statuses : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit: q.limit,
      offset: q.offset
    });
    return c.json(data);
  }

  /** PATCH /admin/loans/:id/status — body: { status: APPROVED | REVIEWING | PROCESSING | DISBURSED } */
  async patchLoanStatus(c: Context): Promise<Response> {
    const { id } = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const body = (await c.req.json()) as unknown;
    const { status } = parseWithSchema(patchStatusSchema, body);
    const loan = await this.adminLoanService.setLoanStatus(id, status);
    return c.json({ loan: { id: loan.id, status: loan.status, updatedAt: loan.updatedAt.toISOString() } });
  }

  /** GET /admin/loan-operations/summary */
  async getLoanOperationsSummary(c: Context): Promise<Response> {
    const data = await this.adminLoanService.getLoanOperationsSummary();
    return c.json(data);
  }

  /** GET /admin/loan-operations/loans?tab=&q=&limit=&offset= */
  async listLoanOperations(c: Context): Promise<Response> {
    const q = parseWithSchema(adminLoanOperationsListQuerySchema, {
      tab: c.req.query("tab"),
      q: c.req.query("q"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset")
    });
    const data = await this.adminLoanService.listLoanOperations({
      tab: q.tab,
      q: q.q,
      limit: q.limit,
      offset: q.offset
    });
    return c.json({ ...data, limit: q.limit ?? 10, offset: q.offset ?? 0 });
  }

  /** GET /admin/loan-operations/export */
  async exportLoanOperations(c: Context): Promise<Response> {
    const q = parseWithSchema(adminLoanOperationsExportQuerySchema, {
      tab: c.req.query("tab"),
      q: c.req.query("q"),
      limit: c.req.query("limit")
    });
    const limit = q.limit ?? 5000;
    const data = await this.adminLoanService.listLoanOperations({
      tab: q.tab,
      q: q.q,
      limit,
      offset: 0
    });
    c.header("Content-Disposition", 'attachment; filename="loan-operations.json"');
    return c.json({
      tab: q.tab,
      loans: data.loans,
      exported: data.loans.length,
      totalMatched: data.total
    });
  }

  /** POST /admin/loans/:id/disburse */
  async disburseLoan(c: Context): Promise<Response> {
    const { id } = parseWithSchema(loanIdParamSchema, { id: c.req.param("id") });
    const loan = await this.adminLoanService.executeDisbursement(id);
    return c.json({
      loan: { id: loan.id, status: loan.status, updatedAt: loan.updatedAt.toISOString() }
    });
  }
}
