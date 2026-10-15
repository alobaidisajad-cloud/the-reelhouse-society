# Undo files

Each pending migration's undo, under the migration's own file name. It returns production's schema to exactly what
it was before the migration: `mobile/e2e/db/up-down-up.mjs` applies the migration, this undo, and the migration again
on production's shape in CI, and fails unless the schema after the undo equals the schema before.

These are not migrations. Neither the Supabase CLI nor `apply.cjs` reads this folder, the add-only check skips it,
and the migration lint still refuses transaction control in it. Applying one to production is a rollback, run as
`apply.cjs` runs a migration, with its own command.
