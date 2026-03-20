import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { LoanController } from "../controllers/loan.controller.js";

type OnboardingMiddleware = (c: import("hono").Context, next: () => Promise<void>) => Promise<void>;

export function createLoanRoutes(
  loanController: LoanController,
  requireOnboardingComplete: OnboardingMiddleware
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.get("/individual", (c) => loanController.listIndividualLoans(c));
  routes.get("/group", (c) => loanController.listGroupLoans(c));
  routes.post("/individual", requireOnboardingComplete, (c) =>
    loanController.requestIndividual(c)
  );
  routes.post("/group", requireOnboardingComplete, (c) =>
    loanController.requestGroup(c)
  );
  routes.post("/:id/approve", requireOnboardingComplete, (c) =>
    loanController.approveLoan(c)
  );
  routes.post("/:id/reject", requireOnboardingComplete, (c) =>
    loanController.rejectLoan(c)
  );
  routes.post("/:id/institutional-approval", (c) =>
    loanController.institutionalApprovalCallback(c)
  );
  routes.get("/:id", (c) => loanController.getLoan(c));
  return routes;
}
