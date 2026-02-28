import { UserDao } from "../dao/user.dao.js";
import { compareHash } from "./auth.js";
import { HttpError } from "./http-error.js";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

const attemptsByUser = new Map<string, { count: number; resetAt: number }>();

function getWindow(userId: string): { count: number; resetAt: number } {
  const now = Date.now();
  const w = attemptsByUser.get(userId);
  if (w && now < w.resetAt) return w;
  const resetAt = now + WINDOW_MS;
  const next = { count: 0, resetAt };
  attemptsByUser.set(userId, next);
  return next;
}

export async function verifyLoanPin(
  userId: string,
  pin: string,
  userDao: UserDao
): Promise<void> {
  const window = getWindow(userId);
  if (window.count >= MAX_ATTEMPTS) {
    throw new HttpError(
      429,
      `Too many PIN attempts. Try again after ${new Date(window.resetAt).toISOString()}`
    );
  }

  const user = await userDao.findById(userId);
  if (!user || !user.loanPinHash) {
    window.count += 1;
    throw new HttpError(401, "Invalid loan PIN");
  }

  const valid = await compareHash(pin, user.loanPinHash);
  if (!valid) {
    window.count += 1;
    throw new HttpError(401, "Invalid loan PIN");
  }

  window.count = 0;
}
