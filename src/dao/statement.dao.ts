import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { Statement } from "../models/index.js";

export class StatementDao {
  findByUserId(userId: string, transaction?: Transaction): Promise<Statement | null> {
    return Statement.findOne({ where: { userId }, transaction });
  }

  findByUserIds(userIds: string[], transaction?: Transaction): Promise<Statement[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return Statement.findAll({ where: { userId: { [Op.in]: userIds } }, transaction });
  }

  async createOrUpdate(
    userId: string,
    data: {
      accountId?: string | null;
      code?: string | null;
      comment?: string | null;
      extraData?: Record<string, unknown>;
      income?: Record<string, unknown>;
      statement?: Record<string, unknown>;
      details?: Record<string, unknown>;
      identities?: Record<string, unknown>;
      bvn_identities?: Record<string, unknown>;
      nin_identities?: Record<string, unknown>;
      status?: boolean;
    },
    transaction?: Transaction
  ): Promise<Statement> {
    const existing = await this.findByUserId(userId, transaction);
    const payload = {
      accountId: data.accountId ?? existing?.accountId ?? null,
      code: data.code ?? existing?.code ?? null,
      comment: data.comment ?? existing?.comment ?? null,
      extraData: data.extraData ?? existing?.extraData ?? {},
      income: data.income ?? existing?.income ?? {},
      statement: data.statement ?? existing?.statement ?? {},
      details: data.details ?? existing?.details ?? {},
      identities: data.identities ?? existing?.identities ?? {},
      bvn_identities: data.bvn_identities ?? existing?.bvn_identities ?? {},
      nin_identities: data.nin_identities ?? existing?.nin_identities ?? {},
      status: data.status ?? existing?.status ?? false
    };
    if (existing) {
      await existing.update(payload, { transaction });
      return existing;
    }
    return Statement.create({ userId, ...payload }, { transaction });
  }
}
