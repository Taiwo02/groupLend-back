import { Context } from "hono";
import { HistoryService, type HistoryCategory } from "../services/history.service.js";
import { historyBodySchema } from "../validators/history.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** POST /history — body: { category?, limit?, offset?, startDate?, endDate? } */
  async getHistory(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c).catch(() => ({}));
    const payload = parseWithSchema(historyBodySchema, body);
    const data = await this.historyService.getHistory(c.get("userId"), {
      category: payload.category as HistoryCategory,
      limit: payload.limit ?? 20,
      offset: payload.offset ?? 0,
      startDate: payload.startDate ? new Date(payload.startDate) : undefined,
      endDate: payload.endDate ? new Date(payload.endDate) : undefined
    });
    return c.json(data);
  }
}
