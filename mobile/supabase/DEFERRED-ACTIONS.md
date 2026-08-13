# Deferred actions — things deliberately not applied yet

Work that is **written, correct, and intentionally waiting** for a condition.
Not a backlog: everything here is finished SQL whose only remaining question is
*when*.

This file exists because the alternative was a comment inside one of 143
migration files. Batch 32 found the entry below by extracting every function all
43 "APPLY MANUALLY" migrations claim to create and diffing against the live
database — it was one of only two absences in the whole repo. A deferral nobody
can find is indistinguishable from a mistake.

`npm run schema:check` reconciles what IS. This file records what is **meant to
change later**, which no snapshot can infer.

---

## 1. Revoke `anon`'s read on `profiles.preferences`

**File** `supabase/migrations/20260731_08_public_prefs_projection.sql`, STEP 4
**Marked** `-- STEP 4 — THE ACTUAL CLOSURE. DO NOT RUN THIS YET.`
**Blocked on** the launch build reaching the App Store and Play Store
**Verify it is still pending** — `true` means not yet run:

```sql
SELECT has_column_privilege('anon','public.profiles','preferences','SELECT');
```

### Why it waits

The mobile app is **browsable logged out**. There is no auth guard on the tab
layout — login is a modal — so a visitor with no session loads profiles. Reading
a JSONB path still requires column-level SELECT on `preferences`, so revoking it
today breaks the profile fetch for every logged-out visitor on the **frozen
TestFlight build**, which cannot be patched.

Steps 1–3 are applied and are purely additive: `public_prefs()` plus a generated
`profiles.public_prefs` column expose only whitelisted keys, and both clients
read that instead. The leak is closed for anyone on the new build. STEP 4 removes
the old door once nobody is using it.

### What is still exposed until it runs

`anon` can read the raw `preferences` JSONB, which carries roughly 8 keys beyond
the 3 the app exposes — including notification settings and privacy
configuration. Not credentials, and not visible in any app UI, but more than the
whitelist intends.

### When to run it

After the launch build is live on **both** stores and TestFlight traffic on the
frozen build has stopped. Then run STEP 4, re-run `npm run schema:snapshot`, and
delete this entry.

⚠️ Running it early does not corrupt anything — it makes logged-out profile
views fail on the old build until members update.

---

## 2. `supabase_admin` default privileges

**Found in** batch 29
**Blocked on** nothing we control

`supabase_admin` carries default privileges granting TRUNCATE, REFERENCES,
TRIGGER and MAINTAIN on future tables to `anon` and `authenticated`. We revoked
these for `postgres`, which owns all 27 tables and creates every new one, so the
practical exposure is closed.

`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` fails with *"permission denied
to change default privileges"*, and `postgres` is not a member of that role. It
applies only to tables created **by Supabase's own tooling** in `public`, which
this project does not do.

The `noWipePrivileges` assertion in `scripts/check-backend-live.mjs` catches it
if such a table ever appears.
