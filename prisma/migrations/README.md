# Migrations

This folder was squashed to a single **baseline** on 2026-06-11. The previous
incremental files only ever layered onto a `db push`-managed schema and were
never a complete history.

- **Fresh database:** `npx prisma migrate deploy` creates everything.
- **Existing database created via `db push`:** mark the baseline as already
  applied once, then use `migrate deploy` from that point on:

      npx prisma migrate resolve --applied 20260611000000_baseline
      npx prisma migrate deploy
