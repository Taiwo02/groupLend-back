import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import {
  getIdentities,
  updateCustomer,
  getIncome,
  getStatement,
  getDetails,
  getAccounId
} from "./mono.client.js";

export class StatementSyncService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly statementDao: StatementDao
  ) {}

  async saveIdentities(accountId: string, userId: string): Promise<void> {
    try {
      const identityResult = await getIdentities(accountId);
      const identity = identityResult.data;
      if (!identityResult.ok || !identity) return;

      const user = await this.userDao.findById(userId);
      const kycData = await this.userKycDataDao.findByUserId(userId);
      const contact = kycData?.contact as Record<string, unknown> | null | undefined;
      const bvn = (identity as Record<string, unknown>).bvn as string | undefined;

      const payload: {
        identity?: { type: string; number: string };
        address?: unknown;
        phone?: string;
      } = {};
      if (bvn) payload.identity = { type: "bvn", number: bvn };
      if (contact) payload.address = contact;
      if (user?.phone) payload.phone = user.phone;

      if (Object.keys(payload).length > 0) {
        await updateCustomer(accountId, payload);
      }

      await this.statementDao.createOrUpdate(userId, {
        identities: identity as Record<string, unknown>
      });
    } catch (err) {
      console.error("saveIdentities error:", err);
    }
  }

  async saveIncome(accountId: string, userId: string): Promise<void> {
    try {
      const result = await getIncome(accountId);
      if (!result.ok || result.data == null) return;
      await this.statementDao.createOrUpdate(userId, {
        income: result.data
      });
    } catch (err) {
      console.error("saveIncome error:", err);
    }
  }

  async saveStatement(accountId: string, userId: string): Promise<void> {
    try {
      const result = await getStatement(accountId);
      if (!result.ok || result.data == null) return;
      await this.statementDao.createOrUpdate(userId, {
        statement: result.data
      });
    } catch (err) {
      console.error("saveStatement error:", err);
    }
  }

  async saveDetails(accountId: string, userId: string): Promise<void> {
    try {
      const result = await getDetails(accountId);
      if (!result.ok || result.data == null) return;
      await this.statementDao.createOrUpdate(userId, {
        details: result.data
      });
    } catch (err) {
      console.error("saveDetails error:", err);
    }
  }

  /**
   * When code is not "skip", fetches identities, income, statement, details from Mono
   * and saves each to the user's statement record.
   */
  async saveStatementInfo(userId: string, code: string): Promise<void> {
    if (code === "skip") return;
    const monoAccountId = await getAccounId(code);
    if (!monoAccountId) return;
    await this.saveIdentities(monoAccountId, userId);
    await this.saveIncome(monoAccountId, userId);
    await this.saveStatement(monoAccountId, userId);
    await this.saveDetails(monoAccountId, userId);
  }
}
