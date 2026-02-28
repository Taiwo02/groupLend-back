import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getContainer } from "./container.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createKycRoutes } from "./routes/kyc.routes.js";
import { createDashboardRoutes } from "./routes/dashboard.routes.js";
import { createDocRoutes } from "./routes/doc.routes.js";
import { createGroupRoutes } from "./routes/group.routes.js";
import { createLoanRoutes } from "./routes/loan.routes.js";
import { createRepaymentRoutes } from "./routes/repayment.routes.js";
import { HttpError } from "./utils/http-error.js";

export function createApp(): Hono {
  const app = new Hono();
  const container = getContainer();

  app.get("/health", (c) => c.json({ ok: true, service: "Enlace Lending API" }));

  app.route("/", createDocRoutes());

  app.route("/auth", createAuthRoutes(container.authController));
  app.route("/auth/kyc", createKycRoutes(container.kycController));
  app.route(
    "/dashboard",
    createDashboardRoutes(container.dashboardController, container.requireOnboardingComplete)
  );
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
