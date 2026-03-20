/**
 * Helpers for group mandate periods stored as DATEONLY (local calendar dates).
 */

/** Local calendar date as YYYY-MM-DD (for Postgres DATEONLY / string compare). */
export function toLocalDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add calendar days in local timezone (avoids UTC drift for DATEONLY). */
export function addLocalDays(base: Date, days: number): Date {
  const x = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

/** Add calendar months in local timezone (same day-of-month rules as Date). */
export function addLocalMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
}
