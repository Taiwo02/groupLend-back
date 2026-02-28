import { Context } from "hono";
import { z, ZodType } from "zod";
import { HttpError } from "./http-error.js";

export const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
};

export const requireNumber = (value: unknown, field: string): number => {
  const num = Number(value);
  if (Number.isNaN(num)) throw new HttpError(400, `${field} must be a valid number`);
  return num;
};

export const readJsonBody = async <T>(c: Context): Promise<T> => {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON payload");
  }
};

export const parseWithSchema = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    throw new HttpError(400, message || "Validation failed");
  }
  return result.data;
};

export { z };
