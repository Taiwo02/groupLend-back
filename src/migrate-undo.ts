import { undoMigrations } from "./migrate.js";

undoMigrations()
  .then(() => {
    console.log("Migrations reverted");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Revert failed", err);
    process.exit(1);
  });
