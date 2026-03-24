import { Transaction } from "sequelize";
import { Group, Loan } from "../models/index.js";
import { CredibilityLevel, GroupStatus, LoanStatus } from "../models/enums.js";

export class GroupDao {
  createGroup(
    payload: {
      name: string;
      targetCredit: number | 0;
      createdBy: string;
      currentCreditPool: number;
      credibilityScore: number;
      groupId?: string | null;
      minimumAmount?: number | null;
      maximumAmount?: number | null;
      repaymentPeriod?: number | null;
      repaymentType?: string | null;
      description?: string | null;
      interestType?: string | null;
      interest?: number | null;
      penalCharges?: number | null;
      gracePeriod?: number | null;
      gracePeriodType?: string | null;
      overGracePenalCharges?: number | null;
      ageRange?: string[];
      states?: string[];
      expectedLoan?: number | null;
      status?: string;
    },
    transaction: Transaction
  ): Promise<Group> {
    return Group.create(
      {
        ...payload,
        credibilityLevel: CredibilityLevel.STANDARD,
        ageRange: payload.ageRange ?? [],
        states: payload.states ?? [],
        status: payload.status ?? GroupStatus.ACTIVE
      },
      { transaction }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<Group | null> {
    return Group.findByPk(id, { transaction });
  }

  async updateCreditPool(id: string, currentCreditPool: number, transaction?: Transaction): Promise<void> {
    await Group.update({ currentCreditPool }, { where: { id }, transaction });
  }

  getGroupWithRelations(id: string): Promise<Group | null> {
    return Group.findByPk(id, { include: [{ association: "members" }, { association: "loans" }] });
  }

  async hasUnrepaidGroupLoans(groupId: string, transaction?: Transaction): Promise<boolean> {
    const count = await Loan.count({
      where: {
        groupId,
        status: [
          LoanStatus.REQUESTED,
          LoanStatus.PENDING_APPROVAL,
          LoanStatus.INSTITUTIONAL_PENDING,
          LoanStatus.APPROVED,
          LoanStatus.REVIEWING,
          LoanStatus.PROCESSING,
          LoanStatus.DISBURSED,
          LoanStatus.ACTIVE,
          LoanStatus.DEFAULTED
        ]
      },
      transaction
    });
    return count > 0;
  }

  findAll(transaction?: Transaction): Promise<Group[]> {
    return Group.findAll({ transaction });
  }

  async updateQuarterAndPool(
    id: string,
    data: {
      currentCreditPool?: number;
      quarterlyStartDate?: Date | null;
      quarterlyEndDate?: Date | null;
    },
    transaction?: Transaction
  ): Promise<void> {
    await Group.update(data, { where: { id }, transaction });
  }

  async updateGroup(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      status: string;
      maximumAmount: number | null;
      minimumAmount: number | null;
      targetCredit: number;
    }>,
    transaction?: Transaction
  ): Promise<void> {
    await Group.update(data, { where: { id }, transaction });
  }
}
