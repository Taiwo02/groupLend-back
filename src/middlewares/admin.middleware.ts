import { Context, Next } from "hono";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

type AdminContext = Context & {
  var: {
    userEmail?: string;
  };
};

/** If ADMIN_EMAILS is configured, require JWT email to be listed. */
export const requireAdminEmail = async (c: AdminContext, next: Next): Promise<void> => {
  if (env.adminEmails.length === 0) {
    await next();
    return;
  }
  const email = (c.get("userEmail") as string | undefined)?.toLowerCase().trim();
  if (!email || !env.adminEmails.includes(email)) {
    throw new HttpError(403, "Admin access denied");
  }
  await next();
};
