import { Op, QueryTypes, type WhereOptions } from "sequelize";
import { sequelize } from "../config/database.js";
import { CreditStatus, KycStatus } from "../models/enums.js";
import { Group, GroupMember, User } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";

const USER_LIST_ATTRIBUTES = [
  "id",
  "fullName",
  "email",
  "phone",
  "kycStatus",
  "creditStatus",
  "creditLimit",
  "trustLevel",
  "createdAt",
  "updatedAt",
  "emailVerified"
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminUsersSummary = {
  totalUsers: number;
  pendingKycUsers: number;
  activeCreditUsers: number;
  usersInActiveGroup: number;
};

export class AdminUsersService {
  /** Sequelize `User.count` + include + distinct can emit invalid SQL (`User->User`); use explicit SQL. */
  private async countUsersInActiveGroup(): Promise<number> {
    const [row] = await sequelize.query<{ c: string }>(
      `
      SELECT COUNT(DISTINCT u.id)::text AS c
      FROM "users" AS u
      INNER JOIN "group_members" AS gm ON gm."userId" = u.id AND gm.status = 'ACTIVE'
      `,
      { type: QueryTypes.SELECT }
    );
    return Number(row?.c ?? 0);
  }

  async getSummary(): Promise<AdminUsersSummary> {
    const [totalUsers, pendingKycUsers, activeCreditUsers, usersInActiveGroup] = await Promise.all([
      User.count(),
      User.count({
        where: { kycStatus: { [Op.in]: [KycStatus.PENDING, KycStatus.SUBMITTED, KycStatus.RESUBMITTED] } }
      }),
      User.count({ where: { creditStatus: CreditStatus.ACTIVE } }),
      this.countUsersInActiveGroup()
    ]);
    return { totalUsers, pendingKycUsers, activeCreditUsers, usersInActiveGroup };
  }

  async listUsers(opts: {
    q?: string;
    kycStatus?: KycStatus;
    creditStatus?: CreditStatus;
    limit: number;
    offset: number;
  }): Promise<{ users: Record<string, unknown>[]; total: number }> {
    const search = opts.q?.trim();
    const parts: WhereOptions<User>[] = [];
    if (opts.kycStatus) parts.push({ kycStatus: opts.kycStatus });
    if (opts.creditStatus) parts.push({ creditStatus: opts.creditStatus });
    if (search) {
      const orClause: WhereOptions<User>[] = [
        { fullName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
      if (UUID_RE.test(search)) orClause.push({ id: search });
      parts.push({ [Op.or]: orClause });
    }
    const where: WhereOptions<User> =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { [Op.and]: parts };

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [...USER_LIST_ATTRIBUTES],
      limit: opts.limit,
      offset: opts.offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: GroupMember,
          as: "groups",
          attributes: ["id", "status", "role"],
          required: false,
          include: [{ model: Group, as: "group", attributes: ["id", "name", "groupId", "status"] }]
        }
      ],
      distinct: true
    });

    const users = rows.map((u) => {
      const plain = u.get({ plain: true }) as Record<string, unknown>;
      if (plain.creditLimit != null) plain.creditLimit = toNumber(String(plain.creditLimit));
      return plain;
    });

    return { users, total: count };
  }

  async getUserDetail(userId: string): Promise<Record<string, unknown>> {
    const user = await User.findByPk(userId, {
      attributes: {
        exclude: [
          "passwordHash",
          "loanPinHash",
          "emailVerificationToken",
          "passwordResetToken"
        ]
      },
      include: [
        {
          model: GroupMember,
          as: "groups",
          required: false,
          include: [{ model: Group, as: "group" }]
        }
      ]
    });
    if (!user) throw new HttpError(404, "User not found");
    const plain = user.get({ plain: true }) as Record<string, unknown>;
    if (plain.creditLimit != null) plain.creditLimit = toNumber(String(plain.creditLimit));
    if (plain.monthlyIncome != null) plain.monthlyIncome = toNumber(String(plain.monthlyIncome));
    if (plain.trustScore != null) plain.trustScore = toNumber(String(plain.trustScore));
    return plain;
  }
}
