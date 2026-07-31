# NEW FINDING — Private lounge invite codes are readable by anyone

**Not in the 124-finding register.** Found 2026-07-31 while sweeping for the same
flaw class as #23 (SECURITY DEFINER functions trusting a caller-supplied identity).
Verified live against production.

---

## What an invite code is

`src/stores/lounge.ts:246` joins a private lounge by matching one:

```ts
.eq('invite_code', code.toUpperCase())
```

It is generated only for private lounges (`lounge.ts:194`,
`invite_code = isPrivate ? generateInviteCode() : null`). **It is the credential
that bypasses the join-approval flow.** Anyone holding it can enter a private room.

## The exposure, measured live as an anonymous caller

| | |
|---|---|
| Lounges returned | **5** |
| **Private lounges included** | **2** |
| **Rows with a non-null `invite_code`** | **3** |
| Lounges the named member is not in | 5 |

Reproduced through **two independent paths**. Values were never printed.

---

## PATH A — the table itself

`supabase/migrations/20260627_01_lounge_overhaul.sql:70-71`:

```sql
-- lounges: metadata discoverable (so private rooms can be found + requested).
DROP POLICY IF EXISTS "Anyone can view lounges" ON public.lounges;
CREATE POLICY "Lounges are discoverable" ON public.lounges FOR SELECT USING (true);
```

The previous policy correctly hid private lounges from non-members. It was dropped
and replaced with `USING (true)`.

**The visibility itself is intentional** — the comment says so, and the product
wants private rooms to be findable so they can be requested. **The defect is that
`invite_code` lives in the same table and therefore rides along.** RLS is
row-level; it cannot hide one column. Same shape as `private_notes` in batch 1.

`GRANT ALL ON TABLE public.lounges TO anon` is in the baseline, so anon reads every
column.

## PATH B — `get_user_lounges(p_user_id)`

`SECURITY DEFINER`, so it bypasses RLS entirely, and it contains a dead filter:

```sql
WHERE TRUE OR mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id
```

`TRUE OR …` is unconditionally true. The function returns **every** lounge —
private ones and their invite codes — for any caller-supplied id, to `anon`.

**It has ZERO callers.** No client (`rpc('get_user_lounges')` appears nowhere in
mobile or web), no SQL, no policy. `LoungeService.getUserLounges` has a similar
name but queries `lounge_members` directly and never touches this function.
`20260609_security_definer_hardening.sql:82` even contains
`DROP FUNCTION IF EXISTS get_user_lounges(uuid)` — yet it is live today.

---

## Who actually needs `invite_code`

| Consumer | Needs it? |
|---|---|
| **Mobile** | **No.** `stores/lounge.ts` selects it into the store, but it is displayed **nowhere** — no hit in any screen or component. |
| **Web** | **Yes**, for members: `LoungeRoomPage.tsx:301-315` shows it when `isPrivate && lounge.invite_code`, with copy-to-clipboard at `:224`. |
| **Web queries** | Use `select('*')` (`stores/lounge.ts:115,168,280`), and `/lounge` has **no auth guard**. |

---

## The fix, staged by what each step costs

### STEP 1 — now, pure SQL, zero client impact
Revoke `EXECUTE` on `get_user_lounges` from `PUBLIC` **and** `anon`. It is dead
code; nothing can break. **Closes Path B completely, for everyone.**

⚠️ Both revokes are required — Postgres grants `EXECUTE` to `PUBLIC` by default, so
revoking from `anon` alone is silently useless. Proven on a replica in batch 2.

### STEP 2 — needs a web deploy first
Revoking the `invite_code` **column** from `anon` closes Path A's internet-facing
half. But the web's `select('*')` would then 403 for logged-out visitors — exactly
the trap batch 1 hit with the film pages. So first: change the web's lounge list
queries to explicit columns that omit `invite_code`, keeping it only where the
member is in the room. Web deploys instantly.

### STEP 3 — launch build
Revoke the column from `authenticated` too, so one member cannot read another's
code. Mobile must first stop selecting `invite_code` — which costs nothing,
because it never displays it. Cannot ship before the launch build
(see the TestFlight freeze).

**After steps 1 and 2 the public key can no longer harvest invite codes. Step 3
closes member-to-member.**

---

## Not yet examined

`get_user_analytics(p_user_id)` also answers anonymously with data and is
`SECURITY DEFINER`. It returns log counts, average rating and a rating
distribution — plausibly public profile data, but **I have not finished checking
what else it exposes.** It is not part of this finding and must not be assumed
safe.
