# Migrations

The app uses **Umzug** with **Sequelize** for migrations. Schema changes are done **only** via migration files; `sequelize.sync()` is not used.

**Migrations do not run on app start.** You run them explicitly (e.g. before deploy or locally with `bun run migrate`).

## Commands

- **Run pending migrations** (run this when you add or change migrations):
  ```bash
  bun run migrate
  ```
- **Revert all migrations** (drops all tables):
  ```bash
  bun run migrate:undo
  ```

## Migration files

- **Location:** `src/migrations/`
- **Naming:** `0001-initial.ts`, `0002-add-notifications.ts`, etc. Files are run in **sorted order by name**, so use a numeric prefix.
- Each file must export:
  - **`up({ context })`** – apply the migration. Use `context.sequelize` or `context.sequelize.getQueryInterface()`.
  - **`down({ context })`** – revert the migration (drop tables/columns you added, etc.).

---

## Adding more tables (new migrations)

When you need new tables (or columns, indexes, FKs):

1. **Create a new migration file** in `src/migrations/` with the next number, e.g. `0002-add-notifications.ts`.

2. **Implement `up` and `down`** using the query interface or raw SQL.

**Example – adding a `notifications` table:**

```ts
// src/migrations/0002-add-notifications.ts
import { DataTypes } from "sequelize";
import type { MigrationContext } from "./types";

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const qi = context.sequelize.getQueryInterface();

  await qi.createTable("notifications", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addConstraint("notifications", {
    type: "foreign key",
    fields: ["userId"],
    references: { table: "users", field: "id" },
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  });
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  await context.sequelize.getQueryInterface().dropTable("notifications");
}
```

3. **Add the Sequelize model** in `src/models/` (e.g. `notification.model.ts`) and register it in `src/models/index.ts` so your app code can use it.

4. **Run migrations:**
   ```bash
   bun run migrate
   ```

Only **pending** migrations run (Umzug records completed ones in `SequelizeMeta`). So adding `0002-add-notifications.ts` and running `bun run migrate` will run only that file.

---

## Moving from `sync()` to migrations

If you already have a database created with `sequelize.sync({ alter: true })`:

1. **Option A – Start clean** (only if you can drop the DB):
   - Drop all tables (or the whole database), then run `bun run migrate`.

2. **Option B – Keep data** (baseline existing schema):
   - Create the migrations table and mark the initial migration as already run:
     ```sql
     CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) NOT NULL PRIMARY KEY);
     INSERT INTO "SequelizeMeta" (name) VALUES ('0001-initial') ON CONFLICT (name) DO NOTHING;
     ```
   - Then run `bun run migrate` for any **new** migrations only.
