#!/usr/bin/env node
/**
 * OpenAPI tags + x-tagGroups to match doc layout:
 *
 * Admin
 *   · Dashboard      → /admin/dashboard, /admin/search
 *   · KYC            → /admin/kyc/...
 *   · Users & groups → /admin/groups/..., /admin/users/...
 *   · Loan operations→ /admin/loan-operations/..., loan-requests, loans/:id/status, disburse
 *   · Institutional lenders → POST /loans/{id}/institutional-approval
 *
 * Users
 *   · Health, Auth, KYC, Dashboard, Groups, Loans, Repayments
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const openapiPath = path.join(root, "src/openapi.json");

const doc = JSON.parse(fs.readFileSync(openapiPath, "utf8"));

function tagForPath(pathKey) {
  if (pathKey === "/health") return "Users · Health";
  if (pathKey === "/dashboard") return "Users · Dashboard";
  if (pathKey === "/admin/dashboard" || pathKey === "/admin/search") return "Admin · Dashboard";
  if (pathKey.startsWith("/admin/kyc")) return "Admin · KYC";
  if (pathKey.startsWith("/admin/groups") || pathKey.startsWith("/admin/users")) {
    return "Admin · Users & groups";
  }
  if (
    pathKey.startsWith("/admin/loan-operations") ||
    pathKey === "/admin/loans/{id}/disburse" ||
    pathKey === "/admin/loan-requests" ||
    pathKey === "/admin/loans/{id}/status"
  ) {
    return "Admin · Loan operations";
  }
  if (pathKey === "/loans/{id}/institutional-approval") return "Admin · Institutional lenders";
  if (
    pathKey.startsWith("/auth/nin") ||
    pathKey.startsWith("/auth/lookup") ||
    pathKey.startsWith("/auth/kyc")
  ) {
    return "Users · KYC";
  }
  if (pathKey.startsWith("/auth/")) return "Users · Auth";
  if (pathKey.startsWith("/groups")) return "Users · Groups";
  if (pathKey.startsWith("/loans")) return "Users · Loans";
  if (pathKey.startsWith("/repayments")) return "Users · Repayments";
  return null;
}

const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

for (const [p, item] of Object.entries(doc.paths ?? {})) {
  if (typeof item !== "object" || !item) continue;
  const tag = tagForPath(p);
  if (!tag) {
    console.warn("No tag mapping for path:", p);
    continue;
  }
  for (const m of methods) {
    const op = item[m];
    if (op && typeof op === "object") op.tags = [tag];
  }
}

doc.tags = [
  {
    name: "Admin · Dashboard",
    description:
      "Admin home: KPI dashboard (`GET /admin/dashboard`) and cross-entity search (`GET /admin/search`). Requires admin JWT when ADMIN_EMAILS is set."
  },
  {
    name: "Admin · KYC",
    description:
      "Admin KYC: counts, list, detail, approve/reject, Mono verify/statement (`/admin/kyc/...`)."
  },
  {
    name: "Admin · Users & groups",
    description:
      "Admin credit groups and users: summaries, list, export, create group, detail, patch (`/admin/groups/...`, `/admin/users/...`)."
  },
  {
    name: "Admin · Loan operations",
    description:
      "Admin loan desk: operations dashboard KPIs and tabbed lists (`/admin/loan-operations/...`), loan request queue (`/admin/loan-requests`), workflow status and disburse (`/admin/loans/{id}/status`, `POST /admin/loans/{id}/disburse`)."
  },
  {
    name: "Admin · Institutional lenders",
    description:
      "Partner callback for institutional approval (`POST /loans/{id}/institutional-approval`)."
  },
  {
    name: "Users · Health",
    description: "Service health (`GET /health`)."
  },
  {
    name: "Users · Auth",
    description:
      "Account lifecycle: signup, login, profile, passwords, invitations, income, loan PIN (`/auth/...` except KYC/NIN/lookup routes)."
  },
  {
    name: "Users · KYC",
    description: "Borrower KYC flow and helpers (`/auth/kyc/...`, `/auth/nin/...`, `/auth/lookup/...`)."
  },
  {
    name: "Users · Dashboard",
    description: "Borrower dashboard (`GET /dashboard`)."
  },
  {
    name: "Users · Groups",
    description: "Groups, invites, exits, direct-debit mandates (`/groups/...`)."
  },
  {
    name: "Users · Loans",
    description: "Loan requests, get loan, member approve/reject (`/loans/...` except institutional callback)."
  },
  {
    name: "Users · Repayments",
    description: "Repayments (`/repayments`)."
  }
];

doc["x-tagGroups"] = [
  {
    name: "Admin",
    tags: [
      "Admin · Dashboard",
      "Admin · KYC",
      "Admin · Users & groups",
      "Admin · Loan operations",
      "Admin · Institutional lenders"
    ]
  },
  {
    name: "Users",
    tags: [
      "Users · Health",
      "Users · Auth",
      "Users · KYC",
      "Users · Dashboard",
      "Users · Groups",
      "Users · Loans",
      "Users · Repayments"
    ]
  }
];

const navNote =
  "Documentation layout: **Admin** and **Users** are top-level groups in the sidebar when your viewer supports `x-tagGroups` (e.g. Redoc, Stoplight). Sub-bullets (Dashboard, KYC, …) are OpenAPI tags. **Note:** borrower KYC lives under `/auth/kyc`, `/auth/nin`, `/auth/lookup` (shown as **Users · KYC**). Swagger UI often lists tags flat and alphabetically.";

let desc = String(doc.info.description ?? "")
  .replace(/\n\nDocumentation navigation:[\s\S]*$/, "")
  .replace(/\n\nDocumentation layout:[\s\S]*$/, "");
desc = desc.trimEnd();
doc.info.description = desc ? `${desc}\n\n${navNote}` : navNote;

fs.writeFileSync(openapiPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log("Updated", openapiPath);
