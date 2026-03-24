import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdminEmail } from "../middlewares/admin.middleware.js";
import type { AdminDashboardController } from "../controllers/admin-dashboard.controller.js";
import type { AdminKycController } from "../controllers/admin-kyc.controller.js";
import type { AdminLoanController } from "../controllers/admin-loan.controller.js";

export function createAdminRoutes(
  adminDashboardController: AdminDashboardController,
  adminKycController: AdminKycController,
  adminLoanController: AdminLoanController
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.use("*", requireAdminEmail);

  routes.get("/loan-requests", (c) => adminLoanController.listLoanRequests(c));
  routes.patch("/loans/:id/status", (c) => adminLoanController.patchLoanStatus(c));

  routes.get("/dashboard", (c) => adminDashboardController.getDashboard(c));
  routes.get("/search", (c) => adminDashboardController.search(c));
  routes.get("/kyc/count", (c) => adminKycController.getKycCount(c));
  routes.get("/kyc", (c) => adminKycController.getKycList(c));
  routes.get("/kyc/:kycId", (c) => adminKycController.getKycDetails(c));
  routes.post("/kyc/:kycId/approve", (c) => adminKycController.approveKyc(c));
  routes.post("/kyc/:kycId/reject", (c) => adminKycController.rejectKyc(c));
  routes.post("/kyc/:kycId/verify/address", (c) => adminKycController.verifyAddress(c));
  routes.post("/kyc/:kycId/verify/credit-history", (c) => adminKycController.verifyCreditHistory(c));
  routes.get("/kyc/:kycId/statement", (c) => adminKycController.fetchStatement(c));
  routes.post("/kyc/:kycId/verify/nin", (c) => adminKycController.verifyNin(c));

  return routes;
}
