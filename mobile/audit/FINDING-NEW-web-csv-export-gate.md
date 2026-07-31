# NEW FINDING (web) — CSV export checks the WRONG person's tier

**Found:** 2026-07-31, during the batch 5 grants audit.
**Not in the 124-finding register.** Web app only; mobile is unaffected.
**Severity: HIGH for the web app** — it exports another member's entire film history.

---

## The defect

`web/src/components/profile/ProjectorRoom.tsx:7-15`

```tsx
export function ProjectorRoom({ stats, user }: { stats: any; user: any }) {
    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'

    const downloadCsv = async () => {
        if (!isPremium) { window.location.href = '/join'; return reelToast(...) }
        // ... pages through ALL of `user.id`'s logs, 1000 at a time
        supabase.from('logs').select('*').eq('user_id', user.id)
```

`user` is **not the viewer**. It is `profileUser` — the profile being *looked at* —
passed down from `web/src/features/profile/components/ProfileContent.tsx:86`:

```tsx
<ProjectorRoom stats={cineStats} user={profileUser} />
```

So the paywall asks *"is the person whose profile I am viewing an Archivist?"*, and
the export then pulls **that person's** complete log archive.

**Consequence:** open any Archivist's or Auteur's profile → Projector Room tab →
Export CSV, and you download their entire viewing history. The viewer needs no tier
of their own. The gate is not merely bypassable; it is pointed at the wrong subject.

---

## Why it is not currently exploitable by a logged-out visitor

Batch 1B put `public.logs` under column-level grants for `anon`. Under a column-grant
regime `SELECT *` raises `42501` for the whole table. Verified live:

```
anon  GET /rest/v1/logs?select=*   ->  401 / 42501
```

The loop does `if (error || !data || data.length === 0) break`, so for a logged-out
visitor the export now silently produces an empty CSV.

**This was an accident, not a fix.** Batch 1B closed it for `anon` only. Any
**signed-in** member still holds table-level SELECT on `logs`, so the export works
exactly as described above for every authenticated user.

---

## Correct fix (web, at the next web deploy)

Two independent changes; do both:

1. **Gate on the viewer, not the subject.** `isPremium` must read the authenticated
   user from `useAuthStore`, and the export must additionally require
   `isOwnProfile`. Exporting another member's archive is not a premium feature — it
   is not a feature at all.
2. **Name the columns.** Replace `select('*')` with the explicit list the CSV
   actually writes. This is required regardless: `logs` is under column grants now,
   and `select('*')` is a latent 42501 for any role that ever loses a column.

Server-side, the real backstop is that a member should not be able to read another
member's full log rows in bulk at all. RLS permits it today because every profile is
public (`can_view_user_data` → true). That is the intended product behaviour for
*viewing*; bulk *export* is a different act and belongs behind ownership.

---

## Related

- The same `select('*')` hazard exists at `web/src/api/supabase.ts:55`
  (`fetchUserLogs`) — but that function has **zero callers**; it is dead code.
- `web/src/pages/AuthPage.tsx:105` and `web/src/pages/DebugPanel.tsx:34` do
  `select('*')` on `profiles`, which has been under column grants since
  `20260717_01`. Those calls **already fail** with 42501 today. `AuthPage` spreads
  the result (`{...profile}`), and spreading `null` is a no-op, so login degrades
  (profile fields missing from the store) rather than breaking outright.

See `supabase/migrations/20260731_07_batch5_rest_exposure.sql` for the full
column-grant invariants recorded for batch 32.
