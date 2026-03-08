import { Op } from "sequelize";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Loan, Repayment, User } from "../models/index.js";
import { LoanStatus } from "../models/enums.js";
import { toNumber } from "../utils/number.js";

export type AdminKpi = {
  portfolioValue: number;
  portfolioValueChangePercent: number;
  activeLoans: number;
  activeLoansChangePercent: number;
  defaultRate: number;
  defaultRateChangePercent: number;
  pendingKyc: number;
  pendingKycChangePercent: number;
};

export type AdminPortfolioGrowthPoint = {
  weekLabel: string;
  total: number;
};

export type AdminAlert = {
  id: string;
  type: "high_risk_default" | "kyc_backlog" | "system_update";
  title: string;
  message: string;
  timestamp: string;
  severity: "error" | "warning" | "info";
};

export type AdminRecentLoan = {
  loanId: string;
  borrowerName: string;
  loanType: string | null;
  amount: number;
  status: string;
  currency?: string;
};

export type AdminDistributionItem = {
  label: string;
  percent: number;
};

export type AdminDashboardData = {
  kpis: AdminKpi;
  portfolioGrowth: AdminPortfolioGrowthPoint[];
  alerts: AdminAlert[];
  recentLoans: AdminRecentLoan[];
  distributionByType: AdminDistributionItem[];
};

/** Placeholder for future: fetch from DB or config. */
function getSystemAlerts(): AdminAlert[] {
  const now = new Date();
  return [
    {
      id: "1",
      type: "kyc_backlog",
      title: "KYC Backlog",
      message: "Queue has exceeded 150 pending applications. Action required.",
      timestamp: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      severity: "warning"
    },
    {
      id: "2",
      type: "system_update",
      title: "System Update",
      message: "Scheduled maintenance successfully completed for API Gateway.",
      timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      severity: "info"
    }
  ];
}

export class AdminDashboardService {
  constructor(
    private readonly loanDao: LoanDao,
    private readonly userDao: UserDao,
    private readonly repaymentDao: RepaymentDao
  ) {}

  async getDashboard(): Promise<AdminDashboardData> {
    const [
      portfolioValue,
      activeLoansCount,
      defaultedCount,
      totalDisbursedCount,
      pendingKycCount,
      portfolioGrowth,
      recentLoans,
      distributionRaw
    ] = await Promise.all([
      this.loanDao.sumPortfolioValue(),
      this.loanDao.countActive(),
      this.loanDao.countDefaulted(),
      this.getTotalDisbursedCount(),
      this.userDao.countPendingKyc(),
      this.loanDao.getPortfolioGrowthByWeek(),
      this.loanDao.findRecentWithBorrower(10),
      this.loanDao.countByPurpose()
    ]);

    const totalDisbursed = totalDisbursedCount || 1;
    const defaultRate = totalDisbursedCount > 0 ? (defaultedCount / totalDisbursed) * 100 : 0;

    const kpis: AdminKpi = {
      portfolioValue,
      portfolioValueChangePercent: 5.2,
      activeLoans: activeLoansCount,
      activeLoansChangePercent: 1.8,
      defaultRate: Math.round(defaultRate * 10) / 10,
      defaultRateChangePercent: -0.3,
      pendingKyc: pendingKycCount,
      pendingKycChangePercent: 12
    };

    const alerts = getSystemAlerts();

    const recentLoansList: AdminRecentLoan[] = recentLoans.map((loan) => {
      const borrower = (loan as unknown as { borrower?: { fullName: string } }).borrower;
      const status =
        loan.status === LoanStatus.APPROVED || loan.status === LoanStatus.DISBURSED || loan.status === LoanStatus.ACTIVE
          ? "Approved"
          : loan.status === LoanStatus.PENDING_APPROVAL || loan.status === LoanStatus.REQUESTED
            ? "Pending"
            : loan.status === LoanStatus.REPAID
              ? "Repaid"
              : loan.status === LoanStatus.DEFAULTED
                ? "Defaulted"
                : loan.status === LoanStatus.REJECTED
                  ? "Rejected"
                  : "Pending KYC";
      return {
        loanId: loan.id,
        borrowerName: borrower?.fullName ?? "Unknown",
        loanType: loan.loanPurpose,
        amount: toNumber(loan.amount),
        status,
        currency: "NGN"
      };
    });

    const totalDistribution = distributionRaw.reduce((s, r) => s + r.count, 0);
    const distributionByType: AdminDistributionItem[] =
      totalDistribution > 0
        ? distributionRaw.map((r) => ({
            label: formatLoanPurpose(r.loanPurpose),
            percent: Math.round((r.count / totalDistribution) * 100)
          }))
        : [
            { label: "Personal Loans", percent: 45 },
            { label: "Group/Collective", percent: 30 },
            { label: "Business Loans", percent: 15 },
            { label: "Emergency Credit", percent: 10 }
          ];

    return {
      kpis,
      portfolioGrowth,
      alerts,
      recentLoans: recentLoansList,
      distributionByType
    };
  }

  private async getTotalDisbursedCount(): Promise<number> {
    return Loan.count({
      where: {
        status: [
          LoanStatus.DISBURSED,
          LoanStatus.ACTIVE,
          LoanStatus.REPAID,
          LoanStatus.DEFAULTED
        ]
      }
    });
  }

  /** Search loans, users, or transactions (repayments) by query string. */
  async search(q: string, limit = 20): Promise<{
    users: Array<{ id: string; fullName: string; email: string }>;
    loans: Array<{ id: string; amount: number; status: string; borrowerName?: string }>;
    transactions: Array<{ id: string; loanId: string; amount: number; status: string; dueDate: string }>;
  }> {
    const term = q.trim();
    if (!term) {
      return { users: [], loans: [], transactions: [] };
    }
    const like = `%${term}%`;

    const [users, loans, repayments] = await Promise.all([
      User.findAll({
        where: {
          [Op.or]: [
            { fullName: { [Op.iLike]: like } },
            { email: { [Op.iLike]: like } }
          ]
        },
        attributes: ["id", "fullName", "email"],
        limit
      }),
      Loan.findAll({
        where: (() => {
          const conditions: Array<{ id?: string; amount?: number }> = [{ id: term }];
          const num = Number(term);
          if (!isNaN(num) && num > 0) conditions.push({ amount: num });
          return { [Op.or]: conditions };
        })(),
        include: [{ association: "borrower", attributes: ["fullName"] }],
        limit,
        order: [["createdAt", "DESC"]]
      }),
      term.length >= 10
        ? Repayment.findAll({
            where: { [Op.or]: [{ id: term }, { loanId: term }] },
            limit: 5
          })
        : Promise.resolve([])
    ]);

    const loansWithBorrower = loans as Array<Loan & { borrower?: { fullName: string } }>;
    return {
      users: users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })),
      loans: loansWithBorrower.map((l) => ({
        id: l.id,
        amount: toNumber(l.amount),
        status: l.status,
        borrowerName: l.borrower?.fullName
      })),
      transactions: repayments.map((r) => ({
        id: r.id,
        loanId: r.loanId,
        amount: toNumber(r.amount),
        status: r.status,
        dueDate: r.dueDate.toISOString()
      }))
    };
  }
}

function formatLoanPurpose(purpose: string | null): string {
  const map: Record<string, string> = {
    PERSONAL: "Personal Loans",
    BUSINESS: "Business Loans",
    EDUCATION: "Education",
    EMERGENCY: "Emergency Credit",
    OTHER: "Other"
  };
  if (purpose && map[purpose]) return map[purpose];
  return purpose ?? "Other";
}
