import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { getContainer } from "./container.js";
import { env } from "./config/env.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createKycRoutes } from "./routes/kyc.routes.js";
import { createLookupRoutes } from "./routes/lookup.routes.js";
import { createNinRoutes } from "./routes/nin.routes.js";
import { createDashboardRoutes } from "./routes/dashboard.routes.js";
import { createAdminRoutes } from "./routes/admin.routes.js";
import { createDocRoutes } from "./routes/doc.routes.js";
import { createGroupRoutes } from "./routes/group.routes.js";
import { createLoanRoutes } from "./routes/loan.routes.js";
import { createRepaymentRoutes } from "./routes/repayment.routes.js";
import { HttpError } from "./utils/http-error.js";

export function createApp(): Hono {
  const app = new Hono();
  const container = getContainer();

  const allowedOrigins = env.corsOrigin
    ? env.corsOrigin.split(",").map((o) => o.trim()).filter(Boolean)
    : ["*"];
  app.use(
    "*",
    cors({
      origin: allowedOrigins.length === 1 && allowedOrigins[0] === "*" ? "*" : allowedOrigins,
      allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: allowedOrigins[0] !== "*",
      maxAge: 86400
    })
  );

  app.get("/health", (c) => c.json({ ok: true, service: "Enlace Lending API" }));

  app.route("/", createDocRoutes());

  app.route("/auth", createAuthRoutes(container.authController, container.invitationController));
  app.route("/auth/nin", createNinRoutes(container.ninController));
  app.route("/auth/lookup", createLookupRoutes(container.lookupController));
  app.route("/auth/kyc", createKycRoutes(container.kycController));
  app.route("/dashboard", createDashboardRoutes(container.dashboardController));
  app.route("/admin", createAdminRoutes(container.adminDashboardController, container.adminKycController));
  app.route("/groups", createGroupRoutes(container.groupController));
  app.route(
    "/loans",
    createLoanRoutes(container.loanController, container.requireOnboardingComplete)
  );
  app.route("/repayments", createRepaymentRoutes(container.repaymentController));

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      c.status(error.statusCode as never);
      return c.json(
        error.details ? { message: error.message, ...error.details } : { message: error.message }
      );
    }
    if (error instanceof HTTPException) {
      c.status(error.status as never);
      return c.json({ message: error.message });
    }

    console.error(error);
    return c.json({ message: "Internal server error" }, 500);
  });

  return app;
}
