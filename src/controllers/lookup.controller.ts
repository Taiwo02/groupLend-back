import { Context } from "hono";
import { verifyAccount, getBankList } from "../services/mono.client.js";
import { accountLookupSchema } from "../validators/lookup.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";
import { HttpError } from "../utils/http-error.js";

export class LookupController {
  async bankList(c: Context): Promise<Response> {
    const result = await getBankList();
    if (!result.ok) {
      throw new HttpError(400, result.message ?? "Bank list lookup failed");
    }
    return c.json({
      status: "successful",
      message: "Lookup Successful",
      data: { banks: result.data }
    });
  }

  async verifyAccount(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const { accountNumber, bankCode } = parseWithSchema(accountLookupSchema, body);
    const result = await verifyAccount(accountNumber, bankCode);
    if (!result.ok) {
      throw new HttpError(400, result.message ?? "Account lookup failed");
    }
    return c.json({
      status: "successful",
      message: "Lookup Successful",
      data: result.data
    });
  }
}
