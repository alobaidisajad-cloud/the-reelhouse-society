# BATCH 3 — #42 · "Delete Account" deletes nothing

**Status: PLANNED, NOT EXECUTED.** Tier C. App Store blocker.
Studied 2026-07-31 against the live database and both codebases.

---

## 1 · CONFIRMED. Not a false positive, not intentional.

Every claim in the finding was re-verified independently:

| Claim | Verified |
|---|---|
| The function only bans | ✅ body is exactly `UPDATE profiles SET is_banned = TRUE, ban_reason = 'USER_REQUESTED_DELETION'` |
| No redefinition | ✅ zero hits across all migrations — the baseline is the only definition |
| The flag is never read | ✅ `USER_REQUESTED_DELETION` appears **once** in the entire repo: in the function that writes it |
| No purge job | ✅ no `cron.schedule` in the mobile tree at all |
| `handle_user_deletion` never runs | ✅ **23 triggers exist; none fires it.** It is dead code. |
| Content stays readable | ✅ `can_view_user_data` branches only on `auth.uid()`, `is_social_private` and the follow graph — it **never reads `is_banned`** |

**What the member is told**, `SettingsScreen.tsx:322`:
> "This will **permanently destroy** your dossier, all logs, stacks, and critiques.
> This action is **irreversible**."

**What then happens:** email OTP → `rpc('request_account_deletion')` → `logout()` →
`storage.clearAll()` → login screen. Local data is wiped and the member is signed
out, so **it looks completely deleted**. Server-side the account is only flagged.

Mobile only — the web app has no delete path at all.

**Why blocking:** App Store Guideline 5.1.1(v) requires in-app account *deletion*
for any app with signup; "disabled instead of deleted" is a documented rejection
reason and reviewers test it. GDPR Art. 17 erasure is recorded and never honoured.
And the app states something untrue to the member, twice.

---

## 2 · Corrections to the finding

**(a) Six blocking constraints, not five.** The finding lists
`interactions_target_user_id`, `mod_actions_admin_id`, `mod_actions_target_user_id`,
`reports_target_user_id`, `warnings_admin_id`. It misses **`venues_owner_id_fkey`**.

**(b) Only ONE of them blocks today.** Live row counts:

| table | rows |
|---|---|
| venues | 0 |
| mod_actions | 0 |
| reports | 0 |
| warnings | 0 |
| **interactions** | **100** |

So today a delete fails on `interactions.target_user_id` alone — every member with
a single follower. The moderation tables would block only once they hold data. That
makes the retention decision **cheap to settle right now**, not urgent-but-blocked.

**(c) The finding never mentions the `auth.users` surface.** There are **two**
dependency sets:

- **25 FKs → `public.profiles`** — 13 `CASCADE`, 1 `SET NULL`, **11 with no action**
- **11 FKs → `auth.users`** — 10 `CASCADE`/`SET NULL`, and **`profiles_id_fkey (id) → auth.users(id)` with NO action**

That last one is structurally decisive: **`auth.users` cannot be deleted while the
profile row exists.** The profile must go first. Deleting the auth user then
cascades `dossier_certifications`, `dossier_comments`, `log_comments`,
`notifications`, `physical_archive`, `push_tokens`, `tips`, `video_reviews`.

**(d) `handle_user_deletion` is not merely unwired — it is also incomplete.** It
covers 8 tables and would still fail on `interactions.target_user_id`. Rebuilding
the purge is the right move; reusing it is not.

---

## 3 · The fix — and why it needs no app update

The client already calls `rpc('request_account_deletion')`. **Redefining that
function makes deletion real with zero client change** — which matters, because the
app is frozen on TestFlight until all 33 batches land.

Both call sites fail safe. `SettingsScreen.tsx:108` and `:356` wrap the call in
`try/catch`, show "Deletion failed", and **return without logging out**. So if the
new function raises, the member keeps their account and sees an honest error —
never a silent half-delete.

### Order (each step is forced by the FK map)

1. **Clear the 11 no-action references to `profiles`** — otherwise step 2 raises `23503`.
2. **`DELETE FROM profiles`** — cascades its 13 `CASCADE` children.
3. **`DELETE FROM auth.users`** — cascades its own 10.

### The one thing I cannot determine from here

Whether a `SECURITY DEFINER` function may delete from `auth.users`. If it can, this
is entirely SQL and ships today. If it cannot, the auth user must be removed by an
Edge Function using the service role, which means a client change and therefore the
launch build.

**One read-only query settles it:**

```sql
SELECT
  has_table_privilege('postgres', 'auth.users', 'DELETE') AS postgres_can_delete,
  (SELECT rolname FROM pg_roles r
    JOIN pg_proc p ON p.proowner = r.oid
   WHERE p.proname = 'request_account_deletion') AS function_owner;
```

---

## 4 · The decision that is yours, not mine

`mod_actions`, `reports` and `warnings` record moderation history. Deleting a member
either destroys that history or orphans it.

- **Delete the rows** — cleanest erasure, but you lose the record that someone was
  reported or warned. A banned abuser could return and their history would be gone.
- **Anonymise (`SET NULL`)** — keeps the moderation record, drops the identity.
  GDPR Art. 17(3) explicitly permits retention for legal claims. This is what most
  platforms do.

**All three tables are empty today**, so whichever you choose costs nothing to
implement now. I will not choose for you: it is a legal and product question.

My recommendation is **anonymise**, because a deletion feature that erases abuse
history is exploitable — delete, re-register, repeat.

---

## 5 · What happens to a member's public content

Once the profile is genuinely deleted, `logs`, `lists`, `watchlists` and the rest go
with it. That also closes the compounding problem the finding names: today a
"deleted" member's reviews and notes stay served, because `can_view_user_data`
ignores `is_banned`.

Batch 1 already removed the private-notes exposure; this removes the rest.

---

## 6 · Verification, once applied

Against a **throwaway test account**, never a real member:

1. Create it, write a log, a list, a watchlist entry, follow someone, be followed.
2. Delete via the app's own flow.
3. Confirm zero rows remain across all 20 profile-linked tables and all 11
   auth-linked tables.
4. Confirm the auth user is gone — the same email can sign up fresh.
5. Confirm the *follower's* feed still renders (the follow row is gone from both sides).
6. Confirm no other member's data moved.

**A rollback cannot restore deleted rows.** That is the nature of the feature. The
safety net is that the function either completes or raises, and the client shows an
honest failure — never a partial delete presented as success. Take a database
snapshot before the first live run.
