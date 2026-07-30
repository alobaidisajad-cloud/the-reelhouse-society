# BATCH 2 — THE LIVE SECURITY ITEMS · FLAWLESS PLAN

**Scope (DEEP-VERIFY-131.md:85):** #26 · #32 · DESYNC · #84 · #48 · #36 · #67 · #78

Every item re-proven against the LIVE backend this session. Every fix below is the exact
change, with its zero-side-effect proof and its ordering constraint.

---

## STEP 1 · SQL ONLY — no app build. Do this first; data is leaking now.

### 1a · #26 — close the direct read

```sql
REVOKE SELECT (private_notes) ON public.logs FROM anon;
```

**Zero-side-effect proof (covers BOTH clients, not one):**
- every anon-reachable read in mobile AND web uses an explicit column list omitting `private_notes`
- `LogService.ts:153` DOES select it — but is guarded by `if (currentUserId && logData.user_id === currentUserId)`: owner-only, authenticated
- `src/api/supabase.ts:59 getUserLogs` selects `*` — **zero callers, dead code**
- ⚠️ `ProjectorRoom.tsx:28` (web) selects `*` and IS reachable. It is already leaking today. It breaks only under a Stage-2 revoke (from `authenticated`), which is NOT in this plan.

### 1b · #32 — close the second door

`get_featured_critique()` is `SECURITY DEFINER RETURNS SETOF public.logs` doing `SELECT l.*`.
**It ignores grants, so 1a does NOT close it.**

⚠️ **DO NOT change the return type to a column list.** The client chains
`.select(... profiles!logs_user_id_fkey(username, role, avatar_url))` — PostgREST resolves that
embed through the TABLE's FK. A `RETURNS TABLE(...)` breaks the embed and kills the component.
The return type must stay `SETOF public.logs`.

```sql
CREATE OR REPLACE FUNCTION public.get_featured_critique()
RETURNS SETOF public.logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE r public.logs;
BEGIN
  FOR r IN
    SELECT l.*
    FROM public.logs l
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.review IS NOT NULL
      AND l.review <> ''
      AND LENGTH(l.review) > 100
      AND l.rating >= 4
      AND COALESCE(p.is_social_private, false) = false
    ORDER BY l.created_at DESC
    LIMIT 1
  LOOP
    r.private_notes := NULL;   -- never leaves the server, whatever the caller selects
    RETURN NEXT r;
  END LOOP;
END;
$func$;
```

**Proof:** `private_notes` is `text` (nullable) so the assignment is legal. Selection logic is
byte-identical to `20260709_05`. No positional column list, so a future column added to `logs`
cannot silently break it. The mobile client never selects `private_notes` anyway — this closes
the hole for any OTHER caller, including raw REST.

### 1c · DESYNC — **the code is already correct; the DATA is stale**

`SettingsScreen.tsx:132-135` writes BOTH keys atomically from one value:
`is_social_private: data.socialVisibility === 'private'` **and** `preferences.social_visibility`.
This is NOT an ongoing write-path bug — the offending row predates that code.

```sql
UPDATE public.profiles
SET is_social_private = true
WHERE COALESCE(preferences->>'social_visibility','public') = 'private'
  AND COALESCE(is_social_private,false) = false;
```

**Proof:** narrowed to rows that actively disagree. Only ever sets private = TRUE (more
restrictive, never less). `is_social_private=eq.true` currently returns `[]`, so this can only
ADD privacy, never remove it.

---

## STEP 2 · #48 — tier. **ORDERING IS THE WHOLE RISK.**

29 of 32 rows have `tier: NULL`. Anything that reads `tier` in preference to `role` BEFORE the
back-fill blanks badges for 29 members.

**2a — back-fill FIRST (SQL):**

```sql
UPDATE public.profiles SET tier = role
WHERE tier IS NULL AND role IN ('cinephile','archivist','auteur','projectionist');
```

**2b — THEN the client learns the legacy tier** (`src/utils/tier.ts`):

```ts
const t = tierStr.toLowerCase();
if (t === 'archivist' || t === 'auteur' || t === 'founding') return t as ReelHouseTier;
if (t === 'projectionist') return 'archivist';  // legacy tier — the DB already grants it
                                                // lounge access at 4 RLS sites
return 'cinephile';
```

**Proof it is not a guess:** `projectionist` is a first-class tier created by
`20260325_projectionist_tier.sql`; `20260401_the_lounge.sql` grants
`role IN ('archivist','auteur','projectionist')`. Mapping it to `archivist` matches what the
DATABASE already grants — the client is being taught what the server already believes.

⚠️ Do NOT add telemetry to the fall-through branch: `normalizeTier` runs at ~60 call sites per
render and 30 of 32 members are `cinephile`, so it would emit per-member-per-row-per-render.

---

## STEP 3 · #36 + #67 — ONE identity decision, three sites

The same bug. The app holds three views of a legal username:

```
DB                accepts  .  @      (5 live rows)
validateUsername  STRIPS   .  @      -> silent rename on ANY profile save
socialSlice:61    REJECTS  .  @      -> those 5 cannot be followed, permanently
```

**3a — stop the silent rename** (`useEditProfile.ts`, `buildProfileUpdates:80` always sends
`username`). Send it only when it actually changed:

```ts
const updates: Record<string, any> = { display_name, bio, social_links };
if (input.sanitizedUsername !== input.currentUsername) {
  updates.username = input.sanitizedUsername;
}
```

**Proof:** the availability check at `:155` already gates on `sanitizedUsername !== user.username`,
so the "changed" signal exists and is trusted. A member editing only their bio then sends no
`username` at all — the rename becomes impossible rather than merely unlikely.

**3b — let the 5 be followed** (`socialSlice.ts:61`). Widen the guard to match what the DB stores:

```ts
if (!/^[a-zA-Z0-9._@-]{1,64}$/.test(username)) return null;
```

**Proof it is strictly permissive:** it can only ADMIT usernames currently rejected; every
username passing today still passes. It is defence-in-depth against malformed input, not a
security boundary — the value goes to `.eq()`, which is parameterised, never interpolated.

**3c — the collision must be resolved BY HAND before any back-fill.**
`saleel.house` sanitises to `saleelhouse`, **which already exists as a different member.** Any
bulk normalisation hits a unique constraint. Decide per-account; do not automate.

---

## STEP 4 · #84 — the dead search tab

`useUniversalSearch.ts:62` selects `username, role` FROM `logs`. Live: `42703`, both absent.
Use the embed the codebase already uses at `LogService.ts:108`:

```ts
.select('id, user_id, film_title, review, rating, poster_path, status, abandoned_reason, created_at, profiles!logs_user_id_fkey(username, role)')
```

**Proof:** identical shape to a query already working in production. Line 54 is a DIFFERENT query
against `profiles`, where those columns DO exist — leave it alone.

---

## STEP 5 · #78 — cancel-request leaves the button stuck

`unfollowUser` optimistically calls `removeFollowing` but never `removeRequested`, and
`useProfileController.ts:249` routes cancel-request through it. The **DB delete is already
correct** — `.in('type', ['follow','follow_request'])` removes both. Only the local store goes stale.

```ts
useSocialStore.getState().removeFollowing(targetUsername);
useSocialStore.getState().removeRequested(targetUsername);   // ADD
```

**Proof:** exactly what `followUser`'s rollback does at `:178-179`. `removeRequested` on a
username that was never requested is a no-op.

---

## ORDER (safe to stop after any step)

1. **1a + 1b + 1c** — SQL only, no build. Leak closed.
2. **2a** SQL back-fill → **2b** code.
3. **3a + 3b** code (3c by hand first if you want the back-fill).
4. **4** code.
5. **5** code.

Steps 2b, 3, 4, 5 ship in ONE build. Steps 1 and 2a are SQL you paste.

## GAPS I AM NOT CLOSING (stated, not hidden)

- **Stage 2 of #26** (revoke from `authenticated`) is NOT in this plan. It needs
  `ProjectorRoom.tsx`'s `select('*')` fixed first and reroutes the owner read through a
  SECURITY DEFINER accessor — touching `mutationExecutor`'s offline merge, the most
  failure-sensitive code in the app. It deserves its own pass.
- **ProjectorRoom (web)** is leaking today and is NOT in this repo.
- The username **policy** decision (what a handle may legally contain) is yours; 3a and 3b stop
  the damage either way.
