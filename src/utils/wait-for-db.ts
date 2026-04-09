import type { Sequelize } from "sequelize";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type WaitForDbOptions = {
  maxAttempts: number;
  delayMs: number;
};

/**
 * Retries `sequelize.authenticate()` so brief network blips or Postgres still starting
 * do not immediately kill the process (common with Docker / remote DBs).
 */
export async function waitForDatabase(sequelize: Sequelize, opts: WaitForDbOptions): Promise<void> {
  const attempts = Math.max(1, opts.maxAttempts);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await sequelize.authenticate();
      if (attempt > 1) {
        console.log(`Database connected on attempt ${attempt}/${attempts}.`);
      }
      return;
    } catch (err) {
      lastError = err;
      const brief = formatDbErrorBrief(err);
      console.error(`Database connection attempt ${attempt}/${attempts} failed${brief ? `: ${brief}` : ""}`);
      if (attempt < attempts) {
        await sleep(opts.delayMs);
      }
    }
  }
  throw lastError;
}

function formatDbErrorBrief(err: unknown): string {
  if (err instanceof Error) {
    const codes = collectErrorCodes(err);
    if (codes.length) return `${err.message} (${codes.join(", ")})`;
    return err.message;
  }
  return String(err);
}

function collectErrorCodes(err: unknown): string[] {
  const codes: string[] = [];
  let e: unknown = err;
  for (let i = 0; i < 6 && e != null; i++) {
    if (typeof e === "object" && e !== null && "code" in e) {
      const c = (e as { code: unknown }).code;
      if (typeof c === "string" && c.length > 0) codes.push(c);
    }
    if (typeof e === "object" && e !== null && "cause" in e) {
      e = (e as { cause: unknown }).cause;
    } else {
      break;
    }
  }
  return [...new Set(codes)];
}

export function collectConnectionErrorCodes(err: unknown): string[] {
  return collectErrorCodes(err);
}
