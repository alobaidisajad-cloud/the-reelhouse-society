# BATCH 2 — THE LIVE SECURITY ITEMS. Deep study.

**Scope (from DEEP-VERIFY-131.md:85):** #26 · DESYNC · #84 · #48 · #36 · #67 · #78
(+ #32, which the master plan binds to #26: *"either alone leaves private notes reachable"*)

Every item below re-proven against the LIVE backend and shipped code this session.
Nothing trusted on its register note — that register has been wrong in both directions.

---

## 1 · ARE THEY REAL / INTENTIONAL?

**All 7 real. None intentional. Two are worse than filed.**

| # | verdict | proof |
|---|---|---|
| #26 | REAL · BLOCKING | anon `curl`, HTTP 200: `{"film_title":"The Shawshank Redemption","private_notes":"watched it in my darkest day "}` |
| #32 | REAL · BLOCKING | `get_featured_critique()` returns **30 columns incl. `private_notes`** to anon. SECURITY DEFINER → **ignores RLS, so #26's revoke does NOT close it** |
| DESYNC | REAL · **worse than filed** | a member has `preferences.social_visibility="private"`; `is_social_private=eq.true` returns **`[]`** — the enforcing column says public for EVERY account |
| #84 | REAL | live: `logs?select=username` → `42703 column does not exist`; same for `role` |
| #48 | REAL | live: `role=admin, tier=projectionist`; `normalizeTier` knows only archivist/auteur/founding → falls through to `cinephile`, weight **0** |
| #36 | REAL · **worse than filed** | `buildProfileUpdates:80` always sends `username`. Sanitiser strips `[^a-z0-9_]`. 5 live handles change — and `saleel.house → saleelhouse` **collides with the existing @saleelhouse** |
| #67 | REAL | `socialSlice.ts:61` guard `/^[a-zA-Z0-9_]{1,30}$/` → `null` → throw → permanent, unretryable failure. **Same 5 members** |
| #78 | REAL | `unfollowUser` contains **0** calls to `removeRequested`; `useProfileController.ts:249` routes cancel-request through it |

**Not intentional — proven, not assumed:**
- #26: three client layers try to hide `private_notes` (`PUBLIC_LOG_COLUMNS` omits it,
  `LogReviewBody` renders it `{isOwner && …}`, `LogForm` labels it *"Notes only you can see"*).
  And `profiles.email` IS column-revoked on the same DB — the technique is deployed, just not here.
- #48: `projectionist` is a **first-class legacy tier** — created by
  `20260325_projectionist_tier.sql`, granted lounge access at 4 RLS sites in
  `20260401_the_lounge.sql`. The DB knows the value; the client does not.
- #36/#67: `validateUsername` returns `valid:true` while silently rewriting the input —
  there is no "I changed this" signal in its return type at all.

## 2 · THE KEY STRUCTURAL FINDING

**#36 and #67 are ONE bug, not two.** The app holds three different opinions about
what a username may contain:
```
the DB              accepts  .  and  @      (5 live rows prove it)
validateUsername    STRIPS   .  and  @      -> silent rename on any profile save
socialSlice guard   REJECTS  .  and  @      -> those members cannot be followed
```
Fixing either alone leaves the contradiction. This is why the master plan groups them
(cluster 7 · Identity) — **one decision about what a handle may be**, applied at all
three sites plus a back-fill for the 5 stranded rows.

Same shape for #26+#32: two doors to one room. Either alone leaves it reachable.

## 3 · ZERO-SIDE-EFFECT ANALYSIS

- **#26 Stage 1** (`REVOKE SELECT (private_notes) ON public.logs FROM anon`) — confirmed
  zero-risk across BOTH clients: every anon-reachable read in mobile and web uses an
  explicit column list omitting `private_notes`. The one `select('*')` that would break
  (`ProjectorRoom.tsx:28`) is already leaking and must be fixed first regardless.
  `src/api/supabase.ts:59 getUserLogs` also selects `*` but has **zero callers**.
- **#32** — must change the RPC's projection, not just grants; SECURITY DEFINER ignores them.
- **#48** — `normalizeTier` learning `projectionist` is additive. ⚠️ **Ordering constraint:**
  29 of 32 rows have `tier: NULL`, so the `tier` back-fill must land BEFORE anything starts
  reading `tier` in preference to `role`, or badges blank for 29 members.
- **#36** — the fix must NOT retroactively rename. Send `username` only when it changed,
  and resolve the `saleelhouse` collision by hand before any back-fill.
- **#67** — widening the guard to match the DB is strictly permissive: it can only allow
  follows that currently fail.
- **#78** — adding the missing `removeRequested` call to `unfollowUser` mirrors what
  `followUser` already does at `:135`/`:179`.

## 4 · ARE WE DOING THE RIGHT THING?

Yes — and the ORDER is the decision, not the fixes:
1. **#26 + #32 together** (SQL + RPC). Private data is leaking *right now*.
2. **DESYNC** — one member is publicly visible against their stated setting.
3. **#84** — SQL/client, a dead search tab.
4. **#48** — back-fill FIRST, then the client change.
5. **#36 + #67 + the back-fill** — one identity decision, applied at three sites.
6. **#78** — smallest, purely additive.

**Two are pure SQL (no app build). The rest ship in one build.**
