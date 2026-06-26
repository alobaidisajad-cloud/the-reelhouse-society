# WAVE 0 — live-DB verification notes (2026-06-26)

**⚠️ DO NOT run `supabase db push` against this project.**
The live database's `supabase_migrations.schema_migrations` history is **empty** — the
DB was built outside the migration system. `db push` would try to replay the entire
repo migration history against an already-built schema and conflict/fail. Apply
fixes as **targeted SQL** in the Supabase SQL editor instead.

These notes record what was verified against the **live** database, so the dated
`20260626_*` files are honest about what's real vs. repo-only.

## Applied live (run manually in SQL editor)
- **NOTIF-SPOOF-1** (`20260626_01`) — dropped the permissive `Authenticated users can
  insert notifications` INSERT policy. ✅ confirmed live + applied.
- **SHADOWBAN-1** (`20260626_04`) — dropped the dormant `Elite Public Feed (Shadowban
  Enforced)` policy on `logs`. ✅ confirmed live + applied.

## To apply with the deploy
- **signup-collision** (`20260626_05`) — `enforce_username_policy` superset (also de-dups
  general handle collisions on signup). Live body verified to match the base. ✅ safe.
- **EMAIL-ENUM-1** (`20260626_07`) — REVOKE `get_email_by_username` from anon/authenticated.
  Apply **after** deploying the `sign-in-with-username` edge function + the new app build
  (username login routes through the function). Function confirmed exposed live.

## NOT live — verified repo-only artifacts (no action; migrations made no-ops)
- **PROFILE-FREEZE-1** (`20260626_02`) — `protect_profile_fields` does not exist live; no
  profile-freeze trigger present. Follower counts / tier are not frozen.
- **NOTIF-DUP-1** (was in `20260626_01`) — the two `interactions` triggers
  (`notify_on_interaction` + `handle_follow_count_change`) are NOT duplicates;
  `on_interaction_created` doesn't exist. Dropping `tr_notify_interaction` would have
  removed the only notification trigger — **cancelled.**
- **PRIV-1** (`20260626_03`) — `get_public_profile_analytics` does not exist live.
- **LOUNGE-1** (was in `20260626_05`) — no broad "Invite code lookup" policy exists; the
  live `lounges` SELECT policy is correctly scoped (is_private=false OR creator OR member).
  The client join-by-invite was reverted to the direct lookup that matches the live schema.

## Deferred (non-blocking)
- **RL-1** (`20260626_03`) — `rate_limit_check` search_path hardening; needs live body first.
- **COMP-SPOILER-1 feed RPCs** (`20260626_06`) — every other surface veils spoilers; the
  feed degrades gracefully. Requires dumping the live feed RPCs + DROP/CREATE (return-type
  change) before applying.
