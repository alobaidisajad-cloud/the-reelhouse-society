# BATCH 6 — #125 · #123 · Server-side entitlement enforcement

**Status: STUDIED. One read-only query outstanding before anything is written.**
Studied 2026-08-01 against `src/utils/tier.ts`, both codebases, and the live REST surface.
**Blocks batch 12.**

---

## 1 · The findings are CONFIRMED in principle — and both proposed the wrong fix

#123 is one instance of #125; treat them as one finding with several instances.

The claim — *paid features are gated in the client only* — is real. What neither
finding did was check the **triggers**, and both said so explicitly:

> "I examined policies, not triggers, and that must be settled before this is applied."

Both also flagged that their SQL needed diffing against `src/utils/tier.ts`
"line by line before it's written." **I have now done that diff, exhaustively.**

### The proposed SQL in both findings is wrong in three ways

Both proposed some form of:
```sql
p.role IN ('auteur','admin') OR p.tier = 'auteur' OR p.is_founding = true
```

Tested against a verbatim transcription of the shipped helpers across **all 432
combinations** of `tier` × `role` × `is_founding`:

| Case | The app grants | The findings' SQL grants | |
|---|---|---|---|
| `role = 'admin'` | **NO** | yes | ❌ grants admins a paid feature the app denies them |
| `tier = 'founding'` | **YES** | no | ❌ locks out a founding member |
| `tier = 'AUTEUR'` | **YES** | no | ❌ case-sensitive; the app lowercases |

`normalizeTier` maps anything outside `archivist|auteur|founding` to `cinephile`
(weight 0) — and `'admin'` is outside that set. `ReelHouseTier` is
`'cinephile' | 'archivist' | 'auteur' | 'founding'`; **there is no admin tier.**

### The predicate that IS exact — proven, not asserted

```sql
CREATE OR REPLACE FUNCTION public.tier_weight(t text)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE lower(coalesce(t, ''))
           WHEN 'archivist' THEN 1
           WHEN 'auteur'    THEN 2
           WHEN 'founding'  THEN 3
           ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.profile_tier_weight(
  p_tier text, p_role text, p_is_founding boolean)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT GREATEST(
    public.tier_weight(p_tier),
    public.tier_weight(CASE WHEN coalesce(p_is_founding,false)
                            THEN 'founding' ELSE p_role END));
$$;
```

`resolveTier`'s "highest watermark" rule is exactly `GREATEST` — it returns
`max(weight(tier), weight(is_founding ? 'founding' : role))`.

**432 / 432 cases agree. Zero disagreements.** Generator and comparison harness:
`scratchpad/tier_mirror.mjs` + `scratchpad/tier_sql.sql`.

---

## 2 · The findings cover 2 of 7 paid surfaces

The membership screen (`src/constants/membership.ts`) sells these. Every one is
gated in the client and needs checking server-side:

| # | Paid promise | Tier | Server object | In the findings? |
|---|---|---|---|---|
| 1 | Publish Essays to The Dispatch | Auteur | `dispatch_dossiers` INSERT | ✅ #123/#125 |
| 2 | The Lounge (chat rooms) | Archivist | `lounges` + `lounge_members` INSERT | ✅ #125 |
| 3 | The Physical Archive | Archivist | `physical_archive` INSERT | ❌ **no** |
| 4 | The Vault (Private Notes) | Archivist | `log_private_notes` INSERT | ❌ **no** |
| 5 | The Breakdown Engine (6-axis) | Auteur | `logs.autopsy`, `is_autopsied` | ❌ **no** |
| 6 | The Editorial Desk | Archivist | `logs.editorial_header`, `pull_quote`, `drop_cap` | ❌ **no** |
| 7 | Curatorial Control (alt posters) | Auteur | `logs.alt_poster` | ❌ **no** |

Purely cosmetic perks (Gilded Frame, Poster Glow, Gold Foil badge, Early Access)
are client-render only and correctly need no server rule.

**#4 is mine.** `log_private_notes` was created in batch 1 with owner-only policies
and **no tier predicate**, so a free member can write to The Vault via REST. That
gap was introduced by my own migration and is fixed here.

---

## 3 · A mechanism the findings missed — RLS cannot do #5, #6 or #7

**RLS is row-level. It cannot gate a column.** Surfaces 5–7 are paid *fields on a
free row* — any member may create a log; only a paying one may attach an autopsy,
an editorial header or an alternate poster. No policy can express that.

The only correct mechanism is a **BEFORE INSERT OR UPDATE trigger** on `logs` that
strips those fields when the writer is not entitled. Not a policy, not a grant
(column grants are per-role, and tier is per-row data, not a role).

Stripping is the right behaviour rather than raising: an unentitled write should
save the log without the paid extras, not fail. Raising would break the offline
queue, which replays writes it cannot re-gate.

---

## 4 · A second mechanism the findings missed — RLS will not stop the lounge join

#125 proposes a tier predicate on `lounge_members` INSERT. **The real join path
does not go through RLS at all.** Members join via `join_public_lounge` and
`request_lounge_membership`, both `SECURITY DEFINER` (confirmed in batch 5), and
`SECURITY DEFINER` bypasses RLS entirely.

So a policy on `lounge_members` would only block direct REST inserts — and batch 5
already established there is **no INSERT policy on `lounge_members` at all**, which
means direct inserts are already impossible. The finding quotes a policy
`"Users can join lounges"` that `20260627_01_lounge_overhaul.sql` removed.

**Therefore:** the lounge tier check belongs *inside* the two join RPCs, not in a
policy. This is the single most likely false-positive-shaped part of #125 and it is
settled by query result 1.

---

## 5 · The one thing still unknown — and it is exactly what both findings admitted

`audit/BATCH-6-QUERY.sql` — read-only, changes nothing. It returns:

1. **Every policy** on all six tables — confirms which of the quoted policies still
   exist (the finding quotes at least one that was deleted a month ago).
2. **Every trigger** on all six tables — *the gap both findings named.* If a trigger
   already enforces tier, part of this batch is a false positive and must not be
   "fixed" twice.
3. **Whether a tier helper already exists**, plus the real distribution of `tier`,
   `role` and `is_founding` values in production — so the predicate is validated
   against actual data, not assumed values.

**Nothing gets written before this comes back.** Every previous batch that trusted a
repo file over the live database found the file stale — five times, including
`replace_list_items` in batch 5, where the repo showed a vulnerable signature that
was not deployed.

---

## 6 · The shape of the fix, once the query settles the unknowns

**Design rules, each with a reason:**

- **INSERT-only, never SELECT or UPDATE.** A lapsed Auteur must keep the ability to
  read, edit and delete essays they already published; a lapsed Archivist must not
  be ejected from lounges they already belong to. Locking someone out of their own
  work is worse than the bypass.
- **One shared predicate**, not seven copies. Tier logic already exists three times
  client-side; duplicating it into seven SQL sites guarantees drift.
- **`IMMUTABLE`, not `SECURITY DEFINER`, for the weight helpers** — they read no
  tables. Only the wrapper that looks up `auth.uid()`'s profile needs DEFINER, and
  it needs `SET search_path`.
- **Strip, don't raise, for the paid log columns** — see §3.
- **The join RPCs get the check inside them** — see §4.

**Verification before applying, on a throwaway replica:** reproduce each of the
seven bypasses as a free member, apply, confirm each is refused, then confirm a
paying member and a *lapsed* member both still do everything they should.

**DONE WHEN** all seven bypasses are re-run against the live backend and refused,
and a lapsed member is proven to retain access to work they already created.
