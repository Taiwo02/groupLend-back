import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdminEmail } from "../middlewares/admin.middleware.js";
import type { AdminDashboardController } from "../controllers/admin-dashboard.controller.js";
import type { AdminGroupsController } from "../controllers/admin-groups.controller.js";
import type { AdminKycController } from "../controllers/admin-kyc.controller.js";
import type { AdminLoanController } from "../controllers/admin-loan.controller.js";
import type { AdminUsersController } from "../controllers/admin-users.controller.js";

export function createAdminRoutes(
  adminDashboardController: AdminDashboardController,
  adminKycController: AdminKycController,
  adminLoanController: AdminLoanController,
  adminGroupsController: AdminGroupsController,
  adminUsersController: AdminUsersController
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.use("*", requireAdminEmail);

  routes.get("/loan-requests", (c) => adminLoanController.listLoanRequests(c));
  routes.get("/loan-operations/summary", (c) => adminLoanController.getLoanOperationsSummary(c));
  routes.post("/loan-operations/loans", (c) => adminLoanController.listLoanOperations(c));
  routes.get("/loan-operations/export", (c) => adminLoanController.exportLoanOperations(c));
  routes.post("/loans/:id/disburse", (c) => adminLoanController.disburseLoan(c));
  routes.patch("/loans/:id/status", (c) => adminLoanController.patchLoanStatus(c));

  routes.get("/dashboard", (c) => adminDashboardController.getDashboard(c));
  routes.get("/search", (c) => adminDashboardController.search(c));

  routes.get("/groups/summary", (c) => adminGroupsController.getSummary(c));
  routes.get("/groups/export", (c) => adminGroupsController.exportGroups(c));
  routes.get("/groups", (c) => adminGroupsController.listGroups(c));
  routes.post("/groups", (c) => adminGroupsController.createGroup(c));
  routes.get("/groups/:id/members", (c) => adminGroupsController.listGroupMembers(c));
  routes.get("/groups/:id/activity", (c) => adminGroupsController.getGroupActivity(c));
  routes.get("/groups/:id/certificate", (c) => adminGroupsController.getGroupCertificate(c));
  routes.get("/groups/:id", (c) => adminGroupsController.getGroup(c));
  routes.patch("/groups/:id", (c) => adminGroupsController.patchGroup(c));

  routes.get("/users/summary", (c) => adminUsersController.getSummary(c));
  routes.get("/users", (c) => adminUsersController.listUsers(c));
  routes.get("/users/:id", (c) => adminUsersController.getUser(c));
  routes.get("/kyc/count", (c) => adminKycController.getKycCount(c));
  routes.get("/kyc", (c) => adminKycController.getKycList(c));
  routes.get("/kyc/groups/:groupId/members", (c) => adminKycController.getGroupMembersKyc(c));
  routes.get("/kyc/:kycId", (c) => adminKycController.getKycDetails(c));
  routes.post("/kyc/:kycId/approve", (c) => adminKycController.approveKyc(c));
  routes.post("/kyc/:kycId/reject", (c) => adminKycController.rejectKyc(c));
  routes.post("/kyc/:kycId/verify/address", (c) => adminKycController.verifyAddress(c));
  routes.post("/kyc/:kycId/verify/credit-history", (c) => adminKycController.verifyCreditHistory(c));
  routes.get("/kyc/:kycId/statement", (c) => adminKycController.fetchStatement(c));
  routes.post("/kyc/:kycId/verify/nin", (c) => adminKycController.verifyNin(c));
  routes.get("/kyc/mandates/unfinished", (c) => adminKycController.getUnfinishedMandates(c));
  routes.get("/kyc/mandates/completed", (c) => adminKycController.getCompletedMandates(c));
  routes.post("/kyc/mandates/:mandateId/review", (c) => adminKycController.reviewCompletedMandate(c));

  return routes;
}
