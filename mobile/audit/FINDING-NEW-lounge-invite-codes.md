# CORRECTED — lounge exposure via `get_user_lounges`

**Status: the security claim in the first version of this document was WRONG.**
Found 2026-07-31; corrected the same day after the user pointed out that the invite
feature had been removed. Correcting rather than quietly editing, because the first
version called something a credential leak that is not one.

---

## What I claimed, and why it was wrong

I wrote that `invite_code` is *"the credential that bypasses the join-approval
flow"*, based on `src/stores/lounge.ts:246` matching on it.

**It confers nothing.** Traced properly:

| Step | Reality |
|---|---|
| `joinByInviteCode(code)` exists in the web store | **No UI calls it** — the feature was removed |
| It looks up a lounge id by code | That id is already public — lounge metadata is discoverable **by design** |
| It then calls `joinLounge(id)` | Which cannot self-insert (below) |
| Mobile | Has **no invite feature at all** — it carries the column through the store and displays it nowhere |

**Joining is gated independently of any code.** `20260627_01_lounge_overhaul.sql:84`
removed the open client INSERT with the comment *"Joins/requests go through SECURITY
DEFINER RPCs only (prevents self-inserting as 'approved' into a private room)."*
There is **no replacement INSERT policy on `lounge_members` anywhere**, and RLS is
enabled on it, so a client cannot insert a membership row at all. Mobile joins
through `join_public_lounge` / `request_lounge_membership`, which enforce approval.

So an exposed `invite_code` is **a dead string from a deleted feature**, not a key.

---

## What was actually true, and is now fixed

`get_user_lounges(p_user_id)` is `SECURITY DEFINER` (bypasses RLS) and contains a
dead filter:

```sql
WHERE TRUE OR mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id
```

`TRUE OR …` is unconditionally true, so it returned **every** lounge for any
caller-supplied id, to `anon`. Measured live: 5 lounges, 2 private, 3 with a
non-null `invite_code`.

**Severity, corrected:** this exposed *private lounge metadata* to anonymous
callers — names and descriptions of rooms — plus a vestigial string. Not a
credential leak. Still wrong, still worth closing, but not the severity I gave it.

**It also had ZERO callers** — no client, no SQL, no policy. `20260609_security_definer_hardening.sql:82`
even tried to drop it. Revoking `EXECUTE` from `PUBLIC` and `anon` therefore closed
it with no possible breakage. **Applied 2026-07-31, verified: 42501 permission denied.**

---

## The remaining table exposure — now LOW, not urgent

`20260627_01_lounge_overhaul.sql:70-71` replaced the lounge SELECT policy with
`USING (true)`, so `public.lounges` is fully readable, `invite_code` included.

The visibility is **intentional** (its own comment: *"metadata discoverable so
private rooms can be found + requested"*). And since the code confers nothing, what
leaks is a dead string.

**Recommendation, downgraded:** do not spend a web deploy and a column revoke on
this. Instead, at the launch build, **drop the `invite_code` column entirely** —
it belongs to a removed feature. That is cleaner than protecting data nobody should
be storing. It cannot be dropped before then: `mobile/src/stores/lounge.ts:317,323,328`
name the column explicitly, so dropping it would break the lounge list for every
TestFlight tester.

---

## Separate finding uncovered here — WEB JOIN IS BROKEN

`src/stores/lounge.ts:227-234` joins by inserting straight into `lounge_members`:

```ts
await supabase.from('lounge_members').insert([{ lounge_id: loungeId, user_id: user.id }])
```

RLS is enabled on that table and the overhaul **removed the only INSERT policy**, so
this insert is denied. The result is not awaited for an error, so it fails silently.

**Joining a lounge from the web app does not work.** Mobile is unaffected — it uses
the proper RPCs. This is a functional bug, not a security one, and it is not in the
124-finding register. Belongs to a web batch.

---

## Lesson

I called something a credential without tracing whether anything consumed it. The
grep showed a function matching on `invite_code`; I did not check that **no UI calls
that function**, nor that the join path is gated independently. Severity claims need
the same execution standard as fixes.
