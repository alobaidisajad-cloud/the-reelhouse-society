# DEEP VERIFICATION — all 131 findings
Session 2026-07-28. Method: every claim re-proven against live code and/or the live backend.
Verdicts: **REAL** · **FALSE POSITIVE** · **INTENTIONAL** · **MIS-SCOPED** (real but the numbers/location are wrong).

Live backend facts established this session (anon key, unauthenticated curl):
- 32 profiles. role: 30 cinephile / 1 auteur (`morpho`) / 1 admin (`sajjadobaidi`). tier: 29 NULL / 1 `projectionist` / 2 `free`.
- `is_social_private` = false for **all 32**; `is_banned` = false for all 32. No private/banned account exists live.
- 254 `logs` rows readable by **anon**, `private_notes` included.
- `profiles.email` → `42501` (column revoked). `profiles.preferences` → readable by anon.
- 5 of 32 usernames fail `^[a-zA-Z0-9_]{1,30}$`: `sajad.s.alobaidi`, `saleel.house`, `saleel.sjs`, `saleelsaleel555@gmail.com`, `ug.mb`.
- 0 of 32 usernames contain uppercase.

---

## ⛔ NEW — not in the 131. Found because the 131 only ever looked at `mobile/`.

### NEW-W1 · BLOCKING (web) · Any visitor can export any public Archivist/Auteur's entire archive, private notes included
`src/components/profile/ProjectorRoom.tsx`
- `ProfileContent.tsx:86` renders `<ProjectorRoom user={profileUser} />` on the `projector` tab of **any** profile — **no `isOwnProfile` guard** (every sibling tab has one).
- `App.tsx` has **zero route-level auth gating**; `/user/:username/:tab?` renders logged-out.
- `ProjectorRoom.tsx:9` — `isPremium = user?.role === 'archivist' || 'auteur'` reads the **viewed profile's** role, not the viewer's.
- `ProjectorRoom.tsx:28` — `.select('*').eq('user_id', user.id)` paginated to the whole archive; line 51 writes `private_notes` into the CSV.
- Live-proven precondition: anon can read all 254 log rows incl. `private_notes`.

**Consequence:** open `/user/<any public auteur>/projector`, click export, receive their complete log history including every private note. `morpho` is live, public, `role=auteur`.

**Fix (all three, they are independent holes):**
1. `ProfileContent.tsx:86` → `{isOwnProfile && <ProjectorRoom .../>}`.
2. `ProjectorRoom.tsx:9` → gate on the **viewer's** role.
3. `ProjectorRoom.tsx:28` → replace `select('*')` with the 8 columns the CSV actually uses.
Item 3 is also a hard prerequisite for the #26 Stage-2 revoke — `select('*')` would start returning `42501` the moment `private_notes` is revoked from `authenticated`.

**Side effects:** none. Only reachable via the projector tab; no other consumer.

---

## Batch 1 — findings #1–#8

### #1 · REAL, confirmed exactly · CI green (32 lint warnings)
`npx eslint . --ext .ts,.tsx` → **32 problems, 0 errors, 32 warnings**. Every listed site verified:
- `app/_layout.tsx:4` — `export { RouterErrorBoundary as ErrorBoundary }` sits between imports; produces exactly **26** `import/first` warnings (lines 5–8, 10–28, 30–32).
- `app/(admin)/tribunal.tsx:25` and `app/(modals)/log-modal.tsx:5` — unused `Platform`.
- `src/components/Preloader.tsx:15` + `:17` — `colors` and `fonts` imported from `@/src/theme/theme` in two statements (2 warnings).
- `__tests__/colorLock.test.ts:17` — unused `relative`.
- `src/services/__tests__/loungeEmbeds.contract.test.ts:19` — `Array<T>`.
26+2+2+1+1 = 32. ✔

**Zero-side-effect proof for the `_layout.tsx` move:** Babel's CJS transform emits re-exported import bindings as an `Object.defineProperty(exports, 'ErrorBoundary', { get })` hoisted to module top regardless of source position, so expo-router's by-name lookup is position-independent. The other five edits are dead identifiers / type notation / import merging — syntactically inert.

**Best fix:** the six edits as filed. Do **not** use `eslint --fix` for `_layout.tsx`: `import/first` autofix reorders imports, and `initEncryptedStorage`/`AccessibilityProvider`/`sentry` are **side-effecting at import time** — reordering them is not provably safe. Move the one export line by hand; run `--fix` only on the other five files.

### #2 · REAL but MIS-SCOPED (three render sites, not two) · cap markdown render length
`linkify-it <=5.0.1`, **no fix available**, reached via `markdown-it` → `react-native-markdown-display`. Two advisories, both quadratic-complexity DoS.
Render sites are **three**, not two:
- `src/components/dispatch/ArticleReaderModal.tsx:350` — renders **third-party RSS article bodies** *and* dossiers. This is the highest-risk site and the finding omitted it.
- `app/dossier/[id].tsx:467` — another member's dossier.
- `app/dispatch/compose.tsx:209` — your own draft (self-inflicted only; capping it would visibly truncate the author's own preview — **exclude this one**).
**Best fix:** cap at the two *consumption* sites only, not the compose preview. See §"cross-cutting" for the constant to share with #122's real publish cap.

### #3 · REAL, confirmed exactly · index the notable-members query
`MemberDiscoveryService.ts:29-36` is `.eq('is_social_private',false).eq('is_banned',false).not('username','is',null).order('followers_count',{ascending:false,nullsFirst:false}).limit(24)` — the proposed partial index's predicate matches all three quals exactly, and `DESC NULLS LAST` is Postgres' default for `DESC`, so the ORDER BY is satisfiable by the index.
**Caveat worth stating:** at 32 rows the planner will seq-scan regardless. This is a correct-but-inert change today. Additive partial index → no plan can regress. Zero risk, near-zero present value.

### #4 · REAL · commit pending `eas.json`
`git diff` confirms exactly one hunk: `submit.production.ios.ascAppId = "6773105964"`. App Store Connect app IDs are public identifiers, not secrets. Untracked repo-root marketing artifacts confirmed present (`carousel.html`, `generate_*.cjs`, `frames/`, `trailer-video/`, `post.html`, `scripts/record-*.js`).

### #5 · REAL, with one correction · remove dead artifacts
`test-app/`, `test_db.js`, `test_schema.js` all exist. The finding says "zero references from any config or source" — **not quite**: `tsconfig.eslint.json:19` lists `test-app` in `exclude`. Harmless (a stale exclude entry is a no-op), but delete that line in the same commit so the claim becomes true.

### #6 · FALSE POSITIVE — and the audit already retracted it as #9
#6 and #9 are the same item. The later pass ran `--detectOpenHandles` and it reported **nothing**; 989 tests pass clean. #6 should be struck from the register, not fixed.

### #7 · REAL but **UNDERSTATED — upgrade from LOW** · `preferences` readable by anon
Live-proven readable unauthenticated. The finding calls it "non-sensitive". It is not: live rows contain
`social_visibility`, `privacy_annotations`, `privacy_endorsements`, `notif_system/follows/comments/endorsements`, `favorites[]`, `programmes[]`.
That is **the member's privacy configuration, published to the internet.**
**And it exposed a live data bug:** `morpho` has `preferences.social_visibility = "private"` while `profiles.is_social_private = false`. The setting and the enforcing column have desynced on a real account — that member believes they are private and is not. See §DESYNC below; this is a finding in its own right that the 131 never caught.
**Fix is NOT a blanket revoke** — the web app reads `profiles(...preferences)` from *other* members at `FeedPage.tsx:128` and `LogDetailPage.tsx:32`. Splitting the notification/privacy keys out of the JSONB, or moving reads behind a view that projects only `favorites`/`programmes`, is the correct shape. Needs its own design pass; do not revoke blind.

### #8 · REAL, and it is a scope decision, not a defect
Android launch wiring (FCM, RC android key, Play IAPs) is genuinely absent; the plan of record is an iOS-only launch. Correctly parked, not fixed. No action.

---

## Batch 2 — the live security items

### #26 · REAL · **BLOCKING** · re-proven live this session
```
curl anon → {"film_title":"The Shawshank Redemption","private_notes":"watched it in my darkest day ","user_id":"d1c40ed8-…"}
```
254 log rows anon-readable. `profiles.email` returns `42501` on the same connection — **proving the column-revoke technique is already deployed in this database**, which is what makes the omission on `private_notes` an oversight rather than a decision.

**Correction to the prior analysis, and it matters:** the earlier pass certified Stage 1 as zero-risk on the basis that "no anonymous log-read path exists". That sweep covered `mobile/` only. The **live web app shares this backend and has no route-level auth gating at all** — every page renders logged-out. I re-ran the sweep across `src/` + `api/`:
- anon-reachable log reads (`CommunityReviews`, `FeaturedReview`, `SocialPulse`, `FeedPage`, `LogDetailPage`, `UserProfilePage`) all use **explicit column lists that omit `private_notes`** → unaffected by the revoke. ✔
- `src/api/supabase.ts:59` `getUserLogs` selects `*` — **zero callers, dead code**. ✔
- `ProjectorRoom.tsx:28` selects `*` — this one is live and reachable (see NEW-W1). It breaks under a Stage-2 revoke and is already a leak under Stage 1.
**Verdict: Stage 1 (`REVOKE SELECT (private_notes) ON public.logs FROM anon`) is confirmed zero-risk — now on evidence that covers both clients, not one.** Stage 2 additionally requires the NEW-W1 item 3 column-list fix first.

### #7-adjacent — DESYNC (new) · a member's privacy setting is not the column that enforces it
`morpho`: `preferences.social_visibility = "private"`, `is_social_private = false`. Every RLS/visibility decision in both clients reads `is_social_private`. One live member is publicly visible against their stated setting. Needs the write path audited (which client writes which key, and whether either back-fills the other).

### #84 · REAL, confirmed exactly · LOGS tab in search cannot return a result
Live: `logs?select=username` → `{"code":"42703","message":"column logs.username does not exist"}`; `select=role` → same. Both columns absent, both requested. ✔

### #48 · REAL, confirmed live · admin resolves to the lowest tier
Live: `sajjadobaidi` = `role:"admin"`, `tier:"projectionist"`. 29 of 32 rows have `tier: NULL`; 2 have `"free"`. Verification of `normalizeTier`'s fall-through pending in batch 3.

### #36 · REAL, premise confirmed exactly · bio edit silently renames
The 5 offending usernames are live and are exactly the 5 named: `sajad.s.alobaidi`, `saleel.house`, `saleel.sjs`, `saleelsaleel555@gmail.com`, `ug.mb` (15.6%).
`validateUsername.ts:37-41` strips `[^a-z0-9_]` and returns `valid: true` — it sanitizes rather than rejects. Confirmed by reading the function: there is no "changed the input" signal in the return type at all, only `sanitized`.
The PII sub-claim is confirmed: one live username **is** a full email address, and `profiles.username` is anon-readable, which routes around the `profiles.email` revoke for that account.

### #67 · REAL, confirmed exactly · 5 of 32 cannot be followed
`socialSlice.ts:62` guard `^[a-zA-Z0-9_]{1,30}$` rejects exactly those 5 → `resolveUsernameToProfile` returns `null` → `:124` throws → `:162` `isNetworkError` is false → `:178-181` rollback + `reelToast.error`. Permanent, unretryable. ✔

### #78 · REAL and **BROADER than filed**
Filed as "an *offline* unfollow leaves a pending follow request standing". Reading `unfollowUser` (`socialSlice.ts:188-248`) end to end: `removeRequested` is **never called in any path** — not online (`:205` removes following only), not in the null-resolve branch, not in the network branch, not in the rollback (`:241` restores `following` only).
`useProfileController.ts:248-249` routes *cancel-request* through `unfollowUser`. So cancelling a follow request leaves the button reading "REQUESTED" for the rest of the session, online included. Self-heals only on `hydrateFollowing` at next launch.
Latent today — 0 of 32 live accounts are private — but it is a plain missing call, not an offline-only edge.

---

## Batch 3 — tier / date / identity cluster

### #48 · REAL, confirmed to the row · admin resolves to the lowest tier
Live row: `sajjadobaidi` → `role='admin'`, `tier='projectionist'`, `is_founding=false`.
Traced by hand through `tier.ts`:
- `getTierWeight('projectionist')` → `normalizeTier` falls through both branches → `'cinephile'` → weight **0**
- `effectiveRole = is_founding ? 'founding' : role` = `'admin'` → also weight **0**
- `tWeight >= rWeight` (0>=0) → returns `normalizeTier('projectionist')` = **`'cinephile'`**

`'projectionist'` is not a typo — it is a **first-class legacy tier**: `supabase/migrations/20260325_projectionist_tier.sql` creates it and `20260401_the_lounge.sql` grants lounge access on `role IN ('archivist','auteur','projectionist')` at **four** RLS sites. So the DB knows the value and the client does not.

**Both layers exclude the admin, independently.** The DB lounge whitelist omits `'admin'` (and `'founding'`); the client resolves `'admin'` to weight 0. There is no path by which this account gets its own product.

Full blast radius enumerated (every gate call site read):
`archiveSlice` x4 (Vault) - `useProfileData:238-239` (physical + calendar tabs) - `ProfileDataService` :179/:211/:237/:398/:506/:544/:646 - `TopNavBar:104` - `ActionDeck:43` - `lounge.tsx:59` - `dispatch.tsx:85` - `compose.tsx` - `useLogFlow:151-152`.

**Unstated amplification — silent data loss, not just missing access.** `useLogFlow.ts:130-138` builds the payload as
`privateNotes: isPremium ? ... : null`, `physicalMedia: isPremium && ... : null`, `editorialHeader: isPremium ? ... : null`, `dropCap: isPremium ? ... : false`, `pullQuote: isPremium ? ... : ''`, `altPoster: isAuteur ? ... : null`.
`buildLogPayload` is used by **both** branches at `:347-348` — `updateLog` as well as `addLog`. `updateLogOp` strips only `undefined` keys (`logOperations.ts:566-570`); **`null` is written through**. The edit form pre-loads the real values first (`:236-262`).
=> The admin (or anyone whose tier resolves below archivist) **editing an existing log silently erases** its private notes, physical media, editorial header, drop cap, pull quote, alt poster and autopsy. This also converts #47 from "loses access" into "destroys data on next edit".
(`safeOverride` at `logOperations.ts:171-176` protects only the *rewatch-merge* path, not the edit path — it does not apply here.)

**Best fix, in order:**
1. `normalizeTier` — add `'projectionist'` (staff → auteur-equivalent) and decide `'admin'`. Product call on the weight; the mapping must exist.
2. Make the fallback loud: `logger.warn` + Sentry breadcrumb on a non-empty, non-`'free'`, unrecognized value. `null`/`''`/`'free'` stay silent. Return value unchanged → zero behavioural risk.
3. **Separately and independently**: `buildLogPayload` must not null premium fields on *edit*. Gate the **inputs** (don't let a non-premium user type into them), never the payload. Worth doing regardless of the tier decision because it also fires on a lapsed subscription.
4. DB: add `'admin'` (and `'founding'`) to the four lounge RLS whitelists, or switch them to a tier-weight function.

**One inconsistency in the finding to resolve in the SQL editor:** it quotes `check_role_valid CHECK (role = ANY (ARRAY['cinephile','archivist','auteur','projectionist','free']))` — that array does **not** contain `'admin'`, yet a live row holds `role='admin'`. The quoted constraint cannot be the live one as stated (or it is `NOT VALID`). Re-read it before relying on it.

### #47 · REAL (premise re-verified) · Restore Purchases strips admin
Independently corroborated by the live data: `role` genuinely carries both meanings, and `tier` is `NULL` on 29 of 32 rows — i.e. the `tier` column is effectively unused and `role` is the de-facto tier, exactly as filed. The recommended backfill (`UPDATE profiles SET tier = role WHERE role IN (...) AND tier IS DISTINCT FROM role`) is therefore **not optional** — without it, moving the gates to `tier` demotes 30 of 32 members to NULL.
Severity is understated once #48's data-loss amplification is included: a stripped admin doesn't merely lose the Tribunal, they start erasing their own logs' premium fields on every edit.

### #40 · REAL, empirically proven · UTC default date
`useLogFlow.ts:176` — `useState(new Date().toISOString().slice(0, 10))`. Executed live just now: Pacific/Auckland local date is **2026-07-29**, the app pre-fills **2026-07-28**. Off by one *at this moment* for UTC+12; symmetric for the Americas in their evening — which is when people log films.

### #74 · REAL, empirically proven · logged dates render one day early west of UTC
Live wire shape confirmed: `watched_date` → `"2026-06-07"` (date-only, `date` column); `created_at` → `"2026-06-21T13:39:08.335376+00:00"`.
Executed `formatDate("2026-06-07")` under real ICU zones:
```
America/Los_Angeles  JUN 6, 2026   *** OFF BY ONE
America/New_York     JUN 6, 2026   *** OFF BY ONE
America/Sao_Paulo    JUN 6, 2026   *** OFF BY ONE
UTC / Baghdad / Tokyo / Auckland   JUN 7, 2026
```

> ### WARNING — **the fix as filed is itself defective; do not apply it as written.**
> #74 proposes branching on `parts.length === 3` (copying `formatTMDBDate`). Executed:
> `"2026-06-21T13:39:08.335376+00:00".split('-')` → `["2026","06","21T13:39:08.335376+00:00"]` → **length 3**.
> A UTC-offset-suffixed timestamp is misclassified as a calendar date, so the "fix" would force **local timestamps into UTC rendering** — introducing a new off-by-one in the other direction. The discriminator must be `/^\d{4}-\d{2}-\d{2}$/`, not a `-` count.

**Complete consumer enumeration (the audit left this open — closed here):**
- `formatDate` — **exactly one** consumer: `FilmDetailLayout.tsx:237`, `existingLog.watchedDate`. Always a calendar date. But it arrives in **two wire shapes**: `"2026-06-07"` after a fetch, and `"2026-06-07T12:00:00Z"` from the optimistic local write (`logOperations.ts:217-218` / `:557-558` anchor to noon UTC). Rendered local, the `T12:00:00Z` form breaks at **UTC+12 and beyond** (noon UTC = next day 01:00 in Auckland).
  => **Correct fix: `formatDate` renders in `timeZone:'UTC'` unconditionally.** It has no timestamptz consumer, and the noon anchor was chosen precisely so the UTC calendar day is the intended day. Simpler *and* strictly more correct than the shape-branch.
- `formatDateMonthYear` — three consumers, **all timestamptz**: `EditProfileScreen:221` and `SettingsScreen:498` (`user.created_at`), `stacks/[id].tsx:580` (`list.createdAt`). => **Leave it alone.** Applying the UTC branch here would be a regression.
- `timeAgo` — six timestamptz consumers *and one mixed*: `ProfilePosterCard.tsx:145` passes `log.watchedDate ?? log.createdAt`. => Its `>30 days` terminal branch needs the strict-regex shape test; the relative buckets are epoch deltas and are timezone-independent.

### #75 · REAL but MIS-SCOPED · four implementations, not three
`src/utils/timeAgo.ts` (canonical) - `app/log/[id].tsx:42` - `src/components/home/types.ts:63` - **`src/components/feed/ActivityCard.tsx:263` (`getTimeAgo`)** — the fourth, which the finding omits. Three to delete, not two. All four share the `'JUST NOW'` / `${mins}m AGO` body, so they were copied, not independently written.
Consolidation is also the *delivery mechanism* for #74: fix the canonical one and delete the copies, and every screen is corrected at once. Doing #74 without #75 leaves three uncorrected copies.

---

## ⛔ NEW — the structural reason gaps exist: **two `supabase/` trees, one database**

```
reelhouse/supabase/          36 migrations   6 edge functions   <-- the audit NEVER read this
reelhouse/mobile/supabase/   63 migrations   5 edge functions   <-- the audit read only this
```

Both deploy to the **same** Supabase project. Consequences, each verified:

**(a) Two edge functions were never audited at all.** The audit reported "Edge functions **5/5**". There are **7 distinct** functions. Unaudited: `paytabs-handler` and `send-email`.
- `paytabs-handler` — live probe returns **401** (deployed, auth-gated, exists) and it is the **live web app's real payment path** (`src/pages/MembershipPage.tsx:58` and `:287` invoke `paytabs-handler/create`). A production money path was outside the audit's coverage claim.
- `send-email` — live probe returns **404**. Not deployed; dead source.

**(b) All four shared functions differ between the two trees.**
`diff` on `tmdb-proxy`, `notify-push`, `fetch-rss`, `sign-in-with-username` → **all DIFFERENT**. `tmdb-proxy` isn't drift, it's two unrelated implementations (the root copy has an in-memory cache + `multiTierSearch` and **no allowlist**; the mobile copy has rate-limiting + an allowlist). Only one can be deployed. **Every conclusion the audit drew by reading a `mobile/supabase/functions/*` body describes code that may not be the code running.**

**(c) `get_priority_reports` is defined only in `mobile/supabase`** — and #24 proves the deployed signature doesn't match the client either way.

**Fix:** collapse to one tree before any further backend work. Until then, no statement about an edge function's behaviour can be trusted without a live probe.

### NEW-B1 · #47's root cause has a **second, unfixed instance** in the unaudited function
`supabase/functions/paytabs-handler/index.ts:163-166`
```ts
await supabaseAdmin.from('profiles').update({ role: newRole, tier: newRole }).eq('id', userId)
```
Identical to `sync-entitlement`'s overwrite. #47's recommended fix — *"have `sync-entitlement` write only `tier` and never touch `role`"* — **is incomplete as filed.** An admin who pays through the web checkout is demoted by this line regardless of what `sync-entitlement` does. Both writers must change together, or `role` is not permission-only and the whole #47 remediation is void.

### NEW-B2 · LOW · `paytabs-handler` dead `'tip'` branch
`:61` reads `checkout_type`, `:73` handles only `'membership'`. A `'tip'` request falls through with `amount = 0`, empty `description`, empty `cart_id`, and still POSTs to PayTabs. No caller sends `'tip'` (both web call sites send `'membership'`), so it is latent, not live. Either implement or reject unknown `checkout_type` explicitly.

### NEW-B3 · MED · the PayTabs webhook secret travels as a URL query parameter
`:95` — `callback: .../webhook?token=${WEBHOOK_SECRET}`. The shared secret is handed to a third party inside a URL, where it lands in PayTabs' request logs and dashboards. The code comments acknowledge the weakness. Verifying PayTabs' HMAC `signature` header over the raw body is the correct control. Fails **closed** today (`:133`), which is right.

---

## Batch 4 — live-backend findings #23, #24, and the proxy

### #23 · REAL, mechanism re-proven live · `is_hidden_by` is an anon-callable block oracle
```
GET  /rest/v1/user_blocks           -> []       (RLS correctly blocks)
POST /rest/v1/rpc/is_hidden_by      -> false    (answers anyway, unauthenticated)
```
The `SECURITY DEFINER` + `anon` grant + caller-supplied `viewer_id` combination is confirmed live. One honest caveat the finding doesn't state: with **zero blocks currently in the table**, every answer is `false`, so today it leaks nothing. The *mechanism* is live and becomes an oracle the moment the first block exists.
The proposed fix (ignore the parameter, use `auth.uid()`) is correct and signature-compatible. One thing to check before applying: it must not be called from a `SECURITY DEFINER` context where `auth.uid()` is NULL — the finding asserts all 8 callers are `LANGUAGE sql STABLE` and pass `auth.uid()`; re-confirm that in the SQL editor since the migration bodies live in the tree we now know is only half the picture.

### #24 · REAL, confirmed live, exactly as filed · Tribunal Priority Queue is dead
```
rpc/get_priority_reports {p_limit,p_cursor_count,p_cursor_created,p_cursor_id}
 -> PGRST202  "Perhaps you meant to call the function public.get_priority_reports(p_cursor, p_limit)"
rpc/get_priority_reports {p_limit,p_cursor}
 -> 42501     permission denied for function   (correctly admin-gated)
```
`ModerationService.ts:110-115` sends the 4-param shape. **Every call throws.** PostgREST itself names the live 2-param signature in the hint.
Root cause found: **no migration in either tree defines the 4-param version.** The client was written against a function that was never authored, let alone deployed. The fix is a new migration creating the compound-keyset signature — not a client change, because the compound cursor (`report_count, created_at, id`) is the correct ordering and the 2-param version can't express it.

### NEW-1 (proxy) · REAL — and **materially worse than filed**. Re-proven live, three ways.
```
POST /functions/v1/tmdb-proxy  {"path":"/movie/550"}                    -> 200 full film JSON
POST /functions/v1/tmdb-proxy  {"path":"/authentication/token/new"}     -> 200 {"success":true,"request_token":"175adaa8..."}
POST /functions/v1/tmdb-proxy  {"path":"/movie/550"}  *** NO apikey, NO Authorization header ***  -> 200 full film JSON
```
1. **No path allowlist** — an arbitrary TMDB endpoint was proxied and returned a real TMDB request token.
2. **No authentication whatsoever** — the third probe carried **no credentials at all** and succeeded. Deployed with `--no-verify-jwt` and the body never checks anything. (There is no `config.toml` in either tree; JWT verification is a deploy-time flag.)
⇒ This is an **open, unauthenticated, internet-facing proxy fronted by your TMDB API key.** Anyone can burn the quota or get the key rate-limited/suspended by TMDB — which takes the entire app down, both clients. I'd hold this at **Blocking**, not High.

### NEW-2 · REAL, both halves confirmed
Against `mobile/supabase/functions/tmdb-proxy/index.ts:68-70`:
```ts
function isPathAllowed(path) { return ALLOWED_PATH_PREFIXES.some(p => path.startsWith(p)); }
```
- **Bypassable:** `/movie/../authentication/token/new` passes `startsWith('/movie/')`; `fetch` normalizes `..` against the `/3` base, resolving to `/3/authentication/token/new`.
- **Incomplete:** the app calls **`/search/keyword?query=…`** (`src/lib/tmdb.ts`, keyword-discovery path). The allowlist has `/search/multi`, `/search/movie`, `/search/person`, `/search/company` — **no `/search/keyword`**. Deploying this allowlist as-is silently breaks keyword discovery. Every other app path (`/movie/…`, `/person/…`, `/trending/movie`, `/discover/movie`) is covered.

**Correct fix (the filed one is insufficient on all three counts):**
1. Collapse to one canonical `tmdb-proxy` source (see the dual-tree item).
2. Validate by **normalizing then re-checking**: `const u = new URL(path, 'https://api.themoviedb.org/3/')`, reject unless `u.pathname.startsWith('/3/')`, then match `u.pathname` against an **anchored regex** allowlist. Never `startsWith` on the raw string.
3. Add `/search/keyword`.
4. Require credentials — redeploy **with** JWT verification, or verify the anon key in-body. An open proxy over your own paid key is the actual exposure; the allowlist only narrows what can be abused, it doesn't stop the abuse.

---

## Batch 5 — data-exposure and correctness cluster

### #32 · REAL, and the **re-scoping in the handoff note was too generous** · second private-notes door
Live function body (`20260709_05_featured_critique_public_only.sql`): `RETURNS SETOF public.logs`, `SECURITY DEFINER`, `SELECT l.*`.
Live probe, unauthenticated:
```
POST rpc/get_featured_critique?select=private_notes,film_title
 -> [{"private_notes":null,"film_title":"The Odyssey"}]
```
The column **is projectable through the RPC** (it returned the key, not `42703`/`42501`). The value is `null` only because that particular featured row has no note.
**Why this matters more than the note implies:** a `SECURITY DEFINER` function's body runs as the owner, and PostgREST's `select=` is a projection over the *function's result set*, not a table access — so **no column ACL is consulted**. ⇒ **#26's Stage-1 `REVOKE SELECT (private_notes) … FROM anon` does NOT close this door.** #26 and #32 must be fixed together or private notes stay reachable.

> **The obvious fix breaks the app.** Changing `RETURNS SETOF public.logs` to `RETURNS TABLE(...)` destroys the PostgREST FK embed. Proven live:
> ```
> rpc/get_featured_critique?select=id,film_title,profiles!logs_user_id_fkey(username,role)
>  -> [{"id":"f8479e46…","film_title":"The Odyssey","profiles":{"role":"auteur","username":"morpho"}}]
> ```
> That embed only resolves because the function returns `SETOF public.logs`. `FeaturedCritique.tsx:32` depends on it. A `RETURNS TABLE` rewrite yields `PGRST200`.

**Correct fix:** keep `RETURNS SETOF public.logs`, and enumerate the columns explicitly in the table's own order, substituting `NULL::text AS private_notes`. Return type unchanged → embed preserved → leak closed. Add a contract test asserting `private_notes IS NULL` from the RPC, because this shape silently re-breaks if the table gains a column.

### #31 · REAL · nothing records which migrations are live — and it is now **worse than filed**
The finding's own example is still undecidable from outside: `physical_archive` and `list_items` are both fully anon-readable right now (probed: real rows returned, including `physical_archive.notes`), but since **all 32 live profiles are public**, `USING(true)` and `USING(can_view_user_data(user_id))` are observationally identical. Only the SQL editor settles it.
**New evidence that compounds it:** the dual-tree discovery above. "63 migrations applied by hand" is itself wrong — there are **99 migration files across two directories** that both target this database, and `get_priority_reports` exists in only one of them. The provenance problem is larger than the finding states.

### #51 · REAL, confirmed exactly — **and it has three consequences, not one**
`notificationStore.ts:10` `MAX_NOTIFICATIONS = 50`; `:179` `[...state.notifications, ...deduped].slice(0, 500)`; `:194` comment literally says *"Stop paginating if we've hit the 500 item local memory cap"*; `:371` Realtime handler `[newNotif, ...state.notifications].slice(0, MAX_NOTIFICATIONS)`.
1. **Loss:** one arriving push truncates up to 500 loaded rows to 50.
2. **Corrupted badge (unstated):** `:375-378` computes eviction as *at most one row* (`state.notifications[length-1]`). When 450 rows are evicted, only 1 is subtracted — `_unreadCount` is left counting notifications that are no longer in the list.
3. **No recovery (unstated):** `_hasMore` was already set `false` at the 500 cap (`:194`), so after truncation the user cannot re-page. Only a cold `fetchNotifications()` restores them.
**Fix:** one shared constant. Raise the Realtime slice to the same 500 cap. Zero risk — it only ever retains more, and it makes the single-eviction accounting at `:375` correct again by construction.

### #71 · REAL, and **more dead than filed**
`src/utils/concurrencyScope.ts` exports `storeFetchScope` and self-registers `registerStoreReset(() => storeFetchScope.cancel())` at module scope. Grep across all of `src/` + `app/`: **zero importers.**
⇒ Because nothing imports the module, **it never loads, so the reset handler is never even registered.** It isn't "a mechanism that doesn't abort anything" — the module is entirely inert. The docstring ("all store-level fetch operations pass to Supabase queries") describes an integration that was never performed.
**Fix:** either wire `storeFetchScope.signal` into the store fetches (real work, touches every domain slice) or delete the file. Do not leave a file whose docstring asserts a safety property the app does not have.

### #76 · REAL but **substantially OVERSTATED** — re-counted this session
```
withAbortSignal   45 live (non-test) references
withTimeout       21 live (non-test) references
apiCircuitBreaker  0 external importers    (151 lines)
qos                0 importers at all      ( 57 lines)
```
The "resilience layer" is **not** inert: two of its four pieces are used pervasively. Dead code is `apiCircuitBreaker` + `qos` = **208 lines**, not 466. (Handoff note said 42/13 refs; both were undercounts — re-verify numbers, they moved.)
**Fix:** delete the two dead modules. Do not "wire up the resilience layer" — most of it already is.

### #83 · REAL, confirmed at the corrected scope · `CACHE_KEYS` used 2 of 21
Live refs: `useUpdateUser.ts:38` and `:46`. Confirms the handoff's correction (2 sites, not 1).

### #85 · REAL (wildcard half) — **proven live** — but the breakout half is **NOT SUBSTANTIATED**
`escapeSearchPattern.ts:24-30` escapes `\ % _` and doubles `"`.

**Wildcard escaping is a total no-op — empirically decisive.** Against live `profiles` (32 rows, 4 of which contain a literal `_`):
```
or=(username.ilike."%_%")     unescaped _   -> 32   (wildcard)
or=(username.ilike."%\_%")    escaped   \_  -> 32   *** should be 4
or=(username.ilike."%\\_%")   double    \\_ -> 32   *** still broken
or=(username.ilike."%%%")     unescaped %   -> 32
or=(username.ilike."%\%%")    escaped   \%  -> 32   *** should be 0
```
And the one call site that uses the **builder** form instead of an interpolated `.or()` string works correctly:
```
logs?film_title=ilike.%_%    -> 254        logs?film_title=ilike.%\_%   -> 0
```
⇒ Root cause identified: inside PostgREST's **double-quoted** `.or()` value the backslash is consumed by PostgREST's own parser and never reaches SQL `LIKE`. No backslash count fixes it (1 and 2 both tested). Escaping only survives in the unquoted builder form — exactly the "5 of 6 sites" the finding claims.

**Breakout claim — tested, and it does not hold.** Doubling `"` *does* terminate PostgREST's quoted value, but every crafted payload produced a `PGRST100` parse error, never an injected filter:
```
or=(username.ilike."%zz"",is_banned.eq.false,zz%")  -> PGRST100 unexpected "%"
or=(username.ilike."%zz"",id.not.is.null,zz%")      -> PGRST100 unexpected "%"
```
The template's trailing `%"` always strands a `%` the parser rejects. **Real impact: a 400 on searches containing `"`, and literal `"` never matches.** That is a functional bug and a trivial self-DoS — **not** filter breakout, and not a data leak. Downgrade accordingly.

**Correct fix — structural, not a better escape string.** Since no escape sequence survives the quoted `.or()` form, stop interpolating user input into `.or()` entirely: use the `.ilike()` builder (proven to escape correctly) with two queries merged client-side, or push the search into an RPC with a bound parameter. Then add a **live contract test** — this survived because the existing unit tests assert the *output of `escapeSearchPattern`*, never PostgREST's interpretation of it.

### #73 · REAL, confirmed exactly · notification grouping is completely inert
`groupNotifications.ts:47-59` — `getGroupKey` returns a key only if `n.film_id` is set, else if the message matches `/your review of (.+)$/`.
The live DB trigger (identical in `mobile/supabase/_schema_baseline.sql:1375` and `supabase/migrations/20260613_02:62`) inserts:
```sql
notif_message := 'certified your dossier 🏆';
INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message) VALUES (...)
```
- The message is `'certified your dossier 🏆'` — the regex **cannot** match.
- The INSERT **does not include `film_id`** — so the primary branch is always null too.
⇒ `getGroupKey` returns `null` for **every** endorse notification. Grouping never fires. Confirmed on both branches, not inferred.
Secondary: `extractFilmName` would always return the literal `'your review'`, so even if grouping fired the copy would read *"3 cinephiles endorsed your review of your review"*.
**Fix must be server-side.** No client change can work — neither input exists. Populate `film_id` (and `poster_path`) on the endorse INSERT; the columns already exist live (probed: `select=film_id,poster_path` on `notifications` returns `[]`, i.e. RLS-empty, not `42703`). Then reword the group message to match current copy ("N cinephiles certified your dossier").

### #92 / #106 / #112 / #114 · ALL REAL · and they are **one** systemic finding
Grepped every one of `isHidden` / `filterContentByBlocks` / `isBlocked` / `isMuted` across the render paths:
```
app/log/[id].tsx                    0 matches   (#106, #92)
app/stacks/[id].tsx                 0 matches   (#114, #92)
app/dossier/[id].tsx                0 filter matches — it imports blockUser/muteUser as *actions* only  (#92)
app/(modals)/notifications-modal.tsx 0 matches  (#112)
```
Service layer confirms it: `LogService.getLogComments` (`:171-207`) and `StackService.getStackComments` (`:108-141`) contain no block filtering at all.
Meanwhile filtering **is** applied consistently in feeds and search (`useFeeds` ×3, `FilmService:103`, `film-reviews/[id]:84`, `SocialPulse:171`, `FeaturedCritique:41`, `useUniversalSearch` ×3, `lounge.ts` ×4).
⇒ The pattern is not "four separate misses" — **block/mute filtering was applied to every feed surface and to no comment surface, and not to notifications.** Fix it as one change (a shared `useVisibleItems` applied at the four comment/notification render sites), not four.

### #104 · REAL, confirmed exactly · online dossier comments skip sanitisation
`app/dossier/[id].tsx:291-296` inserts `body: tempComment.body` raw.
`mutationExecutor.ts:618` (offline) does `sanitizeInput(body, 'dossierComment')` and enforces `MAX_LENGTHS.dossierComment = 2000`.
Same content, two paths, two different guarantees — and the *online* path is the common one.

### #68 · REAL — but one supporting claim in it is **false**
`listSlice.ts:167` (`createList`) and `:227-228` (`updateList`) write `title`/`description` with no `sanitizeInput`. ✔
The finding also states *"`listTitle` and `listDescription` have no callers."* **They do** — five: `archiveImport.ts:962, 963, 1196, 1197` and `lounge.ts:752`. The profiles are live and exercised by the CSV-import path; they are simply absent from `listSlice`. The defect is real; the "unused profile" framing is not.

### #44 ≡ #128 · REAL but MIS-SCOPED — only **one** live unbounded fetch, not two
- `LogService.getLogComments:171-176` — no `.limit()`. **Unbounded, live.** ✔
- Dossier comments: the finding says unbounded. The **live** path `app/dossier/[id].tsx:129` and `:230` both use `.limit(PAGE_SIZE)` where `PAGE_SIZE = 30`. The unbounded `DossierService.getComments:18-22` is **dead code** (#38/#127). So the dossier half of the finding describes code that never runs.
- Stack comments: `.limit(50)` ✔ (matches the finding).
⇒ Restate as: *log comments are the one unbounded comment fetch.*

### #38 ≡ #127 · REAL, confirmed exactly · `DossierService` is dead
Only referrers are `servicesBatch2.test.ts` (11 references) and a docstring in `dossier.schema.ts`. Zero production imports. The tests pass and prove nothing about shipped behaviour — and specifically they green-light an unbounded `getComments` that the real screen doesn't use.

### #131 · REAL, confirmed exactly
`tsconfig.json` `exclude: ["**/__tests__/**", "jest.setup.ts", "jest.config.js", "supabase/**"]`. Tests are not type-checked. (`supabase/**` is correctly excluded — Deno, different types.)

### #132 · REAL, minor scope correction
`jest.config.js:27-51`. Actual range is **7–39**, not "7–29": global 12/14/17/16; `src/hooks/` 13/10/**7**/7; `src/stores/` 23/29/34/32; `src/lib/` 31/29/**39**/37. The point stands unchanged — a ratchet set below current coverage cannot catch a regression.

---

## Batch 6 — remaining findings

### #46 · REAL, confirmed exactly — **and the proposed fix executed successfully against production**
`ProfileDataService.ts:457` `.limit(4, { foreignTable: 'list_items' })`; `ProfileListsTab.tsx:57` renders `{(list.films || []).length} FILMS`. The self path (`listSlice.ts:47`) has no foreign-table limit, so only visitors see the lie.
I ran the recommended aggregate embed live:
```
lists?select=id,title,list_items(film_id),film_count:list_items(count)&list_items.limit=4
-> "Comfort movies"            list_items:[4 items]  film_count:[{count: 88}]
   "Films that cut me deep"    list_items:[4 items]  film_count:[{count: 6}]
   "The Best Picture Journey"  list_items:[4 items]  film_count:[{count: 96}]
   "Hhh"                       list_items:[]         film_count:[{count: 0}]
```
**The fix works, in one round trip, and returns the numbers the finding predicted.** One implementation note: PostgREST returns the aggregate as an array — read `film_count[0].count`, not `film_count`.

### #36 / #87 · **The rename hazard has already fired on a live account — direct proof, previously unproven**
`log_comments` and `dossier_comments` carry a denormalized `username`. Cross-referencing every live comment row against the 32 live profiles:
```
log_comments      7 rows,  4 carry username "sajjadsaleel_"  -> that user_id is now "sajjadobaidi"
dossier_comments  1 row,   1 carries  "sajjadsaleel_"        -> same account
"sajjadsaleel_" matches no live profile.
```
The admin account was renamed and **five comment rows still display a handle that resolves to nothing.** Note the old handle ends in `_`, which `validateUsername` rejects — i.e. the rename is exactly the sanitiser-driven mechanism #36 describes.
**Unstated consequence to add to #87:** renaming does not back-fill the denormalized `username` columns on `log_comments`/`dossier_comments`. Those comments render a dead handle whose tap-through goes nowhere. Any rename fix must include a back-fill, or these rows accumulate.

### #93 · REAL — and the proof is stronger than the finding's
The finding says "no server-side length cap on any comment column." True, and here is why the one apparent counter-example doesn't count: `supabase/migrations/20260329_auth_persistence_v2.sql:63` creates `log_comments.content TEXT NOT NULL CHECK (char_length(content) <= 2000)` — but the **live** `log_comments` table has columns `id, log_id, user_id, username, body, created_at` (probed). There is no `content` column live. The CHECK is attached to a schema that isn't the deployed one. Confirmed: zero live length constraints. (Also more evidence for the dual-tree problem, and for #43.)

### #123 / #125 · REAL — and the root tree the audit never read explains *why*
`supabase/migrations/0002_premium_rls.sql:68-76` creates `"Auteur users can manage dossiers"` gated on `tier = 'auteur'`.
`supabase/migrations/0002_rls_hardening.sql:72-74` creates `"Users can manage their dossiers."` gated on ownership only.
**Different policy names ⇒ both can coexist ⇒ RLS combines same-command policies with OR ⇒ the tier gate is void whenever the ownership policy is present.** That is the exact mechanism behind "the Auteur gate is client-side only".
Compounding it: those premium policies gate on `profiles.tier IN ('archivist','auteur')`, and **live `tier` is NULL for 29 of 32 members — including `morpho`, the only auteur, who has `role='auteur'` and `tier=NULL`.** If those policies were the effective gate, every paying member would be denied. They are not the effective gate. Either way, **server-side tier enforcement is not functioning**, which is #125 restated with proof.
Also note `0002_premium_rls.sql:9` declares `CHECK (tier IN ('free','cinephile','archivist','auteur'))` while a live row holds `tier='projectionist'` — so that constraint is not applied live either. `20260325_projectionist_tier.sql:61` has its own ALTER **commented out**. Three independent signals that the migration files do not describe the live schema (#31).

### #55 · REAL — but the **diagnosis in the finding is wrong**, and the correct one changes the fix
Filed as "swallows every backend error — silently." Reading `lounge.ts` end to end:
- `fetchMessages` catch (`:519`) → `reelToast.error('Could not load messages — check your connection.')`
- `loadMoreMessages` catch (`:566`) → `reelToast.error('Could not load older messages.')`
Both **do** surface. The finding is wrong about the catch.
**The real defect is one line up.** supabase-js returns PostgREST failures in `{ data, error }` — **it does not throw**. `loadMoreMessages:541` guards with `if (data && data.length > 0 && !error)`, so a backend error skips the block, never reaches the catch, is never toasted, and is never logged. Same shape in `fetchMessages`.
⇒ The fix is **not** "add a toast to the catch" (already there) — it is `if (error) { logger.error(...); reelToast.error(...); return; }` before the success guard. Applying the filed fix would change nothing.

### #57 · REAL, confirmed exactly
`lounge.ts:536` `.lt('created_at', oldestMessage.created_at)` — a bare timestamp cursor with no tiebreaker. Messages sharing a `created_at` are skipped on the page boundary. Same class as the compound-cursor pattern used correctly in `notificationStore` and `ModerationService`.

### #54 · REAL, confirmed
`lounge.ts:327-372` computes unread counts client-side by fetching recent messages per lounge, while `mobile/supabase/migrations/get_user_lounges.sql` exists as a deployed RPC that does the same server-side.

### #52 · REAL — but **misfiled to the wrong file**, and it belongs somewhere that matters more
The handoff was right that `lounge.ts` contains no `_hasMore` symbol. The described defect exists in **`notificationStore.ts:194`**:
```ts
_hasMore: validated.length >= PAGE_SIZE && allNotifs.length < 500,
```
`validated` is the **post-salvage** array (`:166-173` drops rows failing `RealtimeNotifSchema`). One malformed row makes `validated.length < PAGE_SIZE` and **pagination stops permanently**, even though the server returned a full page. Re-file against `notificationStore`, not `lounge`. Fix: compare `data.length` (what the server returned) against `PAGE_SIZE`, not the salvaged length.

### #58 · REAL, confirmed exactly
`lounge.ts:767` `_lastCreateAt = now;` executes **before** the `create_lounge` RPC at `:771`. The error branch at `:776-780` returns without restoring it. A failed creation burns the full 30-second cooldown.

### #59 · REAL, confirmed
`deleteMessage` declared `lounge.ts:106`, implemented `:711`, referenced only by `lounge.test.ts`. Zero UI callers.

### #62 · REAL, confirmed exactly
`watchlistSlice.ts:151` and `:190` spread a new entry into `_watchlistPromises` per film id, and no code path ever deletes one. The correct pattern (`current.finally(() => map.delete(id))`) exists in `interactionSlice` in the same store.

### #63 · REAL — and it is a **deliberate trade-off**, which changes the right fix
`interactionSlice.ts:131` and `:228` both `.limit(500)`, each annotated `// Reduced from 2000 — prevents massive payloads`. So this is a known payload-vs-accuracy decision, not an oversight. Raising the limit re-creates the payload problem it was lowered to solve. The right fix is a server-side `has_endorsed(target_id)` lookup (or an `EXISTS` on demand), not a bigger prefetch.

### #64 · REAL, confirmed exactly
`films.ts:119-125` resets exactly 10 keys. The 14 pagination/mutex fields the finding names all exist — spread across `archiveSlice` (12 refs), `logSlice` (10), `logOperations` (15), `watchlistSlice` (13) — and none are cleared.

### #69 · REAL, confirmed against the live column
`mappers.ts:356` declares `position: number` and `:383`'s comment claims `.order('position', { referencedTable: 'list_items' })`. Live `list_items` rows return **`rank_position`**, no `position` column. Confirmed against production data.

### #82 · REAL, confirmed exactly · `grep -c invalidateQueries src/stores/domain/socialSlice.ts` → **0**

### #88 / #126 · REAL, confirmed exactly
`grep -c 'Sentry|captureException'` → **0** in every one of the six domain slices (`archiveSlice`, `interactionSlice`, `listSlice`, `logSlice`, `socialSlice`, `watchlistSlice`) **and 0 in `logOperations.ts`** — the file that performs the app's core write.

### #103 · REAL, confirmed exactly — and the audit's own later retraction of the RSS half was **wrong**
None of the three `<Markdown>` sites passes an `onLinkPress` prop (`grep -n onLinkPress` → no matches), so `react-native-markdown-display`'s default handler calls `Linking.openURL` with no scheme validation. The app's own `safeOpenURL` allowlist is used at **every other** link site (`ArticleReaderModal:401`, `WatchProviders:42/:82`, `SettingsScreen:459/460/494/496`, `useProfileController`).
`ArticleReaderModal:350` renders `content` for wire stories — **third-party RSS bodies** — through that unguarded renderer, while line 401 (the article's own "open original" button) correctly uses `safeOpenURL`. The surface the audit later claimed "does not exist" is the markdown body two lines above the one it checked.

### #129 · REAL, confirmed exactly
`src/utils/requestReview.ts` is fully implemented (`StoreReview.isAvailableAsync` → `requestReview`, prompt counting, logging). Grep across `src/` + `app/` for any importer: **zero**.

### #41 · REAL, confirmed
`NewsService.ts:53` `const FALLBACK_NEWS: NewsItem[]`, returned at `:118` (empty result) and `:140` (error).

### #43 · REAL, confirmed
`0005_log_comments_fk.sql` adds `log_comments_user_id_fkey → profiles(id)`. Consistent with the live table having been created from a different definition than this tree's (see #93).

### #95 · REAL, confirmed · `p_admin_id` sent at `ModerationService.ts:84` and `:95`.

### #50 · REAL, premise confirmed
`auth.ts:255-258` — `supabase.auth.signUp({ ..., options: { data: { username } } })`. That metadata feeds `handle_new_user`'s `COALESCE(raw_user_meta_data->>'username', split_part(email,'@',1))`, and `enforce_username_policy` may rewrite it on collision/reserved-word — with no echo back to the client. Same root as #36/#67.

### #6 / #9 · duplicate, FALSE POSITIVE (already retracted)
### #77 · FALSE POSITIVE (already retracted — offline follows do queue; `socialSlice.ts:168-173` re-verified this session: `enqueueMutation` + toast)
### #38 ≡ #127 · duplicate. #44 ≡ #128 · duplicate.

---

# VERDICT

## 1. Coverage — stated precisely, no overstatement

| depth | count | what it means |
|---|---|---|
| **Live-proven** (curl against production and/or executed code) | **31** | #1 #7 #23 #24 #26 #31 #32 #35 #36 #40 #46 #48 #67 #74 #84 #85 #87 #93 #103 #123 #125 + NEW-1 NEW-2 NEW-W1 + the dual-tree items |
| **Read line-by-line in the shipped source** | **48** | #2 #3 #4 #5 #37 #38 #41 #43 #44 #47 #50 #51 #52 #54 #55 #57 #58 #59 #62 #63 #64 #68 #69 #70 #71 #73 #75 #76 #78 #82 #83 #88 #92 #95 #104 #106 #112 #114 #126 #127 #128 #129 #131 #132 … |
| **Retracted / duplicate** | **5** | #6≡#9 (false positive) · #77 (false positive) · #38≡#127 · #44≡#128 |
| **Carried from the prior pass, not independently re-proven here** | remainder | mostly LOW items whose claims are single-line code-existence assertions; none is Blocking |

I am not going to claim I re-derived all 131 to the same depth in one session. Every **Blocking** and every **High** is in the first two rows.

## 2. Score against your four questions

**(1) False positives / intentional?**
- **False positives: 2** — #6 (≡#9, already retracted) and #77 (already retracted).
- **Intentional, correctly: 2** — #15 (`notify-push` fail-open, documented) and **#63** (the 500 endorsement cap is annotated *"Reduced from 2000 — prevents massive payloads"* — a deliberate trade-off, so "raise the limit" is the wrong fix).
- **Wrong diagnosis, right symptom: 1** — **#55**. The catch blocks already toast; the real defect is that supabase-js doesn't throw, so PostgREST errors are dropped by the `if (data && !error)` guard. **The filed fix would change nothing.**
- **Misfiled to the wrong file: 1** — **#52** belongs to `notificationStore.ts:194`, not `lounge.ts`.
- **Mis-scoped (real, numbers wrong): 8** — #2 (3 sites not 2) · #7 (**upgrade** from LOW) · #44/#128 (one live unbounded fetch, not two — the dossier half is dead code) · #68 (the "unused profiles" claim is false; they have 5 callers) · #75 (four impls, not three) · #76 (**208** dead lines, not 466; `withAbortSignal` has 45 live refs) · #83 (2 of 21) · #85 (**breakout half not substantiated** — it's a 400, not an injection) · #132 (7–39%, not 7–29%).
- Everything else I checked stands.

**(2) Is the fix the best one?** Three filed fixes are **wrong or insufficient** and would have shipped as regressions:
- **#74** — `parts.length === 3` misclassifies `"2026-06-21T13:39:08+00:00"` (it splits into 3). Applying it forces timestamps into UTC rendering — a *new* off-by-one. Use `/^\d{4}-\d{2}-\d{2}$/`, and `formatDate` should simply always render UTC.
- **#32** — `RETURNS TABLE(...)` breaks the PostgREST FK embed `FeaturedCritique.tsx:32` depends on (proven live). Keep `SETOF public.logs`, null the column.
- **#47** — "make `sync-entitlement` write only `tier`" is incomplete: `paytabs-handler` does the identical `update({role, tier})` and was never audited.
- **#85** — no escape sequence survives PostgREST's quoted `.or()` value (1 and 2 backslashes both tested live). The fix must be structural, not a better escape string.
- **#26** — Stage 1 was certified zero-risk on a `mobile/`-only sweep; the web app shares the backend. It *is* still zero-risk, but now on evidence covering both clients.

**(3) All gaps closed?** No — and the gaps were structural, not individual:
- The audit read **one of two `supabase/` trees**. 36 migrations and 2 edge functions, including the **live payment handler**, were outside its coverage claim of "edge functions 5/5".
- The audit read **`mobile/` only**. The live web app on the same backend has **no route-level auth gating** and shipped **NEW-W1**, a one-click full-archive export of any public Auteur's private notes.
- All four shared edge functions **differ between the trees** — so any conclusion drawn from reading a function body may describe code that isn't deployed. The live `tmdb-proxy` proves it: **no allowlist, and no authentication at all.**

**(4) Zero negative effects?** For each fix I recommend, the side-effect analysis is in-line above. The ones with genuine blast radius, flagged explicitly: #47/#48's tier change needs the `tier` back-fill first (29 of 32 rows are NULL); #26 Stage 2 needs `ProjectorRoom`'s `select('*')` fixed first; #123/#125's RLS work needs the live `pg_policies` read first.

## 3. What I would do, in this order

**Before launch — nothing else matters until these are done**
1. **NEW-1 · tmdb-proxy** — it is open and unauthenticated on the public internet with your TMDB key behind it. Redeploy with JWT verification + normalized-path allowlist (incl. `/search/keyword`). If TMDB suspends the key, both clients die.
2. **NEW-W1 · ProjectorRoom** — three one-line fixes; it is exporting members' private notes to anonymous visitors today.
3. **#26 + #32 together** — Stage 1 revoke *and* the `get_featured_critique` column fix. Either alone leaves private notes reachable.
4. **#42 · Delete Account** — deletes nothing (carried, verified in the prior pass; App Review rejects on this).
5. **#84 · LOGS search tab** — `42703` on every query, live-confirmed.

**Then the structural repair (it is the root cause of most of the rest)**
6. Collapse the two `supabase/` trees into one; audit `paytabs-handler` and `send-email` properly; record which migrations are live (#31).

**Then the Highs**, grouped so each group is one change rather than N:
7. **Identity**: #36 + #67 + #50 + #87 — one decision about what a username may contain, applied at `enforce_username_policy`, `validateUsername`, and `socialSlice.ts:62` simultaneously, **plus the denormalized-username back-fill** (5 live rows are already stranded).
8. **Tier**: #47 + #48 + #101 + the unstated **premium-field data loss on edit** — `role` becomes permission-only, `tier` back-filled, `normalizeTier` learns `projectionist` and gets loud, **both** entitlement writers changed, and `buildLogPayload` stops nulling premium fields on update.
9. **Dates**: #74 + #40 + #75 — fix the canonical `timeAgo.ts` (UTC for `formatDate`, strict-regex branch in `timeAgo`, leave `formatDateMonthYear`), then delete the three copies. Doing #74 without #75 leaves three uncorrected duplicates.
10. **Block/mute**: #92 + #106 + #112 + #114 — one shared filter at the four comment/notification render sites.
11. **Telemetry**: #88 + #126 — zero Sentry across all six domain slices.
12. Then #24, #46 (fix is verified working), #51, #54, #73, #82, #86, #103, #104, #122, #129.

**Lows** — batch them; none blocks. Strike #6 and #77 from the register.

---
---

# ROUND 2 — the findings I had not opened. Every one below was verified this pass.

## 🔴🔴 #65 · **UPGRADE TO BLOCKING** · the TMDB key is live, committed, and served to every web visitor today

The register downgraded this to *"partially stale — false today; rotate only if the repo goes public."* **That downgrade is wrong.** It was made from `mobile/` alone. Proven this pass:

1. **The key is in a tracked file at HEAD.** `git ls-files --error-unmatch .env.vercel.pull` → tracked. It contains `VITE_TMDB_API_KEY="d1e7…"` (32 hex chars, TMDB v3 format), added in commit `f66caf0`.
2. **The web app inlines it into the client bundle.** `src/utils/letterboxdImport.ts:23` reads `import.meta.env.VITE_TMDB_API_KEY` and `:140` interpolates it straight into a URL (`…&api_key=${TMDB_API_KEY}`). Vite substitutes `import.meta.env.VITE_*` at build time. Confirmed in the built output — the literal key string is present in **`dist/assets/index-*.js` and `dist/assets/SettingsPage-*.js`**. `dist/` is untracked but it is what deploys.
3. **The key is still valid.** `GET api.themoviedb.org/3/movie/550?api_key=<key>` → **HTTP 200**.

So both halves of the original finding — *"committed to git"* and *"shipped in the web bundle"* — are **true and current**.

**Also in that same tracked file:** `VERCEL_OIDC_TOKEN` (1326-char JWT). Vercel OIDC tokens are short-lived so it is almost certainly expired, but it should never have been committed. `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_URL` are public by design — not leaks.

**This couples to NEW-1 and the order matters.** Rotating the key while `tmdb-proxy` is still open and unauthenticated just launders a *new* key through a public endpoint. Correct sequence:
1. Close the proxy (auth + allowlist).
2. Remove `VITE_TMDB_API_KEY` from the web client — route `letterboxdImport` through the proxy like the mobile client already does.
3. **Then** rotate the key at TMDB.
4. `git rm --cached .env.vercel.pull`, add to `.gitignore`, and decide on history rewrite vs. accepting the historical exposure (rotation in step 3 makes the history value worthless, so a rewrite is optional).

---

## 🔴🔴 #42 · CONFIRMED — and **materially worse than filed**

Verified against the production dump and live.

- **Function body identical to the filed text** (`_schema_baseline.sql:1616-1626`): sets `is_banned = TRUE`, `ban_reason = 'USER_REQUESTED_DELETION'`. No redefinition in **either** migration tree.
- **`USER_REQUESTED_DELETION` appears exactly once** across the whole supabase tree — the write site. Zero readers. ✔
- **Live probe:** `POST /rest/v1/rpc/request_account_deletion` as **anon** → **HTTP 204**. The function exists, is granted to `anon` (`baseline:5634`), and executes; it matches zero rows only because `auth.uid()` is NULL.

**Three things the finding did not establish:**

1. **`handle_user_deletion` is attached to no trigger at all.** The baseline contains 23 `CREATE TRIGGER` statements and **none** references it (`grep "EXECUTE FUNCTION public.handle_user_deletion"` → no match). It is not "unreachable because the auth user is never deleted" — it is an **orphaned function**. Even deleting the auth user would not fire it.

2. **Twelve FKs block a profile delete, not five.** Full extraction of `REFERENCES public.profiles(id)` with no `ON DELETE`:
   `interactions_target_user_id_fkey` · `interactions_user_id_fkey` · `lists_user_id_fkey` · `logs_user_id_fkey` · `watchlists_user_id_fkey` · `tickets_user_id_fkey` · `vaults_user_id_fkey` · `mod_actions_admin_id_fkey` · `mod_actions_target_user_id_fkey` · `reports_target_user_id_fkey` · `warnings_admin_id_fkey` · **`venues_owner_id_fkey`**
   The finding assumed six of these are "cleaned by `handle_user_deletion`" — true only if it ran, and it never runs.

3. **Six tables hold the user's content with *no FK to profiles at all***, so no cascade can ever reach them:
   `log_comments` · `dossier_comments` · `physical_archive` · `push_tokens` · `lounge_message_reactions` · `dossier_certifications`
   Even a fully working `DELETE FROM profiles` would leave the member's **comment bodies (with their denormalized username), their entire physical archive, and their push tokens** behind permanently. For a GDPR Art. 17 erasure that residue is the whole point. `handle_user_deletion`'s body omits all six as well.

**So the fix is bigger than "wire it up":** it needs a deletion function that enumerates all 19 dependent tables explicitly, plus the moderation-retention decision the finding correctly flagged as yours.

---

## #80 · CONFIRMED exactly as filed
- `useBanCheck` — the only non-test references are a **barrel re-export** (`src/hooks/index.ts:10`) and a **comment** in `offlineQueue.ts:190`. Zero real consumers. ✔
- `is_banned` in the client appears only in `useBanCheck` itself, the Zod schema, `MemberDiscoveryService:33` (filters others out of discovery), `ProfileWriteService:19` (a select list), and `offlineQueue`. Never used to gate a write. ✔
- Live policy set from the production dump — exactly **12 `ban_block_*` policies over 10 tables**: `dossier_comments, dispatch_dossiers (insert+update), interactions, list_comments, list_items, lists, log_comments, logs (insert+update), lounge_messages, watchlists`. **`physical_archive` and `lounge_message_reactions` are absent.** ✔
- `is_user_not_banned()` (`baseline:1325-1334`) is `STABLE SECURITY DEFINER`, returns `NOT EXISTS(... id = auth.uid() AND is_banned)`. For a non-banned user it returns true, so a RESTRICTIVE policy ANDed on top **cannot** change legitimate behaviour. The proposed two-statement fix is safe. ✔

**Worth noting, inverted from expectation:** `offlineQueue.ts:194-199` performs a real server round-trip ban check and dead-letters the queue. So the **offline** write path is protected and the **online** path is not.

---

## #113 · CONFIRMED — and I closed the side-effect question the finding left open

- Both predicates confirmed one-directional (`baseline:1297-1304` `is_blocked_by`, `:1311-1318` `is_hidden_by`).
- **Usage confirmed by enclosing-definition analysis**, not just grep: `is_hidden_by` appears at `baseline:459`, `:579`, `:706`, enclosed by `get_community_feed_auth_cursor` (`:445`), `get_filtered_stacks_auth_cursor` (`:559`), `get_following_feed_auth_cursor` (`:690`). **Not in a single RLS policy.** ✔

**Two things the finding missed:**

1. **`is_blocked_by` is completely dead — and it is the *same anon oracle as #23*.** Zero callers anywhere (only its definition, a comment, and `GRANT … TO anon` at `baseline:5517`). It is `SECURITY DEFINER`, takes `viewer_id` as a caller-supplied parameter, and is granted to `anon` — identical to the #23 defect. **#23's fix as written patches only `is_hidden_by` and leaves this second door open.** Since it has no callers, **`DROP FUNCTION public.is_blocked_by` is the right fix**, not a rewrite.

2. **The open question is resolved: the index already exists.** The finding said it had *not* verified whether a reversed lookup would seq-scan and that this must be settled before implementing. It is settled — `baseline:3247` `CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id)`. The symmetric predicate's new `OR` branch is indexed. No new index needed. (Also present: `idx_user_blocks_blocker`, `idx_user_blocks_type (blocker_id, type)`, and `UNIQUE (blocker_id, blocked_id)`.)

Minor inconsistency spotted: `get_following_feed_auth_cursor:706` omits the `auth.uid() IS NULL OR` guard its two siblings carry. Harmless (`is_hidden_by(NULL, x)` → false → `NOT false` → passes, and the feed requires auth anyway), but it should match.

---

## #105 · CONFIRMED exactly, with the mechanism pinned down
`app/lounge/[id].tsx:497` renders `data={currentMessages}` — the **raw Zustand array**.
`blockStore.blockUser` (`:80-135`) updates its own state, persists to MMKV, and then invalidates only `queryClient` keys `['feed']` and `['universalSearch']`. `currentMessages` is Zustand, **not React Query** — nothing recomputes it.
Lounge block-filtering happens only at fetch (`lounge.ts:517`, `:563`) and on realtime insert (`:1142`).
⇒ Block someone mid-salon and their messages stay on screen until you leave and re-enter, while the toast says they're hidden. ✔

**Best fix** — and it is better than mutating the store: derive the rendered list instead. `useMemo` over `currentMessages` keyed on `useBlockStore(s => s._blockedIndex)`, exactly the `MemberRegistry.tsx:139-146` pattern the audit itself named as the reference implementation. Pure render-side, no store mutation (so it can't fight the realtime handler), and it fixes mute at the same time. Zero risk.

---

## #12 · The register's own downgrade is **correct** — with a residual worth one line
`archiveImport.ts:1318-1336`: caps entries at 2000 and total uncompressed at 50 MB **before** reading any entry. The guard is real and ordered correctly.
The residual the register named is genuine: `(zip.files[name] as unknown as {_data?:{uncompressedSize?:number}})?._data?.uncompressedSize ?? 0` reads a JSZip **internal**. The `?? 0` means that if JSZip ever renames it, every entry contributes 0 and the size cap **silently becomes a no-op**, leaving only the 2000-entry bound — which permits 2000 unbounded entries.
**Fix:** fail closed instead of open — if the size is not a finite number, reject the archive rather than treating it as 0.

---

## #49 · CONFIRMED — **both halves**, and the second one is the important one
`mmkv-storage.ts:68-74`:
```ts
} catch (e) {
  if (__DEV__) console.warn('[mmkv] encryption init failed; using unencrypted store', e);
}
```
1. **Silent failure confirmed.** A keystore failure degrades to a fully unencrypted store, and in production (`__DEV__` false) it is logged **nowhere** — not `logger`, not Sentry. A device in that state stays unencrypted forever with zero signal.
2. **The justifying comment is factually false.** It claims *"the cached data is non-sensitive."* Verified what MMKV actually persists: `films.ts:32-49` `partialize` persists `logs, watchlist, lists, interactions, physicalArchive` (logs windowed to 150), and `film.types.ts:36` shows `DomainLog.privateNotes`. So the cache holds **up to 150 logs including their private notes**, the whole physical archive (a paid feature), and the block list. That is the single most sensitive field in the product — the one #26 is a Blocker about.

**Fix, in dependency order (this is not a single change):**
- Now, zero risk: replace the `__DEV__ console.warn` with `logger.error` + `Sentry.captureException`, and correct the comment.
- Later, **only after** the `buildLogPayload` edit-path fix from #48: strip `privateNotes` from the persisted window so it never touches disk regardless of encryption. **Not safe today** — if the user opens the edit form before the post-launch fetch resolves, the notes field would be empty and the current payload builder would write that emptiness back. Do them in that order.

---

## #98 · CONFIRMED exactly — all three links
- `membership.tsx:504-505` hardcodes `$` and `49`; `:513` hardcodes "Compare to $19.99/yr".
- `revenueCat.ts:248` — `['archivist','auteur'].find(t => productId.startsWith(t))` → `founding_lifetime` fails, `continue`. And `if (!period) continue` drops `LIFETIME` even if it passed.
- `constants/membership.ts` — `TIERS` ids are `cinephile`, `archivist`, `auteur`. No `founding`.
The live price is therefore not merely unused, it is never collected. ✔

## #99 · CONFIRMED exactly — chain verified end to end
`revenueCat.ts:363-366` catch → `parseEntitlements(null)` → `:83-88` fallback `{tier:'cinephile', isActive:false}` → `membership.tsx:558-560` `else` branch → `isManualVIP` guards **only** `founding` → `updateUser({tier:'cinephile'})` demotes a paid Archivist/Auteur. The screen's own `catch` never fires because `restoreIAP` doesn't throw. ✔
DB-safety claim also verified: `syncEntitlementToSupabase` sits **inside** the try (`revenueCat.ts:360`), so a thrown restore never reaches it. ✔
**One coupling the finding didn't draw:** on a *successful* restore that legitimately finds nothing, `syncEntitlementToSupabase('cinephile')` **does** run — and that is the exact #47 admin-strip path. #47 and #99 are the same button.

## #100 · CONFIRMED · #101 · CONFIRMED exactly
- `setLocalTierHint` (`auth.ts:419-426`) writes state + `ironvault_user_cache_*` directly, no DB round trip. `handleCheckout:155` and `handleFoundingCheckout:215` use it correctly; the restore handler uses `updateUser` at `:555` and `:559`. ✔

## #102 · REAL — **three** controls, not two
`st.restoreBtn` used at `:542`; `st.manageBtn` used at **both `:580` and `:591`**. None carries `hitSlop`. Computed: restore ≈ 12+12+~11+2border ≈ **37px**; manage ≈ 8+8+~10 ≈ **26px**. Both under 44pt, and the manage style is used twice.

---

## Round 2 continued — the remainder

### #133 · **FALSE — and it is contradicted by #65**
The finding asserts *"No secrets leaked — but stating what I checked."* Disproven above: `.env.vercel.pull` is **tracked at HEAD** and holds a **live** TMDB key plus a Vercel OIDC token, and the key is inlined into the deployed web bundle. Strike #133 from the register; it is an incorrect all-clear, which is worse than a missing finding because it was used as evidence of coverage.

### #96 · CONFIRMED — I doubted this one and was wrong; the finding is exactly right
`20260622_rpc_auth_hardening.sql:140-142`:
```sql
-- Calculate expiry for time-limited actions (suspend, mute_user)
IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
  v_expires_at := now() + (p_duration_hours || ' hours')::interval;
END IF;
```
The comment says the branch covers **suspend *and* mute_user**; the condition covers only `suspend`. So three silent no-ops, all while `UPDATE reports SET status='resolved'` (`:146-151`) already ran:
1. `WHEN 'mute_user'` → `suspended_until = v_expires_at` = **NULL** → mutes nobody.
2. `'suspend'` with no `p_duration_hours` → same.
3. `WHEN 'delete_content' THEN NULL;` → nothing.
The comment/condition mismatch is the proof it is unintentional. Latent (the UI's `EnforcementAction` type excludes `mute_user`/`delete_content`), but the `ModAction` Zod enum permits them.

### #94 · CONFIRMED — also one I mis-read first
Not `summonEvidence` (that is correctly lazy, fired only by an explicit tap at `:848`). The N+1 is `tribunal.tsx:872` — `{!!item.target_user_id && <EnforcementHistory userId={item.target_user_id} />}` mounted **unconditionally inside the report `.map()`**, each running its own `useQuery`. Exactly as filed.

### #27 · CONFIRMED — re-measured live, and one of its "clean" notes is wrong
Anon read surface, counted this session:
```
logs 254 · watchlists 852 · list_items 247 · lists 9 · interactions 100 · profiles 32
log_comments 7 · dossier_comments 1 · dispatch_dossiers 1 · lounges 5 · lounge_messages 6 · physical_archive 3
notifications 0 · user_blocks 0 · lounge_members 0   <- correctly sealed
```
Matches the finding's numbers exactly. **But its accompanying "clean" note — *"`profiles` denies anon outright (42501 permission denied)"* — is false.** `profiles` denies only the *revoked columns*; `select=id,username,role,tier,preferences,…` returns all 32 rows to anon (that is how most of this audit's probes ran). The 42501 the earlier pass saw was a column-level denial being read as a table-level one.

### #25 · CONFIRMED exactly
`scripts/check-backend-live.mjs:58` — `SELECT proname FROM pg_proc p JOIN pg_namespace n …`. Names only, never signatures. This is precisely why #24 passed the contract check while being uncallable.

### #35 · CONFIRMED exactly
`FollowRequestService.ts:56-59` — `.ilike('username', '%…%').limit(500)` with **no `.order()`**. `LIMIT` without `ORDER BY` is non-deterministic in Postgres, and `restrictIds` then constrains the inbox to that arbitrary subset. Cannot fire at 32 profiles; correct as filed (Low, scale).

### #50 · CONFIRMED at the source
`_schema_baseline.sql:1154` — `COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))`, no sanitisation; `auth.ts:255-258` supplies the metadata. `enforce_username_policy` may then rewrite it with no echo to the client. Same root as #36/#67. (`:1155` also confirms `venue_owner` is assigned at signup — the value #47 says gets overwritten.)

### #47 · both writers now confirmed at the source
`sync-entitlement/index.ts:119` `const dbRole = tier === 'founding' ? 'auteur' : tier;` and `:146` `.update({ role: dbRole, tier: dbRole })`. Identical to `paytabs-handler:165`. **NEW-B1 stands: the filed fix is incomplete.**

### #37 · #39 · #45 · #53 · #56 · #61 · #70 · #79 · #87 — all CONFIRMED
- **#37** — `getFilmReviewCount` referenced only by its definition and `servicesBatch2.test.ts`. Dead. ✔
- **#39** — `FeedService.ts:389-392,412` builds `endorseMap` from `interactions` rows fetched **as the viewer**, under RLS ⇒ `certifyCount` is viewer-dependent. `:310` uses a server-computed `certify_count` on a different path, so the two disagree. ✔
- **#45** — `FeedService.ts:374` pulls `list_items` up to 600 rows for 60 lists while 4 posters render per card. Live data: **247 items / 9 lists = 27.4 avg ⇒ 27.4/4 ≈ 6.9×**. The finding's "~7×" is exact. ✔
- **#53** — three sites, not the two the title implies: `mine = r.user_id === myId` immediately after `if (r.user_id === myId) return;` in **both** reaction handlers (provably always `false`), plus `lounge.ts:653`'s `.slice(0, Math.max(MESSAGE_DEDUP_CAP, s.currentMessages.length + 1))` — `max(100, len+1)` is always ≥ the new length, so it can never truncate. ✔
- **#56** — `lounge.ts:482`: `// Wait, fetchMessages maps and reverses them. Let's see. The fetch order is 'created_at' descending, so newest first.` Literal reasoning-aloud in shipped code. ✔
- **#61 — REAL but the fix as implied would BREAK A LIVE FEATURE.** `cinema_reviews`, `vaults`, `venues` have **0** client references. **`tickets` has 4 and is live** — `archiveSlice.ts:238` reads it, `:270` and `mutationExecutor.ts:471` insert into it. Dropping the "dead subsystem" wholesale would destroy the ticket-stub feature. Drop only the three.
- **#70** — `getCinephileStats` has zero consumers outside its own wiring in `logSlice`. Dead in mobile. ✔
- **#79** — `dossier.schema.ts`'s exports are reached only through the `schemas/index.ts` barrel and the dead `DossierService`. ✔
- **#87** — complete chain verified: `useProfileController.ts:81-87` derives `isSelf` by comparing `user.username` to the **route param**; after a rename those differ ⇒ `isSelf` false and the by-username lookup misses ⇒ `app/user/[username].tsx:425` "Member Not Found". `app/(tabs)/profile.tsx:44` passes a live `usernameOverride` so the tab is immune, but `app/user/[username].tsx:861` gates Edit Profile on `isSelf` **alone**, so the route path reaches Edit, and `useEditProfile.ts:274` `router.back()`s you onto the stale URL. ✔

### #86 · CONFIRMED — every link
`useProfileData.ts:552-556` seeds `watchlist: 0` on the cache-first self path and immediately clears loading. `profileComputed.ts:265` protects the tab pill with `String(counts.watchlist || displayWatchlist.length)`. `app/user/[username].tsx:896` renders `<StatCard label="WATCHLIST" value={counts.watchlist} />` — **raw**, while its three siblings all use `Math.max`/`||`. Two contradictory counts on screen at once.
The filed fix and its side-effect analysis check out: `profileComputed`'s `useMemo` dep array (`:269`) already contains both `counts` and `displayWatchlist.length`, so no new inputs are needed.

### #122 · CONFIRMED — and the draft deletion is the part that hurts
`sanitizeInput.ts:56-58` — `if (clean.length > maxLen) clean = clean.slice(0, maxLen)` — **silent truncation, no signal in the return type**. `MAX_LENGTHS.dossierContent = 25000` chars ≈ 4,200 words. `compose.tsx:161` then `storage.delete(DRAFT_KEY)`.
`isOverLimit()` and `remainingChars()` exist in the same file and **`compose.tsx` uses neither** (grep: no matches). So the author gets no counter, no warning, a truncated publish, and their draft deleted.
**Fix order matters:** add the counter/blocking validation *before* touching the truncation, so the failure mode moves from "silently destroyed" to "cannot submit".

### #60 · CONFIRMED — and there is a one-line fix better than the filed one
- Online (`content.ts:266`, `:292`): `tempId = Crypto.randomUUID()` is used **as the row `id`** in the insert, so the optimistic row and the server row share an id.
- Offline (`mutationExecutor.ts:585-593`): `dbPayload` **omits `id`** ⇒ Postgres mints a different UUID.
- The executor does return `{ newId, fakeId }` (`:596-598`), but `offlineQueue.ts:315-316` writes it into a **local `idMap` used only to rewrite later queued payloads** — it is never applied to the `content.ts` store. So `content.ts:178-181`'s `!mapped.some(m => m.id === d.id)` keeps the local row alongside the fetched one. Both render. ✔
**Best fix:** add `id: p._tempId` to the offline `dbPayload` so both paths insert the same id. That removes the need for any remap, and makes the two paths identical — the online/offline-parity principle this codebase states everywhere else. Zero risk: the online path already proves the column accepts a client UUID.

### #72 · REAL — **10 dead util files, 637 lines** (finding said nine / 596)
Measured by importer sweep (excluding tests and self):
`concurrencyScope 41 · dateUtils 39 · debounce 13 · navigationSnapshot 78 · performanceMonitor 217 · qos 57 · requestReview 59 · safeParse 15 · sanitize 71 · storyExporter 47`
Plus `apiCircuitBreaker` (151) which is **transitively** dead — its only importer is the dead `qos`. True total **788 lines**.
Worth flagging on its own: **`sanitize.ts` (71 lines) is dead while `sanitizeInput.ts` is the live one.** A dead near-namesake of the security utility is a trap for the next reader.

### #81 · CONFIRMED **exactly** — 813 lines
Importer sweep (excluding tests and the barrel): 13 dead hooks totalling **783** lines —
`useAnalytics 93 · useBanCheck 22 · useDebouncedSearch 118 · useEntitlement 126 · useFilmReviews 15 · useLoungeData 63 · useParallaxBreathing 56 · useSafeAsync 57 · useScaledFont 6 · useStableSubscription 60 · useStaggeredPrefetch 68 · useStreak 75 · useTMDBMovies 24`
— plus `src/hooks/index.ts` at 30 lines = **813**. The finding's number is precise.
**One of these matters far beyond dead code: `useEntitlement` (126 lines) is dead.** That is the RevenueCat entitlement check. Its absence is *why* #125 is true — paid-tier gating runs entirely through `resolveTier` on a client-held profile object with no entitlement verification anywhere.

### #130 · REAL, ~12% over-counted
Measured **1,717 lines** across 26 files (10 utils + apiCircuitBreaker + 13 hooks + the hooks barrel + `DossierService`) against the claim of 1,957 across 28 modules. Direction and magnitude right; the residual is presumably components, which I did not sweep.

### #33 · #11 · #13 · #14 · #107 · #108 · #109 · #110 · #111 · #115 · #116 · #117 · #118 · #119 · #120 · #121 · #124 — all CONFIRMED
- **#33** — `20260701_02` is used twice: `_lounge_profiles_fk_embeds.sql` and `_schema_drift_fixes.sql`. ✔
- **#11** — `archiveImport.ts:829` `skipped += agg.viewCount` accumulates **view counts** into the field the UI labels as unmatched films. ✔
- **#13** — `FilmHero.tsx:143` `reviews.length >= 10 ? '+' : ''` renders "10+" at exactly 10. ✔
- **#14 — FALSE POSITIVE, correctly retracted.** `offlineQueue.ts:133-134` fires **both** `logger.warn` and `reelToast.error('Offline queue full — oldest action dropped.')`. ✔
- **#107** — `log/[id].tsx:461` `if (loading) return <View style={s.container} />;` versus `dossier/[id].tsx:404-407` and `lounge/[id].tsx:442`, which both render an `ActivityIndicator`. ✔
- **#108** — `previousData` captured at `:315-316` behind an eslint suppression, never read. ✔
- **#110** — both locations dead: `log/[id].tsx:720` and `stacks/[id].tsx:827`, unreachable because `hideMute` is passed at `:706` / `:813` and `ContentActionSheet.tsx:159` renders Mute only `if (!showUnblock && !hideMute)`. ✔
- **#111** — `critiquesSectionY.current = 80 + y`. ✔
- **#115** — `social-modal.tsx:182` toasts with **no** logger; `:249` logs **and** toasts. Same file, two standards. ✔
- **#116/#117** — `stacks/[id].tsx:387` `if (__DEV__) console.error(...)` (nothing in production) and `:511-513` toast with no telemetry. ✔
- **#118** — `stacks/[id].tsx:792-793` `onBlock`/`onMute` never call `setActionSheetVisible(false)`, while the sibling handler at `:789` does. ✔
- **#119** — `stacks/[id].tsx:745` + style `:912` `padding: 8` around a 14px icon + 1px border = **32px**, no `hitSlop`, while neighbouring controls carry `hitSlop={{10,10,10,10}}`. ✔
- **#120** — exactly 4 `no-unused-vars` suppressions in `reels.tsx` (`:8, :174, :176, :178`). ✔
- **#121** — `ReportSheet.tsx:63` `const SCREEN_HEIGHT = Dimensions.get('window').height` at module scope, and it is the **only** `Dimensions.get` call in the entire app (total count: 1). Every other component uses `useWindowDimensions`. ✔
- **#124** — exactly 2 `no-unused-vars` suppressions in `compose.tsx` (`:9, :17`). ✔

### #89 · #90 · #91 — all CONFIRMED exactly
- **#89** — `logOperations.ts:355`: `AccessibilityInfo.announceForAccessibility('Film logged to your archive')` sits in the **`finally`**, so it fires on both `throw error` paths at `:293-294` and `:296-297`. A VoiceOver user is told the log succeeded when it failed. ✔
- **#90** — `logOperations.ts:293`/`:296` toast `'Failed to seal record. Please try again.'` then re-throw; `useLogFlow.ts:360` catches and toasts `'The record could not be sealed. Try again.'`. Two toasts, one failure. ✔
- **#91** — `useLogFlow.ts:353-357` bare `setTimeout(…, 650)`, no ref, no cleanup — while the draft timer 40 lines above (`:309-324`) is correctly ref'd **and** cleared, and `useEditProfile.ts` uses `sealTimerRef`. The asymmetry is what proves it unintentional. ✔

### #34 · #8 — process/scope items, no defect
- **#34** — a stated limitation of the earlier pass's method (a grant list is a point-in-time snapshot), not a code defect. It is however now *reinforced*: the dual-tree discovery means point-in-time snapshots of **either** tree are unreliable.
- **#8** — Android launch wiring genuinely absent; iOS-only launch is the plan of record. A scope decision, correctly parked.

### #66 — does not exist
The register skips from #65 to #67. There is no finding #66. The "131" is a label, not a count.

---

## Round 2 final — the NEW-* and A-* findings

### NEW-3 · CONFIRMED exactly · your own Vault goes stale and refresh can't fix it
`profileComputed.ts:48` types `physicalFilter: string | null`; `:66` computes `const hasPhysicalSearch = physicalFilter !== 'all'`. The value is only ever `null` or a format id, so **`hasPhysicalSearch` is constant `true`**. The proof it's a slip and not intent is 145 lines below, at `:211`, where the same variable is tested correctly: `if (!physicalFilter) return displayVault;`.
Consequence traced to the consumer: `:86` — `if (isSelf) return hasPhysicalSearch ? vault : myVault.map(toProfileVaultItem);` ⇒ for your own profile `displayVault` **always** reads the server snapshot `vault` and never the live local `myVault`. Since Profile is a mounted tab, a newly added disc never appears for the session. ✔

### NEW-5 · CONFIRMED exactly · "OBSCURITY INDEX" is fabricated
`CinemaDNACard.tsx:105` — `Math.round(40 + (5 - (avgRatingNum || 3)) * 12 + Math.min(totalCount, 30))`. No popularity term, no rarity term, nothing obscurity-related: it rises as you rate **lower** and log **more**. A real `obscurityScore(movie: { popularity? })` exists at `tmdb.ts:481` and is not used here. ✔

### NEW-6 · CONFIRMED exactly, including the "no live exposure" half
`supabase/sql/get_filtered_stacks.sql:20` and `get_following_feed.sql:35` are `SECURITY DEFINER` with **no `SET search_path`** (grep confirms the pin is absent in both). Live probe:
```
rpc/get_following_feed   -> PGRST202 (not deployed)
rpc/get_filtered_stacks  -> PGRST202 (not deployed)
```
Correct as filed: no current exposure; the hazard is that applying these files would install unhardened definers. Delete them or pin the path before they are ever run.

### A-1 · CONFIRMED exactly · CSV import can flip a private stack public
`archiveImport.ts:965-981` — idempotency is keyed on **title** (`.eq('user_id', userId).eq('title', safeTitle)`), the existing row's id is reused, and the upsert hardcodes **`is_private: false`** and `is_ranked: false` while overwriting `description`. Import a CSV list named the same as an existing private stack and that stack is republished, unranked, and its description replaced. ✔

### A-2 · CONFIRMED exactly · non-US dates corrupt per-row
`archiveImport.ts:304-313` decides the format **inside the per-row match**:
```ts
if (numA > 12) return `${yr}-${numB}-${numA}`;   // must be DD/MM
return `${yr}-${numA}-${numB}`;                  // otherwise assume MM/DD
```
So within one European file, `25/03/2024` is read correctly and `05/03/2024` is silently transposed. Mixed corruption in a single import is exactly what makes it undetectable. The two-pass fix the finding proposes (if **any** row has first-number > 12, treat the whole file as DD/MM) is the right shape. ✔

### A-3 · CONFIRMED exactly · a 1–10 export can double every rating
`archiveImport.ts:251-256` — `detectRatingScale` branches on `Math.max(...)` alone. A 1–10 export where the member never rated above 5 yields `max <= 5` → `'half-five'` → every value imported at face value on a 5-scale, i.e. doubled in meaning. `clampRating` (`:264-268`) bounds it to [0,5] so nothing violates the CHECK — which is precisely why it lands silently. ✔

### A-4 · CONFIRMED exactly · reviews can attach to the wrong film
`archiveImport.ts:401-405`:
```ts
let best = yearNum ? movies.find(m => m.release_date?.startsWith(String(yearNum))) : null;
if (!best) best = movies[0] ?? null;
```
Unconditional fallback to the first result whenever the year doesn't match — and the source is `tmdb.search`, the three-tier engine that includes typo-tolerance and **semantic keyword discovery**, so a title with no genuine match can still return a popular unrelated film.
`searchType` is produced by that engine (`tmdb.ts:227, 288, 296, 352` set `'failed' | 'exact' | 'person' | 'typo'`) and **`archiveImport` never reads it** — grep for `searchType` returns only `src/lib/tmdb.ts`. There is no confidence gate. ✔

### A-5 / A-6 · CONFIRMED (both are duplicates of items already in the register)
A-5 ≡ **#11** (`skipped += agg.viewCount`). A-6 ≡ **#12** (the `?? 0` fail-open on JSZip's private `_data.uncompressedSize`). Merge them rather than counting them twice.

### #30 · **STILL UNVERIFIABLE FROM HERE — the one item I could not close**
Requires reading `vault.decrypted_secrets` and `net._http_response`, neither reachable with the anon key. The two queries in the finding are correct and are the only way to settle it. **This is the single remaining open item in the register**, and it is launch-critical: if the Vault half was never stored, every push silently 401s with no client-side signal. Run it in the SQL editor.

### Register entries with no content
**#10, #16–#22, #97** have no text anywhere in `ALL-FINDINGS-FULL.md` — they are gaps in the numbering, not findings. **#66** likewise (the register jumps 65 → 67). **#196 · "43,661"** is a line-count artifact that got swept into the list. So "131" is a label, not a count: the register holds **~120 real entries**, of which 5 are duplicates and 3 are false positives.

---
---

# FINAL VERDICT — supersedes the Round-1 verdict above

## Coverage

Every entry in the register that has content has now been verified against the shipped code, the production schema dump, or the live backend. **One item remains open and cannot be closed from here: #30** (needs `vault.decrypted_secrets` + `net._http_response` in the SQL editor).

The register is not 131 findings. **#10, #16–#22, #66, #97 have no text; #196 is a line-count artifact.** Real entries: **~120**.

| verdict | count | which |
|---|---|---|
| **REAL, confirmed as filed** | ~92 | the bulk |
| **REAL but mis-scoped** (numbers/locations wrong) | 14 | #2 #7 #44/#128 #53 #61 #68 #72 #75 #76 #83 #85 #96(no) #102 #130 #132 |
| **Wrong diagnosis, right symptom** | 1 | #55 |
| **Misfiled to the wrong file** | 1 | #52 |
| **FALSE POSITIVE** | 3 | #6 (≡#9) · #14 · #77 |
| **FALSE ALL-CLEAR** | 1 | **#133** |
| **INTENTIONAL, correctly** | 2 | #15 · #63 |
| **Duplicates** | 5 | #9≡#6 · #38≡#127 · #44≡#128 · A-5≡#11 · A-6≡#12 |
| **Open** | 1 | #30 |

## The four questions, answered

**1 · False positives or intentional?**
Three false positives (#6/#9, #14, #77 — all already retracted by the register itself). Two correctly intentional (#15; **#63**, whose 500-cap is annotated *"Reduced from 2000 — prevents massive payloads"*, so "raise the limit" is the wrong fix). One wrong diagnosis (**#55** — the catches already toast; the real defect is that supabase-js doesn't throw, so `if (data && !error)` drops PostgREST errors; **the filed fix would change nothing**). One misfiled (**#52** belongs to `notificationStore.ts:194`). And one **false all-clear** — **#133 "no secrets leaked" is wrong**, see below.

I was wrong twice in Round 1 and corrected myself on re-check: **#96** (I doubted it; the finding is exactly right — the comment says the expiry branch covers `mute_user` and the condition doesn't) and **#94** (I looked at `summonEvidence`; the N+1 is `EnforcementHistory` mounted inside the `.map()`).

**2 · Is the fix the best one?** **Five filed fixes are wrong or incomplete and would have shipped as regressions:**
- **#74** — `parts.length === 3` misclassifies `2026-06-21T13:39:08+00:00` (it splits into 3). Use `/^\d{4}-\d{2}-\d{2}$/`; `formatDate` should simply always render UTC.
- **#32** — `RETURNS TABLE(...)` breaks the FK embed (proven live). Keep `SETOF public.logs`, null the column.
- **#47** — incomplete: `paytabs-handler:165` does the identical `update({role, tier})`. Both writers or neither.
- **#85** — no escape sequence survives PostgREST's quoted `.or()` (1 and 2 backslashes both tested live). Must be structural.
- **#61** — "drop the dead subsystem" would **destroy a live feature**: `tickets` has 4 live call sites. Only `cinema_reviews`, `vaults`, `venues` are dead.

Three fixes I improved on rather than corrected: **#60** (send `id: p._tempId` in the offline payload — removes the need for any remap), **#105** (derive the filtered list in render, don't mutate the store — can't fight the realtime handler), **#113** (`DROP` the dead `is_blocked_by` rather than rewrite it).

Two open side-effect questions the register flagged, now **closed**: **#113**'s reversed-lookup index already exists (`idx_user_blocks_blocked`, baseline:3247); **#46**'s aggregate-embed fix I executed against production and it returns the exact predicted counts.

**3 · Gaps closed?** Not by the original audit. Three structural blind spots, each yielding live findings:
- It read **`mobile/` only** → the web app's `ProjectorRoom` exports any public Auteur's private notes to anonymous visitors, and #65's key is live in the web bundle.
- It read **one of two `supabase/` trees** → `paytabs-handler` (the live payment path) was never audited, and all four shared edge functions differ between trees.
- It trusted **source over deployment** → the live `tmdb-proxy` has no allowlist and **no authentication at all**.

**4 · Zero negative effects?** Per-fix analysis is inline throughout. Five have real ordering dependencies and must not be applied blind:
- #47/#48 need the `tier` back-fill first (29 of 32 rows are NULL).
- #26 Stage 2 needs `ProjectorRoom`'s `select('*')` fixed first.
- #49's disk-stripping needs #48's `buildLogPayload` fix first, or it causes data loss.
- #65's rotation must come **after** closing the proxy, or you rotate into an open endpoint.
- #123/#125 need a live `pg_policies` read first — two conflicting policies exist in history and RLS ORs them.

## Revised order of work

**Blocking — in this order, the sequence matters**
1. **NEW-1 · `tmdb-proxy`** — open and unauthenticated on the public internet, fronting your key.
2. **#65 · the TMDB key** — live, tracked in `.env.vercel.pull` at HEAD, and inlined in the deployed web bundle. Remove from the web client → then rotate. (After 1, not before.)
3. **NEW-W1 · `ProjectorRoom`** — three one-line fixes; anonymous full-archive export of private notes.
4. **#26 + #32 together** — a `SECURITY DEFINER` result set ignores column GRANTs, so Stage 1 alone doesn't close it.
5. **#42 · Delete Account** — deletes nothing; `handle_user_deletion` has **no trigger**; **12** FKs block a delete and **6** tables have no FK at all so no cascade can reach them. App Review 5.1.1(v) + GDPR Art. 17.
6. **#84 · LOGS search tab** — `42703` on every query.
7. **#30** — run the two Vault queries. If push is dead you want to know before launch, not after.

**Then the structural repair** — collapse the two `supabase/` trees; audit `paytabs-handler`; record which migrations are live (#31); fix the contract checker to compare signatures not names (#25 — this is why #24 was invisible).

**Then the Highs, grouped so each group is one change:**
- **Identity** — #36 + #67 + #50 + #87, plus the denormalized-username back-fill (5 rows already stranded on `sajjadsaleel_`).
- **Tier** — #47 + #48 + #99 + #101 + the unstated premium-field data loss on edit. Note `useEntitlement` is **dead code**, which is *why* #125 is true.
- **Dates** — #74 + #40 + #75 (fix the canonical util, then delete the three copies).
- **Block/mute** — #92 + #105 + #106 + #112 + #114 as one shared filter; plus `DROP is_blocked_by`.
- **Telemetry** — #88 + #126 (zero Sentry in all six domain slices).
- **Import engine** — A-1 + A-2 + A-3 + A-4. All four are silent data corruption on a flow the app advertises. If CSV import isn't launch-critical, disabling that one path is cheaper than fixing four.
- Then #24, #46, #51, #54, #73, #80, #82, #86, #96, #98, #100, #103, #104, #122, #123, #129.

**Lows** — batch. Strike **#6**, **#14**, **#77** and **#133** from the register; merge **#9→#6**, **#127→#38**, **#128→#44**, **A-5→#11**, **A-6→#12**.

---
---

# ADDENDUM — self-audit of this report

I machine-checked every register entry (118 numbered) against this document. Three entries had been carried on the register's own word rather than verified by me, despite the Round-2 verdict claiming full closure: **#15, #28, #29**. All three are now verified below. (#106 and #112 also flagged by the checker but are genuinely covered — they sit inside the combined §"#92 / #106 / #112 / #114" heading with per-file evidence.)

### #28 · CONFIRMED exactly
Counted directly in the production dump: **49 `SECURITY DEFINER`**, **25** carrying `SET search_path` ⇒ **24 without**. The filed number is exact.
The register's reachability analysis holds and is worth keeping attached to the finding: none of the 24 uses dynamic SQL, twelve are trigger functions, and PostgREST clients cannot issue `SET search_path`. So this is DR/rebuild hardening, not 24 live vulnerabilities — **except** `is_hidden_by`, which is High for the separate reason in #23, and now also `is_blocked_by` (see #113).

### #29 · REAL but **UNDERSTATED** — 11 droppable indexes, not 9
Extracted and grouped every `CREATE INDEX … USING btree (…)` in the dump by table+signature:
```
2x  interactions (target_log_id)
2x  interactions (target_user_id)
2x  interactions (user_id)
4x  logs         (created_at DESC)     <-- the finding counts this as ONE pair
2x  logs         (film_id)
2x  logs         (user_id)
2x  notifications(created_at DESC)
2x  profiles     (username)
2x  watchlists   (user_id)
```
`logs (created_at DESC)` exists **four** times, so it alone contributes **3** redundant indexes. Total droppable: **1+1+1+3+1+1+1+1+1 = 11**. The finding's table of 9 signatures is right; its count of 9 duplicates is not.
`logs` is the hottest write table in the app and it is paying for **four** copies of the same index on every insert and update.

### #15 · CONFIRMED INTENTIONAL — and I verified the live half myself rather than carrying it
Both tree copies are identical (`mobile/…/notify-push/index.ts:73-79`, `supabase/…/notify-push/index.ts:39-45`):
```ts
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SHARED_SECRET') || ''
if (FUNCTION_SECRET && (req.headers.get('x-function-secret') || '') !== FUNCTION_SECRET) { … 401 … }
```
The `FUNCTION_SECRET &&` guard means an unset env var skips the check entirely — fail-open, exactly as described — and the docstring at `:11` documents it as deliberate (*"if FUNCTION_SHARED_SECRET is set, require it"*), so it can start working before the secret is configured. **Intentional, correctly filed.**
Live probe confirms the secret is set today:
```
POST /functions/v1/notify-push  no x-function-secret   -> HTTP 401
POST /functions/v1/notify-push  wrong secret           -> HTTP 401
```
**The residual risk is real and couples to #30:** one missing env var silently opens the endpoint; a different missing Vault secret silently kills delivery. Neither failure surfaces anywhere. When you run #30's queries, check `FUNCTION_SHARED_SECRET`'s presence in the same pass — the two failure modes are opposite and both invisible.

### Corrected coverage statement
118 numbered register entries. **117 verified in this session. One open: #30**, which cannot be closed without the SQL editor. No entry is now carried on the register's own word.

---
---

# ROUND 3 — re-challenging the 110 "real" findings for false-positive / intentional status

Method: for each finding, ask *"what would make this deliberate?"* and go looking for the evidence — design comments, deliberate patterns, the value's provenance, and whether the proposed fix would break the feature. Intentionality is only a live hypothesis for a subset; for findings whose mechanism is "this column does not exist" (#84) or "this function deletes nothing" (#42) there is nothing to re-litigate. **~30 findings were re-challenged in depth this round; 5 changed classification, and one new blocker fell out of the process.**

---

## 🔴 NEW-C1 · **CI IS RED ON `main` RIGHT NOW** — and no finding in the register reports it

`.github/workflows/god_tier_ci.yml:50-54`:
```yaml
# Runs the full Jest suite AND enforces the coverage thresholds in
# jest.config.js. A failing test or a coverage regression now blocks merge.
- name: Jest (with coverage gate)
  run: npx jest --coverage --ci --maxWorkers=2
```
I ran that exact command:
```
Jest: "./src/stores/" coverage threshold for statements (32%) not met: 31.75%
Jest: "./src/stores/" coverage threshold for functions  (29%) not met: 28.78%
EXACT CI COMMAND EXIT CODE: 1
```
All 989 tests pass. **The build fails on the coverage gate**, by 0.25 and 0.22 percentage points.

**Why this matters more than its size:** the go/no-go condition of record is *"CI must be green before the launch build is cut from `main`."* **#1 does not achieve that** — it addresses 32 lint warnings and nothing else. Fixing #1 leaves the build red.

**Fix — and the right one is not to lower the numbers.** Two `src/stores/` thresholds sit fractionally above current coverage; global thresholds sit ~6 points *below* it. Lowering the two failing numbers makes the gate green and permanently useless. The correct move is to add the handful of `src/stores/` tests that carry those two metrics back over the line, **and in the same commit raise the four global thresholds to just under measured coverage** (statements 22.63 / branches 18.55 / functions 20.15 / lines 23.76) so the ratchet actually ratchets. That resolves NEW-C1 and #132 together, in the direction the gate was written for.

---

## Reclassified — these five change status

### 🚫 #13 · **FALSE POSITIVE — and the implied fix is a regression**
The claim: `FilmHero.tsx:143`'s `reviews.length >= 10 ? '+' : ''` wrongly renders "10+" at exactly 10.
**It is correct.** `useFilmDetail.ts:20` fetches `FilmService.getFilmReviews(String(filmId), 10)` — **page size 10**. `reviews` is the first page and **can never exceed 10 elements**. So `>= 10` reads "we filled the page, there may be more", which is exactly right for a capped fetch.
Changing it to `> 10` — the only reading under which the finding makes sense — would make the `+` **unreachable forever**, because the array is hard-limited to 10. The finding inverts a correct predicate.
*(The `> 999 ? '999+'` convention at `MemberFaceStack.tsx:40` is not a counter-example: that value is a computed overflow, not a capped array length.)*
**Action: strike #13. Do not touch that line.**

### ⚠️ #27 · **INTENTIONAL** — public readability is the product, not a leak
The finding lists anon-readable `logs 254 · watchlists 852 · lists 9 · list_items 247 · physical_archive 3` as an exposure. Re-challenged:
- The **live web app has no route-level auth gating at all** — `/`, `/feed`, `/film/:id`, `/user/:name` all render logged-out and *depend* on these reads.
- `can_view_user_data()` returning true for public profiles is the written RLS policy, not an accident.
- The Vault is **designed to be visible on other members' profiles**: `useProfileData.ts:238` gates the physical tab on `isArchivistPlusTier(state.targetUser)` — the **viewed** member's tier — and `ProfileDataService:212` counts `physical_archive` for `targetUser.id`. Watchlist is the same shape.
⇒ Anonymous read of a public member's content **is the design**. The finding itself hedges ("whether public profiles should be world-readable is your call"); the answer is that the product already answered it.
**What survives as real** is only the *inconsistency* it names: `get_user_analytics` refuses `auth.uid() IS NULL` while the underlying tables serve anon. That is a coherence defect, not an exposure. Downgrade to Low-cosmetic.
**This does not touch #26** — `private_notes` is proven non-intentional by three independent client layers and the `profiles.email` revoke precedent, and #26 stands unchanged.

### #122 · the **cap is intentional**; the failure mode is not — so the fix changes
`sanitizeInput.ts:28-32` documents the limit explicitly:
> *"Essays are longform by design: ~4,500 words (a 15–20 minute read). This is the sanitizer's memory/abuse fence, not an editorial limit — no genuine essayist should ever feel it."*
So `dossierContent: 25000` is a deliberate abuse fence and **must not be raised**. That sentence also shows why the bug exists: the author reasoned nobody would reach it and therefore never designed the reached path.
**Corrected fix:** do not touch the constant. Add the counter/blocking validation that already exists unused in the same file (`isOverLimit`, `remainingChars` — `compose.tsx` calls **neither**), so the failure moves from *silent truncation + draft deletion* to *cannot submit*. `compose.tsx:161`'s `storage.delete(DRAFT_KEY)` must not run on a rejected publish.

### #131 · REAL and **materially worse than filed** — and the obvious fix breaks CI
Baseline: `npx tsc --noEmit -p tsconfig.json` is **clean** — production code typechecks.
I built a temp config including `__tests__` and ran it: **152 type errors**. Several are not stylistic — they prove tests assert against shapes production never produces:
```
filmStore.test.ts:175  '_archiveIndex' does not exist in type 'FilmState'
filmStore.test.ts:202  DomainLog[] missing required 'status'
filmStore.test.ts:202  _loggedIndex typed Record<number,true>, production is Record<number,DomainLog>
filmStore.test.ts:262  Type 'number' is not assignable to type 'string'
ActivityCard.test.tsx:55  'role' is missing in type 'User'
```
A test sets `_archiveIndex` on a store that has no such field. **Part of the suite is green against objects the app cannot produce** — which independently corroborates #38/#127's "tests give false confidence".
**The naive fix — deleting `"**/__tests__/**"` from `exclude` — turns CI red with 152 errors.** Correct sequence: add a separate `tsconfig.test.json` + a **non-blocking** `typecheck:tests` job, fix the 152 (starting with the shape mismatches, which are real bugs in the tests), then make it blocking. Never flip the exclude in one commit.

### #132 · REAL but **half of it is backwards**
Measured: statements **22.63%**, branches **18.55%**, functions **20.15%**, lines **23.76%**.
- Global thresholds (12/14/17/16) are ~6 points **below** actual ⇒ the ratchet is slack, exactly as filed.
- But the `./src/stores/` thresholds (32 statements / 29 functions) are **above** actual and are **failing** — which is NEW-C1. The finding describes a gate that is too loose; two of its numbers are simultaneously too tight and red.
Fix them as one change, per NEW-C1.

---

## Re-challenged and **confirmed not intentional** — the reasoning, not just the verdict

The decisive test for the dead-code cluster is whether each module's own docstring **claims a usage it does not have**. Parked-on-purpose code says so; forgotten code lies about itself.
- `concurrencyScope.ts` — *"all store-level fetch operations pass to Supabase queries"*. **Zero importers.** (#71)
- `useStreak.ts` — *"Updates Supabase profiles on each log."* It is a pure `useMemo` with **no Supabase call at all**. (#81)
- `useEntitlement.ts` — ships a full `Usage:` example. Never imported. (#81)
- `requestReview.ts` — labelled *"10/10 F-03"*, a numbered deliverable. Never called. (#129)
- `CACHE_KEYS.USER` — docstring says *"Used in auth.ts, auth-callback.tsx, edit-profile.tsx"*; those files use the raw template string (`auth.ts:423`). (#83)
⇒ Five modules assert usage that does not exist. That is the signature of oversight, not deliberate parking. **Dead-code cluster confirmed real.**

**And it reframes #88/#126.** `performanceMonitor.ts` (217 lines) is a complete, correct Sentry wrapper — `startSpan`, P95 budget breadcrumbs, custom measurements, and an explicit no-op path when the DSN is empty. It is **dead**. So the telemetry finding is not "add instrumentation to 25 files"; it is **"wire the instrumentation layer that was already built and never connected."** Cheaper, lower-risk, and already designed to degrade safely.

### Others re-challenged, verdict unchanged
- **#63** — remains the clearest genuine *intentional*: `// Reduced from 2000 — prevents massive payloads` on both `.limit(500)` sites. Real consequence, deliberate trade-off. Fix is a server-side `has_endorsed` lookup, never a bigger prefetch.
- **#93** — not intentional-by-design. `MAX_LENGTHS` is a complete client model, but the team **did** author a server CHECK (`log_comments.content <= 2000`) — it simply landed on a column name the live table doesn't have. They intended a server backstop; it missed.
- **#62** — real, but **not worth fixing before launch.** Session-scoped, bounded by films-touched-per-session, never persisted. The honest answer to "are we doing the right thing" is: leave it.
- **#45** — real (247 rows fetched to render ~32 = **7.7×**, matching the filed ~7×), but I verified live that the counts it produces are **currently correct** (88, 96, 25 …) because 247 < the 600 budget. The truncation risk is latent, not live. Its fix is the same aggregate embed that fixes #46 — **one change closes both**, and I have already executed that query against production.
- **#90** — two toasts confirmed (`logOperations.ts:293/296` then `useLogFlow.ts:360`), and the finding is right that *which copy survives* is a product call, not an engineering one.
- **#64 / #83 / #52 / #107 / #108 / #111 / #119 / #121** — re-checked for deliberate design; in every case the same file or its sibling does the opposite thing correctly (`interactionSlice` cleans its mutex map, `dossier`/`lounge` render spinners, neighbouring controls carry `hitSlop`, every other component uses `useWindowDimensions`). Internal inconsistency is the evidence of oversight. All confirmed real.

---

## Corrected tallies after Round 3

| verdict | before | **after** |
|---|---|---|
| Real defect | 110 | **108** |
| False positive | 4 | **5** (+#13) |
| Intentional / by design | 2 | **3** (+#27, downgraded to a Low coherence note) |
| False all-clear | 1 | 1 |
| Unresolved | 1 | 1 (#30) |
| **New, unreported** | — | **NEW-C1 — CI is red on `main`** |

**Three filed fixes corrected this round** (adding to the five corrected earlier):
- **#13** — do nothing; the current code is right.
- **#122** — do **not** raise the 25 000 cap; it is a documented abuse fence. Add the unused validators instead.
- **#131** — do **not** delete the tsconfig exclude in one commit; it turns CI red with 152 errors. Stage it behind a non-blocking job.

---

## NEW-C1, scoped precisely — and the exact state of every CI gate

`god_tier_ci.yml` runs four gates. I ran all of them:

| gate | command | result |
|---|---|---|
| Strict TypeScript (Web) | `npx tsc --noEmit` (repo root) | **0 errors — green** |
| Strict TypeScript (Native) | `npx tsc --noEmit` (`./mobile`) | **0 errors — green** |
| Jest + coverage gate | `npx jest --coverage --ci --maxWorkers=2` | **EXIT 1 — RED** |
| ESLint | (32 warnings, 0 errors) | green unless `--max-warnings 0` |

So the build is red for **exactly one reason**: two `src/stores/` coverage thresholds, short by **0.25** and **0.22** percentage points. 989/989 tests pass. Production code typechecks clean on both halves of the repo.

That precision matters for the fix: this is not "coverage is bad", it is "two numbers are a quarter of a point too high while four others are six points too low."

### #131 · the fix is not greenfield — the scaffold exists and was abandoned
`mobile/tsconfig.test-check.json` is **tracked in git**, and:
- it includes exactly **three** files (`__tests__/integration/helpers.ts`, `src/stores/auth.ts`, `src/stores/followStore.ts`),
- it is referenced by **nothing** — not `package.json`, not any workflow,
- and it **fails today** (`helpers.ts:114,117` — `Type 'unknown' is not assignable to type '{} | null'`).

Someone started #131's remediation, scoped it to three files, never wired it, and left it broken. The fix is therefore *finish and connect what is already there*, widening its `include` incrementally as errors are cleared — which is exactly the staged, non-blocking rollout the finding needs anyway.

*(That config also surfaces two `src/stores/mmkv-storage.ts:52,66` errors — `new MMKV({ encryptionKey })` missing `id` — which do **not** appear under the project's real `tsconfig.json`. They are a config-divergence artifact, not a production defect: omitting `id` selects the default instance, which is precisely what the surrounding comment says is intended. Worth reconciling the two configs; not a finding.)*

---
---

# ROUND 4 — per-finding intent challenge, one at a time, in register order

**Count correction first.** The "108" was wrong, and so was my earlier "110". The register file holds 118 numbered entries; **#23, #24, #25, #26, #27 and #42 are body-only** and were never in that file, so they were never inside the 118. Correct arithmetic:

```
118 numbered in all-131-findings.txt
 −12 excluded that are IN the file (6 9 13 14 77 15 63 133 30 127 128 196)
 = 106
 + 5 body-only real findings (23 24 25 26 42)          [27 is body-only AND intentional]
 = 111 real findings
```

**The number to work is 111.**

---

## NEW-C2 · `mobile/.eslintrc.js` is dead configuration

Found while intent-challenging #120/#124. ESLint here is **v9.39.4**, which uses flat config and **ignores `.eslintrc.js`**. `mobile/eslint.config.js` exists and is the one in force.

Proof it is not merely theoretical — none of `.eslintrc.js`'s own rules has ever fired anywhere in the codebase:
```
grep -c 'complexity|no-console|tsdoc|no-floating-promises|await-thenable' over the full lint output -> 0
```
In 93k LOC, `complexity > 15` and `no-console` would fire somewhere. They don't, because they aren't loaded. Forcing the legacy config on confirms the delta:
```
ESLINT_USE_FLAT_CONFIG=false npx eslint . --ext .ts,.tsx
 -> 1285 problems (332 errors, 953 warnings)
```

**Verdict — and I am deliberately not inflating this.** The flat config is clearly *deliberate and well-maintained*: it carries a documented `no-restricted-imports` guard against `AnimatedFlashList` (citing a real New-Architecture RecyclerView crash, Sentry REACT-NATIVE-6, builds 31/34), plus considered per-file overrides. And since the legacy config produces **332 errors**, it can never have been enforced in a green build. So this is a **stale artifact, not a lost-enforcement regression**.
**Fix:** `git rm mobile/.eslintrc.js`. It is actively misleading — it documents five rules (`no-floating-promises`, `await-thenable`, `complexity`, `no-console`, `tsdoc/syntax`) that a reader will reasonably assume are enforced and which are not.
**Separate, optional:** `@typescript-eslint/no-floating-promises` is genuinely valuable for this codebase's async surface. Adopting it is a follow-up decision, not a launch item.

---

## Per-finding verdicts — Round 4

### #1 · REAL — not intentional
The `export { RouterErrorBoundary as ErrorBoundary }` at `_layout.tsx:4` sits directly under the import it re-exports, which reads as deliberate *adjacency* — but there is **no eslint override anywhere accepting `import/first`**, so the 26 warnings are unacknowledged rather than accepted. Hygiene item, confirmed.
**Fix / zero-effect proof unchanged**, with one addition now that I've read the active config: run `--fix` on the other five files only. `eslint.config.js` has no `import/first` autofix exemption, and `_layout.tsx` imports three side-effecting modules (`initEncryptedStorage`, `AccessibilityProvider`, `sentry`) whose order is not provably safe to permute.

### #2 · REAL — not intentional
No comment at either consumption site (`ArticleReaderModal.tsx:349`, `dossier/[id].tsx:465`) — just `{/* Body content */}`. No recorded decision to accept the unfixable `linkify-it` advisory. Confirmed.

### #120 · REAL — **exactly four**, and I nearly called it a false positive
`.eslintrc.js:11` sets `@typescript-eslint/no-unused-vars: 'off'`, so I expected the suppressions to be no-ops. They are not — that file is dead config (NEW-C2) and the **flat** config sets the rule to `'warn'`. Verified empirically:
```
npx eslint app/(tabs)/reels.tsx                     -> clean (suppressions working)
npx eslint --no-inline-config app/(tabs)/reels.tsx  -> exactly 4:
   9:31   useAnimatedScrollHandler
 175:102  isCommunityRefetching
 177:102  isFollowingRefetching
 179:93   isStacksRefetching
```
The finding's count of four is **exact**. ✔
**Fix — and the naive reading breaks the screen.** The suppressions sit above lines carrying a *mix*. Of the reanimated import block, `Animated, FadeInDown(3), useSharedValue(4), useAnimatedStyle, withTiming, useDerivedValue(3), Easing(2)` are all **live**; only `useAnimatedScrollHandler` is dead. Of the three feed destructures, 18 of 21 names are live. **Delete the four identifiers, never the four lines.**

### #124 · REAL — **exactly two**, but "two dead imports" is the wrong description
`--no-inline-config` gives exactly two: `TactileEngine` (`:10`) and `spacing` (`:18`). ✔
But only **one is a dead import statement**. The other is one member of `import { colors, fonts, spacing }` where `colors` has **35** uses and `fonts` has **16**. Deleting that import statement — the literal reading of "two dead imports" — breaks 51 references.
**Fix:** delete the `TactileEngine` line entirely; from the theme import remove **only** `spacing`.
(`compose.tsx:77`'s third suppression is `react-hooks/exhaustive-deps`, a different rule, and is genuinely load-bearing — a real missing `edit` dependency. Not part of #124; worth its own look.)

### #12 · **INTENTIONAL** — the fail-open is documented and reasoned
`archiveImport.ts:1330-1332` carries the decision in the code:
> *"JSZip exposes the uncompressed size on the internal `_data`; if unavailable **it's treated as 0 (the entry-count cap still bounds the work)**."*
The author considered the missing-size case and accepted it, leaning on `MAX_ZIP_ENTRIES = 2000`. That is a recorded trade-off, not an oversight — so #12 moves to **intentional**.
**But the reasoning has a hole worth stating:** the entry cap bounds *count*, not *size*. If JSZip renames that internal, every entry contributes 0 and 2000 unbounded entries pass both caps. One line closes it without changing the design — treat a non-finite size as a rejection rather than as 0. Recommended, but it is hardening on a deliberate decision, not a bug fix.

### #41 · **INTENTIONAL** — the fabrication is known and deliberately scoped
`NewsService.ts:134-137`:
> *"Live results stand on their own — FALLBACK_NEWS is ONLY for the empty/failure cases (handled above and in catch). **Appending it here would surface fabricated articles with faked dates + dead links.**"*
The team knows the fallback items are fabricated with faked dates and dead links, and deliberately confined them to the empty/failure path. The finding reads this as an oversight; it is a documented graceful-degradation choice. **Reclassify to intentional.**
**Point 4 — is it the right thing?** I don't think so, and it's worth putting to you: when the RSS feed is down, a member sees invented headlines with fake recency and links that go nowhere. That is the one behaviour this codebase otherwise refuses (cf. NEW-5, where a fabricated stat was called out as out of character). An honest empty state costs nothing and can't erode trust. Recommend replacing `FALLBACK_NEWS` with an empty state — as a **product decision**, not a defect fix.

### #101 · REAL — and its own justification comment points at dead code
`auth.ts:411-418` documents exactly why `setLocalTierHint` exists:
> *"`tier` and `is_founding` are server-derived … and aren't in ProfileService's update whitelist, so routing this through `updateUser()`/ProfileService would **silently no-op the DB write while still paying for the network round trip**. The canonical value is reconciled by the polling loop in **`useEntitlement.purchase()`**/membership.tsx…"*

So the finding is exactly right that the restore handler (`membership.tsx:555`, `:559`) uses the one function the codebase warns against.
**New coupling, previously unstated:** the reconciliation mechanism that comment relies on is **half dead**. `useEntitlement` has **zero importers** (#81) — 126 lines, never mounted. Only the `membership.tsx` half of the documented polling exists (`:165`, `:225`). So the safety net named in the comment does not fully exist, which makes #99's local demotion stickier than the comment implies. **#81 is not merely dead code — it removes the documented recovery path for #99/#101.**

### #37 · #59 · REAL — no parking intent
Neither carries any "keep for later" marker: `FilmService.getFilmReviewCount` is a plain unused method; `lounge.ts:711 deleteMessage` is a plain implementation with no callers and no note about the semantic the finding says was rejected. Both confirmed dead code.

### #5 · #7 · REAL — confirmed
- **#5** — the only reference to `test-app` anywhere is `tsconfig.eslint.json:19` (an `exclude` entry). No runtime path. Confirmed, and the earlier correction stands: remove that line in the same commit.
- **#7** — `preferences` was introduced by `20260329_auth_persistence_v2.sql:24` as a "user settings store" with **no grant/revoke consideration recorded anywhere**. Not intentional exposure; simply never considered. Confirmed, and the upgrade from LOW stands.

---

## Round 4 coverage — stated honestly

I individually intent-challenged **~40 of the 111** across Rounds 3 and 4. Reclassifications found: **#13** (false positive), **#27**, **#12**, **#41** (intentional). Plus two findings the register never had: **NEW-C1** (CI red) and **NEW-C2** (dead eslintrc).

For the remaining **~71 I have not individually re-challenged this round**, my position is a categorical one and I want it labelled as such rather than dressed up as per-item work: their mechanisms are *proven malfunctions* — a column that returns `42703` (#84), a function whose body deletes nothing (#42), a regex that cannot match its input (#73), an escape that provably does not escape (#85), an RPC signature that does not exist (#24), a `finally` block that fires on the throw path (#89). For these, "intentional" would require someone to have intended a broken result, and each mechanism was demonstrated empirically in Rounds 1–2 rather than inferred.

That is a defensible argument, but it is **not** the same as having looked at each one for a design comment — and on the evidence of this round it is not risk-free: **#12 and #41 both turned out to carry explicit intent comments that only reading the surrounding lines revealed.** Two of roughly forty. If that rate holds, **~3–4 more intentional items are likely sitting in the 71 I have not re-read.**

I would rather tell you that than claim a completeness I did not earn.

---
---

# ROUND 5 — reading each finding **and its surrounding code**, in register order

## 🔴 NEW-W2 · The AUTEUR Calendar plots every log on the wrong day for every non-UTC user
`src/components/profile/AUTEURCalendar.tsx` (web app — a paid Archivist feature)

Two key spaces, built on different bases, then joined:
```ts
// :39-41  map keys — from the date-only string, parsed as UTC midnight
const d = new Date(raw)                    // raw = "2026-06-07"
const key = d.toISOString().slice(0, 10)   // -> "2026-06-07"   correct

// :52-65  grid keys — from a LOCAL Date object, then converted to UTC
const start = new Date(today)              // local
start.setDate(today.getDate() - 52 * 7)
let cursor = new Date(start)
const dateKey = cursor.toISOString().slice(0, 10)   // shifted by the offset
```
Executed on this machine (UTC+3):
```
map key  (date-only string, UTC-parsed) : 2026-06-07
grid key (local Date object)            : 2026-06-06
*** MISMATCH ***
```
The grid cell the user reads as one day carries the key of another, so `map[dateKey]` resolves to the neighbouring day. **Off by one for every timezone except UTC** — backwards for positive offsets, forwards for negative. It reproduces on the project's own machine timezone, which is why it is not hypothetical.
Same root cause as #40/#74 (`toISOString()` used to derive a calendar date) and it belongs in that cluster's fix.

---

## #23 · REAL — the recorded intent is about *mute semantics*, not caller trust
`20260620_feed_block_filtering.sql:18-20` documents the design choice:
> *"Block-or-mute check (broader than `is_blocked_by`, which is block-only) — Matches the client's `filterContentByBlocks()`/`BlockStore.isHidden()` semantics."*
So the **semantics** were deliberate. What is nowhere acknowledged is the combination that makes it an oracle: `SECURITY DEFINER` + `GRANT … TO anon` + `viewer_id` taken from the **caller** rather than `auth.uid()`. The `SECURITY DEFINER` is required (it must read `user_blocks` past RLS) and the anon grant is required (the feed RPCs serve logged-out visitors) — only the caller-supplied identity is unexamined.
**This is what makes the fix safe:** using `auth.uid()` internally preserves the documented block-or-mute semantics exactly and changes no legitimate result.

## #24 · REAL — and the docstring proves the intent ran the other way
`ModerationService.ts:102-108`:
> *"Priority queue via the **repaired** RPC — the cursor is compound (report_count, created_at, id) **to match the RPC's own ordering**, so no page can skip or duplicate a case."*
The author believed the RPC had been repaired to take the compound cursor. **No migration in either tree defines it.** So the client is the correct half of the contract and the database is the missing half — which settles the fix direction: **write the migration, do not rewrite the client.** Rewriting the client to the live 2-param signature would discard the compound cursor and reintroduce skip/duplicate on paging, which the comment shows was a deliberate design goal.

## #25 · REAL — and **substantially worse than filed**
Filed as "names only, never signatures." Reading the whole script, there are three compounding defects:
1. **Names only** — `SELECT proname FROM pg_proc …` (`:58`). Signature drift is invisible. ✔ as filed.
2. **Silently skips, then reports success.** `:56-69` — `if (DB_URL) { … } else { console.warn('⚠ RPC check skipped') }`. On the skip path `checkedRpcs` stays false, `failed` stays false, and the script prints `✓ Verified present in production: nothing.` before `process.exit(0)`. **An unconfigured run is indistinguishable from a passing run at the exit-code level.**
3. **It is wired to nothing.** No workflow references it; no `package.json` script. It has never run in CI.
So #24 was not invisible because the check was weak — it was invisible because **the check never ran, and would have exited 0 if it had.**
**Fix:** wire it into CI; compare `proname || '(' || pg_get_function_identity_arguments(oid) || ')'`; and make *skipped* a non-zero exit (or a distinct code), so a misconfigured pipeline cannot report green.

## #36 · REAL — no intent recorded at the decision point
`useEditProfile.ts:155` — `if (sanitizedUsername !== user.username)` carries **no comment**. The only nearby comment is about an unrelated `display_name` mapping. Nothing anywhere frames "the sanitiser changed the string" as an intentional rename trigger. Confirmed.

## #40 · REAL — and **it is in the web app too, which the finding never covered**
The mobile site carries a comment that changes the scope of the fix:
```ts
// ── Form state (matches web LogForm.tsx L37-60) ──
const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
```
Mobile is **deliberately mirroring the web implementation** — so the UTC default was inherited, not chosen. And the web app has the same defect in **six** places:
```
src/components/log-modal/LogForm.tsx:52          the default date
src/components/log-modal/LogForm.tsx:104         the edit-mode fallback
src/components/log-modal/LogDateSelector.tsx:21,22   "Today" button + its active-state comparison
src/components/log-modal/LogDateSelector.tsx:29,30   "Yesterday" button + comparison
src/components/profile/AUTEURCalendar.tsx:41,67      calendar keys  -> NEW-W2
```
**Consequence for the fix:** repairing mobile alone makes the two clients disagree on the default date for the same member — worse than the current consistent-but-wrong state. The `localCalendarDate()` helper must land in **both** clients in the same change, and `LogDateSelector`'s comparisons must move with the buttons or the "Today" pill will highlight the wrong option.

---

## 🚫 #54 · **FALSE POSITIVE as filed — and its recommended fix would take the lounge list down**

Filed as: *"The lounge list recomputes unread counts client-side with unbounded queries, **duplicating a deployed RPC**."*

Live probe:
```
POST /rest/v1/rpc/get_user_lounges
 -> PGRST202  "Could not find the function public.get_user_lounges … in the schema cache"
```
**The RPC is not deployed.** `mobile/supabase/migrations/get_user_lounges.sql` defines it (`RETURNS TABLE (… unread_count bigint …)`, `:23`, `:96`) and it was **never applied** — the same class of repo-vs-live drift as #24 and #31.

So the client is not duplicating a deployed RPC; it is doing the work **because the RPC does not exist**. The surrounding comment confirms the client path was built deliberately: `// Calculate unread counts and last message timestamps — BATCHED (no N+1)`.
**Applying the filed fix — "use the deployed RPC" — replaces a working path with `PGRST202` and breaks the lounge list.**

**But two real defects live inside it, and neither is the one filed** (`lounge.ts:349-375`):
1. **Genuinely unbounded.** The `lounge_messages` query has `.in('lounge_id', loungeIds)` and a `.gt('created_at', oldestLastRead)`, and **no `.limit()`**.
2. **Unread counts are under-reported — a correctness bug.** `oldestLastRead` is computed from `memberships.filter(m => m.last_read_at)`, so a membership with a **null** `last_read_at` is excluded from the floor. Messages in that never-opened lounge older than another lounge's `last_read_at` are never fetched, so its badge reads too low. It only counts correctly when *every* membership is unread (no `.gt()` applied at all) — which is also the unbounded case.

**Correct fix:** keep the client path (it is the only one that works), add a bound, and make the floor honest — `oldestLastRead` must fall back to "no floor" whenever *any* membership has a null `last_read_at`, or the per-lounge floors must be applied per lounge rather than globally. Deploying the RPC is a separate, later option and must not be sequenced first.

---

## #82 · REAL — and sharper than filed
`socialSlice.ts` has **zero** query-client wiring: no import, no `invalidateQueries`, nothing.
But the intended behaviour is already demonstrated elsewhere in the codebase:
```
MemberRegistry.tsx:83   if (ok) queryClient.invalidateQueries({ queryKey: ['feed', 'following'] })
blockStore.ts:131,188,252,306   queryClient.invalidateQueries({ queryKey: ['feed'] })   // block/unblock/mute/unmute
```
So the invalidation lives in **one call site** instead of in the store. Following from the **Member Registry** refreshes the feed; following from the **profile screen** (`useProfileController` → `followUser`) does not — and the profile screen is the primary follow surface.
**Fix:** move the invalidation into `followUser`/`unfollowUser` in `socialSlice`, matching `blockStore`'s house pattern.
**Zero-side-effect proof:** the exact call being moved is already executed today from `MemberRegistry.tsx:83` after a successful follow, so its behaviour under this app is empirically known. Leaving the registry's own call in place is a harmless double-invalidate; removing it is optional.

## #67 · REAL — the guard is intentional, its charset is not
`socialSlice.ts:61` carries `// Defense-in-depth format guard — fail fast on malformed input`. The *mechanism* is deliberate and worth keeping. What was never decided is the **charset**: it encodes the app's intended username policy rather than what `profiles.username` can actually hold, and the database contains five handles the app's own signup path produced. Intentional guard, unintended blast radius.
**Fix must preserve the documented intent** — keep a guard, widen it to the column's real constraint, and fix the data (#36) in the same decision.

## #46 · REAL — the cap is deliberate, deriving the count from it is not
`fetchOtherUserLists` (`ProfileDataService.ts:448-457`) is documented as *"Fetches cursor-paginated lists with their items for another user's profile"*, and `.limit(4, { foreignTable: 'list_items' })` carries no comment. Four is a sensible fetch bound — only four posters render. Nothing anywhere records that the **count** is then taken from that capped array. Cap intentional, count-from-cap the oversight — which is exactly why the fix keeps the cap and adds `film_count:list_items(count)` (already executed against production).

## #44 · REAL — no intent, and the surrounding code shows the file is otherwise careful
`getLogComments` (`LogService.ts:171-176`) has no `.limit()` and no comment. Directly above it, `getLogDetails` carries deliberate schema-drift handling (`logger.warn` + `captureError` to Sentry on a Zod mismatch). The file is attentive; this function was simply never bounded.

## #68 · REAL — no intent anywhere in the file
`createList` (`listSlice.ts:162-168`) inserts `title`/`description` raw, with no comment and no `sanitizeInput` import anywhere in `listSlice.ts` — while `addDossier`, `addLogComment`, `addStackComment` and `createLounge` all sanitize at their service boundary and say so. Confirmed.

---

## Round 5, batch 3 — #69 to #125

### #84 · REAL — and **worse than filed**
`useUniversalSearch.ts:62-63`:
```ts
.select('id, user_id, film_title, review, rating, username, role, poster_path, status, abandoned_reason, created_at')
.or(`film_title.ilike."%${safeText}%",review.ilike."%${safeText}%",username.ilike."%${safeText}%"`)
```
The finding names the **select list**. The `.or()` filter *also* references `logs.username`. Both columns return `42703` live. So the query is broken on two independent counts, and the `username` predicate would have to be removed as well as the two select columns — a fix that only strips the select list still fails.
This site is also one of the interpolated `.or()` queries whose escaping is a proven no-op (#85), so the two fixes touch the same line and should land together.

### #69 · REAL — the type *and* the comment both document a column that doesn't exist
`mappers.ts:356` declares `position: number` on `ListItemRow`, and `:383` states *"Items arrive pre-sorted from server via `.order('position', { referencedTable: 'list_items' })`."*
Live `list_items` returns **`rank_position`**; there is no `position` column. The real queries do use `.order('rank_position', …)` (`ProfileDataService:455`, `FeedService:374`), so sorting works — **only the type and the comment are wrong**. That is the whole risk: a future reader trusting the comment writes `.order('position')` and gets a silent `42703`. Confirmed real; the fix is a two-line correction with no runtime effect.

### #106 · #112 · #114 · CONFIRMED — no filtering intent anywhere
- `app/log/[id].tsx` — the only `filter` calls in the comment path are optimistic delete-by-id (`:375`, `:396`). No block/mute reference at all.
- `app/(modals)/notifications-modal.tsx:173` — the only filter is `n.type !== 'follow_request'`.
- `app/stacks/[id].tsx:367` — `getStackComments` result is used unfiltered.
None of the three carries so much as a TODO. Confirmed.

**A useful by-product for #73:** `notifications-modal.tsx:173` shows `groupNotifications(...)` **is** wired and called on every render. So #73's "completely inert" is exactly right in mechanism — the function executes and returns only `individual` items, because `getGroupKey` can never produce a key. The fix is server-side (populate `film_id`), and no client change alone can help.

### #103 · CONFIRMED — both render sites pass only `style`
```
ArticleReaderModal.tsx:350   <Markdown style={markdownStyles}>
dossier/[id].tsx:467         <Markdown style={markdownStyles}>
```
No `onLinkPress` on either, so `react-native-markdown-display`'s default handler calls `Linking.openURL` unguarded — while `safeOpenURL` is used at every other link site in the app. Confirmed.

### #118 · CONFIRMED — the contrast is in adjacent lines of the same object literal
`app/stacks/[id].tsx:788-793`:
```tsx
onReport={() => { setActionSheetVisible(false); setReportSheetVisible(true); }}
onBlock={()  => blockUser(list.userId)}
onMute={()   => muteUser(list.userId)}
```
Three handlers, same literal: one closes the sheet, two don't. Unambiguous oversight, not a design choice.

### #123 · CONFIRMED — the client gate is the only gate in the publish path
`compose.tsx:134-137`:
```ts
const handlePublish = async () => {
    if (!canWrite) { reelToast.error('Auteur tier required'); return; }
```
`canWrite = isAuteurPlusTier(user)` — a client-side check on a client-held profile object. Combined with the RLS finding (two same-command policies with different names, ORed, one ownership-only), there is no effective server gate. Confirmed.

---

# CLOSING STATEMENT — coverage, honestly

Across five rounds every one of the **111** real findings has been verified for existence, and I have now read the surrounding code for the substantial majority. What that re-reading changed, cumulatively:

**Became false positives (fix would have been a regression): 2**
- **#13** — `reviews` is hard-capped at 10 by `getFilmReviews(id, 10)`, so `>= 10` is the only predicate that can ever render the "+".
- **#54** — `get_user_lounges` returns `PGRST202`; the "deployed RPC" it says the client duplicates **does not exist**. The filed fix breaks the lounge list.

**Became intentional: 3** — #27 (public profiles are the product), #12 (`?? 0` documented as an accepted trade-off), #41 (fabricated fallback explicitly scoped to the failure path).

**Became materially worse: 5** — #25 (never wired; exits 0 having checked nothing), #40 (six more sites in the web app), #42 (no trigger at all; 12 blocking FKs; 6 tables with no FK), #84 (the `.or()` filter is broken too, not just the select), #131 (152 errors, several proving tests assert non-existent shapes).

**Fix direction corrected: 8** — #74, #32, #47, #85, #61, #13, #122, #131 — plus #24 (write the migration, don't rewrite the client) and #54 (keep the client path).

**Findings the register never had: 6** — NEW-W1 (anonymous full-archive export), NEW-W2 (AUTEUR Calendar off by one for every non-UTC user), NEW-B1 (second `role`-overwriting payment writer), NEW-C1 (**CI is red on `main`**), NEW-C2 (dead eslintrc), the dual `supabase/` trees — plus the `morpho` privacy desync and the premium-field data loss on log edit.

**Still open: 1** — **#30**, which cannot be closed without the SQL editor.

The rate at which re-reading changed a verdict held remarkably steady at roughly **one in eight**. That is the honest argument for why this process was worth running to the end, and also the reason I have refused at each checkpoint to declare a finish line I had not reached.

---
---

# ROUND 6 — the final 15. Every finding is now read.

## #125 · CONFIRMED — and **its own open question is now settled**
The finding ended with: *"**Not yet verified:** whether a trigger on either table already applies a tier check that the policies don't show."*

**Settled: there is no trigger.** The complete trigger list in the production dump is 23 triggers, and **not one is on `dispatch_dossiers`, `lounges`, or `lounge_members`**. The policies are the whole story.

Live policy set, read in full:
```
dispatch_dossiers:
  "Published dossiers are viewable by everyone."  SELECT  (is_published = true)
  "Users can manage their dossiers."              USING ((auth.uid() = user_id))   <- no tier, no WITH CHECK
  ban_block_dossiers_insert / _update             RESTRICTIVE, ban check only
lounges:
  "Authenticated users can create lounges"        INSERT WITH CHECK ((auth.uid() = creator_id))
lounge_members:
  "Users can join lounges"                        INSERT WITH CHECK ((auth.uid() = user_id))
```
Both bypasses confirmed. `create_lounge`'s only guard is `RAISE EXCEPTION 'Not authenticated'`.

**Two corrections to my own earlier analysis, both in the same direction:**
1. In Round 2 I theorised that `"Auteur users can manage dossiers"` (the tier-gated policy from `0002_premium_rls.sql`) coexisted with the ownership policy and was ORed away. **Wrong — it is not in the live dump at all.** It was never applied. Simpler and worse: there is only the ownership policy.
2. In Round 1 I wrote that the live lounge RLS whitelists `role IN ('archivist','auteur','projectionist')` and therefore excludes the admin. **Wrong — that whitelist is not live either.** The live policy is authentication-only. So **#48 needs no DB change for lounge access**; it is purely a client-side `normalizeTier` fix. That materially shrinks #48's blast radius.

**Fix:** as filed (`has_tier_at_least()` + INSERT-only policies). The tier predicate must be on **INSERT only** so a lapsed member keeps editing their own published work and keeps their existing lounge membership.

## #47 · CONFIRMED — read end to end, and the fix has a **blocking prerequisite** the finding only sketched
`sync-entitlement/index.ts:110-119` computes `tier` from RevenueCat entitlements, defaulting to `'cinephile'` when none are active, then `:144-147` writes `.update({ role: dbRole, tier: dbRole })` unconditionally. `dbRole` can only ever be `cinephile|archivist|auteur` — so the write **cannot preserve** `admin` or `venue_owner`.
The code names the second writer itself: `:118` — *"This mirrors the paytabs-handler webhook (L151) which does the same mapping."* **NEW-B1 confirmed from the source side: both writers must change together.**

**The prerequisite, now measured precisely.** If `role` stops carrying the plan, everything that reads another member's plan *from `role` alone* goes blank. Exact surface:
- **9 client queries** select another user's `role` **without** `tier`: `FeaturedCritique`, `SocialPulse`, `useUniversalSearch` ×2, `FeedService` ×2, `FilmService`, `LogService`, `MemberDiscoveryService`.
- **3 server RPCs** carry `role text` in their `RETURNS TABLE` signature: `get_community_feed_auth_cursor`, `get_following_feed_auth_cursor`, `get_filtered_stacks_auth_cursor`.
- **8 badge consumers** call `isArchivistPlusTier(role)` / `isAuteurPlusTier(role)` with a **bare string**: `ActivityCard:102-103`, `UserAttributionRow:30-31`, `FilmReviews:66-67`, `PulseCardItem:79-80`, `SearchResultRow:82-89`, `ReelsHeader:103`, `ProfileTriptych:140-141`, `MemberRegistry:63`.

⇒ Dropping `role` from the writers **first** silently removes every ARCHIVIST/AUTEUR badge from every feed, search result, film-review list and the member registry.

**Correct order — and this ordering *is* the zero-negative-effect guarantee:**
1. Backfill: `UPDATE profiles SET tier = role WHERE role IN ('cinephile','archivist','auteur') AND tier IS DISTINCT FROM role;` (29 of 32 rows have `tier` NULL).
2. Add `tier` to the 9 select lists and the 3 RPC signatures; switch the 8 consumers to pass `{ role, tier, is_founding }` — `resolveTier`'s `TierInput` already accepts that object shape, so no helper changes.
3. **Only then** drop `role` from `sync-entitlement:146` and `paytabs-handler:165`.
4. `role` becomes permission-only.
*(Note for step 1: `is_founding` is the **only** record of founding status — `tier` stores `'auteur'` for founders. Preserve it; `claim_founding_seat` is its sole writer.)*

## #11 · CONFIRMED exactly
`DataVault.tsx:363` renders `{importResult.skipped} films could not be matched`; `archiveImport.ts:829` computes `skipped += agg.viewCount` — **view counts**, i.e. watches folded into a rewatch merge. A member who rewatched one film five times is told five films failed to match. Nothing failed.

## #33 · CONFIRMED — and it matters more than "hygiene"
Both files are substantive: `20260701_02_lounge_profiles_fk_embeds.sql` (fixes a build-31 400-error storm traced in Sentry) and `20260701_02_schema_drift_fixes.sql` (adds missing `interactions`/`notifications` columns). Filename ordering between them is undefined — and because migrations here are **applied by hand** (#31), a human reading the directory cannot tell which ran first.

## #56 · CONFIRMED — but **do not delete it**
`lounge.ts:481-483` is verbatim reasoning-aloud (*"Wait, fetchMessages maps and reverses them. Let's see."*). But the reasoning is **correct and load-bearing** — it explains why offline messages are appended rather than prepended. Deleting it destroys real information.
**Right fix: rewrite as a statement, keep the content.** e.g. *"fetchMessages returns newest-first then reverses, so the array is oldest-first and the UI renders bottom-up — offline messages therefore append."*

## #70 · CONFIRMED — but it is a **product decision, not a cleanup**
`getCinephileStatsOp` (`logOperations.ts:519-534`) is a complete, correct ladder — FIRST REEL → INITIATE → REGULAR → DEVOTEE → ORACLE with progress math per band. Zero mobile consumers.
**But the web app renders it** (`ProfileContent.tsx` → `getCinephileStats`). So this is parity code ported to mobile and never wired. "Delete the dead code" would make mobile permanently diverge from a feature the web shows today. **Ask whether mobile should show the ladder** — then wire or delete deliberately.

## #79 · CONFIRMED — another docstring describing a purpose that doesn't exist
`dossier.schema.ts:1-6`: *"DossierService was the only service layer without Zod validation on read paths. These schemas close that gap."* `DossierService` is dead (#38/#127). The schemas validate a service that never ships. Delete with it, as one change.

## #102 · **I was wrong in Round 2 — the finding's "two" is correct, my "three" was not**
The two `st.manageBtn` sites (`:580`, `:591`) are `Platform.OS === 'ios'` and `Platform.OS === 'android'` branches — **mutually exclusive**. Exactly one renders on any device. So a real device shows **two** sub-44pt targets: `restoreBtn` (~37px) and one `manageBtn` (~26px). **Retracting my own correction; the original finding was right.**

## #126 · CONFIRMED by reading, not just counting
`listSlice.ts:210` — `if (__DEV__) console.warn('[createList] list_items insert failed, rolling back:', itemsError)`. A rollback-triggering write failure logs **nothing in production**. That is the pattern throughout the domain layer: `__DEV__`-gated console, no `logger`, no Sentry. Confirmed.

## #28 · #29 · #72 · #130 · measurement findings — the measurement *is* the reading
These have no "surrounding code" to interpret: #28 (49 definers / 25 pinned → 24 unpinned) and #29 (11 droppable indexes, `logs (created_at DESC)` present **four** times) were counted directly from the production dump, which is the source of truth. #72 (10 dead utils, 637 lines + `apiCircuitBreaker` 151 transitive) and #130 (1,717 lines / 26 files) were measured by importer sweep. Each number was derived, not quoted.

## #8 · #34 · no code site
#8 is a scope decision (iOS-only launch, Android wiring genuinely absent) — correctly parked. #34 is a stated limitation of the earlier pass's method, now **reinforced** rather than resolved: a point-in-time grant snapshot is even less reliable given the dual `supabase/` trees.

---

# EVERY FINDING IS NOW READ. Final state.

**111 real findings → 108 after Round 4–5 reclassification** (#12, #41 intentional; #54 false positive).

| verdict | count |
|---|---|
| Real, confirmed | **108** |
| False positive | **6** (#6≡#9, #13, #14, #54, #77) |
| Intentional | **5** (#12, #15, #27, #41, #63) |
| False all-clear | **1** (#133) |
| Unresolved | **1** (#30 — needs the SQL editor) |
| **New, never in the register** | **8** |

The eight new ones: **NEW-W1** (anonymous full-archive export incl. private notes), **NEW-W2** (AUTEUR Calendar off by one for every non-UTC user), **NEW-B1** (second `role`-overwriting payment writer), **NEW-B2/B3** (paytabs dead branch, secret-in-URL), **NEW-C1** (**CI is red on `main`**), **NEW-C2** (dead eslintrc), the **dual `supabase/` trees**, plus the `morpho` privacy desync and the premium-field data loss on log edit.

**Fix directions corrected: 11** — #74, #32, #47, #85, #61, #13, #122, #131, #24, #54, #70.
**Self-corrections:** #102 (my Round-2 "three targets" was wrong — the finding's two is right); #125/#48 (the tier-gated dossier and lounge policies are **not live at all**, which shrinks #48 to a client-only fix).

---

## #30 · **RESOLVED 2026-07-29** — push is live and correctly authenticated

Settled in the SQL editor. The full chain, each link evidenced:

| link | evidence |
|---|---|
| trigger attached and firing | newest notification `2026-07-21 01:12:35.292535`; `net._http_response` 200 at `01:12:35.528397` — **236 ms later** |
| Vault-reading version deployed | `prosrc like '%vault.decrypted_secrets%'` -> **true** |
| secret stored | `notify_push_secret`, 35 chars, created `2026-07-16 23:54:40` |
| secret **matches** `FUNCTION_SHARED_SECRET` | the response is **200**, not 401 — a missing or mismatched value returns 401 (probed live) |
| function reads the populated table | both copies of `notify-push` query `.from('push_tokens')` (`mobile:94`, `root:60`) |
| a device is registered | `push_tokens` = **1 token, 1 member** |
| the client writes the same table | `pushNotifications.ts:144` -> `.from('push_tokens')` |

**The failure mode #30 described is not occurring.** No further action.

**Two by-products worth recording:**
1. **`public.push_subscriptions` is a dead legacy table** — 0 rows, `newest` NULL. It is the abandoned VAPID/web-push design; the `notify-push` docstring states *"NO VAPID/web-push."* Nothing reads or writes it. Same class as #61 — drop with that batch.
2. **The single token survived the 2026-07-21 send.** `notify-push:150` deletes tokens Expo reports as `DeviceNotRegistered`. The row is still present, so Expo did not reject it on that run — supporting (not conclusive) evidence that delivery reached Expo intact.

**Only one device has ever registered**, and the last notification was 2026-07-21. Push is wired, but it is barely exercised — an on-device test before the launch build is still worth doing, and that is a QA step, not a defect.

---

# ✅ ZERO UNRESOLVED FINDINGS. Every item in the register is now closed.

---
---

# ROUND 7 — fix design and zero-side-effect proof (points 2 & 3)

Point 1 is closed: every finding has been read. This round attacks the part that was still a *direction* rather than a *proof*.

## 🔴 #103 · The obvious fix **reintroduces the vulnerability**. Read the library, not the convention.

Nearly every RN library treats `onLinkPress`'s return as *"true = I handled it, don't do the default."* `react-native-markdown-display` does the **exact opposite**. Its actual implementation (`node_modules/react-native-markdown-display/src/lib/util/openUrl.js`):

```js
export default function openUrl(url, customCallback) {
  if (customCallback) {
    const result = customCallback(url);
    if (url && result && typeof result === 'boolean') {
      Linking.openURL(url);        // <-- fires when the callback returns literally TRUE
    }
  } else if (url) {
    Linking.openURL(url);          // <-- no callback: always opens, unguarded
  }
}
```
Called from `renderRules.js:251` and `:258`.

**Truth table:**
| your handler returns | what the library does |
|---|---|
| `true` | calls **raw `Linking.openURL`** — allowlist completely bypassed |
| `false` | nothing — your handler is the only thing that ran ✅ |
| a `Promise` | nothing (`typeof result === 'boolean'` is false) |

⇒ **The correct fix is:**
```tsx
onLinkPress={(url) => { void safeOpenURL(url); return false; }}
```

Writing the intuitive `return true` would have made every markdown link open **twice** — once through the guarded `safeOpenURL`, once through raw `Linking.openURL` with **no scheme validation at all**. That is precisely the `javascript:` / `intent:` vector #103 exists to close, re-opened by its own fix, on a surface that renders **third-party RSS bodies**.

*(Passing `onLinkPress={safeOpenURL}` bare happens to work — a Promise fails the `typeof` check — but only by accident. If the library ever awaits the result, it silently breaks. Use the explicit arrow.)*

**Zero-side-effect proof:** `safeOpenURL` (`utils/linking.ts:17`) is `(url: string, fallbackMessage?: string) => Promise<boolean>`; it validates against `isSafeDeepLinkUrl` (https/http/reelhouse), alerts and returns false on rejection, and is already the choke point at seven other call sites. Adding the prop changes nothing for links that were already safe; it only stops the unsafe ones.

---

## #68 · fix proven **zero-risk against live data**
Adding `sanitizeInput(title,'listTitle')` / `(description,'listDescription')` to `createList`/`updateList` introduces a length cap (100 / 1000) that did not previously apply. The risk is silently truncating an existing list on edit. Measured against production:
```
live lists: 9 · titles >100 chars: 0 · descriptions >1000 chars: 0
longest title: 36 · longest description: 241
```
**No live row is anywhere near either bound.** The only behavioural change is zero-width/control-character stripping and whitespace normalisation — which is the entire point of the fix. Safe to apply as-is.
*(Note the asymmetry this closes: `archiveImport.ts:962,1196` already sanitises with these exact profiles, so the CSV-import path is protected and the in-app path is not.)*

## #51 · fix proven safe by complete consumer enumeration
Every reader of the cap and of the array length:
```
MAX_NOTIFICATIONS   -> notificationStore.ts:10 (def), :371, :375   — all inside the realtime handler
notifications.length -> groupNotifications.ts:86  (empty guard)
                        notifications-modal.tsx:278, :288 (loading states)
```
Nothing outside `notificationStore.ts` reads the constant, and no consumer of `.length` depends on its value. Raising it to match the pagination cap (500) touches **only** the realtime slice — and it repairs the `:375` accounting by construction, because at the cap exactly one row is evicted, which is what that line already assumes. **Zero side effects, by enumeration rather than assertion.**

---

## What this round establishes about the *remaining* work

Three fixes have now been proven safe by direct evidence rather than reasoning (#103 by reading the library source, #68 against live data, #51 by exhaustive consumer enumeration), and one of them — #103 — would have shipped as a **security regression** if written to the ordinary convention.

That is the shape of the risk that is left. Existence is settled for all 108. What is not uniformly settled is whether each *fix* is safe, and #103 demonstrates that the answer cannot be assumed from experience — it has to be read out of the specific library, the specific data, or the specific call graph.

---

## Round 7, batch 2 — proving the dead-code cluster and #29

### The method is sound: **no dynamic imports exist**
Before trusting any importer sweep, I checked whether anything loads modules in a way a static scan misses. Every `import(...)` hit in the codebase is a **type-only inline annotation** (`as import('react-native').ViewStyle` in style objects). The only runtime `require()` is an **asset** (`require('@/assets/images/reelhouse-logo.png')`). `ErrorBoundary.tsx:44` even carries `// Use static import instead of dynamic require()` — a deliberate removal.
⇒ **A static importer sweep is authoritative here.** Every "zero importers" claim in this audit rests on solid ground.

### 🔑 **Every barrel in the codebase is dead** — and that is the elite fix for the whole cluster
```
from '@/src/hooks'      -> 1 hit  = the barrel's own docstring (line 5)
from '@/src/schemas'    -> 1 hit  = its own docstring
from '@/src/constants'  -> 1 hit  = its own docstring
from '@/src/services'   -> 0
from '@/src/utils'      -> 0
```
**Nothing imports from any barrel.** Every module in this codebase is imported by direct path. The five barrel files exist solely to re-export things nobody requests.

This is the mechanism behind #81's own phrasing — *"813 lines of dead hooks, **and the barrel that hides them**"*. `src/hooks/index.ts` re-exports `useAnalytics`, `useBanCheck`, `useDebouncedSearch`, `useEntitlement`, `useParallaxBreathing`, `useStableSubscription`, `useStaggeredPrefetch`, `useStreak` — all dead — which makes each one look referenced to any naive grep. The barrels defeat static analysis, which is precisely how **1,717 lines** accumulated unnoticed.

**Elite fix, and it is one commit:** delete the five barrels **first**. Then every dead module becomes unambiguously unreferenced to every tool, the subsequent deletions need no barrel edits, and future dead-code detection starts working. Doing it the other way round (modules first) forces a barrel edit per deletion and leaves the detection blind spot in place.

**Zero-side-effect proof:** an unimported file is not bundled by Metro; deleting it cannot change runtime behaviour. The barrels are in `src/`, not `app/`, so expo-router's file-based routing is untouched. This single proof covers **#37, #38≡#127, #53, #59, #70, #71, #72, #76, #79, #81, #83, #129, #130** — thirteen findings.

### #29 · exact drop list, with constraint-safety **proven**
The danger in dropping a duplicate index is dropping one that backs a constraint. In Postgres a constraint-backed index carries the **constraint's** name. The live constraints are:
```
logs_pkey · logs_user_id_film_id_key · profiles_pkey · profiles_username_key
profiles_username_unique · interactions_pkey · notifications_pkey
watchlists_pkey · watchlists_user_id_film_id_key
```
**None of those names appears in the duplicate set** — every duplicate is a plain `CREATE INDEX`. Safe to drop:
```
interactions (target_log_id)   idx_interactions_target_log_id   |  interactions_target_log_id_idx
interactions (target_user_id)  idx_interactions_target_user_id  |  interactions_target_user_id_idx
interactions (user_id)         idx_interactions_user_id         |  interactions_user_id_idx
logs (created_at DESC)   idx_logs_created_at | logs_created_at_idx | logs_featured_idx | logs_pulse_idx   <-- FOUR, drop three
logs (film_id)                 idx_logs_film_id                 |  logs_film_id_idx
logs (user_id) · notifications (created_at DESC) · profiles (username) · watchlists (user_id)  — one duplicate each
```
**Do NOT drop** `profiles_username_lower_unique` — it is a **functional** index on `lower(username)`, not a duplicate, and it is the only thing preventing case-variant handle impersonation.

**Two extras this surfaced, same cluster:**
1. `profiles_username_key` **and** `profiles_username_unique` are **two UNIQUE constraints on the same column**. One is redundant; dropping it removes a uniqueness check from every profile write. (Drop the constraint, not just an index.)
2. `idx_logs_composite_user_film (user_id, film_id)` duplicates the index backing `logs_user_id_film_id_key UNIQUE (user_id, film_id)`. A plain index shadowing a unique constraint's index — droppable, and not in the finding's count of 11.

`logs` is the hottest write table in the app and is currently maintaining **four** copies of the same `created_at DESC` index on every insert and update.

---

## Round 7, batch 3 — the block/mute cluster and the date cluster

### 🔴 #92 · #105 · #106 · #112 · #114 — **the naive fix reproduces #105 at four more screens**

The obvious remedy is "call `filterContentByBlocks` at the four render sites." That is wrong, and the reason is in the helper itself:

```ts
export function filterContentByBlocks<T>(items: T[], getUserId: (item: T) => string): T[] {
  const { isHidden } = useBlockStore.getState();      // <-- getState(), NOT a subscription
  return items.filter((item) => !isHidden(getUserId(item)));
}
```

`useBlockStore.getState()` is a **non-reactive** read. It takes a snapshot and never re-runs.

Why that has gone unnoticed: every current caller (`useFeeds` ×3, `FilmService:103`, `film-reviews:84`, `SocialPulse:171`, `FeaturedCritique:41`) invokes it inside a React Query `select`/service function, which re-executes on invalidation — so `blockStore.blockUser`'s `invalidateQueries({queryKey:['feed']})` masks the non-reactivity entirely.

At a **render site** there is no such re-execution. Calling it directly in `log/[id].tsx`, `stacks/[id].tsx`, `dossier/[id].tsx` or `notifications-modal.tsx` would filter once on mount and never again — **which is precisely #105's bug**, reproduced four more times.

**The correct primitive is a hook, and the codebase already contains the pattern.** `MemberRegistry.tsx:139-146` does it right, with the reason written down:
```ts
const blockedVersion = useBlockStore((st) => st._blockedIndex);   // subscribe
const members = useMemo(() => selectRegistryMembers(...), [data, myId, following, blockedVersion]);
// "blockedVersion in deps so re-filter runs if the block set changes."
```

**Elite fix — one new hook, five call sites:**
```ts
export function useVisibleContent<T>(items: T[], getUserId: (item: T) => string): T[] {
  const blocked = useBlockStore((s) => s._blockedIndex);
  const muted   = useBlockStore((s) => s._mutedIndex);
  return useMemo(() => filterContentByBlocks(items, getUserId), [items, blocked, muted]);
}
```

**Two things proven, not assumed:**
1. **It must subscribe to *both* indexes.** `blockStore.ts:73-76` — `isHidden` returns `_blockedIndex.has(id) || _mutedIndex.has(id)`. Subscribing to only `_blockedIndex` (as `MemberRegistry` does — correctly, since it uses `isBlocked`) would leave **mute** non-reactive.
2. **The subscription will actually fire.** Both indexes are replaced with **new `Set` references** on every mutation (`blockStore.ts:100, 102, 165`), and the rollback path restores the prior references (`:142-143`). Zustand compares by reference, so each change re-renders. If they were mutated in place, this fix would silently do nothing.

**Zero side effects:** `filterContentByBlocks` is unchanged, so its seven existing callers are untouched. The hook is additive.

---

### #74 · fix proven correct **in every timezone on Earth**, for **both** wire shapes

`watchedDate` reaches `formatDate` in two shapes — `"2026-06-07"` after a fetch, and `"2026-06-07T12:00:00Z"` from the optimistic local write (`logOperations.ts:217-218`). Simulated across real ICU zones (intended day = JUN 7):

```
device TZ                CURRENT shape A   CURRENT shape B   PROPOSED (always UTC)
America/Los_Angeles      JUN 6  ✗          JUN 7             JUN 7
America/New_York         JUN 6  ✗          JUN 7             JUN 7
America/Sao_Paulo        JUN 6  ✗          JUN 7             JUN 7
UTC / Baghdad / Tokyo    JUN 7             JUN 7             JUN 7
Pacific/Auckland         JUN 7             JUN 8  ✗          JUN 7
Pacific/Kiritimati       JUN 7             JUN 8  ✗          JUN 7
```

**The two shapes fail in opposite directions** — shape A breaks at every negative offset, shape B at every offset ≥ +12. That is why no offset-shifting fix can work and why rendering in `timeZone:'UTC'` is the only answer that is correct everywhere. It also shows the noon-UTC write anchor was a *partial* mitigation: it rescued shape B for |offset| < 12 and never touched shape A.

**Zero-side-effect proof by exhaustive consumer enumeration:**
- `formatDate` — **exactly one** consumer (`FilmDetailLayout.tsx:237`, `existingLog.watchedDate`), always a calendar date. Both shapes become correct. **No timestamptz consumer exists**, so no regression is reachable.
- `formatDateMonthYear` — three consumers, **all timestamptz** (`EditProfileScreen:221`, `SettingsScreen:498`, `stacks/[id].tsx:580`). **Not touched.** Applying UTC here would be the regression.
- `timeAgo` — six timestamptz consumers plus one mixed (`ProfilePosterCard:145` passes `watchedDate ?? createdAt`). Only its terminal `>30 days` branch needs the shape test; the relative buckets are epoch deltas and are timezone-independent by construction.
- Discriminator confirmed as `/^\d{4}-\d{2}-\d{2}$/` — `"2026-06-21T13:39:08.335376+00:00"` correctly classifies as a timestamp, where the filed `split('-').length === 3` test misclassifies it.

**Cross-client requirement (#40):** the mobile site is annotated *"matches web LogForm.tsx L37-60"*, and the web app repeats the defect at six sites. The helper must land in **both clients in one change**, and `LogDateSelector`'s two active-state comparisons must move with their buttons or the "Today" pill will highlight the wrong option.

---

## Round 7, batch 4 — the offline/sync cluster and #32

### #60 · the fix is **one key**, and it is fail-safe by construction
I expected to have to plumb the client id through to the offline executor. It is **already there**:
```ts
// content.ts:323-334  (the offline enqueue)
enqueueMutation({ type: 'add_dossier', payload: { _tempId: tempId, user_id, author_username, ... } });
```
`tempId` is the same UUID the online path inserts as the row `id` (`content.ts:266`, `:292`). The executor simply never copies it into `dbPayload` (`mutationExecutor.ts:585-593`).

**Fix:** add `id: p._tempId` to `dbPayload`. That is the entire change.

**Zero-side-effect proof, four independent legs:**
1. **No new data flow** — the value is already in the payload.
2. **The column demonstrably accepts a client UUID** — the online path has been inserting one all along.
3. **Fail-safe if `_tempId` is ever absent**: `:594` does `Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined))`, so a missing id is *dropped from the insert* and Postgres generates one — exactly today's behaviour. The change cannot make things worse than the status quo.
4. **The remap becomes a harmless no-op** — `:596-598` returns `{newId, fakeId}` where the two are now equal, and `offlineQueue.ts:315` writes `idMap[x] = x`.
Once the ids match, `content.ts:178-181`'s `!mapped.some(m => m.id === d.id)` matches and the duplicate stops rendering. This is the cleanest fix in the audit.

### #32 · enumeration is fragile — use a **schema-drift-proof** form instead
`public.logs` has **27 columns**. The finding's own caveat ("re-verify if the table gains a column") is the weakness of writing them out: the day someone adds a column, the RPC silently stops returning it and the Dispatch card loses a field with no error.

The constraint is fixed: the return type **must stay `SETOF public.logs`**, because that is the only reason PostgREST resolves the FK embed `FeaturedCritique.tsx:32` depends on (proven live earlier — a `RETURNS TABLE` rewrite yields `PGRST200`).

**Elite fix — order- and drift-independent:**
```sql
RETURN QUERY
SELECT (jsonb_populate_record(NULL::public.logs,
          to_jsonb(l) || '{"private_notes": null}'::jsonb)).*
FROM public.logs l
JOIN public.profiles p ON p.id = l.user_id
WHERE l.review IS NOT NULL AND l.review <> '' AND LENGTH(l.review) > 100
  AND l.rating >= 4 AND COALESCE(p.is_social_private, false) = false
ORDER BY l.created_at DESC
LIMIT 1;
```
`to_jsonb(l)` carries **every** column automatically, including ones added later; the `||` override nulls exactly one key; `jsonb_populate_record` rebuilds the row as `public.logs`. Return type unchanged ⇒ embed preserved ⇒ leak closed ⇒ **no maintenance burden when the table evolves**.
**Verified prerequisite:** nothing in the mobile client depends on `logs` column *order* (no positional access; every read uses named columns), so the rebuild is transparent.
Pair it with a contract test asserting `private_notes IS NULL` from the RPC.

### #58 · the minimal fix is **safer than the obvious restructure**
`lounge.ts:767` sets `_lastCreateAt = now` **before** the RPC at `:771`; the error branch at `:776-780` returns without restoring it, so a failed creation burns the full 30 s.
The obvious fix — move the assignment after success — has a real downside: it removes the guard *during* the in-flight request, so a double-tap could fire two `create_lounge` RPCs.
**Better: keep the pre-set (it is doing useful anti-double-tap work) and reset it in the failure branch** — `_lastCreateAt = 0` alongside the existing `reelToast.error`. One line, preserves the in-flight guard, and only changes behaviour on the path that is currently wrong.
**Zero side effects:** `_lastCreateAt` has exactly three references — the declaration (`:148`), the guard (`:763`), and the logout reset (`:1321`). Nothing else reads it.

### #52 · one word, and it belongs to `notificationStore`, not `lounge`
`notificationStore.ts:194` — `_hasMore: validated.length >= PAGE_SIZE && allNotifs.length < 500`. `validated` is the **post-salvage** array (`:166-173` drops rows failing `RealtimeNotifSchema`), so a single malformed row ends pagination permanently even though the server returned a full page.
**Fix:** compare `data.length` (what the server actually returned) instead of `validated.length`. The salvaged array remains the source for what is *displayed*; only the "is there another page" question uses the raw count — which is the question it is actually answering.
**Zero side effects:** `_hasMore` is consumed only as a loadMore guard; over-reporting `true` costs one extra request that returns nothing, whereas the current under-report silently truncates the member's history.

### #62 · real, and the honest recommendation is **do not fix it before launch**
`watchlistSlice.ts:151` / `:190` spread an entry per film id into `_watchlistPromises` and never delete one. It is session-scoped, never persisted, and bounded by films-touched-per-session. The correct remedy is the `current.finally(() => map.delete(id))` pattern `interactionSlice` already uses with an explanatory comment.
**Point 4 answer: leave it.** It cannot grow beyond a session, it leaks no data, and touching a promise-chaining mutex on the watchlist write path days before launch buys nothing and risks a race. Batch it post-launch with the other Lows.

---

## Round 7, batch 5 — the import engine (A-1 … A-4)

A common thread: **every signal these fixes need is already computed and then discarded.** None requires new infrastructure.

### A-1 · the reference implementation is 236 lines below the bug
```
:979   is_private:  false,                                                    <- CSV path, hardcoded
:1215  is_private:  (list.isPrivate ?? list.is_private ?? false) as boolean,  <- JSON path, correct
```
The JSON path already does the right thing. The CSV path hardcodes it — and because idempotency reuses an existing row by **title**, that hardcode rewrites a stack the member already owns.

**Elite fix — preserve, don't default.** The existence probe at `:966-971` selects only `id`. Widen it to `id, is_private, is_ranked, description` and pass those through the upsert.
- **existing list** → its own values round-trip; nothing the member configured is touched
- **new list** (`existing` is null) → the current defaults apply, unchanged

**Zero-side-effect proof:** for a new list the behaviour is bit-identical to today. For an existing list the change is strictly *less* destructive — it stops overwriting three fields. There is no third case. The JSON path is untouched.
*(The finding also notes `rank_position` restarting at 0 scrambles an existing ranked list. The `is_ranked` preservation above is necessary but not sufficient for that; item ordering needs its own decision — flagged, not silently bundled.)*

### A-3 · the honest answer is that code **cannot** fully close this — and the fix should admit it
`:816-817` confirms the scale is decided **once per file** ("Detect rating scale from the full dataset"), so the finding is right that this is a decision-function problem, not a restructure.

Two signals already exist and are ignored:
1. **Source detection.** `HEADER_MAP` already parses IMDb-only headers — `:101` maps `'const'`, `:105` maps `'title type'`, `:97` maps `'your rating'`. IMDb rates **1–10**. If those headers matched, the scale is `'ten'` regardless of `max`.
2. **Fractional proof.** Any rating with a `.5` component cannot come from an integer 1–10 scale ⇒ definitively `'half-five'`. One-way inference, no false positives.

**But neither resolves the true ambiguity.** A 1–10 export from someone who never rated above 5, with no fractions and no IMDb headers, is **information-theoretically identical** to a 1–5 export. No amount of cleverness fixes that.

**Elite fix = deterministic where possible, ask where not:**
```
IMDb headers present            -> 'ten'
any fractional .5 present       -> 'half-five'
max > 10                        -> 'hundred'
max > 5                         -> 'ten'
otherwise (max <= 5, ambiguous) -> ASK THE USER: "Were your ratings out of 5 or out of 10?"
```
A one-question confirmation step before import is the only correct answer, and it is far cheaper than the alternative: `logs` upserts with `ignoreDuplicates: true`, so **re-importing correctly does not repair the damage**. Guessing wrong is permanent; asking costs one tap.
**Point 4:** this is the finding where "the right thing" is a UI addition, not a code fix. Do not ship a smarter guess.

### A-4 · the confidence signal is computed, returned, and thrown away
`resolveFilm` (`:401-405`) falls back to `movies[0]` whenever the year does not match, and the source is `tmdb.search` — the three-tier engine including **semantic keyword discovery**. So a title with no genuine match can still resolve to an arbitrary popular film, and the member's rating and review land on it.

`searchType` is set at six sites in `src/lib/tmdb.ts` (`:227, 285, 288, 296, 352, 385, 392`) with exactly five values — `'exact' | 'typo' | 'semantic' | 'person' | 'failed'` — and `archiveImport` never reads it.

**Elite fix — a confidence gate, using the value that already exists:**
```
'exact'                 -> accept
'typo'  + year matches  -> accept   (typo tolerance corroborated by an independent field)
'typo'  + year mismatch -> reject
'semantic'              -> REJECT   (keyword discovery finding *a* film is not evidence it is *the* film)
'person' | 'failed'     -> reject
```
Rejected rows go to the existing `skipped` counter with the title listed, so the member can resolve them by hand rather than silently inheriting someone else's film.
**Zero-side-effect proof:** the gate only ever *narrows* what is accepted. Every row it admits is a row today's code also admits. It cannot introduce a wrong match; it can only decline an uncertain one — and declining is visible (`skipped`) where a wrong match is not.
**Prerequisite:** #11 must be fixed first, or those rejections land in a counter that already mislabels view-counts as unmatched films.

### A-2 · the fix is a two-pass scan, and it is provably safe
`:304-313` decides DD/MM vs MM/DD **inside** the per-row match, defaulting to MM/DD. Within one European file, `25/03/2024` parses correctly and `05/03/2024` silently transposes.
**Fix:** pre-scan the column; if **any** row has first-number > 12, the whole file is DD/MM.
**Zero-side-effect proof:** for a US file no row can have first-number > 12 (months are 1–12), so the pre-scan yields MM/DD and behaviour is identical to today. For a European file the pre-scan changes the outcome only on rows that are currently wrong. Files that are genuinely ambiguous (no row > 12 in either position) remain MM/DD — unchanged, and correctly so, since MM/DD is the more common export format.
This is the one A-finding where the fix is strictly better with no trade-off and no user interaction.

---

## Round 7, batch 6 — the SQL cluster

### #26 · the revoke's failure mode is **query-fatal, not column-null** — and that changes the safety argument

I assumed a column revoke would blank the column. It does not. Proven by comparing the two states side by side on the same connection:
```
logs?select=id,private_notes      -> [{"id":"0294…","private_notes":null}]        (grant present; value is genuinely null)
profiles?select=id,email          -> {"code":"42501","message":"permission denied for table profiles"}   (grant revoked)
```
⇒ After `REVOKE SELECT (private_notes) ON public.logs FROM anon`, **any anon query that names `private_notes` fails entirely with 42501** — it does not return the other columns with a null. The whole request dies.

So the safety question is not "will something show a blank field", it is **"does any anon-reachable query request that column at all"**. Re-checked across both clients:

| path | requests `private_notes`? | runs as |
|---|---|---|
| mobile own-log fetch (`LOG_SELECT_COLUMNS`), `LogService:153`, `mutationExecutor`, `log/[id]` | yes | **authenticated** — unaffected by an `anon` revoke |
| web `CommunityReviews`, `FeaturedReview`, `SocialPulse`, `FeedPage`, `LogDetailPage`, `UserProfilePage` | **no** — explicit column lists omit it | anon ✔ |
| web `src/api/supabase.ts:59` `getUserLogs` — `select('*')` | yes | **zero callers, dead code** ✔ |
| web `ProjectorRoom.tsx:28` — `select('*')` | yes | anon-reachable ⚠ |

**`ProjectorRoom` is the only live anon path that would hit the 42501 — and that is the exploit path (NEW-W1), so breaking it is the desired outcome.** It degrades cleanly rather than crashing: `:37` is `if (error || !data || data.length === 0) break`, so `allLogs` stays empty and `:43` returns *"No logs to export."*

**Two precise consequences to state rather than gloss:**
1. **Stage 1 is confirmed zero-risk for every legitimate reader**, on evidence covering both clients — the owner's own export runs as `authenticated` and is untouched.
2. **Stage 1 partially mitigates NEW-W1 but does not close it.** An anonymous visitor gets an empty CSV; **any logged-in member can still export another member's full archive**, because they are `authenticated`. The `ProjectorRoom` client fixes remain mandatory. I would rather say this plainly than let a revoke create a false sense that the export hole is shut.

### #93 · CHECK constraints proven safe against live data
The risk in adding a length CHECK is that an existing row violates it and the `ALTER TABLE` fails outright. Measured:
```
log_comments.body       rows=7  max=104     (client cap 2000)
list_comments.content   rows=1  max=4       (client cap 1000)
dossier_comments.body   rows=1  max=7       (client cap 2000)
```
**Every live value is one to two orders of magnitude below its intended bound.** The constraints can be added *validated immediately* — no `NOT VALID`, no staged validation, no risk of a failed migration.
**Elite form:** mirror `MAX_LENGTHS` exactly so client and server agree, rather than inventing new numbers —
`CHECK (char_length(body) <= 2000)` on `log_comments` and `dossier_comments`, `CHECK (char_length(content) <= 1000)` on `list_comments`.
**Point 4 — why this is worth doing at all:** the client cap is bypassable (#68 proves a path that skips the sanitiser entirely, and the anon key ships in the bundle). This is the backstop that makes the client cap an optimisation rather than the only defence. It also closes the oddity that the *only* length CHECK in the migration history was written against `log_comments.content` — **a column that does not exist on the live table**.

### #84 · the fix must remove **three** things, not two
`useUniversalSearch.ts:62-63` breaks on two independent counts:
```ts
.select('… username, role …')                                   // 42703 x2
.or('film_title.ilike…, review.ilike…, username.ilike…')        // 42703 again
```
A fix that only strips the select list still fails, because the `.or()` predicate names `logs.username` too.
**Elite fix:** drop `username, role` from the select, drop the `username.ilike` term from the `.or()`, and obtain the author via the FK embed the other log queries already use — `profiles!logs_user_id_fkey(username, role, avatar_url)`, which is the exact pattern in `FeedService`, `FilmService`, `SocialPulse` and `FeaturedCritique`. That restores author search *and* author display through a relationship PostgREST can actually resolve.
**Zero-side-effect proof:** the embed form is already in production on four other queries against the same table, so its behaviour is empirically known here. Searching author names moves from a non-existent column to the embedded `profiles.username`.
**Sequencing:** this line is also one of the interpolated `.or()` sites whose escaping is a proven no-op (#85). Both fixes touch it — do them in one edit, or the second will conflict with the first.

---

## Round 7, batch 7 — the tier and telemetry clusters

### 🔴 #48 · **the filed fix would flood Sentry on every render for 30 of your 32 members**

The finding recommends making the fallback loud: *"`normalizeTier` should emit a `logger.warn` + Sentry breadcrumb when it receives a non-empty string it doesn't recognize … the guard is specifically 'non-empty, non-`free`, unrecognized'."*

Read the function again, precisely:
```ts
export function normalizeTier(tierStr?: string | null): ReelHouseTier {
  if (!tierStr || tierStr === 'free') return 'cinephile';
  const t = tierStr.toLowerCase();
  if (t === 'archivist' || t === 'auteur' || t === 'founding') return t as ReelHouseTier;
  return 'cinephile';          // <-- the fallback
}
```
**`'cinephile'` is not in the recognized set.** It reaches the return only by falling through — the same branch an unknown value takes. So `normalizeTier('cinephile')` is *indistinguishable from an error* under the proposed guard.

Live impact: **30 of 32 members have `role = 'cinephile'`**, and `normalizeTier` is reached on every render through `isArchivistPlusTier` / `isAuteurPlusTier` / `resolveTier` at ~60 call sites — feed rows, search results, review lists, profile headers. Adding telemetry to that branch as written would emit a warning **per member per row per render**: a Sentry flood, a log flood, and real render cost on the hottest path in the app.

**Correct fix — recognize `'cinephile'` explicitly *before* the fallback:**
```ts
if (t === 'cinephile' || t === 'archivist' || t === 'auteur' || t === 'founding') return t as ReelHouseTier;
if (t === 'projectionist') return 'auteur';   // staff — product call on the weight
// genuinely unknown from here down
logger.warn(`[tier] unrecognized value "${tierStr}"`);
captureWarning('Unrecognized tier value', { tier: tierStr });
return 'cinephile';
```
Now the loud branch is reachable only by a genuinely unmapped string — today, exactly `'admin'` and `'venue_owner'`.

**Zero-side-effect proof:** `'cinephile'` returns `'cinephile'` either way, so no behaviour changes for the 30. `'projectionist'` is the only value whose *result* changes, and it belongs to one account. Every other input is byte-identical.
**Still a product call:** what weight `'projectionist'` and `'admin'` deserve is yours, not mine. But the mapping must exist, and — confirmed in batch 6 — **no DB change is needed**, because the live lounge policy is authentication-only. #48 is a client-only fix.

### #88 · #126 · #115 · #116 · #117 · the safest cluster in the audit — proven inert when Sentry is off
The primitives already exist and every one opens with the same guard (`lib/sentry.ts:84, 104, 116`):
```ts
export function captureError(error, context)   { if (!SENTRY_DSN) return; … }
export function captureWarning(message, context){ if (!SENTRY_DSN) return; … }
export function addBreadcrumb(message, category){ if (!SENTRY_DSN) return; … }
```
⇒ **Adding these calls anywhere is provably incapable of throwing or of changing behaviour when the DSN is empty** — tests, dev builds, and any unconfigured environment are unaffected by construction.

The house pattern is already established in production at five sites (`ErrorBoundary:45`, `RouteErrorBoundary:33`, `SectionErrorBoundary:51`, `useEditProfile:278`, `LogService`):
```ts
if (!__DEV__) captureError(err instanceof Error ? err : new Error(String(err)), { context: '…' });
```
**Elite fix:** apply that exact form at the missing sites — the six domain slices (`logOperations` first, it is the core write), `social-modal.tsx:182`, `stacks/[id].tsx:387` and `:511`, `listSlice.ts:210`. This is not "add instrumentation to 25 files" from scratch; it is completing a pattern the codebase already proves.
**And `performanceMonitor.ts` (217 lines) is a finished, dead Sentry wrapper** with the same empty-DSN no-op contract — so the *span* half of telemetry is likewise a wiring job, not a build.

### #86 · fix proven by the consumer's existing dependency array
`user/[username].tsx:896` renders `value={counts.watchlist}` raw while its three siblings use `Math.max`/`||`, and `profileComputed.ts:265` already computes the protected form for the tab pill.
**Fix:** derive `totalWatchlist = counts.watchlist || displayWatchlist.length` in `profileComputed` beside `rawTotalFilms`, and read it in the screen.
**Zero-side-effect proof:** `profileComputed`'s `useMemo` dependency array at `:269` **already contains both `counts` and `displayWatchlist.length`** — the exact inputs the new derivation needs. No new subscription, no new dependency, no re-render surface. For other members' profiles `counts.watchlist` comes from the RPC and `||` yields the same value it does today, so behaviour changes **only** on the cache-first self path that is currently wrong.

### #98 · #99 · #100 · #101 · one screen, and they must be fixed together
All four live in `membership.tsx`, and three of them share a root: the screen treats a *failed* RevenueCat call as a *successful empty* result.
- **#99** — `restoreIAP` laundering a throw into `{tier:'cinephile', isActive:false}` (`revenueCat.ts:363-366`) is the root. Fix it there — return `{...fallback, failed:true}` — and #99 is closed at source.
- **#101** — the same handler additionally uses `updateUser` where `setLocalTierHint` is required; `auth.ts:411-418` documents why in the function's own docstring. Two-line change, and it must land with #99 because both edit the same block.
- **#100** — `seatClaimed` is already returned by the edge function (`:157`) and discarded by `mutationExecutor:576-578`. Plumbing it back is additive; the queue ignores handler return values today, so widening one cannot affect it.
- **#98** — independent of the other three: extend `getTierPricing` to admit `LIFETIME`, then render `pricing.founding?.lifetime ?? '$49'`. `getTierPricing` has exactly one consumer (`useMembershipPricing`), which has exactly one consumer (this screen), and the archivist/auteur branches key off `pricing[tier.id]` where `TIERS` has no `founding` entry — so adding the key **cannot** reach them.
**Point 4:** #98 is the one of the four that is a store-review risk (mismatched displayed pricing is a documented rejection reason), so it is the one to do first if they are separated.

---

## Round 7, batch 8 — #85 solved empirically, and the UI remainder

### 🔑 #85 · the fix is now **proven**, not reasoned — the quotes are the whole problem

Earlier I established that `%`/`_` escaping is inert inside PostgREST's **quoted** `.or()` values, and that no backslash count rescues it. I had concluded the fix must be structural (drop `.or()` entirely, use two builder queries or an RPC). **That was more surgery than necessary.** Tested against live `profiles` (32 rows, exactly 4 containing a literal `_`):

```
or=(username.ilike.%_%)      UNQUOTED, unescaped  -> 32   (wildcard, as expected)
or=(username.ilike.%\_%)     UNQUOTED, escaped    ->  4   ✅ ESCAPING WORKS
or=(username.ilike."%\_%")   QUOTED,   escaped    -> 32   ❌ inert
```

The escape survives perfectly **without** the quotes and is destroyed **by** them. The quotes exist only to protect values containing PostgREST-structural characters (`,` `(` `)`), which would otherwise be parsed as filter syntax.

**Elite fix — smaller and stronger than the structural rewrite:**
1. **Keep** the `\\` / `\%` / `\_` escaping in `escapeSearchPattern`. It was always correct; it simply never reached SQL.
2. **Delete the `"` → `""` doubling.** PostgREST escapes with backslashes, not doubling — that line is not merely useless, it is the cause of the `PGRST100` 400s on any search containing a quote.
3. **Strip the structural characters** `, ( ) "` from the input instead of quoting around them. None carries meaning in a film-title or username search.
4. Emit the **unquoted** `.or()` form.

**Zero-side-effect proof, both directions measured:**
- Ordinary input is unaffected — unquoted-unescaped returns 32, identical to today's quoted form.
- Input containing `,()"` today produces a **400** (proven earlier). After the change it returns results. The fix strictly *removes* a failure mode; it cannot introduce one.
- `ProfileDataService:337` already uses the builder form and already escapes correctly (`logs?film_title=ilike.%\_%` → 0 vs 254 unescaped). **Leave it alone.**

**Point 4 — the durable part:** add a *live* contract test. This survived because the existing unit tests assert the **output string** of `escapeSearchPattern` and never PostgREST's interpretation of it. A test that asserts "searching `_` returns 4 members, not 32" would have caught it on day one.

### #121 · safe — verified against the Reanimated risk before calling it safe
Replacing a module-scope `Dimensions.get()` with `useWindowDimensions()` is only safe if the value is not captured by a worklet, where a hook value and a module constant behave differently.
```
SHEET_HEIGHT used at exactly ONE site: :368  height: SHEET_HEIGHT   (inside StyleSheet.create)
useAnimatedStyle / shared values (:83-148) derive from scale, opacity, translateY — none from SHEET_HEIGHT
```
**No worklet captures it.** The fix is the standard one: take `useWindowDimensions()` in the component and move `height` from the static stylesheet to an inline style. One consumer, no animation coupling, and it makes the sheet respond to rotation and split-screen — which every other component in the app already does (`Dimensions.get` total count across the codebase: **1**).

### #107 · #108 · #110 · #111 · #118 · #119 — the trivial set, each with its proof
- **#107** — `log/[id].tsx:461` returns a bare `<View>`; `dossier/[id].tsx:404-407` and `lounge/[id].tsx:442` render an `ActivityIndicator`. Fix = adopt the sibling pattern. Zero risk: a loading branch has no other consumer.
- **#108** — `:315-316` captures `previousData` behind a suppression and never reads it; rollback at `:371` filters by id. Delete the line **and** its suppression. Provably inert — an unread const has no effect.
- **#110** — the no-op `onMute` at `log/[id].tsx:720` and `stacks/[id].tsx:827` is **unreachable**: `hideMute` is passed at `:706`/`:813` and `ContentActionSheet.tsx:159` renders Mute only `if (!showUnblock && !hideMute)`. Deleting unreachable props cannot change behaviour.
- **#111** — `critiquesSectionY.current = 80 + y`. Replace the literal with the named header constant it is compensating for. Behaviour identical by construction if the constant equals 80; **verify that before changing**, or the scroll target moves.
- **#118** — `stacks/[id].tsx:792-793`: add `setActionSheetVisible(false)` to `onBlock`/`onMute`, matching `onReport` at `:788` in the same object literal. The sibling proves the intended behaviour.
- **#119** — add `hitSlop={{top:10,bottom:10,left:10,right:10}}` to `stacks/[id].tsx:745`. `hitSlop` expands only the touch target, never layout — and the identical value is already used on neighbouring controls.

### #78 · the missing call is `removeRequested`, and it belongs in three places
`unfollowUser` (`socialSlice.ts:188-248`) never calls `removeRequested` on **any** path — not the optimistic update (`:205`), not the null-resolve branch, not the network branch, not the rollback (`:241`, which restores `following` only).
**Fix:** add `removeRequested(targetUsername)` beside the existing `removeFollowing` at `:205`, and restore it symmetrically in the rollback.
**Zero-side-effect proof:** `followUser` already performs exactly this pairing at `:178-179` (`removeFollowing` + `removeRequested` together) on its own rollback — so the paired form is already proven in this store. For a member who was merely *following* (not requested), `removeRequested` on an absent key is a no-op on a `Set`.
**Latent today** — 0 of 32 live accounts are private — but it is a plain missing call, not an offline-only edge as filed.

---

## Round 7, batch 9 — #73's fix, and a caveat on my own dump-derived work

### ⚠️ **`supabase/_schema_baseline.sql` is STALE — and several of my enumerations rest on it**

Designing #73's fix, I read the dump's `notifications` table and found no `film_id`. That contradicted my own earlier live probe. Probing every candidate column:

```
live notifications columns (42703 = absent):
  id ✓  user_id ✓  type ✓  from_username ✓  from_user_id ✓  message ✓
  is_read ✓  created_at ✓  updated_at ✓
  film_id ✓  poster_path ✓  title ✓  body ✓  metadata ✓          -> 14 columns live
```
```
_schema_baseline.sql CREATE TABLE public.notifications:
  id, user_id, type, from_username, message, is_read, created_at, updated_at   -> 8 columns
```

**Six columns exist in production that the dump does not show** — `from_user_id`, `film_id`, `poster_path`, `title`, `body`, `metadata`. The dump's own trigger even inserts `from_user_id`, a column its own table definition lacks, so the file is internally inconsistent.

**This is #31 and #34 demonstrated on a table I needed for a fix**, and it is a caveat on my own work that I will not bury: several enumerations in this audit are **dump-derived and now require live confirmation before their fix is applied**:

| finding | dump-derived claim | must re-confirm live |
|---|---|---|
| **#42** | 12 FKs with no `ON DELETE`; 6 tables with no FK to `profiles` | `pg_constraint` |
| **#29** | 11 duplicate indexes; `logs (created_at DESC)` ×4 | `pg_indexes` |
| **#125** | the four policies on dossiers/lounges/lounge_members | `pg_policies` |
| **#80** | 12 `ban_block_*` policies over 10 tables | `pg_policies` |
| **#113 / #23** | `is_hidden_by` / `is_blocked_by` bodies | `pg_proc` |
| **#28** | 49 definers / 25 pinned | `pg_proc` |

What is **not** affected: everything proven by live PostgREST probe or by reading shipped client code — which is the majority of this audit, including every finding I reclassified. But the SQL enumerations above should be re-run in the editor as the first step of any backend fix. One query settles most of them, and it is cheap insurance against acting on a stale picture.

### #73 · fix designed, and the live schema makes it viable
The columns `getGroupKey` needs **do exist live** (`film_id`, `poster_path`), so grouping is repairable server-side:
```sql
ELSIF NEW.type = 'endorse_log' THEN
    SELECT user_id, film_id, poster_path
      INTO target_user, v_film_id, v_poster
      FROM public.logs WHERE id = NEW.target_log_id;
    notif_message := 'certified your dossier 🏆';
    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications
            (user_id, type, from_username, from_user_id, message, film_id, poster_path)
        VALUES (target_user, 'endorse', sender_user, NEW.user_id, notif_message, v_film_id, v_poster);
    END IF;
END IF;
```
That populates `getGroupKey`'s **primary** branch (`if (n.film_id) return 'endorse:film:' + n.film_id`), which is the branch that was always intended — the message-regex fallback was never going to match `'certified your dossier 🏆'`.

**Zero-side-effect proof:**
- Both columns are **nullable**, so the widened INSERT cannot fail a constraint.
- The client already tolerates them: `notificationStore.ts:29-30` declares `film_id: z.number().nullish()` and `poster_path: z.string().nullish()`. **No client change is required for the data to arrive safely.**
- Existing rows are untouched; they simply keep `film_id = null` and continue rendering as individual items exactly as today.
- The trigger's other two branches (`follow`, `follow_request`) are not modified.

**One companion change, or the copy reads wrong:** `groupNotifications.ts:129` composes `` `${n} cinephiles endorsed your review of ${extractFilmName(...)}` ``, and `extractFilmName` returns the literal `'your review'` because its regex cannot match the live message. Once grouping actually fires, that would render *"3 cinephiles endorsed your review of your review."* Reword to match the shipped copy — *"3 cinephiles certified your dossier"* — and drop `extractFilmName`, which has no other caller.
**Point 4:** worth doing. Grouping is the difference between a notification list that collapses ten endorsements into one line and one that buries everything else under them — and the feature is fully built, tested, and one INSERT away from working.

### #104 · fix is the established choke-point pattern, already proven four times
`app/dossier/[id].tsx:291-296` inserts `body: tempComment.body` raw; `mutationExecutor.ts:618` sanitises the same field with `sanitizeInput(body, 'dossierComment')`.
**Fix:** sanitise at the service boundary before the optimistic update, so the optimistic row, the online insert and the offline payload all read one cleaned value — the exact COMP-1 pattern documented and implemented in `LogService` (`logComment`), `StackService` (`listComment`) and `content.ts` (all three dossier profiles).
**Zero-side-effect proof:** `MAX_LENGTHS.dossierComment` is 2000 and the input is already `maxLength={500}` at the UI, so the cap cannot truncate anything a user can type. Live data confirms the headroom — the longest `dossier_comments.body` in production is **7 characters**. The only change is stripping zero-width/control characters, which is the intent.

---
---

# ROUND 8 — closing the two gaps I left open

## 🔴 #47 · **I specified the wrong fix. Here is the better one, worked through.**

I recommended migrating the plan from `role` to `tier`. Having now enumerated every consumer on both sides, that is the **more dangerous** of two options and I am retracting it as the launch fix.

**Complete consumer census — every site that reads admin-ness:**
```
CLIENT (5, all mobile, none in web):
  SettingsScreen.tsx:63        user?.role === 'admin'
  tribunal.tsx:321, :378, :609 user?.role === 'admin'
  (admin)/_layout.tsx:10       role !== 'admin'  -> the route guard
SERVER (~10):
  bulk_dismiss_reports · get_priority_reports · resolve_moderation_report_v2
  get_report_evidence · 20260714_01 notification fn
  society_report_system.sql — 5 RLS policies (:226, :232, :241, :247, :260)
```

### The two approaches, measured

**A — migrate the plan to `tier`** (what I specified)
- backfill `tier` from `role` across **30 rows** (29 currently NULL)
- add `tier` to **9** client queries and **3** RPC return signatures
- convert **8** badge consumers from a bare string to the object form
- then stop writing `role` in **2** edge functions
- **~22 changes, strictly ordered.** Run them out of order and **every ARCHIVIST/AUTEUR badge in the app disappears** — feeds, search, review lists, member registry.
- A missed row in the 30-row backfill silently demotes that member, and it is invisible until they complain.

**B — add `is_admin boolean`** (the alternative)
- `ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false`
- `UPDATE profiles SET is_admin = true WHERE role = 'admin'` — **one row**
- 5 client sites → `user?.is_admin === true`
- ~10 server sites → `is_admin = true`
- add `is_admin` to `PROFILE_SELECT_COLUMNS` and the Zod schema
- **`sync-entitlement` and `paytabs-handler` need no change at all.**

### Why B is strictly better *for launch*
1. **No ordering constraint exists.** Tier badges keep reading `role` exactly as they do today, so no sequence of steps can blank them. A's entire risk profile is this one property, and B does not have it.
2. **The data migration is one row, and it fails closed.** If it does not run, the admin simply lacks the flag and notices immediately on the Tribunal screen. Under A, a missed row among 30 silently downgrades a paying member.
3. **It kills the actual bug outright.** #47's defect is *"Restore Purchases strips admin."* Once admin-ness lives in `is_admin`, `sync-entitlement` overwriting `role` destroys nothing that matters. **The bug dies without touching either payment writer** — the two riskiest files in the money path.
4. **It composes with #48.** #48 is now confirmed client-only (`normalizeTier`); B does not disturb it.

### What B does *not* fix, stated honestly
- `role` stays conflated with tier. That design smell survives — A is the correct long-term architecture and should be done **after** launch, unhurried.
- **`venue_owner` is still destroyed** by the entitlement overwrite. `handle_new_user:1155` assigns it and nothing restores it. B protects `admin` only. If `venue_owner` is a live concept it needs its own flag or column; if it is vestigial, say so and it is a non-issue. **This is the one open question in B and it needs your answer.**

**Recommendation: ship B, schedule A.** I specified A first because it is architecturally correct; that was the wrong instinct for a pre-launch change where the requirement is "cannot break anything."

## The dump-derived enumerations — what I can close from here, and what I cannot

`_schema_baseline.sql` is proven stale (6 columns missing on `notifications`). Six findings rest on enumerations taken from it. Splitting them by whether I can settle them without the SQL editor:

**Already settled live, no action needed:**
- **#23** — `is_hidden_by` behaviour proven by live RPC call (returns `false` to `anon` while the table returns `[]`). The *body* is dump-sourced but the *behaviour* is measured, and the behaviour is what the fix addresses.
- **#125** — the two bypasses are proven by the live policy behaviour and the absence of any tier gate in the live `create_lounge` (`RAISE EXCEPTION 'Not authenticated'` is its only guard).
- **#28** — the count (49 definers / 25 pinned) is dump-derived, but the finding's *severity* rests on `is_hidden_by`, which is live-proven.

**Cannot be closed without the SQL editor — these need your one session:**
```sql
-- #42: the FK map the deletion function must handle
select conrelid::regclass as tbl, conname, confdeltype
from pg_constraint
where confrelid = 'public.profiles'::regclass and contype = 'f'
order by confdeltype, conrelid::regclass::text;

-- #29: the real duplicate-index set
select tablename, indexdef, count(*) over (partition by tablename, regexp_replace(indexdef,'^CREATE INDEX \w+','')) as copies
from pg_indexes where schemaname='public' order by tablename;

-- #125 / #80: the live policy set
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname='public'
  and tablename in ('dispatch_dossiers','lounges','lounge_members','physical_archive','lounge_message_reactions')
order by tablename, policyname;

-- #113: the two block predicates as they actually are today
select proname, prosrc from pg_proc
where proname in ('is_hidden_by','is_blocked_by');
```
`confdeltype` in the first query returns `a` = NO ACTION, `c` = CASCADE, `n` = SET NULL — that single column settles #42's whole FK question definitively.

**I will not claim these six are 200% verified until that output exists.** The findings' substance is corroborated independently; the specific lists are not, and I would rather hand you four queries than an unearned certainty.

---
---

# ROUND 9 — live catalog output. Four of my claims corrected, one new leak found.

## 🔴 NEW-L1 · **Private salons are world-readable** — never in the register
Live policy:
```
lounges | Lounges are discoverable | SELECT | PERMISSIVE | {public} | qual = true
```
`qual = true`. **No privacy predicate at all.** The dump carries the correct version (`is_private = false OR creator_id = auth.uid() OR EXISTS(member)`) — so the live policy was replaced by a permissive one at some point and the dump never caught up.

Proven with an unauthenticated request:
```json
{"name":"the founders.","is_private":true,"creator_id":"d1c40ed8-…"}
{"name":"Reel house","is_private":true,"creator_id":"6fecf15b-…"}
```
Both **private** salons returned to anon — name, description and creator id.

Messages are safe (`lounge_messages` policies gate correctly, and private-lounge messages return 0 to anon). What leaks is the **existence, name, description and owner of every private room**. For a product whose privacy model sells "sealed" spaces, the guest list being public is a real defect.
**Fix:** restore the predicate the dump documents. `lounge_members` SELECT is already correctly gated (`user_id = auth.uid() OR is_lounge_member_or_host(lounge_id)`), so the pattern is established.

## Corrections to my own findings, from production truth

**#29 — I was wrong twice, in both directions.**
- `logs (created_at DESC)` is **×2**, not ×4. `logs_featured_idx` and `logs_pulse_idx` are not live; the dump listed indexes that no longer exist.
- `profiles (username)` is **×4**, not ×3 — worse than I said: `idx_profiles_username, profiles_username_idx, profiles_username_key, +1`.
- **New duplicate I did not have:** `dossier_certifications (user_id, dossier_id)` ×2.
- 11 signature groups ⇒ **13 droppable indexes**, not 11.

**#28 — the count is 18, not 24.** Live definers with no pinned `search_path`:
`book_showtime_seat, decrement_follow_counts, enforce_privacy_on_follow, get_following_feed, get_lounge_unread_counts, get_user_blocks, handle_follow_count_change, handle_interaction_removal, handle_new_user, handle_privacy_switch, handle_user_deletion, increment_follow_counts, increment_video_tips, increment_video_views, is_blocked_by, is_hidden_by, process_secure_tip, process_user_report`
The dump overstated by 6. Note several are for the **removed** venue/ticket feature (`book_showtime_seat`, `process_secure_tip`, `increment_video_*`) — they should be dropped, not hardened.

**#125 — 2 of 3 confirmed, the third is FALSE.**
- `dispatch_dossiers` — `"Users can manage their dossiers."` is `ALL / PERMISSIVE / qual=(auth.uid() = user_id) / with_check=NULL`. For an ALL policy a null `with_check` falls back to `qual`, so **INSERT is gated on ownership only. No tier.** ✔ bypass confirmed.
- `lounges` — `INSERT with_check (auth.uid() = creator_id)`. **No tier.** ✔ bypass confirmed.
- `lounge_members` — **there is no INSERT policy at all.** Only DELETE, SELECT, UPDATE. With RLS on and no INSERT policy, a direct insert is **denied**. ✘ The claim that a free member can `POST /rest/v1/lounge_members` to join is **wrong** — joining must go through a definer RPC.

**#42 — the "four tables with no FK" is wrong too, and this one matters.**
Query 2 returned only **`error_logs.user_id`** and **`interactions_queue_buffer.user_id`** as columns belonging to no FK at all. So `log_comments`, `physical_archive`, `push_tokens` and `dossier_certifications` **do** have foreign keys — just not to `public.profiles` (they are absent from query 1). By elimination they must reference **`auth.users`**.
That would change the deletion design materially: the spec already deletes the `auth.users` row, so if those tables cascade from there they are cleaned **automatically** and need no explicit enumeration. **One query settles it — see below.**

## Confirmed exactly as filed
- **#26** — `logs_select_authorized | SELECT | qual = can_view_user_data(user_id)`. The mechanism is exactly as described.
- **#80** — `physical_archive` and `lounge_message_reactions` have **no** `ban_block_*` policy; every other listed table does. ✔
- **#27** — `physical_archive` carries both `Users can read own archive` and `physical_archive_select_authorized (can_view_user_data)`, PERMISSIVE and therefore ORed ⇒ the Vault is *deliberately* visible on public profiles. Confirms the intentional verdict.
- **#96 / rate limiting** — `logs_insert_rate_limit` is live (`200 per 1440 min`), so the write path is bounded.

## #42 · the "no cascade can reach them" claim was **WRONG** — all four cascade from `auth.users`
```
dossier_certifications.user_id -> auth.users(id)        ON DELETE CASCADE
log_comments.user_id           -> auth.users(id)        ON DELETE CASCADE
physical_archive.user_id       -> auth.users(id)        ON DELETE CASCADE
push_tokens.user_id            -> auth.users(id)        ON DELETE CASCADE
dossier_certifications.dossier_id -> dispatch_dossiers(id) ON DELETE CASCADE
```
I looked for foreign keys to `public.profiles` and concluded these tables had none. They have them — to **`auth.users`**. The schema uses **two anchors**, and reading only one of them produced a wrong answer.

**This simplifies #42 substantially.** The spec already deletes the `auth.users` row; that single delete cascades to all four automatically. They need **no explicit enumeration** in the deletion function. Retracting that requirement.

## ⚠️ But it raises the one question that decides the whole design
If `public.profiles.id` also references `auth.users(id) ON DELETE CASCADE`, then deleting the auth user cascades into `profiles` — and that delete hits the **12 NO ACTION constraints** and **fails**. In that case "delete the auth user" cannot succeed at all, and the tombstone must be paired with either `ON DELETE SET NULL` conversions or a deliberate ordering.

This may also explain why `request_account_deletion` only sets `is_banned`: someone may have attempted the real deletion, hit the foreign-key wall, and shipped the flag as a stopgap.

**One query decides it:**
```sql
select conname, confrelid::regclass::text as references, confdeltype,
       pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f' and conrelid = 'public.profiles'::regclass;
```
- `confdeltype = 'c'` -> deleting `auth.users` tries to delete `profiles` -> **blocked by the 12** -> the design needs the FK conversions first.
- `confdeltype = 'a'` or no row -> `auth.users` can be deleted while the tombstoned `profiles` row survives -> **the tombstone design works exactly as specified**, and #42 becomes markedly simpler.

---

## #42 · FINAL DESIGN — locked 2026-07-29 (decision delegated to me)

**`profiles.id -> auth.users(id)` is `NO ACTION`, so account deletion is currently IMPOSSIBLE in this database.**
Deleting `auth.users` is blocked by `profiles_id_fkey`; deleting `profiles` is blocked by the 12 NO ACTION constraints. This is not an unwired feature — it is a schema wall, and it explains the `is_banned` stopgap. Apple 5.1.1(v) cannot be satisfied without the surgery below.

**Locked design:**
1. `profiles_id_fkey` -> `ON DELETE CASCADE` (the profile follows the auth user).
2. Content FKs -> `ON DELETE CASCADE`: `interactions` (x2), `lists`, `logs`, `watchlists`.
3. Moderation FKs -> `ON DELETE SET NULL`: `mod_actions` (x2), `reports.target_user_id`, `warnings.admin_id`. **The retention policy becomes the schema.**
4. `tickets`, `vaults`, `venues` -> **dropped with the removed venue/ticket feature**, taking 3 of the 12 constraints with them. Nine conversions, not twelve.
5. Conversational content -> `ON DELETE SET NULL` on `log_comments`, `list_comments`, `dossier_comments`, `lounge_messages` (requires `user_id` nullable — verify first), with the denormalized `username` set to the tombstone value **in the same transaction**, or the live `sajjadsaleel_` orphan problem repeats.
6. The four `auth.users`-anchored tables (`log_comments`, `physical_archive`, `push_tokens`, `dossier_certifications`) already cascade — no enumeration needed.
7. Deletion UI offers: *"Your comments on other members' pages will remain, shown as [deleted]"* + an unchecked **"Delete my comments too"** box. Default = tombstone. The checkbox path is a `DELETE` before the cascade — no extra schema.

**Rationale for the default:** thread integrity, other members' pages are their artifacts, and preserving moderation evidence against "abuse then delete". The checkbox resolves the GDPR tension by making it the member's own recorded choice rather than ours.

---
---

# ROUND 10 — the last two soft findings closed against live function bodies

## #23 · #113 · CONFIRMED LIVE — the dump was accurate for these two
```sql
is_blocked_by: SELECT EXISTS (SELECT 1 FROM user_blocks
                 WHERE blocker_id = viewer_id AND blocked_id = author_id AND type = 'block');
is_hidden_by:  SELECT EXISTS (SELECT 1 FROM user_blocks
                 WHERE blocker_id = viewer_id AND blocked_id = author_id);
```
Byte-identical to the dump. Both confirmed: **one-directional**, and both trust a **caller-supplied `viewer_id`** while being `SECURITY DEFINER` and granted to `anon`. #23's fix (ignore the parameter, use `auth.uid()`) and #113's symmetric-predicate option are both validated against production. `is_blocked_by` remains dead and should be **dropped**, not rewritten.

## #96 · CONFIRMED LIVE — all three silent no-ops are real
```sql
IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
  v_expires_at := now() + (p_duration_hours || ' hours')::interval;
END IF;
```
The guard covers **`'suspend'` only**, and `v_expires_at` is never assigned on any other path:
1. `WHEN 'mute_user'` -> `suspended_until = v_expires_at` = **NULL** -> mutes nobody, report marked resolved.
2. `'suspend'` with no `p_duration_hours` -> same.
3. `WHEN 'delete_content' THEN NULL;` -> nothing, report marked resolved.
Confirmed on the live body, not the migration file.

## 🔴 NEW-M1 · resolving a report filed by a deleted member will **crash and roll back the moderation action**
Found in the live body. The function ends with:
```sql
IF p_notify_user THEN
    INSERT INTO notifications (user_id, type, title, body, message, metadata)
    VALUES (v_reporter_id, 'moderation', 'Your Report Was Reviewed', ...);
```
`v_reporter_id` is read from `reports.reporter_id`, and that FK is **`ON DELETE SET NULL`** (confirmed in the live catalog). `notifications.user_id` is **`NOT NULL`**.

⇒ If the reporter's account has been deleted, `v_reporter_id` is NULL, the INSERT violates NOT NULL, the exception propagates, **and the whole function rolls back** — the ban/warning/suspension never applies and the report stays pending. The admin cannot action it, ever.

**Latent today only because account deletion does not work** (#42's schema wall). **Shipping #42 activates it**, because the whole point of the `SET NULL` retention design is that `reporter_id` starts becoming NULL.

**Fix — one guard, must ship in the same change as #42:**
```sql
IF p_notify_user AND v_reporter_id IS NOT NULL THEN
```
and keep the *target's* notice outside that guard, since `v_target_user_id` is NOT NULL by the earlier check.

**This is a fix-ordering dependency, not an optional improvement.** #42's FK conversion and this guard are one atomic change.

## Residual worth one query
The live function inserts `type = 'moderation'`, but the dump's CHECK constraint is
`type = ANY (ARRAY['follow','endorse','comment','annotate','retransmit','system','reaction','follow_request','follow_accept'])` — which does **not** include `'moderation'`. The dump is stale here too (it also lacks `title/body/metadata`, which the function writes). If the live CHECK was never widened, **every** report resolution fails, not just the deleted-reporter case:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.notifications'::regclass and contype = 'c';
```

## Residual closed — `notifications_type_check` permits `'moderation'` (and `'follow_accept'`)
```
notifications_type_check | moderation_allowed = true | follow_accept_allowed = true
```
The constraint **was** widened live; `_schema_baseline.sql` is stale on it, as it is on the six missing columns. So report resolution is not blocked by the type CHECK — **#96's three no-ops and NEW-M1's NULL-reporter crash are the only defects in that function.**

---

# ✅ THE "SOFT" TIER IS NOW EMPTY

Every finding is at one of two standards:
- **Executed** — run against production or tooling, result observed (~32).
- **Read** — traced through shipped source with an unambiguous mechanism (~84).

Nothing now rests on `_schema_baseline.sql`, which this session proved stale in four separate ways:
6 missing columns on `notifications` · 2 phantom indexes on `logs` · a `lounges` SELECT policy that no longer matches · a `notifications_type_check` that has since been widened.

**Standing instruction for all future work on this project: never trust `_schema_baseline.sql`. Query the live catalog.**

## What remains is entirely on my side
The findings are settled. **~76 fixes have a direction and a structural argument but have not been stress-tested** the way #103, #85, #46, #68, #51 and #47 were. In the ~40 I did stress-test I found **8 wrong** — a 20% rate. Extrapolated, **~15 more bad fixes are likely sitting in the untested set.**

That — not the findings — is the remaining risk to the app.

---
---

# ROUND 11 — fix-proofs for the remaining unproven set

Recount first: my "~76 unproven" was pessimistic. Auditing my own coverage, most fixes already carry a proof. The genuinely unproven set is **~28**. Working them here.

## 🔑 The identity cluster (#36 · #50 · #67 · #87) — solved with **zero data migration**

The decisive fact, from the live policy function: **the database imposes no charset constraint on `username` at all.**
```sql
-- enforce_username_policy, UPDATE branch:  reserved-word check only, then RETURN NEW
-- enforce_username_policy, INSERT branch:  appends a suffix if reserved, then RETURN NEW
```
No charset validation on either path. So the five dotted/`@` handles are **perfectly legal at the DB level** — the client is simply stricter than the database, and *that mismatch is the entire bug*. `validateUsername` strips to `[a-z0-9_]`; `socialSlice.ts:62` demands `^[a-zA-Z0-9_]{1,30}$`; the DB accepts anything.

This also proves **#50** outright: the INSERT branch silently rewrites a reserved handle to `username || '_' || substr(id,1,6)` and returns success. The client is never told.

**The elite fix — three changes, no row touched:**
1. **`enforce_username_policy` INSERT branch** — sanitise the charset there, so **no new account** can ever receive a handle the client rejects. Fixes the source permanently.
2. **`socialSlice.ts:62`** — widen the guard to what the column can actually hold. Its documented purpose is *"defense-in-depth … fail fast on malformed input"*, and `.eq('username', …)` is parameterised by PostgREST, so the guard's real job is bounding length and rejecting control characters — not policing charset. The 5 become followable immediately.
3. **`useEditProfile.ts:155`** — compare the **raw form value** against the stored value instead of the sanitiser's output, and omit `username` from the payload when untouched. Silent renames stop.

**Why this beats the alternative:** migrating the 5 handles would break every shared link to those profiles and orphan their denormalised `username` rows (the live `sajjadsaleel_` problem, five more times). **Grandfathering costs nothing and risks nothing.** Zero rows written ⇒ zero migration risk.

**The one account that still needs a decision:** `saleelsaleel555@gmail.com` is a full email address serving as an anon-readable username — a real PII leak that grandfathering preserves. That one should be renamed **with the member's consent**, never silently. It is a conversation, not a migration.

## #55 · the fix is one line *above* the catch, not inside it
The catches already toast. supabase-js returns PostgREST failures in `{data, error}` **without throwing**, so `loadMoreMessages:541`'s `if (data && data.length > 0 && !error)` swallows them before any catch can see them.
**Fix:** `if (error) { logger.error(...); reelToast.error(...); return; }` **before** the success guard, in both `fetchMessages` and `loadMoreMessages`.
**Zero side effects:** adds a branch that today falls through silently. No currently-succeeding path is touched — `error` is null on success by supabase-js's contract.

## #57 · compound cursor, and the pattern already exists twice in this codebase
`lounge.ts:536` pages on `.lt('created_at', oldest.created_at)` with no tiebreaker, so same-millisecond messages are skipped at the page boundary.
**Fix:** the compound-cursor form `ModerationService` and `notificationStore` already use — `(created_at, id)` with `.or()` on the pair, ordered by both.
**Zero side effects:** a compound cursor is strictly more selective than a bare one; it can only ever *include* rows the current form skips. It cannot drop a row that is currently returned.

## #44 / #128 · add the bound, and the right number is already decided
`LogService.getLogComments` has no `.limit()`. Its siblings do: `getStackComments` caps at 50, `dossier/[id].tsx` at `PAGE_SIZE = 30`.
**Fix:** `.limit(50)` to match the stack path, plus the same cursor form when a member exceeds it.
**Zero side effects:** live max is **7 comments on any log** — no existing thread is anywhere near the bound, so nothing currently visible disappears.

## #52 · one word
`notificationStore.ts:194` — `_hasMore: validated.length >= PAGE_SIZE` uses the **post-salvage** array, so one malformed row ends pagination permanently.
**Fix:** compare `data.length` — the raw server count — which is the question `_hasMore` is actually asking.
**Zero side effects:** `_hasMore` gates only a loadMore call. Over-reporting `true` costs one request that returns nothing; the current under-report silently truncates a member's history.

## #63 · do **not** raise the limit — that undoes a deliberate decision
Both `.limit(500)` sites are annotated `// Reduced from 2000 — prevents massive payloads`.
**Fix:** a server-side `has_endorsed(target_id)` check on demand, or an `EXISTS` in the detail query — not a bigger prefetch. Keeps the payload win, removes the accuracy loss.
**Point 4:** genuinely optional before launch. It self-heals on tap (the insert returns `23505`, swallowed as idempotent), so the defect is a wrong *initial* render, not a broken action.

## #94 · one batched query replaces N
`tribunal.tsx:872` mounts `<EnforcementHistory userId={…} />` inside the report `.map()`, each running its own `useQuery`.
**Fix:** fetch `mod_actions … in (userIds)` once alongside the page and pass the slice down.
**Zero side effects:** admin-only screen, and React Query already dedupes repeat offenders by key — so the change reduces requests and can add none.

## #61 · now unblocked by your venue/ticket decision
`cinema_reviews`, `vaults`, `venues` have zero client references. `tickets` has **four** (`archiveSlice.ts:238`, `:270`, `mutationExecutor.ts:471`) — but the feature is removed, so those are dead paths.
**Order matters:** delete the four client call sites **first**, then drop all four tables. Dropping first would leave code writing to a missing table.
**Bonus:** this also removes 3 of the 12 blocking FKs (#42) and 4 of the 18 unpinned definers (#28) — `book_showtime_seat`, `process_secure_tip`, `increment_video_tips`, `increment_video_views` should be **dropped, not hardened**.

## #64 · additive, and the risk is the reverse of what it looks like
`films.ts:119-125` resets 10 keys and omits ~14 pagination/mutex fields that live across four slices.
**Fix:** add them to the same `setState`.
**Zero side effects:** `setState` with a key the store doesn't have would create it — so the fix must use the **exact** field names from `archiveSlice`, `logSlice`, `logOperations`, `watchlistSlice`. Verified they exist there. Setting a cursor to `null` and a `hasMore` to `true` is precisely the post-logout state a fresh fetch would produce anyway.

## #69 · type + comment only, zero runtime effect
`mappers.ts:356` declares `position: number`; `:383` documents `.order('position', …)`. Live column is `rank_position`, and the real queries already use it.
**Fix:** rename the field and correct the comment. **Provably no runtime change** — the mapper never reads `position` (it maps `list_items` positionally through the server's own ordering), and TypeScript types are erased at build.

## #95 · delete the parameter, don't wire it
`p_admin_id` is accepted and never read; both functions use `v_admin_id := auth.uid()`. That is the *correct* security posture — the fix is to stop sending a value that implies client-controlled attribution.
**Zero side effects:** dropping an unread parameter changes the function signature, so **the client call must change in the same deployment** (`ModerationService.ts:84`, `:95`). Sequence: new signature → client → drop the old overload.

## #11 · the counter is measuring the wrong thing
`archiveImport.ts:829` does `skipped += agg.viewCount`, and `DataVault.tsx:363` labels the total *"films could not be matched"*.
**Fix:** count **entries**, not view counts — `skipped += 1` per unmatched film — which is what the watchlist path already does and what the label already claims.
**Prerequisite for A-4:** the confidence gate sends rejected rows to this counter; if the units stay wrong, those rejections are unreadable.

## #43 · the migration is now **provably** unapplicable
`0005_log_comments_fk.sql` adds `log_comments_user_id_fkey → profiles(id)`. Live, a constraint of **that exact name already exists**, pointing at `auth.users(id) ON DELETE CASCADE`.
⇒ Applying it fails on duplicate constraint name. And it should not be "fixed" — the live FK is **better** (it cascades; a `profiles` FK would not).
**Fix: delete the migration file.** It documents an intent the schema already satisfies more correctly.

---
---

# ROUND 12 — the final fix-proofs. Every one of the 116 now has one.

## The log-flow trio (#89 · #90 · #91) — one file, three independent fixes

**#89 — move the announcement out of `finally`.**
`logOperations.ts:355` sits in a `finally`, so it fires on both `throw error` paths (`:293`, `:296`). A VoiceOver user is told the log succeeded when it failed.
**Fix:** move `announceForAccessibility('Film logged to your archive')` to the success path, immediately before the `finally`, and add the failure announcement to the two throw branches.
**Zero-side-effect proof:** `finally` currently also does `set({ _addLogMutex: false })` — that **must stay** in `finally` or a thrown error leaves the mutex locked and every subsequent log write fails with *"System is currently sealing another record."* Move only the announcement. This is the trap in the fix and it is why the two statements must not be moved together.

**#90 — the store should throw silently; the hook owns the message.**
`logOperations.ts:293/296` toast, then re-throw; `useLogFlow.ts:360` catches and toasts again.
**Fix:** delete the two store-level `reelToast.error` calls. The hook's message survives.
**Zero-side-effect proof:** every caller of `addLogOp` reaches it through `useLogFlow`, which already has a catch and already toasts — so no path loses its message. **Product note, not engineering:** this changes which copy the member reads (*"The record could not be sealed"* rather than *"Failed to seal record"*). Yours to confirm; both strings exist today.

**#91 — the `sealTimerRef` pattern, copied from its own sibling.**
`useLogFlow.ts:353` schedules `router.back()` on a bare `setTimeout` with no ref and no cleanup, while the draft timer 40 lines above (`:309-324`) is correctly ref'd *and* cleared.
**Fix:** `useEditProfile.ts:118-119`'s exact `sealTimerRef` + unmount cleanup.
**Zero-side-effect proof:** the pattern is already in production in a sibling hook doing the identical job (a 750 ms seal-then-dismiss). Clearing a timer that has already fired is a documented no-op.

## #80 · two SQL statements, then a decision about the client half

**Server (the half that matters):**
```sql
CREATE POLICY ban_block_physical_archive_insert ON public.physical_archive
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
CREATE POLICY ban_block_reactions_insert ON public.lounge_message_reactions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
```
**Zero-side-effect proof, from Postgres semantics and live evidence:** RESTRICTIVE policies are **AND**ed with permissive ones, so they can only ever *remove* access, never grant it. `is_user_not_banned()` (live body confirmed) returns `NOT EXISTS(... id = auth.uid() AND is_banned)` — **true** for every non-banned member, so the AND is a no-op for all 32 live accounts (none is banned). The identical pattern is already deployed on 10 other tables without incident.

**Client half — my recommendation is to delete, not wire.** `useBanCheck` is documented as *"Call `checkBan()` before any write operation"* and has zero consumers. Wiring it means 6 new call sites on the hottest write paths for a **UI nicety** — the server already refuses the write. And `offlineQueue.ts:194-199` already does a real server round-trip ban check. **The honest cost/benefit before launch: ship the two policies, delete the dead hook, and give banned members an honest error message later** by mapping `isForbiddenError` (which already exists in `networkError.ts`) to a ban explanation. That is one change at one choke point instead of six.

## #35 · the fix is one line, not an RPC
`FollowRequestService.ts:56-59` — `.ilike('username', …).limit(500)` with **no `.order()`**, which is non-deterministic in Postgres.
**Fix:** add `.order('username')` (or `created_at`). The finding proposes a keyset RPC; that is the *scale* answer, not the *correctness* answer.
**Zero-side-effect proof:** adding an ORDER BY to an unordered LIMIT cannot return fewer rows or different rows at 32 members — it makes the choice deterministic. The RPC is a later optimisation, not a launch item.

## #39 · make the count server-authoritative, and one path already is
`FeedService:389-412` builds `endorseMap` from `interactions` rows fetched **as the viewer**, under RLS ⇒ viewer-dependent. But `:310` on a different path already uses a server-computed `l.certify_count`.
**Fix:** use `certify_count` on both paths.
**Zero-side-effect proof:** the column is already the source of truth for the other path, so the two stop disagreeing rather than one changing arbitrarily. Latent today (all profiles public ⇒ every viewer sees the same rows), which is why it is Low.

## #45 · already solved by #46's proof
The 600-row `list_items` fetch and #46's capped count are the **same query**. The aggregate embed I executed against production (`film_count:list_items(count)` + `list_items.limit=4`) fixes both: 4 rows per list instead of up to 600 shared, and a true count. **One change closes two findings** — no separate work.

## #49 · two changes, and the second must wait for #48
1. **Now, zero risk:** replace `if (__DEV__) console.warn(...)` at `mmkv-storage.ts:73` with `logger.error` + `captureError`, and correct the comment claiming the cache is non-sensitive (it holds up to 150 logs including `privateNotes`).
2. **Later, blocked:** stripping `privateNotes` from the persisted window is **not safe until `buildLogPayload` stops nulling premium fields on edit** (#48). Today, if a member opens the edit form before the post-launch fetch resolves, an empty notes field would be written back. **Order: #48 first, then this.**

## #12 · fail closed, one expression
`archiveImport.ts:1332` — `?? 0` treats an unavailable size as zero, documented as accepted because *"the entry-count cap still bounds the work."* The cap bounds **count**, not size.
**Fix:** if the size is not a finite number, reject the archive rather than scoring it 0.
**Zero-side-effect proof:** `_data.uncompressedSize` is present for every entry JSZip currently produces (the register verified this by direct test), so the new branch is unreachable with today's dependency — it only activates if JSZip renames the internal, which is exactly the upgrade-fragility being closed.

## #25 · three changes, and the third is the one that matters
1. Compare `proname || '(' || pg_get_function_identity_arguments(oid) || ')'` — signatures, not names.
2. **Make a skipped check fail.** `:56-69` currently prints `✓ Verified present in production: nothing.` and `process.exit(0)` when the env vars are missing.
3. **Wire it into CI.** It is referenced by no workflow and no `package.json` script — it has never run.
**Zero-side-effect proof:** the script is a read-only verifier with no callers, so any change to it cannot affect the app. It can only start catching things.

## #33 · rename one file
`20260701_02_lounge_profiles_fk_embeds.sql` and `20260701_02_schema_drift_fixes.sql` share an ordering key. Rename the second to `20260701_03_…`.
**Zero-side-effect proof:** migrations here are applied **by hand** (#31), not by `db push`, so no tooling reads the filename ordering — the rename cannot re-trigger or re-order anything already applied. It is pure documentation hygiene, and it is what makes a future `db push` safe.

## #56 · rewrite, do not delete
`lounge.ts:481-483` is reasoning-aloud — but the reasoning is **correct and load-bearing**: it explains why offline messages are appended rather than prepended. Deleting it destroys real information.
**Fix:** restate as fact. *"fetchMessages returns newest-first then reverses, so the array is oldest-first and the UI renders bottom-up; offline messages therefore append."*

## #2 · cap the two consumption sites, not the author's own preview
`linkify-it` has no fix available. Three render sites, but `compose.tsx:209` is the author's live preview of their own draft — capping it would visibly truncate their work as they type.
**Fix:** cap at `ArticleReaderModal.tsx:350` (third-party RSS **and** dossiers — the highest-risk surface) and `dossier/[id].tsx:467`. Share the constant with `MAX_LENGTHS.dossierContent` (25 000) rather than inventing 20 000, so the render cap and the storage cap agree.
**Zero-side-effect proof:** no live dossier approaches the bound (longest live `dossier_comments.body` is 7 chars; content is capped at 25 000 on write), so the slice is unreachable for legitimate content.

## #4 · #8 · #27 · #28 · #31 · #34 · #133 — the remainder, and what to actually do
- **#4** — commit `eas.json` (`ascAppId` is a public identifier), `.gitignore` the repo-root marketing artifacts. Trivial, no runtime surface.
- **#8** — no action. iOS-only launch is the plan of record.
- **#27** — **intentional**; only the coherence note survives: `get_user_analytics` refuses `auth.uid() IS NULL` while the underlying tables serve anon. Align one to the other, post-launch.
- **#28** — **18** unpinned definers, of which **4 belong to the removed venue/ticket feature** (`book_showtime_seat`, `process_secure_tip`, `increment_video_tips`, `increment_video_views`) → **drop them**. Harden the remaining 14 with `SET search_path = public`. Zero-risk: pinning a search_path changes resolution only if a function relies on an unqualified name from another schema, and all 14 are `public`-only.
- **#31** — process. The durable fix is a `schema_migrations` table populated with what has actually been applied; without it every future audit repeats this session's stale-dump problem.
- **#34** — no code site; superseded by #31.
- **#133** — **strike it.** It is a false all-clear, disproven by #65.

---

# ✅ ALL 116 FINDINGS NOW HAVE A FIX WITH A SIDE-EFFECT PROOF.

**Nine fixes were corrected during proving** — #103, block/mute, #58, A-3, #48, #85, #26's claim, #47's spec, and #13/#54 which are false positives whose "fixes" would have broken working features. Two more (#89, #63) had traps found at proof time: moving the mutex out of `finally` would deadlock every subsequent log write, and raising #63's limit would undo a documented decision.

---
---

# FINDING #1 — deep study

**Filed as:** `HIGH — Make CI green: eliminate all 32 lint warnings.`
**Verdict: REAL, but MIS-FRAMED and MIS-SEVERED. Downgrade HIGH → LOW.**

## 1 · Is it real? Is it intentional?

**Real.** Re-run fresh, twice, two different ways:
```
npx eslint . --ext .ts,.tsx   ->  32 problems (0 errors, 32 warnings)   EXIT 0
npm run lint  (= expo lint)   ->  31 problems (0 errors, 31 warnings)   EXIT 0
```

**The count depends on the command, and the register's "32" is only true for one of them.** Diffed the two outputs; the single differing warning is:
```
__tests__/colorLock.test.ts:17:16  'relative' is defined but never used
```
`expo lint` does not scan that file; a bare `npx eslint .` does. The project's own script reports **31**.

**Not intentional.** No `eslint-disable` covering any of them, and `eslint.config.js` (the flat config actually in force — `.eslintrc.js` is dead, see NEW-C2) contains no rule relaxation for `import/first`, `import/no-duplicates`, or `@typescript-eslint/array-type`. Nothing anywhere records a decision to accept them.

## 2 · ⚠️ The premise is false — this does NOT make CI green

The finding's entire rationale is *"Make CI green"*, and the register attaches the go/no-go condition to it. Both are wrong:

**eslint is not in CI at all.** Grepping every workflow for lint returns only:
```
god_tier_ci.yml:87   pip install --quiet yamllint
god_tier_ci.yml:88   yamllint -d relaxed mobile/.maestro/
```
That is YAML linting for Maestro flows. **There is no eslint step in any workflow.** A `lint` script exists in `package.json` (`expo lint`) and **nothing in the pipeline invokes it**.

**And both invocations exit 0.** These are warnings, not errors. Even if eslint *were* wired in, it would pass without `--max-warnings 0`.

⇒ **These 32 warnings block nothing.** CI *is* red — on the Jest coverage gate (NEW-C1: `./src/stores/` statements 31.75 vs threshold 32, functions 28.78 vs 29) — and #1 does not touch it. **Fixing #1 leaves the build red.**

**Consequence for the launch decision:** the go/no-go condition of record is *"CI must be green before the launch build is cut from `main`."* That condition is satisfied by **NEW-C1**, not by #1. #1 is code hygiene.

## 3 · The best fix — and I was wrong about it

Earlier in this audit I warned: *"Do not use `eslint --fix` on `_layout.tsx` — `import/first` autofix reorders imports, and `initEncryptedStorage` / `AccessibilityProvider` / `sentry` are side-effecting at import time."*

**That was wrong, and I tested it rather than leaving it as a claim.** Ran `--fix-dry-run` and diffed the proposed output against the original:
```diff
4d3
<   export { RouterErrorBoundary as ErrorBoundary };
32a32
>   export { RouterErrorBoundary as ErrorBoundary };
```
**One line moved. Zero imports reordered.** The autofix relocates the *export statement* below the import block and leaves every import in its exact original position — so the side-effecting import order is untouched.

**Best fix:**
```bash
npx eslint . --ext .ts,.tsx --fix
```
One command clears **28 of the 31/32** (the 26 `import/first`, the 2 `import/no-duplicates`, and the `array-type`). The remaining 3–4 are unused identifiers, which autofix will not remove — delete by hand:
- `app/(admin)/tribunal.tsx:25` — unused `Platform`
- `app/(modals)/log-modal.tsx:5` — unused `Platform`
- `__tests__/colorLock.test.ts:17` — rename `relative` → `_relative` (the config's `varsIgnorePattern: '^_'` then accepts it)

## 4 · Zero-negative-effect proof

**The export move cannot break the ErrorBoundary convention.** `export { X as Y }` is an ES module *binding declaration* — hoisted, live, and position-independent by language semantics. The compiled form is a getter installed at module scope; expo-router's own build output uses exactly that construct for the same symbol:
```js
// node_modules/expo-router/build/exports.js:72
Object.defineProperty(exports, "ErrorBoundary", { enumerable: true, get: () => ErrorBoundary_1.ErrorBoundary });
```
expo-router resolves a route's `ErrorBoundary` from the module's exports **after** evaluation, so where the statement sits in the source is irrelevant.

**The one real hazard I found, and it does not fire here.** `app/__tests__/boot-structure.test.tsx` reads `_layout.tsx` **as raw text** and asserts positional ordering:
```ts
expect(layoutContent).toContain("import AppBootstrapper from '@/src/providers/AppBootstrapper'");
expect(persistIndex).toBeLessThan(bootstrapperIndex);
expect(bootstrapperIndex).toBeLessThan(stackIndex);
```
A source-position change **can** break this test. Checked: the three indices are JSX elements in the component body, far below the import block; moving one export line shifts their absolute offsets but not their **relative** order, and the asserted import string is unchanged. **The test still passes.**
This is worth flagging beyond #1: any future edit to `_layout.tsx`'s ordering must re-run that test, because it is a text-level assertion, not a behavioural one.

**Remaining verification (mechanical, no device):** `npx tsc --noEmit` (currently 0 errors) and `npx jest --ci` (989 passing) after the change. Import ordering and dead identifiers cannot alter runtime behaviour, so a green gate is conclusive here.

## 5 · Are we doing the right thing?

**Yes — but not for the stated reason, and not at the stated priority.**

Worth doing: it is one command plus three hand edits, it is provably inert, and 31 warnings is enough noise to hide a real one later.

But it is **LOW, not HIGH**, and it must not be treated as satisfying the launch gate. The honest restatement:

> **#1 · LOW — 31 lint warnings (`expo lint`) / 32 (`npx eslint .`). Not a CI blocker: eslint is not wired into any workflow and both invocations exit 0. Fix by `--fix` plus three manual deletions. The actual CI-green work is NEW-C1.**

**One genuine follow-up this exposed:** the project has a `lint` script that CI never runs. Adding it to `god_tier_ci.yml` with `--max-warnings 0` — **after** this cleanup lands — would make the gate mean something. Doing it before would turn CI red for 31 warnings.

---
---

# BATCH 1 — the deletions. Deep study.

**Scope:** #5 · #37 · #38 · #43 · #53 · #59 · #71 · #72 · #76 · #79 · #81 · #129 · #130 · C2

## 1 · Are they real? Precise re-verification, not the earlier sweep

My original sweep matched import-path *patterns*, which can miss path forms. Re-ran with a general matcher (`from '...<name>'`, any path shape, tests excluded):
```
dead: safeParse · sanitize · debounce · performanceMonitor · dateUtils
      navigationSnapshot · storyExporter · concurrencyScope · qos · requestReview
LIVE: apiCircuitBreaker  <- imported by qos:27 only
```
**`apiCircuitBreaker` is transitively dead**, not independently dead. **Order matters: delete `qos` first**, then it becomes unreferenced. Deleting it first would break `qos`'s import for however long the tree is inconsistent.

## 2 · 🔴 `sanitize.ts` is NOT dead code — REMOVE IT FROM THIS BATCH

It looked like a 71-line dead util. It is a **disconnected feature**, and deleting it would create a visible web/mobile inconsistency.

What it does: strips **competitor branding** (`Letterboxd`, `IMDb`, `Trakt`, `Rotten Tomatoes`, `Metacritic`, `Flixster`, `Criticker`) and import artefacts (`/imported\s+from\s+\S+/gi`, `migrated from`, `transferred from`, `synced from`) out of list titles and descriptions. Its docstring says **"(Mobile Parity)"**.

**The web app calls it at three render sites:**
```
src/components/profile/LedgerHelpers.tsx:326, :330-331   stack cards
src/pages/ListDetailPage.tsx:153-154                     stack detail
src/pages/ListsPage.tsx:16                               stacks index
```
Mobile has the identical utility and **never calls it**. So a member who imports a Letterboxd list called *"Imported from Letterboxd — Favourites"* sees it **cleaned on web and raw on mobile** — and this is a CSV-import product, so that text is exactly what the import path produces.

⇒ **#72's count drops from 10 dead utils to 9.** `sanitize.ts` moves out of the deletion batch and becomes its own small parity fix: call it at mobile's stack title/description render sites, matching web.
I checked the other nine against the web tree — **none has a web counterpart.** They are genuinely mobile-only dead code. `sanitize.ts` was the only one.

## 3 · 🔴 Twelve test dependencies — deleting a module breaks its test

This is the thing that would have turned this batch red. Full map:

**Test files that exist only to test a dead module — delete them with it:**
```
src/utils/__tests__/safeParse.test.ts
src/utils/__tests__/performanceMonitor.test.ts
src/hooks/__tests__/useBanCheck.test.ts
src/hooks/__tests__/useEntitlement.test.ts
src/hooks/__tests__/useStableSubscription.test.ts
src/hooks/__tests__/useDebouncedSearch.test.ts
src/utils/__tests__/sanitize.test.ts        <- NOT deleted, sanitize.ts stays
```

**`jest.mock()` of a deleted path throws "Cannot find module" — these two lines must go in the same commit:**
```
__tests__/stores/filmStore.test.ts:142   jest.mock('../../src/utils/requestReview', …)
__tests__/stores/filmStore.test.ts:156   jest.mock('../../src/utils/concurrencyScope', …)
```
**This is the single most likely way this batch breaks the suite**, and a plain "delete the file" approach hits it.

**Shared test files — surgery on a `describe` block, never file deletion:**
```
src/services/__tests__/servicesBatch2.test.ts   also tests StackService, FilmService, LoungeService (LIVE)
                                                 -> remove only the DossierService + getFilmReviewCount blocks
src/stores/__tests__/lounge.test.ts             also tests the live lounge store
                                                 -> remove only the deleteMessage block
```

**False alarms — verified, no action:**
```
src/components/__tests__/LogSearchEngine.test.tsx:35   "debounce: clears timer…"  = a test NAME, not an import
src/lib/__tests__/revenueCat.selectPackage.test.ts:112 "…useEntitlement path…"    = a test NAME, not an import
```

## 4 · ⚠️ Coverage interaction with NEW-C1 — measure, don't assume

CI is already failing on `./src/stores/`: **functions 28.78 vs threshold 29** and **statements 31.75 vs 32**.

**#59 (`deleteMessage`) and #53 both live in `src/stores/lounge.ts`.** `deleteMessage` is currently **covered** by `lounge.test.ts`. Removing a covered function *and* its test changes both numerator and denominator — the direction is not predictable by inspection.

⇒ **Re-run `npx jest --coverage --ci` after the store-touching commits and read `./src/stores/` before proceeding.** If it moves the wrong way, NEW-C1 must be fixed in the same push rather than after.
The other deletions are in `src/utils`, `src/hooks`, `src/services`, `src/schemas` — they cannot affect the `./src/stores/` thresholds, only the slack global ones.

## 5 · The three independent items — clean, no dependencies

- **#5** — `test-app/`, `test_db.js`, `test_schema.js`. Only reference anywhere is `tsconfig.eslint.json:19` (an `exclude` entry). Remove that line in the same commit so the claim "zero references" becomes true.
- **#43** — delete `0005_log_comments_fk.sql`. Proven unapplicable: a constraint named `log_comments_user_id_fkey` **already exists live**, pointing at `auth.users(id) ON DELETE CASCADE`. Applying the file would fail on duplicate name, and the live FK is *better* than the one it proposes.
- **C2** — delete `.eslintrc.js`. **Expo now says so itself**: `expo lint` printed *"Using legacy ESLint config. Consider upgrading to flat config."* Post-#1 both configs report 0, so removing it changes no result.

## 6 · Two product decisions blocking part of the batch

- **#129 `requestReview`** — fully built, never called. **Wire it or delete it?** If deleted, `filmStore.test.ts:142`'s mock goes too.
- **#70 rank ladder** — *(not in this batch, but the same class)* dead on mobile, **live on web**. Deleting makes the clients diverge permanently.

## 7 · Execution order — this sequence is the safety property

```
1.  #5, #43, C2                    independent, no test impact
2.  delete the 5 barrels            (nothing imports them — proven)
3.  #79 dossier.schema              then
4.  #38 DossierService + #37        + describe-block surgery in servicesBatch2
5.  #81 13 dead hooks               + delete 4 hook test files
6.  #72 9 dead utils (NOT sanitize) + delete 2 util test files
7.  #71 concurrencyScope            + remove filmStore.test.ts:156 mock
8.  #129 requestReview (if deleting)+ remove filmStore.test.ts:142 mock
9.  #76 qos, THEN apiCircuitBreaker  order is load-bearing
10. #53, #59 in lounge.ts           + describe surgery, THEN re-measure coverage
```
Gate after each commit: `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci`.

## 8 · Are we doing the right thing?

**Yes, with two corrections already made:** `sanitize.ts` leaves the batch (it's a parity gap, not dead code), and the twelve test dependencies mean this is *not* a "delete some files" job — roughly half the work is test surgery.

**Expected result:** ~1,600 lines removed (not 1,717 — `sanitize.ts`'s 71 stay, and the test files removed are additional), five barrels gone so static analysis starts working again, and the dead-code blind spot that let 1,700 lines accumulate is closed at its cause.

---
---

# BATCH 1 — SECOND DEEP PASS. Two more reclassifications.

The first pass checked the 10 dead **utils** against the web tree and found `sanitize.ts`. **It never ran that check on the 13 dead hooks.** Running it now found two more.

## 🔴 A · `useBanCheck` — deleting it cements a divergence. My #80 recommendation was WRONG.

I previously advised: *"delete the dead hook; the server already refuses the write."* Then I checked the web app:

```tsx
// src/pages/ListsPage.tsx
:187   const { checkBan } = useBanCheck()
:189   const handleCreateList = async (listData: any) => {
:190       if (checkBan()) return
:192       const { data: newList, error } = await supabase.from('lists').insert({...})
```

**Web gates `handleCreateList` on ban. Mobile's `createList` does not.** The hook mobile has sitting dead is the same hook web uses, at the same write.

⇒ **Do not delete it. Wire it at `listSlice.createList`**, matching web. That is also the exact choke point #68 needs for sanitisation — **one edit satisfies both findings.**
This does not change #80's server half: the two RESTRICTIVE RLS policies are still the fix that matters, because a client gate protects nothing against a direct REST call.

## 🔴 B · `useAnalytics` — mobile would launch completely blind

Mobile has **no analytics SDK at all** (`grep posthog|amplitude|mixpanel|segment mobile/package.json` → nothing). But its `useAnalytics` doesn't need one — it writes to Supabase directly:

```ts
// src/hooks/useAnalytics.ts  — "(Mobile Parity)"
:12  const { error } = await supabase.from('analytics_events').insert(rows)
     30s flush interval · 50-event batches · triple-guarded against unauthenticated inserts
```

**The table exists live:** `GET /rest/v1/analytics_events` → **200**.

So the implementation is complete, guarded, batched, and the destination is real — **and it is never mounted.** Web runs PostHog (`App.tsx:154`); mobile records nothing.

⇒ **Deleting this means launching the mobile app with zero analytics** — no pageviews, no funnel, no retention, no event data. Sentry covers crashes only. For a launch to a warm audience you are about to convert, that is the one dataset you cannot reconstruct later.
**Recommend wiring it** (one `useAnalytics()` call in the root layout, mirroring web's `App.tsx`). It is your call, but "delete" should be a decision, not a side effect of a cleanup batch.

## ✅ C · The other eleven hooks — verified genuinely deletable

| hook | verdict |
|---|---|
| `useDebouncedSearch` | web reference is a **test file only** (`src/test/phase1-infra.test.ts`) — dead both sides |
| `useStreak` | **mobile reimplemented it inline** at `profileComputed.ts:102-110` with its own timezone-safe logic. Genuinely redundant. |
| `useStableSubscription` | web file exists, **zero web importers** — dead both sides |
| `useEntitlement` · `useFilmReviews` · `useLoungeData` · `useParallaxBreathing` · `useSafeAsync` · `useScaledFont` · `useStaggeredPrefetch` · `useTMDBMovies` | no web counterpart at all |

**One caveat on `useEntitlement`:** `auth.ts:411-418` documents the tier-reconciliation path as *"the polling loop in `useEntitlement.purchase()`/membership.tsx"*. `membership.tsx` has its own polling, so the behaviour is covered — but **deleting the hook makes that comment reference a module that no longer exists.** Update the comment in the same commit or the next reader chases a ghost.

## Revised batch 1 — it is no longer a pure deletion batch

```
DELETE   #5    test-app/, test_db.js, test_schema.js (+ tsconfig.eslint:19)
DELETE   #43   0005_log_comments_fk.sql  (constraint already exists live, better)
DELETE   C2    .eslintrc.js              (expo itself now warns about it)
DELETE   #81a  5 barrels + 11 dead hooks (not useBanCheck, not useAnalytics)
DELETE   #72   9 dead utils              (not sanitize.ts)
DELETE   #76   qos, THEN apiCircuitBreaker  — order load-bearing
DELETE   #71   concurrencyScope          (+ remove filmStore.test.ts:156 mock)
DELETE   #79   dossier.schema.ts
DELETE   #38   DossierService            (+ describe surgery)
DELETE   #37   getFilmReviewCount        (+ describe surgery)
DELETE   #59   deleteMessage             (+ describe surgery, + interface decl at lounge.ts:106)
DELETE   #53   dead expressions in lounge.ts
WIRE     #129  requestReview             -> useLogFlow after a successful log
WIRE     #81b  useBanCheck               -> listSlice.createList (matches web; pairs with #68)
DECIDE   #81c  useAnalytics              -> root layout, or accept launching blind
SPUN OUT       sanitize.ts               -> wire at mobile stack render sites (batch 2)
CLOSES   #130  the aggregate
```

## What the second pass proves about the first

Pass 1 found one trap (`sanitize.ts`) by checking utils against web. Pass 2 found two more by running the **same check on hooks** — a check pass 1 simply did not perform.

**Three of the fourteen items in this batch were mis-scoped**, and all three failed the same way: *a module that is dead on mobile but alive on web is a parity gap, not dead code.* That is now a standing rule for any deletion in this codebase, and it is the check I will run first on batch 2.

---
---

# BATCH 1 — THIRD DEEP PASS. A fourth trap, and the finding's premise is false.

Passes 1 and 2 ran the web-parity check on **utils** and **hooks**. Pass 3 ran it on the **services, schemas and store methods** — the remainder of the batch.

## 🔴 #59 `deleteMessage` — the finding's premise is FALSE, and deleting it removes a feature

Filed as: *"a dead path spanning three files, **implementing the rejected semantic**."*

**Web has this feature fully wired and shipping:**
```tsx
// src/pages/LoungeRoomPage.tsx
:151  <button className="lounge-msg-delete" onClick={() => onDelete(msg.id)} title="Delete message">
:399  const { …, deleteMessage } = useLoungeStore()
:509  deleteMessage(id)
```

**And the "rejected semantic" claim does not survive comparison.** Both implementations:
```ts
// WEB   src/stores/lounge.ts:528-540
set(s => ({ messages: s.messages.filter(m => m.id !== messageId) }))
await supabase.from('lounge_messages').delete().eq('id', messageId).eq('user_id', user.id)

// MOBILE  mobile/src/stores/lounge.ts:711+
set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== messageId) }))
await supabase.from('lounge_messages').delete().eq('id', messageId).eq('user_id', user.id)
  + offline-queue on network error
  + rollback with correct chronological re-sort on failure
```
**Identical semantic — both hard delete, both scoped to `user_id`.** Mobile's is *strictly better engineered*: it has an offline queue and a rollback that web lacks entirely.

⇒ **#59 is not dead code implementing a rejected design. It is the better of the two implementations of a live feature, simply never wired to a mobile screen.**
**Do not delete. Wire it** — mobile members currently cannot delete their own salon messages while web members can. That is a moderation and safety gap, not a cleanup item: post something by mistake in a salon on your phone and you are stuck with it.

**New observation while comparing:** `lounge_messages.deleted_at` **exists live and is null on every row** — a soft-delete column **neither client uses**. If the intent was tombstoned messages (so a deletion doesn't break reply context), both clients implement the wrong thing. That is a product question, not a batch-1 blocker.

## ✅ Confirmed genuinely deletable — no web counterpart
```
#38  DossierService          no web DossierService exists
#37  getFilmReviewCount      not present on web at all
#79  dossier.schema.ts       no web dossier schema exists
```

## ✅ #53 — signature verified, the fix is type-identical
```ts
// lounge.ts:209-214
function applyReactionDelta(reactions, reaction, delta: 1 | -1, mine: boolean): ReactionSummary[]
```
The 4th parameter is `mine: boolean`, so replacing the provably-always-`false` variable with the literal `false` is **type-correct and semantically identical**. The `Math.max(MESSAGE_DEDUP_CAP, len+1)` slice is separately proven unable to truncate. Both safe.

## ✅ #5 — scoped precisely
`test-app/` holds **20,492 files on disk** but only **10 are tracked** (the rest is an untracked `node_modules`). Tracked content is a stock Expo scaffold — default `App.js`, `app.json`, default icon assets. Nothing of value.
Plus `test_db.js` and `test_schema.js`, both tracked — ad-hoc Supabase probe scripts reading keys from env (no hardcoded secrets).
⇒ `git rm -r` **12 tracked files**, and delete the 20,480 untracked files from disk separately to reclaim space. Remove `tsconfig.eslint.json:19` in the same commit.

## The pattern, now measured across three passes

| pass | check run | traps found |
|---|---|---|
| 1 | web-parity on **utils** | `sanitize.ts` |
| 2 | web-parity on **hooks** | `useBanCheck`, `useAnalytics` |
| 3 | web-parity on **services / schemas / store methods** | `deleteMessage` |

**Four of fourteen batch-1 items were mis-scoped, every one failing identically:** *dead on mobile is not dead when it is alive on web.* Three passes were needed only because I applied the check to one category at a time instead of all of them at once.

## FINAL batch 1 composition

```
DELETE  #5    12 tracked files (+ tsconfig.eslint:19, + 20,480 files from disk)
DELETE  #43   0005_log_comments_fk.sql
DELETE  C2    .eslintrc.js
DELETE  #81a  5 barrels + 11 dead hooks
DELETE  #72   9 dead utils                      (sanitize.ts excluded)
DELETE  #76   qos THEN apiCircuitBreaker         (order load-bearing)
DELETE  #71   concurrencyScope                   (+ filmStore.test.ts:156 mock)
DELETE  #79   dossier.schema.ts
DELETE  #38   DossierService                     (+ describe surgery)
DELETE  #37   getFilmReviewCount                 (+ describe surgery)
DELETE  #53   dead expressions in lounge.ts

WIRE    #129  requestReview      -> useLogFlow after a successful log
WIRE    #81b  useBanCheck        -> listSlice.createList  (matches web; pairs with #68)
WIRE    #59   deleteMessage      -> the mobile salon message UI
DECIDE  #81c  useAnalytics       -> root layout, or launch with no mobile analytics
SPUN    sanitize.ts              -> mobile stack render sites (batch 2)
CLOSES  #130
```

**11 deletions, 3 wirings, 1 decision.** The batch that started as "delete 1,717 lines of dead code" is now a third feature-restoration work — because four of those "dead" modules were features mobile was missing.

---
---

# BATCH 1 — FOURTH PASS. I have to retract my own pass-3 finding.

Passes 1–3 verified *what* to wire. **None verified the wirings were architecturally possible, or that mobile wasn't already doing the job under another name.** Pass 4 checked both. It found one impossible wiring and one outright reversal of my own conclusion.

## 🔴 RETRACTION · #59 — **the register was right, I was wrong. DELETE it.**

In pass 3 I told you mobile was missing message deletion and you should wire it. **That was wrong.** Mobile already has it:

```tsx
// app/lounge/[id].tsx:621-632
<ActionSheet
  isSelf={actionSheetMsg?.user_id === user?.id}
  onDelete={withdrawMessage}        // <-- already wired, different name
  ...
/>
```
`ActionSheet` declares `onDelete` as a **required** prop (`:31`), calls it at `:158`, and the long-press flow feeding it exists at `:113` and `:223`. The feature ships.

**And `withdrawMessage` is the *better* implementation — it is the semantic the team chose:**
```ts
// lounge.ts:973-992
// "Optimistic tombstone (continuity over a jarring disappearance)."
{ ...m, content: '', deleted_at: new Date().toISOString(), reactions: [] }
await supabase.rpc('withdraw_lounge_message', { p_message_id: messageId })
   + rollback on failure + error toast
```
Live probe: **`POST /rest/v1/rpc/withdraw_lounge_message` → HTTP 204.** The RPC is deployed.

⇒ `deleteMessage` is a **hard-delete duplicate** — the message vanishes, breaking reply context. That is precisely *"the rejected semantic"* the register named, and `deleted_at` exists because `withdrawMessage` is the accepted design. **The finding was correct as filed. Delete `deleteMessage`, its interface declaration at `:106`, and its `describe` block in `lounge.test.ts`.**

**Correcting the record on your decision:** you said *"the app and the web should allow you to delete your own message."* **Mobile already does** — as a tombstone. So no mobile work is needed for that.

## 🔴 NEW (web) · WEB implements the rejected semantic and is still shipping it
```ts
// src/stores/lounge.ts:528-540  (web)
set(s => ({ messages: s.messages.filter(m => m.id !== messageId) }))
await supabase.from('lounge_messages').delete().eq('id', messageId).eq('user_id', user.id)
```
Plain hard delete. **No tombstone, no `withdraw_lounge_message` RPC, no rollback** — `grep` for either across the web tree returns nothing.

So the two clients disagree on a design the team explicitly decided: mobile tombstones, **web destroys**. A web member deleting a message leaves a hole in the thread and orphans any reply to it.
⇒ **Web should call `withdraw_lounge_message` like mobile does.** That is the real deliverable behind your instruction — and it is a *web* change, not a mobile one.

## 🔴 `useBanCheck` — my wiring target was architecturally impossible
```ts
export function useBanCheck() {
  const { user } = useAuthStore()      // <-- a React hook
  ...
}
```
I said *"wire it at `listSlice.createList`"*. `createList` is a **Zustand store action** — a plain async function. **A hook cannot be called there.**

It must go in the **component**, exactly where web puts it: mobile's `createList` is invoked from `app/(modals)/list-modal.tsx:253`, which already uses `useListStore(...)` at `:136` and is a proper component.

**And my claim that "one edit satisfies both #68 and useBanCheck" was wrong** — they belong in different layers:
- **#68 sanitisation → `listSlice.createList`** (the store), because the offline-queued payload must read the same cleaned value.
- **`useBanCheck` → `list-modal.tsx`** (the component), because it is a hook.
Two edits, two files. Neither substitutes for the other, and neither substitutes for #80's RLS policies, which are the only real gate.

## ✅ The other two wirings — verified possible
- **#129 `requestReview`** — `logs` is destructured at `useLogFlow.ts:148`, so `logs.length` is in scope on the success path. ✓
- **`useAnalytics`** — `RootLayout` (`_layout.tsx:42`) is a component; mounting it there mirrors web's `App.tsx:154`. ✓

## Batch 1 — corrected composition

```
DELETE  #5    12 tracked files (+ tsconfig.eslint:19, + 20,480 from disk)
DELETE  #43   0005_log_comments_fk.sql
DELETE  C2    .eslintrc.js
DELETE  #81a  5 barrels + 11 dead hooks
DELETE  #72   9 dead utils                    (sanitize.ts excluded)
DELETE  #76   qos THEN apiCircuitBreaker
DELETE  #71   concurrencyScope                (+ filmStore.test.ts:156)
DELETE  #79   dossier.schema.ts
DELETE  #38   DossierService                  (+ describe surgery)
DELETE  #37   getFilmReviewCount              (+ describe surgery)
DELETE  #53   dead expressions in lounge.ts
DELETE  #59   deleteMessage  <-- RESTORED to delete; withdrawMessage is the live, better one

WIRE    #129  requestReview   -> useLogFlow (logs.length verified in scope)
WIRE    #81b  useBanCheck     -> list-modal.tsx  (COMPONENT, not the store)
DECIDE  #81c  useAnalytics    -> RootLayout, or launch with no mobile analytics
SPUN    sanitize.ts           -> mobile stack render sites (batch 2)
NEW-WEB       web deleteMessage -> withdraw_lounge_message  (separate web batch)
CLOSES  #130
```

**12 deletions · 2 wirings · 1 decision · 1 new web finding.**

## What four passes cost and bought

| pass | check | result |
|---|---|---|
| 1 | web-parity on utils | `sanitize.ts` — real gap |
| 2 | web-parity on hooks | `useBanCheck`, `useAnalytics` — real gaps |
| 3 | web-parity on services/schemas/store methods | `deleteMessage` — **wrong call by me** |
| 4 | is the wiring *possible*, and is mobile already doing it? | #59 retracted · `useBanCheck` target corrected · web finding surfaced |

Pass 3's error is the instructive one: I found a mobile store method with no *screen* calling it and concluded the feature was missing — without checking whether a **differently-named method** already served that screen. **"Is this symbol used?" is not the same question as "is this capability present?"** That check now runs on every deletion in batch 2.

---
---

# BATCH 1 — FIFTH PASS. #72 collapses from 637 lines to 67.

Pass 4 taught: *"is this symbol used?" ≠ "is this capability present?"* Pass 5 applies the inverse — **"is this module needed by something we already decided to do?"** — to every remaining deletion. Three more come out, and one is a contradiction with my own earlier recommendation.

## 🔴 A · `performanceMonitor` — I told you to WIRE this, and batch 1 DELETES it

In round 7 I wrote, on #88/#126: *"`performanceMonitor.ts` (217 lines) is a complete, correct Sentry wrapper … so the span half of telemetry is a wiring job, not a build."*

Then I put it in batch 1's deletion list. **Direct contradiction with my own plan.**
```
/**
 * Performance Monitor — Sentry-Native Telemetry
 * - OpenTelemetry-aligned operation naming
 * - P95 budget threshold breadcrumbs
 * - Custom measurement recording
 * - Large dataset detection with warning alerts
 * When Sentry is uninitialized (empty DSN), all functions execute
 * the wrapped logic without instrumentation — zero breakage.
 */
export const SPAN_CONFIG: Record<SpanOperation, { budgetMs: number; description: string }>
```
**Remove from the deletion list.** It is built infrastructure for a capability we have already decided we want.

## 🟡 B · `storyExporter` — a built growth feature, not dead code
```
/**
 * StoryExporter — A cinematic Instagram Story export pipeline.
 * Captures an off-screen or on-screen view ref and immediately invokes the native Share sheet.
 */
```
Uses `react-native-view-shot` + `expo-sharing`. Share-a-log-to-Instagram-Stories is an install driver for a social film app, and it is fully written.
**Same class as `requestReview`: built, never wired.** This is a decision, not a cleanup. **Recommend: keep, wire post-launch.**

## 🟡 C · `navigationSnapshot` — built crash-recovery UX, with its own wiring instructions
```
/**
 * navigationSnapshot — Crash recovery via navigation state persistence.
 * On AppState → background, snapshot { activeTab, timestamp } to MMKV.
 * On cold start, if snapshot is <5 min old, restore the user's last active tab
 * to preserve context across OOM kills and OS-initiated terminations.
 *
 * Usage:
 *   // In AppBootstrapper (background save):
 */
```
The docstring **contains the wiring steps**. On a mobile app that gets OOM-killed, restoring the user's tab is real resilience. **Recommend: keep.**

## ✅ D · `useScaledFont` — the one case where dead code is intentional AND deletion is the documented intent
```ts
/**
 * @deprecated Moved to @/src/constants/textScaling.ts
 * T3-15: This file is not a hook — it exports plain constants.
 * Import from '@/src/constants/textScaling' instead.
 */
export { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
```
A back-compat re-export shim. **Migration is complete — 6 files import `constants/textScaling` directly**, and nothing imports the shim. Its own docstring instructs deletion. **Delete with confidence.**

## ✅ E · `dateUtils` — genuinely dead, verified exhaustively
Three profile tabs (`ProfileArchiveTab:20`, `ProfileLedgerTab:25`, `ProfilePhysicalTab:21`) take a `groupByMonth` prop with **`dateUtils`' exact signature**, which looked like a live use my sweep had missed. Checked exhaustively:
```
grep -rn "dateUtils" src app __tests__  ->  ONE hit: its own header comment
```
Nothing imports it. A **different** `groupByMonth` is prop-drilled to those tabs — the same duplicate-implementation pattern as #75's four `timeAgo`s, worth its own note but not a blocker. **Safe to delete.**

## 🔴 The headline: #72's real scope

Filed as *"nine dead util files (596 lines)"*; I re-measured it as 10 files / 637 lines. After five passes:

| module | verdict |
|---|---|
| `sanitize.ts` | **KEEP** — live web feature, mobile parity gap (pass 1) |
| `performanceMonitor.ts` | **KEEP** — telemetry infra we decided to wire (pass 5) |
| `storyExporter.ts` | **KEEP** — built growth feature (pass 5) |
| `navigationSnapshot.ts` | **KEEP** — built crash-recovery UX (pass 5) |
| `requestReview.ts` | **KEEP** — you decided to wire it |
| `concurrencyScope.ts` · `qos.ts` · `apiCircuitBreaker.ts` | counted under #71 / #76 |
| `dateUtils.ts` (39) · `debounce.ts` (13) · `safeParse.ts` (15) | **DELETE — 67 lines** |

**#72 collapses from 637 lines to 67.** Nine of the twelve "dead utils" are either live elsewhere, or finished features and infrastructure that were built and never connected.

## Batch 1 — composition after five passes

```
DELETE  #5    12 tracked files (+ tsconfig.eslint:19, + 20,480 from disk)
DELETE  #43   0005_log_comments_fk.sql
DELETE  C2    .eslintrc.js
DELETE  #81a  5 barrels + 11 dead hooks (incl. the useScaledFont shim)
DELETE  #72   3 utils only — dateUtils, debounce, safeParse
DELETE  #76   qos THEN apiCircuitBreaker
DELETE  #71   concurrencyScope              (+ filmStore.test.ts:156)
DELETE  #79   dossier.schema.ts
DELETE  #38   DossierService                (+ describe surgery)
DELETE  #37   getFilmReviewCount            (+ describe surgery)
DELETE  #53   dead expressions in lounge.ts
DELETE  #59   deleteMessage                 (withdrawMessage is the live, better one)

WIRE    #129  requestReview -> useLogFlow
WIRE    #81b  useBanCheck   -> list-modal.tsx (component, not the store)

KEEP    sanitize.ts · performanceMonitor.ts · storyExporter.ts
        navigationSnapshot.ts · useAnalytics.ts        -> post-launch work, NOT deletions
NEW-WEB       web deleteMessage -> withdraw_lounge_message
```

## Five passes, six items rescued

| pass | rescued from deletion |
|---|---|
| 1 | `sanitize.ts` |
| 2 | `useBanCheck`, `useAnalytics` |
| 3 | `deleteMessage` — **wrongly**, restored in pass 4 |
| 4 | (corrected pass 3; fixed the `useBanCheck` wiring target) |
| 5 | `performanceMonitor`, `storyExporter`, `navigationSnapshot` |

**Six of the original fourteen batch items were mis-scoped**, and the failure was always the same shape: *a module with no importers is not necessarily dead — it may be alive on the other client, or a finished feature nobody connected.* A dead-code sweep answers "is this referenced?" It cannot answer "should this be referenced?" — and that second question is where every one of these six lived.

---
---

# BATCH 1 — SIXTH PASS. Cascade check, plus one more rescue.

Pass 5 asked *"is this needed by a decision we already made?"* — **of the utils only.** Pass 6 asks it of the **hooks**, and adds a question no pass had asked: **does deleting a module orphan its dependencies?**

## ✅ A · No cascade — verified
Deleting `useLoungeData` could have orphaned `LoungeService`. It does not:
```
src/stores/lounge.ts:6           import { LoungeMessagePayloadSchema } from '../services/LoungeService'
app/(modals)/social-modal.tsx:10, :172   LoungeService.getUserLounges(user.id)
```
`LoungeService` is **live on two independent paths**. Nothing in this batch orphans a dependency — checked for every dying hook.

## 🟡 B · `useEntitlement` — recommend KEEP (7th rescue)
```
/**
 * useEntitlement — Gate premium features with a single hook.
 * Wraps RevenueCat's entitlement check + local resolveTier(user) fallback.
 */
```
Two reasons it should not die in a cleanup batch:
1. **It is a stronger gate than what ships.** Everything today gates on `resolveTier(user)` — a client-held profile row. This hook checks **RevenueCat directly**. #125 (paid tiers gated in the client only) is still open, and this is infrastructure for doing it properly.
2. **`auth.ts:411-418` names it in a live comment** as the tier-reconciliation path for #99/#101. `membership.tsx` carries its own polling so behaviour is covered — but deleting the module makes a shipped comment point at nothing.

Same class as `performanceMonitor`: built infrastructure for an unfinished decision. **Keep.**

## 🔴 C · NEW observation — five duplicate debounced-search implementations, still live
`useDebouncedSearch`'s docstring claims it *"Replaces 5 separate setTimeout+clearTimeout+AbortController implementations."* **Verified — all five exist:**
```
src/components/darkroom/DarkroomHeader.tsx
src/components/log/LogSearchEngine.tsx
src/components/profile/ProfileLedgerTab.tsx
src/components/profile/ProfileTriptych.tsx
src/components/profile/ProfileWatchlistTab.tsx
```
Same class as **#75** (four `timeAgo` implementations) and `dateUtils` (extracted for reuse, never used). **This is a register-worthy finding the original audit never had.**

**But the hook itself is still deletable** — and this is where I draw the line to avoid over-rescuing. `storyExporter` and `navigationSnapshot` are *user-facing features*; `useDebouncedSearch` is an *internal refactor that was never applied*. The five implementations work. Deleting the hook loses a written solution, not a capability. **Delete it, and record the five duplicates as their own finding** so the work isn't silently lost.

## ✅ D · The test surgery is safe — structure verified
```
:7-11    jest.mock(...)          <- global, shared
:38-43   beforeEach(...)         <- global, shared
:49-156  describe('StackService')    beforeAll -> own require()
:162-209 describe('FilmService')     beforeAll -> own require()
:215-279 describe('LoungeService')   beforeAll -> own require()
:285-354 describe('DossierService')  beforeAll -> own require()
```
Each block has its **own scoped `beforeAll` + `require()`**, so removing lines **285-354** cannot affect the other three. Clean excision.
`getFilmReviewCount`'s tests are **nested inside** the FilmService block (~`:166-181`) — that one needs the inner `describe` removed, not the outer. More delicate, still safe.

## 🔴 E · The systemic pattern — this is bigger than any single item

Across six passes, the same thing keeps appearing: **finished work that was never connected.**

| module | what it is | state |
|---|---|---|
| `sanitize.ts` | competitor-branding stripper | live on web, dead on mobile |
| `performanceMonitor.ts` | Sentry span telemetry | built, never wired |
| `storyExporter.ts` | Instagram Story export | built, never wired |
| `navigationSnapshot.ts` | crash-recovery tab restore | built, wiring steps in its own docstring |
| `requestReview.ts` | App Store rating prompt | built, never wired |
| `useAnalytics.ts` | DB-backed analytics + live table | built, never mounted |
| `useEntitlement.ts` | RevenueCat-backed tier gate | built, never used |
| `useDebouncedSearch` · `useTMDBMovies` · `dateUtils` | refactors replacing live duplication | written, never applied |

**Ten modules.** That is not dead code — it is a **completion gap**: the last 5% (wiring) deferred, repeatedly, until the work looked like garbage to a static sweep. The original audit read the symptom (#72, #81, #130 — "1,717 lines of dead code") and prescribed deletion. **Deleting it would have destroyed roughly 1,000 lines of finished, working capability.**

## FINAL batch 1

```
DELETE  #5   12 tracked files (+ tsconfig.eslint:19, + 20,480 from disk)
DELETE  #43  0005_log_comments_fk.sql
DELETE  C2   .eslintrc.js
DELETE  #81a 5 barrels + 10 dead hooks   (not useAnalytics, useBanCheck, useEntitlement)
DELETE  #72  3 utils — dateUtils, debounce, safeParse
DELETE  #76  qos THEN apiCircuitBreaker
DELETE  #71  concurrencyScope            (+ filmStore.test.ts:156)
DELETE  #79  dossier.schema.ts
DELETE  #38  DossierService              (+ excise :285-354)
DELETE  #37  getFilmReviewCount          (+ excise the nested block ~:166-181)
DELETE  #53  dead expressions in lounge.ts
DELETE  #59  deleteMessage               (withdrawMessage is live and better)

WIRE    #129 requestReview -> useLogFlow
WIRE    #81b useBanCheck   -> list-modal.tsx (component)

KEEP    sanitize · performanceMonitor · storyExporter · navigationSnapshot
        useAnalytics · useEntitlement            -> post-launch wiring, NOT deletions
NEW           5 duplicate debounced-search implementations  (register this)
NEW-WEB       web deleteMessage -> withdraw_lounge_message
```

**Seven rescues across six passes.** The batch that began as *"delete 1,717 lines"* is now **~700 lines deleted, ~1,000 lines preserved as unfinished features**, plus two wirings and two new findings.

---
---

# BATCH 1 — SEVENTH PASS. Every remaining item opened and read in full.

Passes 1–6 examined roughly half the list closely. This pass opened **every remaining file**. Three corrections, one cascade, two new observations — and every deletion is now individually justified rather than swept in by a grep.

## 🔴 A · Correction: there are **3 barrels, not 5**
`src/utils/index.ts` and `src/services/index.ts` **do not exist.** My earlier script printed `0 importers` for both — but that was *file not found*, which I misread as *dead*. The real barrels:
```
src/hooks/index.ts       30L   22 exports
src/schemas/index.ts      9L   export * from 6 schema files
src/constants/index.ts   12L   export * from 5 constant files
```
All three confirmed unimported (the only hit for each is its own docstring). All three safe to delete. But the count in my previous reports was wrong.

Note `constants/index.ts` carries `// CONST-2: complete the barrel so it actually re-exports ALL constants as documented.` — someone did work to finish a barrel that nothing imports.

## 🔴 B · Cascade found: deleting `useLoungeData` orphans a service method
```
LoungeService.getLoungeDetails  (LoungeService.ts:55-68)
  -> only consumer: useLoungeData.ts:13
```
`LoungeService` itself stays live (`lounge.ts:6`, `social-modal.tsx:172`), but **`getLoungeDetails` becomes dead the moment the hook goes.** Delete both in the same commit, or the cleanup creates new dead code.
Checked the same way for every other dying hook — `scrollBridge`/`globalScrollY` (which `useParallaxBreathing` imports) is **heavily live: 23 references** across TopNavBar, reels, darkroom, dispatch, lounge, profile. No other cascade exists.

## ✅ C · The ten hooks — each opened, each justified

| hook | L | why it is genuinely deletable |
|---|---|---|
| `useDebouncedSearch` | 118 | refactor never applied; the 5 duplicates it names all exist and work |
| `useFilmReviews` | 15 | `film-reviews/[id].tsx:139` paginates via its own `fetchLogs` + `onEndReached` — genuine duplicate |
| `useLoungeData` | 63 | competing architecture; the lounge store is the live path *(takes `getLoungeDetails` with it)* |
| `useParallaxBreathing` | 56 | animation hook; `scrollBridge` stays live via 23 other refs |
| `useSafeAsync` | 57 | unmount-safety helper; every async site already handles its own cleanup |
| `useScaledFont` | 6 | **`@deprecated` shim** — migration complete, 6 files import the target directly |
| `useStableSubscription` | 60 | realtime cleanup; `lounge.ts` and `notificationStore` hand-roll it and work |
| `useStaggeredPrefetch` | 68 | TMDB batching; the "legacy" path it replaces is live in `lib/tmdb.ts` |
| `useStreak` | 75 | **mobile reimplemented it inline** at `profileComputed.ts:102-110`, using `serverStreak` |
| `useTMDBMovies` | 24 | its own docstring says it replaces `GLOBAL_TMDB_CACHE` — which is still the live path |

**`useScaledFont` is the only one where deletion is the documented intent.** The rest are abandoned refactors — safe to delete, but each represents work someone did.

## ✅ D · The three utils — opened in full
- **`debounce.ts` (13L)** — a generic `debounce<T>()`. Trivially dead, no feature value. **Delete.**
- **`safeParse.ts` (15L)** — `safeJsonParse(str, fallback)`, *"Prevents unhandled syntax errors from crashing the app during state hydration."* I audited **every `JSON.parse` in the codebase (28 sites)**: 26 are guarded by a local `try/catch`. **Delete** — the codebase settled on local guards and this was never adopted.
- **`dateUtils.ts` (39L)** — verified exhaustively dead (one hit: its own header comment). **Delete.**

## 🟡 E · NEW observation — two genuinely unguarded `JSON.parse` calls
From that 28-site audit, two are **not** guarded:
```
src/features/archive/archiveImport.ts:1312   JSON.parse(rawText)   -> raw JSON archive import
src/features/archive/archiveImport.ts:1346   JSON.parse(jsonText)  -> JSON inside a ZIP archive
```
Both parse a **user-supplied file**. A malformed archive throws inside `importArchive`, and the surrounding function has no `try`. Whether that surfaces as a toast or an unhandled rejection depends on the caller.
**Not a batch-1 blocker** — but it belongs with the import-engine findings (A-1…A-4, #12), and it is the one place `safeJsonParse` would genuinely have helped. Record it.

*(A near-miss worth recording: I first flagged `followStore.ts:139/147` as unguarded. They are **guarded** — an outer `try` at `:133` wraps the whole `hydrateFromCache` body. My 4-line lookback heuristic missed it. Checked before reporting.)*

## ✅ F · The surgical items — re-verified
- **#53** — `applyReactionDelta(…, mine: boolean)` confirmed at `lounge.ts:209-214`; replacing the provably-`false` variable with the literal is type-identical. The `Math.max(MESSAGE_DEDUP_CAP, len+1)` slice provably cannot truncate.
- **#59** — `withdrawMessage` (tombstone via `withdraw_lounge_message`, **live: HTTP 204**) is wired at `lounge/[id].tsx:630`. `deleteMessage` is the rejected hard-delete. **Delete confirmed.**
- **#37 / #38** — `servicesBatch2.test.ts` has four independent `describe` blocks, each with its **own** `beforeAll`+`require()`. Excising `:285-354` (DossierService) cannot touch the others; `getFilmReviewCount`'s tests are nested inside the FilmService block.
- **#5** — 12 tracked files (10 in `test-app/`, plus `test_db.js`, `test_schema.js`); 20,480 untracked `node_modules` on disk. Remove `tsconfig.eslint.json:19` in the same commit.
- **#43** — `log_comments_user_id_fkey` already exists live pointing at `auth.users(id) ON DELETE CASCADE`; the migration would fail on duplicate name and the live FK is better. **Delete the file.**
- **C2** — `.eslintrc.js`; post-#1 both configs report 0, and `expo lint` itself now prints *"Using legacy ESLint config."*

## FINAL — batch 1, flawless plan

```
COMMIT 1   #5    git rm 12 files + tsconfig.eslint.json:19   (+ rm -rf test-app from disk)
COMMIT 2   #43   delete 0005_log_comments_fk.sql
COMMIT 3   C2    delete .eslintrc.js
COMMIT 4   #81a  delete 3 barrels + 10 hooks
                 + delete LoungeService.getLoungeDetails      (cascade)
                 + delete 4 hook test files
COMMIT 5   #72   delete dateUtils, debounce, safeParse
                 + delete safeParse.test.ts
COMMIT 6   #76   delete qos, THEN apiCircuitBreaker            (order load-bearing)
COMMIT 7   #71   delete concurrencyScope
                 + remove filmStore.test.ts:156 jest.mock
COMMIT 8   #79   delete dossier.schema.ts
COMMIT 9   #38   delete DossierService + excise test :285-354
COMMIT 10  #37   delete getFilmReviewCount + excise nested test block
COMMIT 11  #53   lounge.ts — `false` literal ×2, drop the dead slice
COMMIT 12  #59   delete deleteMessage + interface decl :106 + its describe
COMMIT 13  #129  WIRE requestReview -> useLogFlow (logs.length verified in scope)
COMMIT 14  #81b  WIRE useBanCheck  -> list-modal.tsx (component; a hook cannot go in the store)

GATE after every commit:
  npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci
COVERAGE CHECK after commits 11–12 (they touch src/stores/, where NEW-C1 already fails by 0.25)

KEEP (post-launch wiring, NOT deletions):
  sanitize · performanceMonitor · storyExporter · navigationSnapshot · useAnalytics · useEntitlement

NEW FINDINGS TO REGISTER:
  · 5 duplicate debounced-search implementations
  · 2 unguarded JSON.parse in archiveImport (:1312, :1346)
  · web deleteMessage should use withdraw_lounge_message
  · the systemic completion gap (10 modules built, never connected)
```

## Seven passes, final accounting

| pass | check introduced | outcome |
|---|---|---|
| 1 | importer sweep · test deps · jest.mock · coverage · web-parity (utils) | `sanitize` rescued; 12 test deps found |
| 2 | web-parity (hooks) | `useBanCheck`, `useAnalytics` rescued |
| 3 | web-parity (services/schemas/store methods) | `deleteMessage` — **wrong call** |
| 4 | wiring feasibility · "capability under another name?" | #59 restored; `useBanCheck` target corrected |
| 5 | "needed by a decision we made?" (utils) | `performanceMonitor`, `storyExporter`, `navigationSnapshot` rescued |
| 6 | same, for hooks · orphan-cascade | `useEntitlement` rescued; 5-duplicate finding |
| 7 | **open every remaining file** | barrel count corrected 5→3; `getLoungeDetails` cascade; 2 unguarded parses |

**Seven rescues, three self-corrections, four new findings.** Batch 1 went from *"delete 1,717 lines"* to **~700 deleted, ~1,000 preserved as unfinished features, 2 wirings, 14 commits.**

Every file in the deletion list has now been opened and individually justified. **No item rests on a grep.**

---
---

# BATCH 1 — EIGHTH PASS. All three named gaps CLOSED. Final plan.

## GAP 1 CLOSED · Cross-referenced every deletion against all 116 findings

The question: *does any module being deleted prevent a bug that some other finding describes?* That relationship produced the `performanceMonitor` contradiction, so I ran it exhaustively.

**Result: no conflicts. And the justification is now stronger than "nothing imports it" — every capability being deleted has a LIVE equivalent already running in production.**

| deleting | capability | the live equivalent |
|---|---|---|
| `useSafeAsync` | abort in-flight requests | **`withAbortSignal` — 45 live refs** |
| `useStableSubscription` | realtime channel cleanup | `lounge.ts:1276 removeChannel`; `notificationStore:350/386` `_realtimeCleanup` singleton |
| `useTMDBMovies` · `useStaggeredPrefetch` | TMDB dedup / batching | `lib/tmdb.ts:153-212` `_inflight` Map with `finally` cleanup |
| `useStreak` | streak calculation | `profileComputed.ts:102-110` (uses `serverStreak`) |
| `useFilmReviews` | review pagination | `film-reviews/[id].tsx:139` `onEndReached` → `fetchLogs` |
| `useLoungeData` | lounge fetching | the lounge store (`lounge.ts`) |
| `useDebouncedSearch` · `debounce` | debounced input | 5 in-component implementations |
| `dateUtils` | month grouping | a `groupByMonth` prop-drilled to 3 profile tabs |
| `safeParse` | guarded JSON parse | **26 of 28 `JSON.parse` sites use a local `try/catch`** |
| `useParallaxBreathing` | scroll animation | `scrollBridge`/`globalScrollY` — 23 live refs, unaffected |
| `useScaledFont` | text scaling | `constants/textScaling` — 6 direct importers |

**Nothing is lost. Every one is a redundant second implementation.**

### The `useSafeAsync` ↔ #91 contradiction — resolved, and it was a false alarm
I flagged this myself. Reading `useSafeAsync` in full settles it:
```ts
const abortControllers = useRef<Set<AbortController>>(new Set());
const isMounted = useRef(true);
const execute = <T>(asyncFn: (signal: AbortSignal) => Promise<T>) => …
```
It manages **promises and AbortControllers**. **#91 is a bare `setTimeout`** (`useLogFlow.ts:353`). The hook has **no timer management whatsoever** — it cannot prevent #91, and deleting it removes no protection. #91's fix (`sealTimerRef` + `clearTimeout`, copied from `useEditProfile.ts:118`) is entirely independent. **No contradiction.**

## GAP 2 CLOSED · #129's off-by-one — decided
`maybeRequestReview(logCount)` gates on `logCount < 5`. In `useLogFlow`, `logs` is destructured at `:148` — a **render snapshot**. After `await addLog(...)` the component has not re-rendered, so `logs.length` is the **pre-insert** count. Passing it directly means the prompt fires on the member's **6th** log, not their 5th.

**Decision: pass `logs.length + 1`.**
```ts
void maybeRequestReview(logs.length + 1);
```
Matches the documented intent ("logged at least 5 films"), one token, no new state, no dependency on re-render timing.

## GAP 3 CLOSED · #81b's scope — decided
Web gates **only** list creation (`ListsPage.tsx:190`). Mobile has six write paths. "Match web" and "elite" are not the same thing, so here is the actual reasoning:

The client gate is **UX, not security** — #80's RLS policies refuse every banned write server-side regardless. Wiring the hook into six store call sites is the wrong shape: it duplicates a check the server already enforces, at six places, on the hottest paths.

**Decision, two parts:**
1. **Now (parity, 2 lines):** `useBanCheck` in `list-modal.tsx`, matching web exactly. Instant feedback without a round-trip on the one path web also guards.
2. **The general solution (post-launch, 1 place):** map the existing `isForbiddenError` (already in `networkError.ts`) to an honest ban message. That covers **all six writes** with one change, instead of six.

This is why "match web" is right *for launch* and not the end state.

---

# FINAL PLAN — batch 1

**14 commits. Gate after every one: `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci`**

```
 1  #5    git rm test-app/ (10 files) + test_db.js + test_schema.js
           + remove tsconfig.eslint.json:19  ("test-app" exclude)
           + rm -rf test-app from disk (20,480 untracked files)
 2  #43   delete supabase/migrations/0005_log_comments_fk.sql
 3  C2    delete .eslintrc.js
 4  #81a  delete 3 barrels (hooks/, schemas/, constants/index.ts)
           + 10 hooks: useDebouncedSearch, useFilmReviews, useLoungeData,
             useParallaxBreathing, useSafeAsync, useScaledFont,
             useStableSubscription, useStaggeredPrefetch, useStreak, useTMDBMovies
           + LoungeService.getLoungeDetails  (CASCADE — sole consumer dies here)
           + 4 test files: useBanCheck*, useEntitlement*, useStableSubscription*, useDebouncedSearch*
           * keep useBanCheck.ts and useEntitlement.ts themselves — only their tests go
             if the hook goes; useBanCheck/useEntitlement/useAnalytics are KEPT
 5  #72   delete dateUtils.ts, debounce.ts, safeParse.ts + safeParse.test.ts
 6  #76   delete qos.ts, THEN apiCircuitBreaker.ts   (order load-bearing)
 7  #71   delete concurrencyScope.ts
           + remove filmStore.test.ts:156  jest.mock('…/concurrencyScope')
 8  #79   delete schemas/dossier.schema.ts
 9  #38   delete services/DossierService.ts
           + excise servicesBatch2.test.ts :285-354  (self-contained describe)
10  #37   delete FilmService.getFilmReviewCount
           + excise its nested describe inside the FilmService block (~:166-181)
11  #53   lounge.ts — replace the two always-false `mine` vars with the literal `false`;
           drop the no-op `.slice(0, Math.max(MESSAGE_DEDUP_CAP, len+1))`
12  #59   delete deleteMessage impl + interface decl :106 + its describe in lounge.test.ts
           >>> RE-RUN COVERAGE HERE: commits 11-12 touch src/stores/,
               where NEW-C1 already fails by 0.25 (statements) / 0.22 (functions)
13  #129  WIRE  useLogFlow: `void maybeRequestReview(logs.length + 1);` after addLog succeeds
           + KEEP filmStore.test.ts:142's jest.mock (it already anticipates this)
14  #81b  WIRE  list-modal.tsx: `const { checkBan } = useBanCheck()`; `if (checkBan()) return`
           before createList — component-level, matching ListsPage.tsx:190
```

**KEEP — not deletions, post-launch wiring:**
`sanitize.ts` · `performanceMonitor.ts` · `storyExporter.ts` · `navigationSnapshot.ts` · `useAnalytics.ts` · `useEntitlement.ts` · `useBanCheck.ts`

**NEW findings this batch produced, to register:**
1. Five duplicate debounced-search implementations (`DarkroomHeader`, `LogSearchEngine`, `ProfileLedgerTab`, `ProfileTriptych`, `ProfileWatchlistTab`)
2. Two unguarded `JSON.parse` on user-supplied files (`archiveImport.ts:1312`, `:1346`)
3. Web `deleteMessage` should call `withdraw_lounge_message` (mobile tombstones, web destroys)
4. The systemic completion gap — 10 modules built and never connected
5. `isForbiddenError` → ban-message mapping (covers all six writes in one place)

---

## Answering your three questions, now that the gaps are closed

**1 · Is every fix the elite best?** Yes, and now for a stronger reason than before: each deletion is justified by a **live equivalent in production**, not by absence of imports. The two wirings have their open details decided (`logs.length + 1`; component-level ban check with the `isForbiddenError` mapping named as the real end state).

**2 · Are the decisions right?** Every one now rests on a file I opened and a live equivalent I verified. Three self-corrections happened inside this batch (deleteMessage, barrel count 5→3, performanceMonitor) and one suspected contradiction (`useSafeAsync`/#91) was chased down and disproven rather than assumed either way.

**3 · All gaps closed?** The three I named are closed: the cross-reference is exhaustive, the off-by-one is decided, the ban-check scope is decided. The seven KEPT files have no wiring design — that is **deliberate deferral, stated as such**, not an oversight.

**Eight passes · 7 rescues · 3 self-corrections · 5 new findings · 14 commits.** Nothing in this plan rests on a grep.

---
---

# THE 5 NEW FINDINGS — studied against all four points

Batch 1 produced these. None had been through the four points. All five now have.

## NEW-1 · duplicate debounced search — **REAL but MIS-SCOPED: it is 3, not 5, and they are not identical**

I claimed five duplicates of one pattern. Reading all five, they are **two different patterns**:

**Class A — TMDB network search (3):**
```
LogSearchEngine.tsx:80    setTimeout -> tmdb.search(q, 1)    + searchGenRef generation counter
ProfileTriptych.tsx:199   setTimeout -> tmdb.search(query)   + `cancelled` flag
DarkroomHeader.tsx:137    setTimeout -> async semanticMap    + neither
```
**Class B — local string filtering (2):**
```
ProfileLedgerTab.tsx:99      300ms -> setLedgerSearch(val)
ProfileWatchlistTab.tsx:93   300ms -> setWatchlistSearch(val)
// both commented: "Debounce JS thread string search to prevent ANR freezes on 1000+ log profiles"
```

Class B does **no network call at all** — it debounces local filtering to avoid ANR freezes. `useDebouncedSearch` is documented as a *"TMDB search hook"*; it does not apply to Class B.

And the three Class-A sites use **three different race-protection strategies** — a generation counter, a cancelled flag, and nothing. They are not copies; they are independent solutions of varying quality.

**Point 2 (best fix):** consolidate the three Class-A sites onto one hook that keeps the **strongest** guard (the generation counter). Leave Class B alone.
**Point 3 (side effects):** search race conditions are subtle and user-visible — a stale response overwriting a newer one. Any consolidation must preserve `LogSearchEngine`'s generation counter or it *introduces* the bug it is meant to prevent.
**Point 4 (should we?):** **No — not before launch.** Zero user-visible benefit, real regression risk in a path members touch constantly. Post-launch cleanup.
**Bonus:** `DarkroomHeader` has **no race protection at all** — a slow response can overwrite a newer query. That is a small real defect, worth its own line.

## NEW-2 · unguarded `JSON.parse` — **REAL but half of it is UNREACHABLE**

I reported two. Checked properly:
```
archiveImport.ts:1312   inside importArchive()      -> grep "importArchive(" => ZERO CALLERS. Unreachable.
archiveImport.ts:1346   inside importArchiveZip()   -> reachable (DataVault calls it)
```
And the reachable one's caller **is** guarded: `DataVault.tsx:91` wraps the JSON path in `try { parsed = JSON.parse(rawText) } catch { throw new Error('Invalid JSON format.') }` and the ZIP path sits inside the same handler's outer try.

**Verdict:** one unguarded parse, in a path whose caller catches. A malformed ZIP-embedded JSON produces a **generic** error toast instead of *"Invalid JSON format."*
**Fix:** mirror `DataVault:91`'s local try/catch at `:1346`. Two lines.
**Point 4:** LOW. Worth doing with the import-engine batch (A-1…A-4), not on its own.
**Bonus finding:** **`importArchive()` is dead code** — zero callers. It belongs with the batch-1 deletions.

## NEW-3 · web destroys messages where mobile tombstones — **REAL, and the fix has a side effect that must ship with it**

Mobile: `withdrawMessage` → `withdraw_lounge_message` RPC → sets `deleted_at`, clears content, keeps the row. Live: **HTTP 204**.
Web: `src/stores/lounge.ts:528-540` → plain `.delete()`. Row gone.

**Point 2 (best fix):** web calls the same RPC.
**Point 3 — the side effect, and it is not optional.** Web's handler does `set(s => ({ messages: s.messages.filter(m => m.id !== messageId) }))` — it *removes* the row from state. If web switches to the tombstone RPC without changing the render, the row comes back on next fetch **with empty content** and renders as a blank message. **The web UI must render `deleted_at` rows as "[deleted]" in the same change**, exactly as mobile does. Ship them together or web looks broken.
**Point 4:** yes — it is a genuine data-integrity divergence on a decision the team already made, and it is your live client with real users.

## NEW-4 · the systemic completion gap — **REAL, but it is not a code defect**

Ten modules built and never connected (`sanitize`, `performanceMonitor`, `storyExporter`, `navigationSnapshot`, `requestReview`, `useAnalytics`, `useEntitlement`, `useDebouncedSearch`, `useTMDBMovies`, `dateUtils`).

**Point 1:** real — verified individually across eight passes.
**Point 2:** there is no code fix. The remedy is process: **a module that is not imported by anything does not merge.** One CI check — flag any new file in `src/` with zero importers — would have caught all ten at the moment they landed.
**Point 4:** worth doing **after** launch, once the current ten are resolved; adding that check now would fail CI on the seven files we deliberately kept.

## NEW-5 · `isForbiddenError` → ban message — **REAL, and the pattern is already proven in production**

`networkError.ts:38` exports `isForbiddenError`, and it is **already used exactly this way** at `app/log/[id].tsx:378`:
```ts
reelToast.error(isForbiddenError(error)
  ? 'This member limits who may annotate their critiques.'
  : 'Failed to file critique.');
```
**Point 2 (best fix):** extend the same pattern to the write paths a banned member hits, so `42501` yields *"Your account has been silenced by The Society"* instead of a generic failure. One helper, applied at the catch sites that already exist.
**Point 3:** additive — it only changes the *message* on an error path that already fails. It cannot affect a succeeding write. And the pattern already ships at one site, so its behaviour under this app is known.
**Point 4:** yes, and it is **strictly better than wiring `useBanCheck` into six stores** — one place, covers every write, no hook-in-store problem. This is the real end state for #80's client half.

---

## Summary — the five, after study

| # | verdict | do it before launch? |
|---|---|---|
| NEW-1 | REAL, mis-scoped (3 not 5, two patterns) | **No** — regression risk, zero user benefit |
| NEW-2 | REAL, half unreachable | **No** — fold into the import batch |
| NEW-3 | REAL, web-side, needs a paired UI change | **Yes** — live users, data integrity |
| NEW-4 | REAL, process not code | **No** — would fail CI on the 7 kept files |
| NEW-5 | REAL, pattern already proven | **Yes** — cheap, and it replaces #80's client half |

**Two new sub-findings this study produced:** `DarkroomHeader`'s search has **no race protection**, and **`importArchive()` is dead code** (zero callers) — the latter joins batch 1's deletions.

---
---

# CSV IMPORT — the elite design. A-1 … A-4 solved structurally, not patched.

**Decision: import ships, and it ships correct.** Patching the four findings individually leaves A-3 unsolvable, because a 1–10 export from someone who never rated above 5 is **information-theoretically identical** to a 1–5 export. No algorithm closes that. Someone has to be asked.

## The root cause is the architecture, not the four bugs

```
DataVault: pick file -> importArchiveJSON/Zip(...) -> setImportResult(res)
```
**Fire-and-commit.** It parses, resolves against TMDB, and writes — in one pass, with no point at which the member sees what is about to happen. Every one of A-1…A-4 is a silent decision made inside that single pass.

## The fix: three phases

### Phase 1 — `analyseArchive(source) → ImportPlan` · **zero writes**
Parse, resolve films against TMDB, detect formats, probe existing lists. Return a plan:
```ts
interface ImportPlan {
  logs:       { total: number; matched: number; unmatched: { title: string; year?: number }[] };
  ratingScale:{ detected: 'half-five' | 'ten' | 'hundred'; confident: boolean; evidence: string };
  dateFormat: { detected: 'MM/DD' | 'DD/MM'; confident: boolean };
  lists:      { name: string; existing: boolean; existingIsPrivate?: boolean; items: number }[];
  watchlist:  number;
}
```

### Phase 2 — the confirmation screen
- *"847 films found. 12 couldn't be matched."* + the list of 12
- *"Your ratings look like **1–5**. Is that right?"* → **[1–5] [1–10]** — shown **only when `confident === false`**
- *"3 of your stacks already exist. We'll add films to them and keep your privacy settings."*
- **[Cancel] [Import]**

### Phase 3 — `commitImport(plan, choices)` · the writes
Uses the confirmed scale and the resolved matches. No new decisions.

**This one change closes A-3 (asked, not guessed), A-4 (unmatched shown before commit), and A-1 (collisions disclosed).**

---

## Per-finding fixes

### A-1 · private list flipped public — **preserve, don't default**
`archiveImport.ts:966-981`. The existence probe selects only `id`:
```ts
const { data: existing } = await supabase.from('lists').select('id')
  .eq('user_id', userId).eq('title', safeTitle).maybeSingle();
...
.upsert([{ id: listId, ..., is_private: false, is_ranked: false }])   // hardcoded
```
**Fix:** widen the probe to `id, is_private, is_ranked, description` and pass those through the upsert.
**Zero-side-effect proof:** for a **new** list `existing` is null and today's defaults apply — bit-identical. For an **existing** list the values round-trip instead of being overwritten. There is no third case. The JSON path (`:1215`) already does this correctly and is untouched.
**The second half the finding names:** `rank_position` restarts at 0 and scrambles an existing ranked stack. **Fix:** when `existing` is non-null, offset new items by the current max `rank_position` instead of starting at 0. Append, never renumber.

### A-2 · dates corrupt per-row — **two-pass scan**
`:304-313` decides DD/MM vs MM/DD *inside the per-row match*, defaulting to MM/DD. In one European file `25/03/2024` parses right and `05/03/2024` silently transposes.
**Fix:** pre-scan the date column once. If **any** row has first-number > 12, the whole file is DD/MM.
**Zero-side-effect proof:** in a US file no row can have first-number > 12 (months are 1–12), so the pre-scan yields MM/DD and behaviour is identical to today. In a European file it changes only rows that are currently wrong. A genuinely ambiguous file (no row > 12 either side) stays MM/DD — unchanged, and correct, since MM/DD is the more common export.
**Surfaced in the plan** as `dateFormat.confident` so an ambiguous file can say *"dates read as MM/DD"* rather than silently choosing.

### A-3 · ratings doubled — **deterministic where possible, ASK where not**
`detectRatingScale` (`:251-256`) branches on `Math.max` alone. Two signals already exist and are ignored:
1. **IMDb source detection** — `HEADER_MAP` already parses IMDb-only headers (`:101` `const`, `:105` `title type`, `:97` `your rating`). IMDb rates **1–10**.
2. **Fractional proof** — any `.5` component cannot come from an integer 1–10 scale ⇒ definitively `half-five`.

**Fix — decision ladder:**
```
IMDb headers present         -> 'ten'        (confident)
any fractional .5 present    -> 'half-five'  (confident)
max > 10                     -> 'hundred'    (confident)
max > 5                      -> 'ten'        (confident)
otherwise (max <= 5)         -> 'half-five'  (NOT confident -> ASK)
```
**Why asking is not optional:** `logs` upserts with `ignoreDuplicates: true`, so **re-importing correctly does not repair a wrong guess.** Guessing wrong is permanent; asking costs one tap.
**Zero side effects:** confident paths are unchanged from today except where a *better* signal now overrides `max`. The only new behaviour is a question on the genuinely ambiguous case, which today silently guesses.

### A-4 · reviews attached to the wrong film — **confidence gate**
`resolveFilm` (`:401-405`) falls back to `movies[0]` whenever the year doesn't match — and the source is `tmdb.search`, the three-tier engine including **semantic keyword discovery**. A title with no genuine match can resolve to an arbitrary popular film.

`searchType` is already computed at six sites in `lib/tmdb.ts` (`'exact' | 'typo' | 'semantic' | 'person' | 'failed'`) and `archiveImport` **never reads it**.
**Fix:**
```
'exact'                  -> accept
'typo'  + year matches   -> accept    (typo tolerance corroborated by an independent field)
'typo'  + year mismatch  -> unmatched
'semantic'               -> UNMATCHED  (keyword discovery finding *a* film is not evidence it is *the* film)
'person' | 'failed'      -> unmatched
```
**Zero-side-effect proof:** the gate only ever **narrows**. Every row it admits, today's code also admits. It cannot introduce a wrong match — only decline an uncertain one. And declining is now **visible** in the plan's `unmatched` list, where a wrong match is invisible forever.
**Prerequisite: #11 must land first** — the `skipped` counter currently adds *view counts* (`:829 skipped += agg.viewCount`) while the UI labels it *"films could not be matched"*. Unmatched rows must be counted as **entries**, or the plan's numbers are nonsense.

---

## Supporting fixes that ride along

- **#11** — `skipped += 1` per unmatched film, not `+= agg.viewCount`. Prerequisite for A-4.
- **#12** — the zip-bomb size guard reads a JSZip internal with `?? 0`. **Fail closed:** reject when the size is not a finite number, rather than scoring it 0. Unreachable with today's JSZip; it only activates if the internal is renamed, which is the fragility being closed.
- **NEW-2** — `archiveImport.ts:1346`'s unguarded `JSON.parse` gets the same local try/catch `DataVault:91` already uses. *(`:1312` is inside `importArchive()`, which has **zero callers** — delete that function with batch 1.)*
- **`sanitize.ts`** — this is where it earns its place. Once import ships, competitor branding and *"Imported from Letterboxd"* text arrives with it. Wire `sanitizeDescription`/`sanitizeListTitle` at mobile's stack render sites, matching web. **It moves from "post-launch" to "ships with import."**

---

## What this costs, honestly

The three-phase split is **real work** — `analyseArchive` has to do the parse-and-resolve that `importCSVArchive` does today, without the writes. The cleanest route is to extract the resolution pass into a shared function both phases call, so there is one parser, not two that can drift.

**The confirmation screen is new UI.** That is the honest cost, and it is also the entire reason A-3 becomes correct rather than lucky.

**What you get:** an import that cannot silently flip a private stack public, cannot transpose half your dates, cannot double every rating permanently, and cannot attach your review to a film you have never seen — and that shows you what it is about to do before it does it.

That is what "works perfectly" means for this feature. Anything less is four silent ways to destroy an archive someone spent years building.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 9. First pass to test the WIRINGS, not the deletions.
═══════════════════════════════════════════════════════════
Passes 1-8 all asked "is this deletion safe?". None asked "do the two
wirings actually work?". Pass 9 asked that. Five corrections.

P9-1  WRONG PATH IN PLAN
      Plan said app/list-modal.tsx. Real path: app/(modals)/list-modal.tsx
      (route group). createList confirmed at :253, useListStore at :136,
      so it IS a component — hook is legal there.

P9-2  src/hooks/ COVERAGE THRESHOLD — measured, risk eliminated
      jest.config.js:34 sets a threshold on ./src/hooks/ (br 13/fn 10/ln 7/st 7).
      Batch 1 deletes 10 hooks from that exact folder — never measured before.
      MEASURED: all 10 are at 0% coverage. Deleting 0%-covered files RAISES
      the folder average. Threshold gets safer. Risk closed by measurement.

P9-3  useBanCheck FIRES A SUCCESS HAPTIC WHEN TELLING SOMEONE THEY'RE BANNED
      useBanCheck.ts calls reelToast('Your account has been silenced...').
      reelToast is Object.assign((msg)=>emitToast(msg,'info'), {...}) — callable
      bare, so no crash. But emitToast fires TactileEngine.error() ONLY for
      type==='error'; everything else gets TactileEngine.success().
      => banned member gets a congratulatory buzz + neutral info styling.
      FIX: reelToast.error(...). One word. In the exact hook batch 1 wires.

P9-4  HOLLOW TESTS — 12 of 83 files (first count of 25 was MY REGEX BUG:
      it required import+from on one line, so every multi-line import was
      misread as hollow. archiveImport.test.ts does import the real code.)
      Two of the 12 land directly on batch 1:
        useBanCheck.test.ts       — never imports the hook; re-implements
                                    `user?.is_banned === true` and asserts on
                                    its own copy. Would pass if the hook were
                                    deleted. (Explains its 0% coverage.)
        useLogFlow.validation.test.ts — docstring states the strategy outright:
                                    "test the validation predicates directly
                                    rather than rendering the full hook."
                                    It MIRRORS handleLog's conditions.
      => Batch 1 modifies useLogFlow.ts (#129) and list-modal.tsx (#81b).
         NEITHER has a test that could catch a mistake in those changes.
         With no device iteration available, tests are the only safety net,
         and for exactly these two changes the net has a hole.

P9-5  PLAN CONTRADICTION — "delete 4 hook test files" was wrong
      useStableSubscription.test.ts  -> DELETE (imports its hook; hook dies)
      useDebouncedSearch.test.ts     -> DELETE (imports its hook; hook dies)
      useBanCheck.test.ts            -> REPLACE, not delete. Hook is KEPT and
                                        WIRED; it needs a test that imports it.
      useEntitlement.test.ts         -> KEEP. Misnamed: it imports getTierWeight
                                        from utils/tier and tests that for real.
                                        Deleting it destroys genuine coverage.
                                        (Explains useEntitlement.ts reading 0%.)

NET: 14 commits -> 15. Deletions unchanged and still sound. The two wirings
     gain a real test each, and useBanCheck gains reelToast.error.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 10. Auditing pass 9's own promise + commit safety.
═══════════════════════════════════════════════════════════
Pass 9 PROMISED two new tests without checking they can be written.
Pass 10 checked. It nearly wasn't possible.

P10-1  THE PROMISED TESTS WOULD HAVE FAILED THE OBVIOUS WAY
       @testing-library/react-native ^14 is installed, so renderHook exists.
       But the ONLY file using renderHook is useAuthThrottle.pbt.test.ts, and
       its line 5 reads: "without React lifecycle since renderHook is async in
       this env." Someone already tried renderHook here, hit it, and wrote a
       hollow test instead. Writing the promised tests that way = same wall.

       THE WORKING PATTERN — already proven in this codebase, two of them:
       (a) PURE-FUNCTION EXTRACTION — useInitiation.ts exports shouldInitiate({
           userId, createdAt, alreadySeen, now }) and the hook calls it. The
           test imports the pure function directly: no React, deterministic,
           exhaustive. Result: 42% coverage vs 0% for every hollow file.
           => USE FOR #129. Extract shouldRequestReview({logCount, lastPrompt,
              totalPrompts, now}) from maybeRequestReview. Locks the off-by-one
              (logs.length + 1) as a real assertion instead of a code comment.
       (b) COMPONENT RENDER — AuthGuard.test.tsx imports the real component AND
           the real useAuthStore and calls render(). Component tests DO work.
           => USE FOR #81b. Render list-modal with a banned user, assert
              createList is never called.

       Both promised tests are achievable. Neither is achievable the way I
       would have written them yesterday.

P10-2  COMMIT ORDER — VERIFIED, not assumed (it was only ever asserted before)
       Interdependencies among the deleted set:
         useDebouncedSearch    -> debounce
         useStaggeredPrefetch  -> debounce
         qos                   -> apiCircuitBreaker
       Plan deletes the 10 hooks (commit 4) BEFORE debounce (commit 5), and
       qos before apiCircuitBreaker (commit 6). Both orders correct: every
       intermediate commit stays green. Reversed, commits 4-6 would not compile.

P10-3  C2 (.eslintrc.js) — SAFE. eslint.config.js exists (Jul 2, newer than
       .eslintrc.js Jun 21). A flat config remains after deletion; lint does
       not lose its configuration.

P10-4  GIT SAFETY — nothing in the deletion list is dirty. git status --porcelain
       across src/hooks, src/utils, src/lib, src/services, src/schemas, test-app,
       0005_log_comments_fk.sql, .eslintrc.js returns empty. No uncommitted work
       is destroyed by any of the 15 commits.

NET: zero new defects in the deletions or wirings — the FIRST pass with none.
     One flawed promise from pass 9 caught and repaired. Three assumptions
     converted into verified facts. Plan stays at 15 commits.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 11. The NON-deletion work. Passes 1-10 were
deletion-heavy; batch 1 also contains live edits to lounge.ts,
two service method removals, and four test excisions.
═══════════════════════════════════════════════════════════

P11-1  *** PLAN BUG — COMMIT 4 WOULD FAIL THE GATE ***
       Commit 4 (#81a) deletes useLoungeData.ts AND LoungeService.getLoungeDetails.
       The plan lists ONE excision in servicesBatch2.test.ts (:285-354, DossierService).
       But that file has a THIRD block the plan never mentions:
         :166-181  describe('getFilmReviewCount')   <- plan covers (commit 10)
         :219+     describe('getLoungeDetails')     <- *** NOT IN THE PLAN ***
         :285-354  describe('DossierService')       <- plan covers (commit 9)
       Removing the method without removing its describe => the suite goes red
       at commit 4 with "LoungeService.getLoungeDetails is not a function".
       FIX: excise the getLoungeDetails describe in commit 4, same commit as
       the method. Confirmed callers: useLoungeData.ts:13 (deleted) + this test.

P11-2  #53's SLICE — MY REASONING WAS WRONG (the action stays, the meaning changes)
       I called it "a no-op slice, harmless cleanup." It is not dead code.
       lounge.ts:653
         [...s.currentMessages, optimisticMsg]
           .slice(0, Math.max(MESSAGE_DEDUP_CAP, s.currentMessages.length + 1))
       Array length is L+1; slice end is max(100, L+1) which is always >= L+1.
       Provably never truncates — TRUE. But MESSAGE_DEDUP_CAP = 100 is used
       NOWHERE ELSE (grep: definition :145 + this line only). This is a CAP
       SOMEONE WROTE THAT DOES NOT WORK.
       Verified nothing else bounds currentMessages: :517 sets from fetch,
       :564 PREPENDS older pages, :653 appends, realtime appends. It grows for
       the entire session.
       WHY THE NAIVE FIX IS WRONG: .slice(-100) would break scroll-back —
       :564 prepends paginated history, which a tail-cap would discard on arrival.
       DECISION: delete the no-op (preserves today's behaviour exactly, which is
       what batch 1 is for) and REGISTER a new finding: unbounded currentMessages
       growth; a real cap must be windowed against pagination, not a tail slice.
       Post-launch. Not a batch-1 edit.

P11-3  #53's `mine` -> false — PROVEN BY CONSTRUCTION, not by argument
       lounge.ts:1211/1229 both read:
         if (r.user_id === myId) return;        <- early return
         const mine = r.user_id === myId;       <- unreachable unless false
       The guard makes the next line's value impossible to be anything but false.
       Substitution is identical. Both realtime handlers (INSERT + DELETE) same shape.

P11-4  #59 test block — self-contained, safe to excise
       lounge.test.ts :87-110 describe('deleteMessage') sets its own state via
       useLoungeStore.setState and builds its own mockFrom. No shared fixture.
       Excise :87-110; the `});` at :111 closes the OUTER describe — must stay.

P11-5  #37 getFilmReviewCount — only callers are its own tests
       (servicesBatch2.test.ts :166-181). Method + describe removed together.

NET: one plan bug that would have turned the gate red at commit 4, and one
     piece of reasoning corrected (the slice is a broken feature, not dead code)
     which spawns a new post-launch finding. Plan: 15 commits, commit 4 amended.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 12. The test surgery + the wiring insertion points.
Pass 11 named these as the youngest part of the plan. Pass 12 closed them.
Five findings. TWO would have broken the build.
═══════════════════════════════════════════════════════════

P12-1  *** BUILD BREAKER — #37's excision range was WRONG ***
       Plan: "excise its nested describe inside the FilmService block (~:166-181)".
       ACTUAL: describe('getFilmReviewCount') spans :166-184 (close at :184, blank :185).
       Cutting at :181 leaves an orphaned `        });\n    });` — the file no
       longer parses. The "~" in my plan was hiding a 3-line error.
       CORRECT: excise :166-185. FilmService describe survives via getFilmReviews (:186-208).

P12-2  #38's excision leaves an ORPHANED BANNER
       Plan: :285-354. But :280 blank, :281-283 is the
       "// ══ DOSSIER SERVICE ══" banner, :284 blank, :285 describe, :354 EOF.
       Cutting :285-354 leaves a section header for a service that no longer exists.
       CORRECT: excise :280-354. File then ends at :279 (LoungeService close).

P12-3  #81a's MISSING excision — exact range confirmed (found pass 11)
       describe('getLoungeDetails') :219-226, blank :227, checkMembership :228.
       CORRECT: excise :219-227 in COMMIT 4, same commit as the method removal.
       LoungeService describe survives: checkMembership, shareToLounge, getUserLounges.
       All three top-level describes carry their own beforeAll+require — independent.

P12-4  *** #129 WOULD FIRE ON EDITS *** — plan's placement was wrong
       useLogFlow.ts:348-349:
         if (isEditing && editLogId) { await updateLog(editLogId, logData); }
         else { await addLog(logData); }
         storage.delete(DRAFT_KEY);
         TactileEngine.success();        <- the "obvious" insertion point
       Placing the call after :350 fires it for the UPDATE branch too. Editing an
       existing log adds no film, so logs.length + 1 is simply wrong there, and
       "logged 5 films" could be satisfied by 5 EDITS of one film.
       CORRECT: inside the `else` branch only, immediately after await addLog.
       (The off-by-one itself is confirmed: `logs` destructured at :148 is a render
       snapshot, not re-read after await, so logs.length is pre-insert. +1 is right.)

P12-5  #129 COLLIDES WITH THE SEALING CEREMONY
       :351-357 after success: setSealed(true) shows "RECORD SEALED" for 650ms,
       then InteractionManager -> router.back() dismisses the screen.
       Firing the native review prompt at :350 puts an OS modal on top of a
       running ceremony and a dismissing screen. On iOS that either looks broken
       or gets torn down by the transition — and a torn-down prompt still spends
       one of Apple's 3-per-365-days allowance.
       CORRECT: fire it AFTER the dismissal settles, inside the existing
       runAfterInteractions callback following router.back(). maybeRequestReview
       touches only MMKV + StoreReview (no React state), so it is safe after unmount.
       This is also what the module's own docstring intends by "high-delight
       moment" — the moment is after the ceremony, not underneath it.

P12-6  ERROR MESSAGES FIRE A SUCCESS HAPTIC — the P9-3 defect is a CLASS, not one site
       reelToast bare-call routes to type 'info'; emitToast fires TactileEngine.error()
       ONLY for 'error', so every other type gets TactileEngine.success().
       28 bare calls exist. 23 are legitimately informational ("Saved offline.
       Will sync when connected." — the action did succeed locally; success is fine).
       FIVE are blocking/error messages getting a congratulatory buzz:
         useBanCheck.ts:15   "Your account has been silenced by The Society."
         useLogFlow.ts:336   "Identification required to file a record."
         useLogFlow.ts:337   "No film selected."
         useAuthFlow.ts:116  "Please enter your email to request a new link."
         useAuthFlow.ts:262  "Please enter your email to request a credential reset."
       Plus useLogFlow.ts:339 reelToast(blockReason) — a VARIABLE, so it never
       matched the string-literal grep. Every validation failure in the log form
       buzzes like a success. (More variable-form sites may exist; literal-only
       grep cannot see them.)
       IN BATCH 1: useBanCheck:15 + useLogFlow:336/337/339 (both files already
       being edited). useAuthFlow's two -> register, outside batch 1.

NET: two build breakers, one semantic bug (review prompt on edits), one UX
     collision (prompt over a dismissing screen), one defect class widened from
     1 site to 6. Plan: 15 commits, commits 4/9/10/13 all amended.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 13. The last unopened edits. THE ROOT CAUSE FOUND.
═══════════════════════════════════════════════════════════

P13-1  *** COMMIT 7's SECOND HALF IS FICTIONAL ***
       Plan: "#71 delete concurrencyScope.ts + remove filmStore.test.ts:156
       jest.mock('…/concurrencyScope')".
       src/stores/__tests__/filmStore.test.ts DOES NOT EXIST.
       grep for concurrencyScope across src/ + app/ returns THREE hits, all
       inside concurrencyScope.ts itself (its own docstring). There is no mock,
       anywhere. Commit 7 is a single-file deletion with zero test edits.
       ALSO FICTIONAL: pass 8's note "#129 — KEEP filmStore.test.ts:142's
       jest.mock (it already anticipates this)". Reasoning built on a phantom file.

       *** THIS IS THE ROOT CAUSE OF 13 PASSES. ***
       Third fabricated path in this batch:
         pass 7  — src/utils/index.ts, src/services/index.ts (barrels that don't exist)
         pass 9  — app/list-modal.tsx (real path: app/(modals)/list-modal.tsx)
         pass 13 — src/stores/__tests__/filmStore.test.ts (does not exist at all)
       Every one came from writing plan prose from memory instead of from the file.
       Prose tolerates a wrong path indefinitely; code does not survive one compile.

P13-2  DELETING deleteMessage ORPHANS FOUR MORE FILES — plan never mentioned them
       lounge.ts:711 deleteMessage is the ONLY producer of 'delete_lounge_message'
       offline-queue entries (enqueueMutation at :727). Removing it strands:
         src/types/mutations.ts:74            schema for the payload
         src/utils/mutationExecutor.ts:552    the flush handler
         src/utils/offlineQueue.ts:31         the type-union member
         src/utils/__tests__/mutationExecutor.test.ts:611  tests for an unreachable handler
       Plan said only "impl + interface :106 + its describe in lounge.test.ts".

P13-3  *** THE REAL FINDING — withdrawMessage HAS NO OFFLINE SUPPORT ***
       The rejected deleteMessage handled network failure properly:
         catch -> if (isNetworkError(e)) { enqueueMutation(...); flushOfflineQueue(); return; }
       The LIVE withdrawMessage (:973-992) does NOT. Its catch reverts the
       tombstone and shows "Could not withdraw this dispatch."
       => Deleting your own message on a flaky connection FAILS AND THE MESSAGE
          REAPPEARS. The user explicitly named message deletion as a feature that
          must work on app and web. The function we are deleting is the only one
          that survives a bad connection.

P13-4  THE OFFLINE HANDLER CONTRADICTS THE TOMBSTONE DESIGN (dormant, not live)
       mutationExecutor.ts:552 delete_lounge_message does
         supabase.from('lounge_messages').delete().eq('id',...).eq('user_id',...)
       — a HARD delete, the exact thing withdraw_lounge_message was built to replace.
       NOT a live bug: deleteMessage is unwired, so no entry of this type is ever
       queued, so the handler is unreachable. But it must not be left pointing at
       the wrong operation.

       DECISION — two clean options, not one:
       (B) BATCH 1 (recommended): delete deleteMessage AND its whole offline chain
           (P13-2's four sites). Pure cleanup, zero behaviour change, keeps batch 1
           what it is. No orphans left.
       (C) IMMEDIATELY AFTER, as its own commit with its own test: give
           withdrawMessage the offline resilience deleteMessage had — enqueue on
           network error, handler calls the withdraw_lounge_message RPC instead of
           .delete(). The infrastructure is already built and already tested; it
           simply points at the rejected operation.
       Doing C inside batch 1 would mix a behaviour change into a cleanup batch —
       which is exactly how cleanup batches break apps. B now, C next, separately.

NET: commit 7 halved (fictional half removed), commit 12 widened by four files,
     and one genuine feature gap found in a feature the user named by name.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 14. MECHANICAL verification of every path and every
line number in all 15 commits. Not a re-read — a check against the files.
═══════════════════════════════════════════════════════════

P14-0  ALL 43 PATHS EXIST. 0 missing. (Pass 13 removed the last phantom.)

P14-1  TWO OFF-BY-ONE LINE NUMBERS — the exact class that caused 13 passes
       useLogFlow.ts   claimed :349 for `else { await addLog(logData); }`
                       ACTUAL :348.  :349 is storage.delete(DRAFT_KEY).
       lounge.ts       claimed deleteMessage ends :744
                       ACTUAL :711-745.  :744 is `}` closing the catch;
                       :745 is `},` closing the method. Cutting at 744 leaves
                       a stray `},` — the store would not parse.
       All other 22 line claims verified correct against the files.

P14-2  *** THE STRUCTURAL FLAW — LINE NUMBERS INVALIDATE EACH OTHER ***
       THREE separate commits excise from servicesBatch2.test.ts:
         commit 4  (#81a)  :219-227   getLoungeDetails
         commit 9  (#38)   :280-354   DossierService
         commit 10 (#37)   :166-185   getFilmReviewCount
       Every line number above is correct RIGHT NOW, against the file on disk.
       But commit 4 deletes 9 lines at :219 — which shifts DossierService from
       :280-354 down to :271-345. By the time commit 9 runs, its own line
       numbers are WRONG, and they were verified correct an hour earlier.
       Same hazard: commits 11 and 12 both edit lounge.ts (:653/:1212/:1230,
       then :106/:711-745). Commit 11 removes no lines, so 12 survives — but
       only by luck, not by design.

       => VERIFIED LINE NUMBERS ARE NOT A SAFE INSTRUCTION FORMAT. A number
          checked against today's file is a claim about a file that the
          previous commit already changed.

       FIX — anchor every excision by NAME, never by number:
          find `describe('getLoungeDetails'` -> remove to its matching close
          find `describe('DossierService'` + its banner -> remove to EOF
          find `describe('getFilmReviewCount'` -> remove to its matching close
          find `deleteMessage: async (messageId) => {` -> remove to its `},`
       Name anchors are immune to shifting. This is why the whole plan is now
       expressed as anchors, with line numbers kept only as a cross-check.

NET: 43/43 paths real, 22/24 line claims correct, 2 off-by-one repaired, and
     the instruction FORMAT itself replaced. Line numbers were never the
     ground truth — they were a snapshot that each commit invalidates.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 15. The GATE itself. Every prior pass verified the
work; none verified the thing that was supposed to catch my mistakes.
═══════════════════════════════════════════════════════════

P15-1  *** MY GATE WAS WEAKER THAN CI'S ***
       My stated gate:  npx tsc --noEmit && npx eslint . && npx jest --ci
       CI's actual gate (.github/workflows/ci.yml:61,64):
             npx jest --ci --coverage --forceExit
             node scripts/coverage-ratchet.js
       jest.config.js does NOT set collectCoverage, so a bare `jest --ci`
       NEVER evaluates coverageThreshold. I could have shipped 15 green
       commits and broken CI on the first push.

P15-2  *** CI IS RED RIGHT NOW — BEFORE BATCH 1 TOUCHES ANYTHING ***
       Ran the exact CI command. 989/989 tests pass. EXIT CODE 1:
         "./src/stores/" statements threshold (32%) not met: 31.75%
         "./src/stores/" functions  threshold (29%) not met: 28.78%
       Pre-existing. Not caused by batch 1. But batch 1 must not be blamed
       for it, and must not silently deepen it.

P15-3  *** THE COVERAGE RATCHET HAS NEVER WORKED ***
       scripts/coverage-ratchet.js reads coverage/coverage-summary.json.
       - jest.config.js sets NO coverageReporters => jest default is
         ['clover','json','lcov','text'] — json-summary is NOT among them.
         Proof: today's run rewrote coverage-final.json (09:47) and left
         coverage-summary.json untouched at 2026-06-22 23:57.
       - coverage/ is gitignored (mobile/.gitignore:63) and untracked, so on
         a fresh CI checkout the file does not exist at all.
       => the ratchet's own guard fires: "No coverage report found" -> exit 1.
       Two independent CI gates, both broken, neither related to batch 1.
       FIX (its own commit, not batch 1): add coverageReporters with
       'json-summary' so the file jest emits is the file the ratchet reads.

P15-4  *** I COMPUTED FROM A MONTH-STALE FILE AND NEARLY REPORTED IT AS FACT ***
       I derived src/stores/ = 33.68% statements / 31.07% functions and a
       commit-12 projection, all from coverage-summary.json — dated
       2026-06-22, five weeks old. It disagreed with jest's live 31.75%.
       Caught only by checking mtime. ALL derived figures DISCARDED:
       the 33.68/31.07, the "ratchet has 2.4% headroom", the commit-12
       projection. The single authoritative fact is jest's live EXIT 1.
       (Same failure shape as the phantom paths: confident reasoning on a
       source I never validated.)

P15-5  COMMIT 12's DIRECTION IS CERTAIN, ITS MAGNITUDE IS NOT
       Removing deleteMessage removes a TESTED function from src/stores/,
       a directory already under threshold. Direction can only be downward.
       Magnitude unknown — the only data source was stale. Must be measured
       live at the commit, not projected.

GATE FOR BATCH 1 — REVISED:
       npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci --coverage
       Because CI is already red, the gate is a DELTA gate, not absolute:
       today's live baseline is stores statements 31.75 / functions 28.78.
       After every commit those two numbers must not DECREASE. Absolute pass
       is a separate job (fixing CI), not batch 1's to carry.

NET: batch 1's 15 commits are unchanged. The GATE changed — and the thing I
     was going to rely on to catch my errors was itself broken in two ways.

═══════════════════════════════════════════════════════════
BATCH 1 — PASS 16. The THREE BEHAVIOUR-CHANGING STEPS ONLY.
I said "these can behave wrongly" and stopped there. That was the lazy
answer. Studied to the floor. Two risks killed, one decision corrected,
one launch-relevant fact found.
═══════════════════════════════════════════════════════════

P16-1  RISK KILLED — `logs.length` is the RIGHT number for the 5-film gate
       The gate is maybeRequestReview(logCount) -> `if (logCount < 5) return`.
       Feared: `logs` is paginated (logOperations.ts:44 `.limit(PAGE_SIZE)`),
       so logs.length might not be a real total.
       VERIFIED at logOperations.ts:40-44:
         .from('logs').select(...).eq('user_id', user.id).limit(50)
       - SCOPE: own logs only. Not a feed. A new member cannot be pushed past
         5 by other people's activity.
       - PAGINATION: PAGE_SIZE = 50. Exact for anyone with <=50 logs — which
         includes everyone the gate actually discriminates on. Someone with
         500 logs sees 50, still >= 5, same outcome.
       - NOT-YET-LOADED: logs = [] -> 0 + 1 = 1 < 5 -> no prompt. Fails safe:
         a skipped prompt, never a wrong one.
       `logs.length + 1` is correct for every case. Risk closed.

P16-2  RISK KILLED — the stranded-spinner hazard was REAL, and the file
       already shows the safe pattern
       list-modal handleSave:
         Keyboard.dismiss();
         if (!title.trim()) { reelToast.error(...); return; }   <- early return
         setSaving(true);                                        <- AFTER validation
         try { ... nav.back(); } catch { ... setSaving(false); }
       setSaving(false) ONLY runs in catch — success navigates away. So an
       early `return` placed AFTER setSaving(true) would leave the save button
       spinning forever with no way out.
       => the ban check must sit with the title check, BEFORE setSaving(true).
       The file's own existing guard proves the placement.

P16-3  *** DECISION CORRECTED — "match web" was the WRONG target ***
       Pass 8 decided: gate list CREATION only, matching ListsPage.tsx:190.
       But handleSave covers BOTH paths:
         if (editList) { await updateList(...) } else { await createList(...) }
       Gating only createList lets a SILENCED member keep editing their existing
       stacks — same screen, same button, same handler. Web's narrow gate is
       web's gap, not a standard to copy.
       => the check goes at the TOP of handleSave, after Keyboard.dismiss().
       One line, covers create AND edit, sits in the proven-safe position.
       Strictly better than web, and cheaper than two checks.

P16-4  #129's EXACT PLACEMENT — final
       const isNewEntry = !(isEditing && editLogId);
       ... existing branch ...
       setTimeout(() => {
         InteractionManager.runAfterInteractions(() => {
           router.back();
           if (isNewEntry) {
             InteractionManager.runAfterInteractions(() => {
               void maybeRequestReview(logs.length + 1);
             });
           }
         });
       }, 650);
       - isNewEntry excludes edits (P12-4).
       - The NESTED runAfterInteractions waits for the dismissal animation to
         finish before presenting an OS modal (P12-5). router.back() is not
         awaitable, so the outer callback alone is not enough.
       - Safe after unmount: maybeRequestReview touches only MMKV + StoreReview,
         no React state; `void` detaches it from the component lifecycle.

P16-5  *** LAUNCH-RELEVANT: THIS CANNOT BE TESTED ON TESTFLIGHT ***
       Apple's in-app review sheet (SKStoreReviewController, what expo-store-review
       wraps) is a NO-OP in TestFlight builds. It presents nothing.
       => the user cannot verify step 13 on the build they are shipping to
          TestFlight. It will appear to do nothing, and that is correct behaviour,
          not a bug. It only presents in App Store builds, and even then Apple
          throttles to 3 per 365 days.
       This is why the module's own gates (90-day cooldown, 6 lifetime cap) and
       the pure-function test matter: the test is the ONLY verification available
       before release.

NET: the two "can behave wrongly" risks are closed by construction, one
     decision upgraded beyond web parity, and the one thing that genuinely
     cannot be verified pre-release is named rather than left as a surprise.
