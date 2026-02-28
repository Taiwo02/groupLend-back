/**
 * Scheduled job: run quarterly group review.
 * Run with: bun run src/jobs/run-quarterly.ts
 * Schedule with cron, e.g. 0 0 1 * * (first day of each month).
 */
import { sequelize } from "../config/database";
import { getContainer } from "../container";
import { initModelAssociations } from "../models";

async function main() {
  await sequelize.authenticate();
  initModelAssociations();
  const container = getContainer();
  const result = await container.runQuarterlyGroupReview();
  console.log("Quarterly review completed. Processed groups:", result.processed);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
