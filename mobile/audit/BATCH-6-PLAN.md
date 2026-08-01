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

## 5b · NOT a blocker — corrected. One question to confirm, then it is settled.

**I first wrote this section as a blocker. That was wrong, and the owner corrected
it.** The intended state is: every member is a cinephile except `@morpho`, who is an
auteur. The table below shows the app produces exactly that. Nothing is broken.

What the stored values do is *display* correctly by accident rather than by design —
`tier = 'projectionist'` is a word neither client recognises, so it falls through
`normalizeTier` to `cinephile`. The rank shown in the app is CINEPHILE, which is
right. The value in the column is misleading, which is worth cleaning up but changes
no behaviour.

**SETTLED 2026-08-01 — the owner stays on the lowest tier, deliberately.** He runs
the free tier on purpose so he experiences what a free member experiences, and will
ask for a temporary upgrade when he wants to exercise a paid tier. So enforcement
refusing his account the paid features is the CORRECT and INTENDED outcome, not a
regression. **No change to his row. Do not "fix" it.**

The consequence to remember when testing: after this lands, verifying a paid feature
end-to-end requires temporarily raising a test account's tier — the owner's own
account will correctly be refused.

`role = 'admin'` carrying no entitlement is likewise correct-by-default: admin is a
moderation role, not a subscription. Worth stating explicitly in the ledger so a
future reader does not "fix" it.



Read live from production, 2026-08-01:

| account | `tier` | `role` | `is_founding` | what the app's own rule grants |
|---|---|---|---|---|
| `@morpho` | `null` | `auteur` | false | **auteur** |
| `@sajjadobaidi` | `projectionist` | `admin` | false | **FREE** |
| `@malal`, `@malal1` | `free` | `cinephile` | false | free |

`@sajjadobaidi` is the owner. `normalizeTier('projectionist')` → not in
`archivist|auteur|founding` → `cinephile`, weight 0. `role = 'admin'` → also
weight 0, because `ReelHouseTier` has no admin member. **The app already treats the
owner as a free member**, so the Lounge icon is hidden from him and
`compose.tsx` bounces him today. That is a live product bug, independent of this batch.

Right now it only costs him the UI. **The moment tier is enforced in the database,
it costs him the features themselves** — no dossiers, no lounges, no physical
archive, no vault, no autopsy, no editorial fields. It would read as "the fix broke
the app."

`'projectionist'` appears nowhere in either client except flavour text. It is an
orphan value — precisely finding **#48** ("unknown tier values downgrade silently"),
which lives in **batch 12**. So batch 6 and batch 12 are entangled in the opposite
direction to what the plan assumed: batch 12 is listed as *requiring* batch 6, but
enforcing tier before the admin/unknown-value question is settled would lock out the
one account that must never be locked out.

**This must be decided before any policy is written, and decided in BOTH places at
once** — the SQL predicate and `src/utils/tier.ts` — or they diverge, which is the
exact failure §1 proves the filed fix would have caused.

Three options, and this is a product decision, not a technical one:

1. **Admin means full access.** Add `admin` to the client's weight map at the top
   (weight 3) and mirror it in SQL. Most platforms work this way, and it makes the
   owner's account behave as expected everywhere. One client change, shipped in the
   launch build; the SQL matches it from day one.
2. **Give the owner a real tier.** Set `is_founding = true` (or `tier = 'auteur'`)
   on that one row. Zero code change, works immediately, and `is_founding` already
   maps to weight 3. But it leaves `role = 'admin'` meaningless for entitlement and
   the next admin hits the same wall.
3. **Keep admin as free.** Defensible — admin is a moderation role, not a
   subscription — but then the owner needs a paid tier by some other route, and
   option 2 is that route anyway.

**Recommendation: 1 and 2 together.** Option 2 unblocks batch 6 today with a
one-row update; option 1 fixes the class so the next admin is not surprised. They do
not conflict.

**Also to settle:** `tier = 'projectionist'` should be cleaned up or given a
meaning. Leaving an unrecognised value in the column is what made this invisible.

---

## 5c · THE DECISIVE MECHANISM — both findings' fix would have done NOTHING

Live policy read, 2026-08-01, confirms the shape on `dispatch_dossiers`:

```
Users can manage their dossiers.   ALL     USING (auth.uid() = user_id)   WITH CHECK: null
ban_block_dossiers_insert          INSERT                                 WITH CHECK: is_user_not_banned()
```

A `FOR ALL` policy with no `WITH CHECK` uses its `USING` expression as the insert
check — so `auth.uid() = user_id` already permits every insert.

**Permissive policies combine with OR.** Both findings propose *adding a new INSERT
policy* carrying a tier predicate. A new policy is PERMISSIVE by default, so it
would be OR'd with `auth.uid() = user_id` — which is always true for the attacker,
since they insert their own row. **The tier check would never block anything.**

Proven on a replica by reproducing the exact production shape and adding a second
INSERT policy of `WITH CHECK (false)` — a gate that can only ever say no:

```
permissive  WITH CHECK (false)  ->  INSERT 0 1     the gate is ignored entirely
restrictive WITH CHECK (false)  ->  ERROR: new row violates row-level security
```

So the fix must be **`AS RESTRICTIVE`**, or it must modify the existing policy.
Adding a permissive policy would leave the bypass fully open while appearing fixed —
the worst possible outcome, because it would close the finding on paper.

### The same mechanism casts doubt on two policies that already exist

If `ban_block_dossiers_insert`, `ban_block_logs_insert` and `logs_insert_rate_limit`
are PERMISSIVE, they are being OR'd with plain ownership checks
(`Users can manage their logs.` / `Users can insert their own logs`) and are
therefore **inert** — a banned member could still insert, and the 200-logs-per-day
rate limit would never trigger.

That is finding **#80** (batch 7, ban enforcement) arriving early, plus a
rate-limit concern not in the register at all. Settled by one column:
`pg_policy.polpermissive`, which the first query did not select.

---

## 5d · TRIGGERS READ — the gap both findings named is now CLOSED

Live trigger read, 2026-08-01, across all six tables:

| table | triggers |
|---|---|
| `dispatch_dossiers` | **none** |
| `lounges` | **none** |
| `physical_archive` | **none** |
| `log_private_notes` | **none** |
| `logs` | `set_logs_updated_at` (timestamps), `trg_divert_private_notes` (batch 1) |
| `lounge_members` | `tr_protect_lounge_member_status` (host check), `tr_recount_lounge_members` (counter) |

**Not one of them enforces tier.** Both #123 and #125 ended by saying this had to be
settled before they could be called confirmed. It is settled: **nothing already
enforces this, so neither finding is a false positive.**

### But one of those triggers changes how The Vault must be fixed

`trg_divert_private_notes` is mine, from batch 1. It is `SECURITY DEFINER`, so when
it writes to `log_private_notes` it **bypasses that table's RLS entirely**. The real
path for a private note is:

```
client writes logs.private_notes
  -> trg_divert_private_notes (SECURITY DEFINER)
    -> INSERT INTO log_private_notes     <-- RLS not consulted
```

So a tier policy on `log_private_notes` would only stop a *direct* REST insert, not
the path the app actually uses. **The Vault's tier check must live inside
`divert_private_notes()`.** A policy alone would be theatre — the same trap as §5c,
by a different route.

### Existing policy kinds — checked in the migrations that created them

- `ban_block_logs_insert` / `_update`, `ban_block_dossiers_insert` / `_update` were
  all created **`AS RESTRICTIVE`** (`20260621_ban_enforcement_rls.sql`). Ban
  enforcement therefore works. Good news for batch 7 (#80).
- `logs_insert_rate_limit` was created **without** `AS RESTRICTIVE`
  (`20260325_rate_limiting.sql:50`). It is permissive, so it is OR'd with
  `Users can insert their own logs` (`auth.uid() = user_id`) and reduces to:

  ```
  ((uid = user_id) OR (uid = user_id) OR (uid = user_id AND rate_ok)) AND (not_banned)
  = (uid = user_id) AND (not_banned)
  ```

  **The 200-logs-per-day rate limit is inert. It has never blocked anything.**
  Not in the register. Filed as a new finding; fixing it is a one-word change
  (`AS RESTRICTIVE`) but belongs to its own batch, since it changes throttling
  behaviour for real members and deserves its own before/after.

---

## 6 · The fix — complete, with every mechanism settled

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

---

## 7 · The exact fix, surface by surface

Three mechanisms, because three different things are being protected. Each was
forced by evidence, not chosen for elegance.

### 7.1 · The predicate (shared by everything)

```sql
tier_weight(t)            -- IMMUTABLE. archivist 1, auteur 2, founding 3, else 0, lower()
profile_tier_weight(...)  -- IMMUTABLE. GREATEST(weight(tier), weight(founding?'founding':role))
has_tier_at_least(n int)  -- STABLE SECURITY DEFINER, search_path pinned.
                          -- reads auth.uid()'s profile row, returns weight >= n
```

`has_tier_at_least` must be `SECURITY DEFINER` because a policy on `logs` that reads
`profiles` would otherwise recurse into `profiles`' own RLS. `STABLE` (not
`IMMUTABLE`) because it reads a table. The two weight helpers stay `IMMUTABLE` — they
read nothing — so they can be indexed later if needed.

### 7.2 · RESTRICTIVE policies — 3 surfaces

Restrictive, never permissive, per §5c. Insert-only, so lapsed members keep their work.

| surface | policy |
|---|---|
| `dispatch_dossiers` | `AS RESTRICTIVE FOR INSERT WITH CHECK (has_tier_at_least(2))` |
| `lounges` | `AS RESTRICTIVE FOR INSERT WITH CHECK (has_tier_at_least(1))` |
| `physical_archive` | `AS RESTRICTIVE FOR INSERT WITH CHECK (has_tier_at_least(1))` |

Nothing is added to SELECT, UPDATE or DELETE anywhere. A lapsed Auteur keeps editing
and deleting essays; a lapsed Archivist keeps reading and pruning their archive.

### 7.3 · Inside the two join RPCs — 1 surface

`lounge_members` has no INSERT policy, and both join paths are `SECURITY DEFINER`,
so RLS cannot reach them (§5c). The check goes in the function body:

```sql
IF NOT public.has_tier_at_least(1) THEN
  RAISE EXCEPTION 'The Lounge is an Archivist feature';
END IF;
```

added to `join_public_lounge` and `request_lounge_membership`, after their existing
`auth.uid() IS NULL` guard. **Not** added to `approve_lounge_member` — a host
admitting someone must still work, and the person being admitted already had to
request, which is now gated.

### 7.4 · Inside `divert_private_notes()` — 1 surface

The Vault. Per §5d, the trigger bypasses RLS, so the check belongs in the trigger.
It **strips rather than raises** — an unentitled write saves the log without the
note, instead of failing the whole log write.

### 7.5 · A BEFORE trigger on `logs` — 2 surfaces, 6 columns

RLS cannot gate a column (§3). A `BEFORE INSERT OR UPDATE` trigger reverts paid
fields written by an unentitled member:

| column | required |
|---|---|
| `autopsy`, `is_autopsied` | auteur (2) |
| `alt_poster` | auteur (2) |
| `editorial_header`, `pull_quote`, `drop_cap` | archivist (1) |

**Revert to OLD, never blank to NULL.** The rule is
`IF NEW.col IS DISTINCT FROM OLD.col AND NOT entitled THEN NEW.col := OLD.col`.
On INSERT `OLD` is NULL, so the field is stripped. On UPDATE, a lapsed Auteur editing
the *text* of an essay that already carries an autopsy keeps that autopsy — only an
attempt to *change* it is reverted. Blanking to NULL would destroy work a member
made while they were paying, which is the outcome §6 exists to prevent.

Strip rather than raise, because the offline queue replays writes it cannot re-gate;
a raise there would wedge the queue.

### 7.6 · Deliberately NOT done here

- `logs_insert_rate_limit` being inert (§5d) — real, but it changes throttling for
  every member and deserves its own before/after. Filed, not bundled.
- The cosmetic perks (Gilded Frame, Poster Glow, Gold Foil badge) — client-render
  only, nothing to enforce.
- The owner's own tier — settled in §5b, deliberately unchanged.
