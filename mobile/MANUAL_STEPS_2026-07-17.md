# Audit remediation — MANUAL STEPS (2026-07-17)

Everything code-side is done (migrations written, client code fixed, typecheck + 89 tests green).
This is the list of things **only you can do** (touch the live DB / dashboard / build).

Order matters where noted. Each SQL block is also committed as a migration under `supabase/migrations/` — but paste it into the **Supabase SQL editor** to apply (do NOT `supabase db push`).

---

## 1) Run the SQL migrations (Supabase SQL editor, in this order)

Run each file's contents. All are idempotent and safe to re-run.

1. `20260717_01_profiles_privilege_lockdown.sql` — **F-9 (blocker) + F-15**. Kills admin-takeover / free-tier / ban-evasion + email harvesting.
2. `20260717_02_drop_notification_spoof_policy.sql` — **F-4**. Stops notification/push spoofing.
3. `20260717_03_moderation_notification_fix.sql` — **F-12**. Restores report-resolution (moderation is currently broken in prod).
4. `20260717_04_notify_push_shared_secret.sql` — **F-5** (also do step 2 below — the secret).
5. `20260717_05_backport_live_hardening.sql` — back-port pack (F-6/F-7/F-16/F-17). No-op on live; rebuild safety.
6. `20260717_06_low_severity_hardening.sql` — **F-18 + F-8**.

## 2) F-5 — set the push shared secret (2 places, same value)

Pick a strong random value (e.g. `openssl rand -hex 32`), then:

**a. Store it in Supabase Vault** (SQL editor, once). NOTE: hosted `postgres` cannot
`ALTER DATABASE ... SET` a custom GUC (42501) — Vault is the correct home:
```sql
select vault.create_secret('PASTE_RANDOM_SECRET_HERE', 'notify_push_secret');
```
The `tg_notify_push()` trigger (migration 04) reads it from `vault.decrypted_secrets`.
(To change it later: `select vault.update_secret((select id from vault.secrets where name='notify_push_secret'), 'NEW_VALUE');`)

**b. Edge function env var** (Dashboard → Edge Functions → `notify-push` → Secrets/Env):
- `FUNCTION_SHARED_SECRET` = **the same** random value.

**c. Confirm `verify_jwt`** for `notify-push` (Dashboard → Edge Functions → notify-push → Settings): it should stay `false` (the webhook can't present a user JWT) — the shared secret is now the auth. Leave the function deployed as-is.

**Test:** trigger a notification (e.g. follow yourself from a test account) → push should still arrive. A raw `curl` POST to the function *without* the header should return `401`.

## 3) Deploy the edge function change (F-11)

```bash
supabase functions deploy fetch-rss
```
(That's the only edge function whose code changed. `notify-push` code is unchanged — only its env var.)

## 4) Optional back-port completion (rebuild-safety only — not launch-blocking)

- **F-10** (role constraint): capture the exact live definition, then I'll write the committed reconcile migration:
  ```sql
  SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid='public.profiles'::regclass AND contype='c';
  ```
- **F-13** (avatar storage policies): they're correct on live; export them from the Storage dashboard and commit as a repo artifact.

## 5) Re-verify (run the Phase-0 master matrix again)

Re-run the master matrix query from the audit. Expected AFTER fixes:
- `F9 *` → **false**, `F15 * email` → **false**
- `F4 notifications client-INSERT policy exists` → **false**
- `F12 * has title/body/metadata col` → **true**, `F12 type CHECK allows moderation` → **true**
- `F18 increment_video_views anon-callable` → **false**

## 6) Ship the client & QA

- The client code fixes (F-1 TMDB key removal, F-2, F-3) go out in the **next EAS build** — no hotfix needed since launch hasn't happened. Confirm the new build no longer bundles `EXPO_PUBLIC_TMDB_API_KEY`.
- Rotate the old TMDB key if you want to be thorough (it was previously in the bundle).
- Do the on-device visual/interaction QA pass (Scope §5 — the one thing the audit couldn't cover from source).

---

## Deferred (documented, low priority)
- **F-14** — `preferences` JSONB is readable via raw REST. Contents are non-sensitive UI settings (`tactile_audio_enabled`, `oracle_persona`, and the already-public `programmes`/`favorites`/`hide_stats`). The clean fix (promote sub-keys to columns + client change + revoke) is disproportionate to the risk; revisit as a fast-follow if `preferences` ever holds anything sensitive.
