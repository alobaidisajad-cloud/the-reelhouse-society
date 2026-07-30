# BATCH 1 — The private-notes leak · #26 + #32

**Status: PLANNED, NOT EXECUTED.** Tier C. Not git-revertable.
Studied against the **live database** (`wihyqkpoymwcvbprslyz`, PostgreSQL 17.6) and
against a **local replica of the real table**. Two passes, both by execution.

---

## 1 · Both findings are REAL, LIVE and OPEN. Neither is a false positive.

Probed live with the anon key — the key that ships inside the iOS binary and is served
in plaintext by the web app. **No member's note content was printed or stored.**

| Probe | Result |
|---|---|
| `GET /logs?select=id` as anon | **200** — anon can read logs |
| `GET /logs?select=private_notes` as anon | **200, field present** |
| logs visible to anon, total | **255** |
| `private_notes IS NOT NULL` | **34** |
| **`private_notes` non-null AND non-empty** | **1** |
| `POST /rpc/get_featured_critique` as anon | **200, 27 columns** |
| `POST /rpc/get_featured_critique?select=private_notes` | **200** |

**#26 — a real member's real private note is readable by anyone on the internet.**

⚠️ **Correction to my own earlier report.** Passes 1 and 2 of this plan said "34 logs
carrying real private notes". That was wrong and overstated the exposure by 34×: 33 of
those 34 rows hold an **empty string**, not a note. Measured in pass 3 by splitting
`not.is.null` from `neq.`. **Exactly one row carries actual content** — and it is the
note the original finding quoted, about a member's darkest day.

The severity is unchanged in kind. A written privacy promise, on a paid feature, is
broken, and one real person's private words are on the open internet. The *scale* is
one, and saying otherwise was inaccurate.

**#32 — the RPC returns all 27 columns to anonymous callers**, and leaks more than the
finding recorded: **`viewing_history`, `watched_with` and `autopsy`** as well.

### Which code is deployed — established, not assumed

Three `supabase/` trees disagree. The deployed function is the **mobile** one
(`20260709_05`, `plpgsql`, `SECURITY DEFINER`, `SELECT l.*`). Two proofs:

1. The response has **27 columns** = `SELECT *`. The web tree's version projects 16
   columns against `RETURNS SETOF logs`, which would error at runtime.
2. The featured row matches the mobile ranking rule exactly (`LENGTH(review) > 100`,
   `rating >= 4`, newest first) — the same id returned by the RPC and by a direct query
   under that rule.

Because it is `SECURITY DEFINER`, **fixing the `logs` RLS would not close #32.** That is
why these two are one batch.

### The exposure surface is exactly two paths — enumerated, not guessed

Swept the full production schema dump. `private_notes` appears in exactly two places:
the column definition, and a **filter** inside `global_feed_materialized`.

That materialized view was checked live and is **SAFE**: it uses an explicit 16-column
projection, and `?select=private_notes` against it returns **HTTP 400 — column absent**.
It is also a precedent: *your own schema already uses the explicit-projection pattern
this plan proposes.*

Writes are properly gated (proven): INSERT by anon returns `42501 — new row violates
row-level security policy`; UPDATE/DELETE policies are `USING (auth.uid() = user_id)`.
**Only the SELECT policy leaks.**

**Edge functions swept — clean.** Eleven functions across both trees. Only
`supabase/functions/send-email/index.ts` touches `logs`, and it selects **`rating` only**,
scoped `.eq('user_id', userId)`. It runs with the service-role key (bypasses RLS), so this
mattered — it is not a leak.

**The feed-cache migration resolved.** `supabase/migrations/20260415_hyper_viral_feed_cache.sql`
was the remaining file mentioning `private_notes`. It creates `global_feed_materialized` —
the same object already proven safe above. No third path.

**The premium gate has no server-side backing.** `private_notes` appears exactly twice in
the entire production schema: the column definition and the materialized-view filter. There
is **no trigger, no constraint and no policy referencing tier**, so `useLogFlow.ts:133`
(`isPremium ? notes : null`) is the only thing stopping a non-paying member from writing
notes. Not exploitable for *reading* others' data, so not a batch-1 blocker — but it is the
second reason the dedicated table in §4 is the right architecture.

---

## 2 · ⛔ The filed fix for #32 is WRONG and would break the home screen

The finding proposes `RETURNS TABLE(...)`. **Do not.**

`FeaturedCritique.tsx:32` — the only consumer in either app — fetches the author via a
PostgREST embed: `profiles!logs_user_id_fkey(username, role, avatar_url)`. PostgREST can
only embed when the function returns `SETOF <table>`, because that is where the
foreign-key metadata lives. Proven live:

| Test | Result |
|---|---|
| Embed on the current fn (`RETURNS SETOF logs`) | **works** — returns `{username, role}` |
| Embed on an existing `RETURNS TABLE` fn | **`PGRST200` — "no foreign key relationship between 'record' and 'profiles'"** |

`FeaturedCritique` returns `null` on error, so the filed fix would have made **the Lead
Story silently vanish from the home screen.** It also requires `DROP` + `CREATE` (a
return-type change), which discards `EXECUTE` grants and leaves a window where every
call 500s.

---

## 3 · THE FIX — #32 · keep the return type, starve the payload

Keep `RETURNS SETOF public.logs`; return `NULL` for the 10 columns the Lead Story never
renders. Embed survives, `CREATE OR REPLACE` works, no `DROP`, no grant loss, no outage
window, **zero client change in either app.**

### Proven on a local replica of the real table, not reasoned about

A throwaway PostgreSQL 18.4 instance was built with the **exact 27-column `logs`
definition**, including all three CHECK constraints, then torn down.

| Claim | Result |
|---|---|
| The function compiles and runs | **✓** |
| `private_notes` returns `<NULL>` | **✓** |
| `viewing_history` returns `<NULL>` | **✓** |
| **`NULL` accepted for `watched_date`, a `NOT NULL` column** | **✓ — composite row values do not enforce table constraints** |
| `watched_with`, `autopsy`, `review` still correct | **✓** |
| `CREATE OR REPLACE` preserves the `EXECUTE` grant | **✓ — `anon=X/postgres` present before *and* after** |
| Adding a column to `logs` afterwards | **ERROR: Number of returned columns (27) does not match expected column count (28)** |

The `watched_date` result was an assumption in the first pass. It is now a fact.

### The embed provably cannot break

PostgREST resolves a function embed from exactly two things: the function's **return type**
and the **foreign key** on that type's table. Both were compared across the replace on a
replica carrying the real `logs_user_id_fkey`:

| | before | after |
|---|---|---|
| `prorettype` | `logs` | `logs` |
| `proretset` | `true` | `true` |
| `proargtypes` | `[]` | `[]` |
| `prosecdef` | `true` | `true` |
| `logs_user_id_fkey -> profiles` | intact | **untouched — the fix does not alter the table** |

Byte-identical inputs mean PostgREST cannot resolve the relationship differently. This is
the strongest proof obtainable without running PostgREST itself, and it is what makes this
fix categorically safer than the filed `RETURNS TABLE` version, which changes `prorettype`
to `record` — precisely the value that produced `PGRST200` in the live test above.

### The client cannot notice — proven

`FeaturedLog` (`src/components/home/types.ts:19`) declares **exactly** the 17 columns the
client selects, plus `profiles`. None of the 10 NULLed columns appear in it. The only
apparent hit — `year`, 3 references in `src/components/home/` — is `FilmTicker.tsx`
deriving a year from a TMDB `release_date`, unrelated to `logs.year`.

### The SQL

```sql
CREATE OR REPLACE FUNCTION public.get_featured_critique()
RETURNS SETOF public.logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,                              -- 1
    l.user_id,                         -- 2
    l.film_id,                         -- 3
    l.film_title,                      -- 4
    l.rating,                          -- 5
    l.review,                          -- 6
    NULL::date,                        -- 7  watched_date    (unused)
    NULL::text,                        -- 8  format          (unused)
    l.created_at,                      -- 9
    l.poster_path,                     -- 10
    NULL::text,                        -- 11 year            (unused)
    l.status,                          -- 12
    l.is_spoiler,                      -- 13
    l.watched_with,                    -- 14
    NULL::text,                        -- 15 private_notes   ⛔ never leaves the DB
    l.abandoned_reason,                -- 16
    NULL::text,                        -- 17 physical_media  (unused)
    l.is_autopsied,                    -- 18
    l.autopsy,                         -- 19
    NULL::text,                        -- 20 alt_poster      (unused)
    l.editorial_header,                -- 21
    l.drop_cap,                        -- 22
    l.pull_quote,                      -- 23
    NULL::timestamptz,                 -- 24 updated_at      (unused)
    NULL::text,                        -- 25 video_url       (unused)
    NULL::jsonb,                       -- 26 viewing_history ⛔ unused + sensitive
    NULL::integer                      -- 27 view_count      (unused)
  FROM public.logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND LENGTH(l.review) > 100
    AND l.rating >= 4
    AND COALESCE(p.is_social_private, false) = false
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;
```

**Rollback** — the current definition, verbatim from `20260709_05`:

```sql
CREATE OR REPLACE FUNCTION public.get_featured_critique()
RETURNS SETOF public.logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT l.* FROM public.logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL AND l.review != ''
    AND LENGTH(l.review) > 100 AND l.rating >= 4
    AND COALESCE(p.is_social_private, false) = false
  ORDER BY l.created_at DESC LIMIT 1;
END;
$$;
```

### The one trade-off, measured

Adding a column to `logs` will make this function **fail at call time** until it is
updated — proven above, with the exact error. `FeaturedCritique` swallows the error, so
the symptom is the Lead Story disappearing, not a crash.

That is the correct trade and it is deliberate. Today's behaviour is the opposite: any
column ever added is published to the internet automatically, with nobody making a
mistake. **A security boundary should fail closed.** The invariant must be written into
the migration ledger (batch 32): *changing `logs` requires updating
`get_featured_critique`.*

A `SETOF <view>` variant would be future-proof *and* closed — but whether PostgREST can
embed off a view-returning function cannot be proven without deploying it, and the
proven option is worth more than the elegant one.

---

## 4 · THE FIX — #26 · why no quick fix exists

The obvious mitigation:

```sql
REVOKE SELECT (private_notes) ON public.logs FROM anon;   -- ⛔ does not work
```

**(a) Proven inexpressible.** The baseline contains `GRANT ALL ON TABLE public.logs TO
anon`. Postgres will not subtract a column from a table-wide grant. Closing it properly
means `REVOKE SELECT ON logs FROM anon` followed by an explicit **26-column** `GRANT` —
a list maintained by hand forever, which must be updated on every schema change.

**(b) It would break your live web app.** `MarqueeBoard.tsx:19` and `FilmHero.tsx:43`
run `select('*', { count:'exact', head:true })` on `logs`, and the web app has no route
gating, so a **logged-out visitor** hits them. Verified live: anon `select=*` returns
**200**, and the head-count with `select=*` returns **200**. Remove one column from the
grant and those film pages break.

**(c) Even done perfectly it is partial** — it closes anonymous access while leaving any
signed-up member able to read any other member's notes.

### The correct fix — a dedicated table

```
log_private_notes ( log_id uuid PK → logs(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL → profiles(id),
                    notes text,
                    updated_at timestamptz )
RLS: USING (user_id = auth.uid())  WITH CHECK (user_id = auth.uid())
```

Private data physically separated; owner-only RLS expressed on a **row**, which is the
only thing RLS can do; and the premium gate stops being a client `if`
(`useLogFlow.ts:133`) and becomes a server-side rule.

**This is affordable now for a reason that expires: the mobile app has not shipped to
either store.** There is no installed base to force-update, and the web app deploys
instantly. A client change costs a build you are doing anyway for launch. After launch
the same fix needs a forced update.

Touch points traced — **6 mobile, 4 web, plus a backfill**:

| Where | Site |
|---|---|
| mobile | `mappers.ts:183` — drop `private_notes` from `LOG_SELECT_COLUMNS` |
| mobile | `logOperations.ts:255` · `:401` · `mutationExecutor.ts:75,124` |
| mobile | `LogService.ts:153` — multi-device sync read |
| mobile | `app/log/[id].tsx:193,600` — render path |
| mobile | `useLogFlow.ts:133` — premium gate moves server-side |
| mobile | `archiveImport.ts:1499` — import writes |
| web | `stores/films.ts:315,562,676` · `useFilmMutations.ts:138,165,198,266` |
| web | `ProjectorRoom.tsx:51` — CSV export |
| data | backfill **34 rows**, then `ALTER TABLE logs DROP COLUMN private_notes` |

Note the client discipline is already correct: `LOG_SELECT_COLUMNS` (which includes the
column) is used only on owner-scoped queries; other members' logs go through
`PUBLIC_LOG_COLUMNS`, which omits it. **The leak is purely at the API layer.**

---

## 5 · Recommended split — flagged against my own plan

**Batch 1 as filed is too big.** #32 is one self-contained SQL statement with zero
client impact. #26 is a schema migration plus ten call sites across two codebases plus a
backfill plus a column drop. Running them together repeats the batch-2 mistake.

- **BATCH 1A · #32** — one `CREATE OR REPLACE`. Proven on a replica. Ships in minutes.
- **BATCH 1B · #26** — the `log_private_notes` migration, both clients, backfill, column
  drop. Its own plan, its own probes.

1A also reduces live exposure immediately while 1B is built.

---

## 6 · Execution — BATCH 1A

**Before** (record output in the commit):
```
POST /rest/v1/rpc/get_featured_critique?select=private_notes                       -> 200, field present
POST /rest/v1/rpc/get_featured_critique?select=id,user_id,profiles!logs_user_id_fkey(username,role)
                                                                                   -> profile object present
```

**Apply** — paste section 3's SQL into the Supabase SQL editor. **Never `db push`.**

**After** — all four must hold:
1. `?select=private_notes` → `null`.
2. The embed still returns `{username, role}` — **the author must survive.**
3. `?select=viewing_history` → `null`.
4. Home screen: Lead Story renders with author, avatar, rating, review, pull-quote,
   drop-cap and autopsy exactly as before.

**If any fails**, paste the rollback in section 3 immediately.

**Then** commit the migration to `mobile/supabase/migrations/` so the repo matches the
database, and record the `logs`-schema invariant for batch 32.

---

## 7 · What this does NOT close

- **1A does not fix #26.** After 1A the 34 notes remain readable at
  `GET /logs?select=private_notes` with the anon key. Only 1B closes that.
- `anon` holds `GRANT ALL` on `logs`, not just `SELECT`. Writes are correctly gated by
  RLS (proven), so this is not exploitable today — but the grant is wider than it needs
  to be. Not batch 1; worth its own finding.
- The three `supabase/` trees remain out of sync. Batch 32 owns that.
- Production is PG 17.6; the replica proof ran on 18.4. The semantics exercised
  (composite return types, NULL in a `NOT NULL` position, `CREATE OR REPLACE` ACL
  retention) are unchanged across those versions.
