# BATCH 1 — The private-notes leak · #26 + #32

**Status: PLANNED, NOT EXECUTED.** Tier C. Not git-revertable.
Studied 2026-07-31 against the **live database** (`wihyqkpoymwcvbprslyz`), not the repo.

---

## 1 · Both findings are REAL, LIVE, and OPEN. Neither is a false positive.

Verified by probing the live API with the anon key — the same key that ships inside
the iOS binary and is served in plaintext by the web app. **No member's note content
was printed or stored at any point.**

| Probe | Result |
|---|---|
| `GET /logs?select=id` as anon | **HTTP 200** — anon can read logs |
| `GET /logs?select=private_notes` as anon | **200, field present** |
| `GET /logs?select=id&private_notes=not.is.null` count | **34 rows** |
| `POST /rpc/get_featured_critique` as anon | **200, 27 columns** |
| RPC includes `private_notes` | **true** |
| `POST /rpc/get_featured_critique?select=private_notes` | **HTTP 200** |

**#26 — 34 logs carrying real private notes are readable by anyone on the internet
right now.**

**#32 — the RPC returns all 27 columns to anonymous callers.** It leaks more than the
finding recorded: not just `private_notes` but **`viewing_history`, `watched_with`
and `autopsy`**. On the currently featured row the note happens to be empty — the
path is open regardless, and the Lead Story is shown to every viewer, so whoever is
featured next with notes leaks them to the entire userbase.

### Which code is actually deployed — established, not assumed

There are three `supabase/` trees in this repo and they disagree. The deployed
function is the **mobile** one (`20260709_05`, `plpgsql`, `SECURITY DEFINER`,
`SELECT l.*`). Two independent proofs:

1. The response has **27 columns** = `SELECT *`. The web tree's version projects only
   16 columns against a `RETURNS SETOF logs` declaration, which would error at runtime.
2. The featured row matches the mobile ranking rule exactly (`LENGTH(review) > 100`,
   `rating >= 4`, newest first) — id `66ebec95…` returned by both the RPC and a direct
   query under that rule.

Because it is `SECURITY DEFINER`, **fixing the `logs` RLS policy would not close #32.**
That is why these two are one batch.

---

## 2 · ⛔ The filed fix for #32 is WRONG and would break the home screen

The finding proposes changing the return type to `RETURNS TABLE(...)`. **Do not.**

`FeaturedCritique.tsx:32` — the only consumer in either app — asks for the author via
a PostgREST embed:

```
.select('id, …, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
```

PostgREST can only embed a related table when the function returns `SETOF <table>`,
because that is where the foreign-key metadata comes from. Proven live:

| Test | Result |
|---|---|
| Embed on the current fn (`RETURNS SETOF logs`) | **works** — returns `{username, role}` |
| Embed on an existing `RETURNS TABLE` fn | **`PGRST200` — "no foreign key relationship between 'record' and 'profiles'"** |

`FeaturedCritique` returns `null` on error, so the filed fix would have made **the
Lead Story silently disappear from the home screen.** A second, quieter cost: changing
a function's return type requires `DROP` + `CREATE`, which discards its `EXECUTE`
grants and leaves a window where every call 500s.

---

## 3 · THE FIX — #32 · keep the return type, starve the payload

Keep `RETURNS SETOF public.logs` — the embed survives, `CREATE OR REPLACE` works, no
`DROP`, no grant loss, no outage window, **and zero client change in either app.**
Replace `SELECT l.*` with an explicit 27-column projection that returns `NULL` for
every column the Lead Story does not render.

The client selects exactly 17 columns. The other 10 are returned as `NULL`.

Column order verified against the **live** table (all 27, order confirmed identical to
`_schema_baseline.sql`).

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
    l.id,                                  -- 1
    l.user_id,                             -- 2
    l.film_id,                             -- 3
    l.film_title,                          -- 4
    l.rating,                              -- 5
    l.review,                              -- 6
    NULL::date                       ,     -- 7  watched_date    (unused)
    NULL::text                       ,     -- 8  format          (unused)
    l.created_at,                          -- 9
    l.poster_path,                         -- 10
    NULL::text                       ,     -- 11 year            (unused)
    l.status,                              -- 12
    l.is_spoiler,                          -- 13
    l.watched_with,                        -- 14
    NULL::text                       ,     -- 15 PRIVATE_NOTES   ⛔ never leaves the DB
    l.abandoned_reason,                    -- 16
    NULL::text                       ,     -- 17 physical_media  (unused)
    l.is_autopsied,                        -- 18
    l.autopsy,                             -- 19
    NULL::text                       ,     -- 20 alt_poster      (unused)
    l.editorial_header,                    -- 21
    l.drop_cap,                            -- 22
    l.pull_quote,                          -- 23
    NULL::timestamptz                ,     -- 24 updated_at      (unused)
    NULL::text                       ,     -- 25 video_url       (unused)
    NULL::jsonb                      ,     -- 26 VIEWING_HISTORY ⛔ unused + sensitive
    NULL::integer                          -- 27 view_count      (unused)
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

### The one trade-off, stated plainly

An explicit projection means **adding a column to `logs` will break this function**
until it is updated. That is deliberate. The alternative is what exists today: any
column ever added is published to the internet automatically, with nobody making a
mistake. A loud failure on a schema change is the correct trade for a security
boundary — but it must be written into the migration ledger (batch 32).

---

## 4 · THE FIX — #26 · why the quick fix does not exist

The obvious mitigation is to revoke the column from anonymous callers:

```sql
REVOKE SELECT (private_notes) ON public.logs FROM anon;   -- ⛔ does NOT work
```

**Two independent reasons it fails.**

**(a) Postgres will not subtract a column from a table-wide grant.** `anon` holds
table-level `SELECT` (the Supabase default — consistent with `select=*` returning 200).
A per-column `REVOKE` against a table-level grant is a no-op. Closing it properly means
`REVOKE SELECT ON logs FROM anon` followed by an explicit **26-column** `GRANT` — a list
that must then be maintained by hand forever.

**(b) It would break your live web app.** `MarqueeBoard.tsx:19` and `FilmHero.tsx:43`
both run `select('*', { count:'exact', head:true })` on `logs`, and the web app has no
route gating, so a **logged-out visitor** hits them. Verified live: anon `select=*`
returns **200** today. Remove one column from the grant and those film pages break.

And even done perfectly it is only a partial fix: it closes the anonymous path but any
signed-up member could still read any other member's notes.

### The correct fix — a dedicated table

```
log_private_notes ( log_id uuid PK → logs(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL → profiles(id),
                    notes text,
                    updated_at timestamptz )
RLS: USING (user_id = auth.uid())  WITH CHECK (user_id = auth.uid())
```

Private data is physically separated, owner-only RLS is expressible on a *row* (which
is the only thing RLS can do), and the premium gate stops being a client `if` and
becomes a server-side rule.

**This is affordable right now for a reason that will not last: the mobile app has not
shipped to either store yet.** There is no installed base to force-update. The web app
deploys instantly. A client change costs a build you are doing anyway for launch. After
launch, this same fix requires a forced update.

Touch points already traced — **6 mobile, 4 web, plus the backfill**:

| Where | Site |
|---|---|
| mobile | `mappers.ts:183` — drop `private_notes` from `LOG_SELECT_COLUMNS` |
| mobile | `logOperations.ts:255` insert · `:401` · `mutationExecutor.ts:75,124` |
| mobile | `LogService.ts:153` — the multi-device sync read |
| mobile | `app/log/[id].tsx:193,600` — render path |
| mobile | `useLogFlow.ts:133` — premium gate moves server-side |
| mobile | `archiveImport.ts:1499` — import writes |
| web | `stores/films.ts:315,562,676` · `useFilmMutations.ts:138,165,198,266` |
| web | `ProjectorRoom.tsx:51` — the CSV export |
| data | backfill **34 rows**, then `ALTER TABLE logs DROP COLUMN private_notes` |

---

## 5 · Recommended split — and I am flagging this against my own plan

**Batch 1 as filed is too big for one batch.** #32 is a self-contained SQL change with
zero client impact. #26 is a schema migration plus ten call sites across two codebases
plus a data backfill plus a column drop. Executing them together is exactly the
16-findings mistake from batch 2.

**Proposal — split into 1A and 1B, run in order, both before launch:**

- **BATCH 1A · #32.** One `CREATE OR REPLACE`. No client change, no `DROP`, no grant
  loss. Closes the RPC leak completely, including the three columns the finding never
  named. Can ship in minutes.
- **BATCH 1B · #26.** The `log_private_notes` migration, both clients, the backfill,
  the column drop. Its own batch, its own plan, its own before/after probes.

Doing 1A first also **reduces the live exposure immediately** while 1B is built.

---

## 6 · Execution — BATCH 1A

**Before** (record the output in the commit):
```
POST /rest/v1/rpc/get_featured_critique?select=private_notes            -> expect 200, field present
POST /rest/v1/rpc/get_featured_critique?select=id,user_id,profiles!logs_user_id_fkey(username,role)
                                                                        -> expect the profile object
```

**Apply** — paste section 3's SQL in the Supabase SQL editor. **Never `db push`.**

**After** (all four must hold):
1. `?select=private_notes` → returns `null`, not a note.
2. The embed still returns `{username, role}` — **the Lead Story's author must survive.**
3. `?select=viewing_history` → `null`.
4. Open the app home screen: the Lead Story renders with author, avatar, rating,
   review, pull-quote, drop-cap and autopsy exactly as before.

**If any of the four fails**, paste the rollback in section 3 immediately.

**Then** commit the migration file to `mobile/supabase/migrations/` so the repo matches
the database — and note the three trees still disagree (batch 32).

---

## 7 · What this does NOT close

Stated so it is not mistaken for finished:

- **1A does not fix #26.** After 1A, the 34 notes are still readable at
  `GET /logs?select=private_notes` with the anon key. Only 1B closes that.
- The `year` column is `text` in this schema, not an integer. Unrelated, noted while
  verifying the projection.
- The three `supabase/` trees remain out of sync. Batch 32 owns that.
