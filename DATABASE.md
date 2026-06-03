# Database workflow & drift prevention

Most of the runtime errors we chased (snake_case columns, missing columns/tables,
a missing enum value, stale unique indexes, uuid-vs-text columns) had **one root
cause: schema drift**. The Prisma schema (`packages/server/src/prisma/schema.prisma`)
is the source of truth, but migrations were applied as **hand-written SQL** straight
to Neon, so the live database gradually diverged from the schema. Each divergence
later surfaced as a different, confusing error.

This document is how we keep the database and schema in lockstep.

## The golden rule

**The Prisma schema is the source of truth. The database must match it.**

When you change `schema.prisma`, push the change to the database with Prisma — do
**not** hand-write the SQL:

```bash
cd packages/server
# preview what would change, then apply it
DATABASE_URL=... npx prisma db push        # syncs the DB to the schema
```

`prisma db push` generates and runs the exact DDL so the column names, types,
enums, and indexes always match what the ORM expects (Prisma maps `String` → TEXT,
fields are quoted camelCase with no `@map`, enums use the PascalCase type name).

If you ever must write SQL by hand, follow `schema.prisma` exactly:
- columns are **quoted camelCase TEXT** (e.g. `"revaluationReserveAccountId" TEXT`),
  never snake_case or `uuid`;
- enum types use the Prisma name (e.g. `"ApprovalEntityType"`), not snake_case.

## Drift guard — run before every deploy

A guard script reports drift and **fails on breaking drift** (missing/extra
tables or columns, missing enum values, unique-index drift, real type changes).
Cosmetic drift (FK/index *names*, dropped defaults, timestamp precision, unused
enums) is reported but ignored — it never reaches a user.

```bash
cd packages/server
DATABASE_URL=... npm run db:check-drift
```

- exit `0` → DB matches the schema where it matters; safe to deploy.
- exit `1` → breaking drift; resolve with `prisma db push` (or the matching
  migration) **before** deploying.

Run this in CI or locally before pushing to `main`. It is the early-warning system
that turns "a user hit a weird error in production" into "the check failed on my
machine."

## The `fix_*.sql` files in the repo root

These are the one-off corrective migrations that brought the drifted database back
in line with the schema (column naming, missing tables, the approval enum, the
fixed-asset hierarchy, stale unique indexes, column types). They have all been
applied to Neon and are kept for history. New schema changes should go through
`prisma db push`, not new hand-written files.
