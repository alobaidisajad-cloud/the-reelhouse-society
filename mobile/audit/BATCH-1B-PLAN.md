# BATCH 1B — #26 · Separate the private notes

**Status: PLANNED, NOT EXECUTED.** Tier C. Ships **before launch**, with 1A.
Planned 2026-07-31 against the live database and a local replica.

**1A closes the RPC leak. 1B closes the table leak.** Neither is optional; both ship
before launch. 1B is cheap *now* only because mobile has not shipped to either store —
no installed base to force-update, and the web app deploys instantly. After launch this
same fix needs a forced update on both stores.

---

## 1 · What is actually wrong

`logs.private_notes` sits on a row that anonymous callers are allowed to read. RLS is
row-level; **it has no column dimension**, so there is no policy that can say "this
column, owner only". Proven live: `GET /logs?select=private_notes` returns 200 to anon.

Proven inexpressible as a grant, too: the baseline carries `GRANT ALL ON TABLE
public.logs TO anon`, and Postgres will not subtract a column from a table-wide grant.
Revoking would also break `MarqueeBoard.tsx:19` and `FilmHero.tsx:43`, which run
`select('*')` on `logs` for logged-out visitors (verified: anon `select=*` → 200).

**The only structure that expresses "owner only" is a separate row.** Hence a table.

Second reason, independently sufficient: **the premium gate has no server-side backing.**
`private_notes` appears exactly twice in the production schema — the column and one
materialized-view filter. No trigger, no constraint, no tier policy.
`useLogFlow.ts:133` (`isPremium ? notes : null`, where `isPremium = isArchivistPlusTier`)
is the *only* thing stopping a non-paying member from writing notes. A table with an RLS
`WITH CHECK` fixes that in the same move.

---

## 2 · ⚠️ Two collisions proven on a replica — Phase 4 fails without them

**(a) The column cannot simply be dropped.**
```
ERROR: cannot drop column private_notes of table logs because other objects depend on it
DETAIL: materialized view global_feed_materialized depends on column private_notes
HINT:  Use DROP ... CASCADE to drop the dependent objects too.
```
**Do not take the hint.** `CASCADE` would destroy `global_feed_materialized` — your
global feed — silently.

**(b) Dropping the column breaks 1A.**
```
ERROR: structure of query does not match function result type
DETAIL: Number of returned columns (5) does not match expected column count (4).
```
1A gives `get_featured_critique` an explicit 27-column projection. Remove a column from
`logs` and it must become 26, or the Lead Story disappears.

Both are sequenced into Phase 4 below.

---

## 3 · PHASE 1 · The table (additive — nothing can break)

Nothing reads it yet; `logs.private_notes` stays authoritative. Fully reversible.

```sql
-- Server-side tier gate. Mirrors resolveTier()'s "highest watermark" rule:
-- the greater of profiles.tier and (is_founding ? 'founding' : profiles.role).
CREATE OR REPLACE FUNCTION public.is_archivist_plus(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT GREATEST(
      CASE lower(COALESCE(p.tier,''))
        WHEN 'founding' THEN 3 WHEN 'auteur' THEN 2 WHEN 'archivist' THEN 1 ELSE 0 END,
      CASE WHEN p.is_founding IS TRUE THEN 3
           ELSE CASE lower(COALESCE(p.role,''))
                  WHEN 'founding' THEN 3 WHEN 'auteur' THEN 2
                  WHEN 'archivist' THEN 1 ELSE 0 END
      END
    ) >= 1
    FROM public.profiles p WHERE p.id = p_user
  ), false);
$$;

CREATE TABLE public.log_private_notes (
  log_id     uuid PRIMARY KEY REFERENCES public.logs(id)     ON DELETE CASCADE,
  user_id    uuid NOT NULL    REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes      text NOT NULL CHECK (length(notes) <= 1000),   -- mirrors LogForm maxLength={1000}
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX log_private_notes_user_idx ON public.log_private_notes (user_id);

ALTER TABLE public.log_private_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY lpn_select ON public.log_private_notes
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY lpn_insert ON public.log_private_notes
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_archivist_plus(auth.uid()));
CREATE POLICY lpn_update ON public.log_private_notes
  FOR UPDATE USING (user_id = auth.uid())
         WITH CHECK (user_id = auth.uid() AND public.is_archivist_plus(auth.uid()));
CREATE POLICY lpn_delete ON public.log_private_notes
  FOR DELETE USING (user_id = auth.uid());

-- anon gets NOTHING. This is the whole point.
REVOKE ALL ON public.log_private_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_private_notes TO authenticated;

-- Backfill. Only non-empty notes: 34 rows are non-null, exactly 1 has content.
INSERT INTO public.log_private_notes (log_id, user_id, notes, updated_at)
SELECT l.id, l.user_id, l.private_notes, COALESCE(l.updated_at, now())
FROM public.logs l
WHERE l.private_notes IS NOT NULL AND l.private_notes <> ''
ON CONFLICT (log_id) DO NOTHING;
```

### Phase 1 was executed on a replica — every property proven

Built with a stub `auth.uid()`, real `anon`/`authenticated` roles, an archivist, a
cinephile, one real note, one empty string and one NULL:

| Test | Result |
|---|---|
| backfill row count | **1** — the empty string and the NULL correctly skipped |
| tier gate: archivist / cinephile / founding-via-`is_founding` | **true / false / true** |
| owner reads own note | **"REAL NOTE"** |
| **another member reads it** | **0 rows** |
| **anonymous reads it** | **permission denied for table log_private_notes** |
| non-archivist writes own note | **blocked — RLS violation** |
| member forges a row owned by someone else | **blocked — RLS violation** |
| 1001-character note | **blocked — CHECK constraint** |
| deleting a log | **its note is cascade-deleted** |

**Verify the same on production after applying:**
`SELECT count(*) FROM public.log_private_notes;` → **1**, and as anon
`GET /rest/v1/log_private_notes?select=log_id` → must be **401/403/404, never 200**.

**Rollback:**
```sql
DROP TABLE IF EXISTS public.log_private_notes;
DROP FUNCTION IF EXISTS public.is_archivist_plus(uuid);
```

---

## 4 · PHASE 2 · The clients — 9 files, ~20 edit points

I previously said "6 mobile, 4 web". That counted **files**, not edits. Accurately:

### The design — one query, not two. Proven.

The note rides in the **same request** as an embed, so no extra round trip and no
loading race. RLS on `log_private_notes` means a non-owner's embed simply comes back
empty — the server, not the client, decides.

**Proven live** that PostgREST does child-table embeds when the FK exists:
`GET /lists?select=id,list_items(film_id)` → **200 with data**. (The `logs → log_comments`
equivalent fails `PGRST200` only because that FK is missing — which is finding #43,
unrelated.) Phase 1 creates `log_private_notes.log_id` as a real FK to `logs(id)`, so the
relationship PostgREST needs will exist.

Because `log_id` is the **primary key**, PostgREST treats it as to-one and returns an
object; older versions return a one-element array. Handle both — the codebase already
uses that idiom for `profiles` in `FeaturedCritique.tsx:51`.

**One shared helper, added to `utils/mappers.ts`, used by every read site:**

```ts
/** log_private_notes rides along as an embed; PostgREST may hand back an
 *  object (to-one) or a one-element array. RLS guarantees it is only ever
 *  the caller's own note — a non-owner receives nothing at all. */
export function extractPrivateNotes(embed: unknown): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return (row as { notes?: string | null } | undefined)?.notes ?? null;
}
```

**And one shared writer** (mobile `services/LogService.ts`, web `stores/films.ts`):

```ts
/** Upsert on content, delete on empty — an empty note must not leave a row behind. */
export async function savePrivateNotes(logId: string, userId: string, notes: string | null) {
  const trimmed = notes?.trim() || null;
  if (!trimmed) {
    await supabase.from('log_private_notes').delete().eq('log_id', logId);
    return;
  }
  await supabase.from('log_private_notes')
    .upsert({ log_id: logId, user_id: userId, notes: trimmed, updated_at: new Date().toISOString() },
            { onConflict: 'log_id' });
}
```

The premium gate is now enforced server-side by `lpn_insert`/`lpn_update`, so a
non-archivist's write is rejected by the database rather than by a client `if`.

### Tests that must FAIL before any of these edits

Per the batch rule, each is written first and must fail against today's code:

1. `mapLogRow` returns `privateNotes` from the **embed**, not from `private_notes`.
2. `extractPrivateNotes` handles object, one-element array, `[]`, `null`, `undefined`.
3. `savePrivateNotes` **deletes** when the note is empty or whitespace, upserts otherwise.
4. `LOG_SELECT_COLUMNS` no longer contains the string `private_notes`.
5. A non-owner's mapped log has `privateNotes === null` given an empty embed.

Then mutation-verify: break `extractPrivateNotes` to always return `null` and confirm
test 1 fails; make `savePrivateNotes` skip the delete and confirm test 3 fails.


### Mobile (6 files, 11 edits)
| File | Edit |
|---|---|
| `utils/mappers.ts:183` | `…, private_notes, …` → `…, log_private_notes(notes), …` in `LOG_SELECT_COLUMNS`. **Do not touch `PUBLIC_LOG_COLUMNS`** — it must stay embed-free so a non-owner's query never even asks. |
| `utils/mappers.ts:204` | `privateNotes: dbLog.private_notes ?? null` → `privateNotes: extractPrivateNotes((dbLog as { log_private_notes?: unknown }).log_private_notes)` |
| `utils/mappers.ts:153` | `LogRow`: replace `private_notes?: string \| null` with `log_private_notes?: { notes: string \| null } \| { notes: string \| null }[] \| null` |
| `stores/domain/logSlice/helpers/logOperations.ts:255` | remove from the insert payload; upsert to `log_private_notes` after the log insert returns its id |
| `…/logOperations.ts:401` | remove `private_notes: null` |
| `utils/mutationExecutor.ts:75` | archived-entry read → from the new table |
| `utils/mutationExecutor.ts:124` | remove from `dbPayload`; separate upsert |
| `services/LogService.ts:153` | the multi-device sync read → `from('log_private_notes').select('notes').eq('log_id', logId)` |
| `app/log/[id].tsx:193` | remove from the write payload |
| `app/log/[id].tsx:600` | `privateNotes` from an owner-scoped fetch of the new table |
| `hooks/useLogFlow.ts:133` | **keep** the client gate — defence in depth now that the server enforces it |
| `features/archive/archiveImport.ts:1499` | import writes → new table |

### Web (3 files, 9 edits)
| File | Edit |
|---|---|
| `stores/films.ts:315` | drop `private_notes` from the select; fetch own notes separately |
| `stores/films.ts:562` | insert → new table |
| `stores/films.ts:676` | update → new table |
| `features/film/hooks/useFilmMutations.ts:138` · `:165` | inserts → new table |
| `…/useFilmMutations.ts:198` | mapping |
| `…/useFilmMutations.ts:266` | update |
| `components/profile/ProjectorRoom.tsx:27` | `select('*')` no longer returns notes |
| `…/ProjectorRoom.tsx:51` | CSV export — join the new table so the export still contains notes |

**Order:** web first (deploys instantly, verifiable in minutes), mobile second (rides the
launch build). During this window `logs.private_notes` is stale but still present —
nothing breaks either way.

**Do not skip `ProjectorRoom`.** It is a data export; silently dropping a column from a
member's own export is data loss from their point of view.

---

## 5 · PHASE 3 · Close the leak (reversible)

Once **both** clients are deployed and verified:

```sql
UPDATE public.logs SET private_notes = NULL WHERE private_notes IS NOT NULL;
```

The leak is closed here — anon can still name the column, but every value is `NULL`.
**Reversible**, because the data lives in `log_private_notes`:

```sql
UPDATE public.logs l SET private_notes = n.notes
FROM public.log_private_notes n WHERE n.log_id = l.id;
```

**Verify as anon:** `GET /logs?select=private_notes&private_notes=not.is.null` → **0 rows**.

---

## 6 · PHASE 4 · Drop the column — in this exact order

Any other order fails. Both failures are proven above.

**4.1 — Redefine the materialized view first.** Capture its unique index name before
dropping (needed for `REFRESH … CONCURRENTLY`).

The current filter `l.private_notes IS NULL` excludes logs-with-notes from the global
feed. Preserve that meaning against the new table:

```sql
DROP MATERIALIZED VIEW public.global_feed_materialized;
CREATE MATERIALIZED VIEW public.global_feed_materialized AS
  SELECT l.id, l.user_id, p.username, p.avatar_url, p.role AS user_tier,
         l.film_id, l.film_title, l.poster_path, l.year, l.rating, l.review,
         l.status, l.watched_date, l.is_spoiler, l.created_at,
         count(i.id) FILTER (WHERE i.type = 'endorse_log') AS endorse_count
  FROM public.logs l
  LEFT JOIN public.profiles p     ON l.user_id = p.id
  LEFT JOIN public.interactions i ON l.id = i.target_log_id
  WHERE l.status <> 'abandoned'
    AND p.is_social_private = false
    AND NOT EXISTS (SELECT 1 FROM public.log_private_notes n WHERE n.log_id = l.id)
  GROUP BY l.id, p.id
  ORDER BY l.created_at DESC;
-- recreate the unique index captured above, then REFRESH.
```
⚠️ **Product question, not a technical one:** should the global feed still hide logs that
have private notes? That rule predates the separation and may no longer be intended.
**Preserve it unless you say otherwise** — do not change behaviour silently.

**4.2 — Update `get_featured_critique` to 26 columns.** Take the 1A definition and delete
the `NULL::text` at position 15. Without this the Lead Story disappears.

**4.3 — Drop the column.**
```sql
ALTER TABLE public.logs DROP COLUMN private_notes;   -- never CASCADE
```

### ⚠️ 4.1–4.3 must run inside ONE transaction — proven

`refresh_global_feed()` is on a **pg_cron schedule firing every minute**
(`REFRESH MATERIALIZED VIEW CONCURRENTLY`). Between dropping the view and recreating its
unique index, that job would error — and `CONCURRENTLY` is impossible without the unique
index. Wrapping all three steps in `BEGIN … COMMIT` means cron simply waits on the lock
and never observes a missing or index-less view.

**The whole sequence was executed on a replica** carrying the real view, its unique index
`idx_global_feed_mat_id`, `refresh_global_feed()`, and the 1A function:

| After the transaction | Result |
|---|---|
| feed row count (semantics preserved) | **unchanged** — the log with a note is still excluded, now via `NOT EXISTS` |
| `refresh_global_feed()` — `REFRESH … CONCURRENTLY` | **OK** |
| `get_featured_critique()` at 26 columns | **works** |
| `private_notes` column | **gone** |
| the note itself | **preserved in `log_private_notes`** |

**Verify after 4.3:**
1. `POST /rpc/get_featured_critique?select=id,user_id,profiles!logs_user_id_fkey(username,role)` → profile present.
2. Home screen: Lead Story renders.
3. `GET /global_feed_materialized?select=id&limit=1` → 200, feed intact.
4. `GET /logs?select=private_notes` → **400, column absent**.
5. Log a film with a private note, reopen it — the note is there.

---

## 7 · Risks, stated

- **Phase 4.3 is irreversible for the column.** The data lives in `log_private_notes`
  first, verified in Phase 1 and again before 4.3. Take a snapshot regardless.
- **A stale mobile build writing to `logs.private_notes`** would silently lose notes after
  4.3. Not a risk today — mobile has not shipped. It becomes one the day it does, which is
  the argument for doing this before launch, not after.
- **`is_archivist_plus` is `SECURITY DEFINER`** and reads `profiles`. It takes `p_user`
  and is called with `auth.uid()`, so it cannot be used to probe another member's tier
  in a way they could not already observe. Add `SET search_path` — done above.
- **A non-premium member who already has notes** keeps them readable (SELECT is not
  tier-gated) but cannot write new ones. That matches the current client behaviour.
- Production is PG 17.6; replica proofs ran on 18.4. The behaviours exercised
  (dependency refusal on `DROP COLUMN`, composite return-type arity) are unchanged
  across those versions.

---

## 8 · Order of execution

1. **1A** — `get_featured_critique` projection. Minutes. Independent.
2. **1B Phase 1** — table, RLS, backfill. Additive, reversible.
3. **1B Phase 2** — web deploy, then mobile in the launch build.
4. **1B Phase 3** — `NULL` the column. Leak closed. Reversible.
5. **1B Phase 4** — matview → function → drop column, in that order.

Phases 1–3 close the leak. Phase 4 is cleanup and may follow the launch build, provided
Phase 3 has run.
