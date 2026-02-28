import { Transaction } from "sequelize";
import { Notification } from "../models";
import { NotificationType } from "../models/enums";

export class NotificationDao {
  create(
    payload: {
      userId: string;
      type: NotificationType;
      message: string;
      readStatus?: boolean;
    },
    transaction?: Transaction
  ): Promise<Notification> {
    return Notification.create(
      { ...payload, readStatus: payload.readStatus ?? false },
      { transaction }
    );
  }

  findByUserId(userId: string, limit?: number): Promise<Notification[]> {
    return Notification.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit: limit ?? 50
    });
  }
}
