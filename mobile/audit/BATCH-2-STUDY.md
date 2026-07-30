# BATCH 2 — DEEP STUDY. Verified against the LIVE database and current code.

Every item below was proven by probing the live backend or reading the shipped
code — not taken from the register. Register severities were wrong in both
directions before, so nothing here is trusted on its note alone.

---

## 🔴 LAUNCH BLOCKERS — verified live, today

### B-1 · Private notes are readable by ANYONE. No login.
`curl` with only the public anon key, HTTP 200:
```json
{"film_title":"The Shawshank Redemption","private_notes":"watched it in my darkest day "}
```
**Why it happens:** `logs_select_authorized` uses `can_view_user_data(user_id)`, which
returns TRUE for any public profile — including to `anon`. RLS is ROW-level, so once the
row is visible every column comes with it. `private_notes` was never column-revoked
(`profiles.email` WAS — proving the team knows the technique).

**Proven NOT intentional** — three independent client-side layers try to hide it:
`mappers.ts` omits it from `PUBLIC_LOG_COLUMNS`; `LogReviewBody.tsx` renders it only
`{isOwner && …}`; `LogForm.tsx` labels it *"Notes only you can see…"*.

### B-2 · A SECOND, independent leak — and it ignores RLS entirely
`get_featured_critique()` is `SECURITY DEFINER RETURNS SETOF public.logs`. Probed
anonymously it returns **30 columns including `private_notes`**. Because it is
SECURITY DEFINER, **B-1's column revoke does NOT close this one.** Both are needed.

### B-3 · The LOGS tab in search can never return a result
Live: `logs.username` → `42703 column does not exist`. Same for `logs.role`.
A whole search tab is dead on arrival.

### B-4 · Your own admin account resolves to the LOWEST tier
Live profile: `role=admin, tier=projectionist`. `normalizeTier` recognises only
`archivist | auteur | founding` — everything else silently returns `cinephile`
(weight 0). You have no Vault, autopsy, or premium access **on your own app**, and
any future tier name fails the same silent way.

### B-5 · Editing your bio silently RENAMES you — 5 live members affected
`buildProfileUpdates` always sends `username: sanitizedUsername`, even when only the
bio changed. The sanitiser strips `.` and `@`. Live handles that would change:
```
sajad.s.alobaidi          -> sajadsalobaidi
saleel.house              -> saleelhouse      *** COLLIDES with the existing @saleelhouse ***
saleel.sjs                -> saleelsjs
saleelsaleel555@gmail.com -> saleelsaleel555gmailcom
ug.mb                     -> ugmb
```
One rename lands on a username that already exists — a unique-constraint collision on
a live account.

---

## 🟠 HIGH — verified in shipped code

- **#74/#40 · Every date is the UTC calendar date.** `new Date().toISOString().slice(0,10)`
  at `useLogFlow.ts:177,225,244,398`. West of UTC, an evening log records TOMORROW.
- **#51 · One notification destroys up to 450 loaded ones.** `notificationStore.ts:179`
  keeps `slice(0,500)` on fetch; `:371` applies `slice(0, MAX_NOTIFICATIONS=50)` on every
  new push.
- **#103 · Markdown links bypass the URL allowlist.** THREE `<Markdown>` render sites
  (ArticleReaderModal, compose, dossier/[id]) and **zero `onLinkPress` handlers**, so
  links skip `safeOpenURL`'s scheme check — on third-party RSS content.
  ⚠️ The fix must `return false`: the library calls `Linking.openURL` when the callback
  returns TRUE.
- **#106/#112/#114 · Block filtering is systematically missing on comments.**
  `filterContentByBlocks` is correctly applied to FEEDS (useFeeds, SocialPulse,
  FeaturedCritique, FilmService) but NOT to log comments, stack comments, or
  notifications. `log/[id].tsx` imports the block store and never filters with it.
- **#126/#88 · Zero error telemetry in the domain store layer.** `src/stores/domain`:
  **0 of 6 files** call `captureError` — that is where filing a log happens.
- **#123/#125 · Tier gates are client-side only.** `compose.tsx:29`
  `canWrite = isAuteurPlusTier(user)` with no server-side equivalent.

---

## METHOD NOTE
Register severities have been wrong in BOTH directions (#77 was a false positive; #26
was understated). Everything above was re-proven from scratch. Items not yet re-verified
are NOT included, and must not be actioned on their register note alone.
