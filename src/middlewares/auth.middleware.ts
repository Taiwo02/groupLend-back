import { Context, Next } from "hono";
import { verifyJwt } from "../utils/auth";
import { HttpError } from "../utils/http-error";

type AuthContext = Context & {
  var: {
    userId: string;
    userEmail: string;
  };
};

export const requireAuth = async (c: AuthContext, next: Next): Promise<void> => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid authorization header");
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);

  c.set("userId", payload.sub);
  c.set("userEmail", payload.email);
  await next();
};