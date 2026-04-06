import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { LoanController } from "../controllers/loan.controller.js";
import type { DirectDebitMandateController } from "../controllers/direct-debit-mandate.controller.js";

type OnboardingMiddleware = (c: import("hono").Context, next: () => Promise<void>) => Promise<void>;

export function createLoanRoutes(
  loanController: LoanController,
  requireOnboardingComplete: OnboardingMiddleware,
  directDebitMandateController: DirectDebitMandateController
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);

  // Individual loan lists + requests
  routes.get("/individual", (c) => loanController.listIndividualLoans(c));
  routes.get("/group", (c) => loanController.listGroupLoans(c));
  routes.get("/activity", (c) => loanController.getMyActivity(c));

  routes.post("/individual", requireOnboardingComplete, (c) =>
    loanController.requestIndividual(c)
  );
  routes.post("/group", requireOnboardingComplete, (c) =>
    loanController.requestGroup(c)
  );

  // Individual direct-debit mandate (mirrors /groups/:groupId/direct-debit-mandate but for non-group users)
  routes.get("/direct-debit-mandate", (c) =>
    directDebitMandateController.getMandateIndividual(c)
  );
  routes.get("/direct-debit-mandate/accounts", (c) =>
    directDebitMandateController.listSavedAccountsIndividual(c)
  );
  routes.post("/direct-debit-mandate", (c) =>
    directDebitMandateController.createAndAuthorizeMandateIndividual(c)
  );
  routes.post("/direct-debit-mandate/accounts/:accountId/verify", (c) =>
    directDebitMandateController.verifyAccountIndividual(c)
  );
  routes.post("/direct-debit-mandate/accounts/:accountId", (c) =>
    directDebitMandateController.getOrRefreshAccountIndividual(c)
  );
  routes.post("/direct-debit-mandate/:mandateId/confirm", (c) =>
    directDebitMandateController.confirmMandateIndividual(c)
  );

  // Loan approval / rejection
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
