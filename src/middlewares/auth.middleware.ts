import { Context, Next } from "hono";
import { verifyJwt } from "../utils/auth.js";
import { HttpError } from "../utils/http-error.js";

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

/** Sets userId and userEmail if valid Bearer token present; does not require auth. */
export const optionalAuth = async (c: Context, next: Next): Promise<void> => {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyJwt(authHeader.slice(7));
      c.set("userId", payload.sub);
      c.set("userEmail", payload.email);
    } catch {
      // ignore invalid token
    }
  }
  await next();
};