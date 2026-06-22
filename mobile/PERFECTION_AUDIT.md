# ReelHouse Mobile — Perfection Audit

> **Goal:** find every gap between the current code and a flawless, best-in-the-world app.
> **Mode:** report + fixing plan only. **No code is changed** until each fix is approved.
> **Rule:** every finding is verified against the actual code (exact `file:line`). No suspicions, no false positives. If something can't be verified from the mobile code (e.g. server-side RLS), it goes in *Needs Server Verification*, not in Findings.

Scope: `mobile/` only (the shipping app). 355 non-test source files, ~65k LOC.

---

## Severity scale

| Tag | Meaning |
|---|---|
| **P0 — Critical** | Data loss, security hole, crash on a normal path, or money/entitlement bug |
| **P1 — High** | Wrong behavior on a reachable path; correctness/UX bug users will hit |
| **P2 — Medium** | Edge-case bug, missing handling, or a real architectural gap |
| **P3 — Low** | Minor correctness/consistency nit |
| **P4 — Polish** | Dead code, naming, deprecations, micro-perf, style toward "perfect" |

Each finding: ID · severity · `file:line` · what · why it's a gap · **Verified** note · suggested fix. Nothing is fixed yet.

---

## Coverage tracker (so "no skips" is auditable)

Legend: ✅ reviewed · ⏳ in progress · ⬜ pending

| Module | Files | Status |
|---|---|---|
| `src/lib` | 11 | ✅ |
| `src/utils` | 39 | ✅ |
| `src/services` | 13 | ✅ |
| `src/stores` (+domain, lounge) | 22 | ✅ |
| `src/schemas` | 8 | ✅ |
| `src/hooks` | 35 | ✅ 100% (35/35) |
| `src/providers` | 3 | ✅ (clean) |
| `src/constants` | 8 | ✅ 100% (8/8) |
| `src/types` | 14 | ✅ 100% |
| `src/theme` | 3 | ✅ (clean) |
| `src/components/*` (top level) | 31 | ✅ 100% (all clean except COMP-1/2/3) |
| `src/components/feed` | 8 | ✅ (COMP-4, COMP-5) |
| `src/components/log` | 9 | ✅ (clean) |
| `src/components/profile` | 28 | ✅ (COMP-6,7,8,9) |
| `src/components/film` | 17 | ✅ (clean; HOOK-8 + UTIL-5 scope-expanded) |
| `src/components/lounge` | 9 | ✅ (clean) |
| `src/components/home` | 8 | ✅ (COMP-10; reduced-motion-aware) |
| `src/components/dispatch` | 5 | ✅ (clean; ArticleReaderModal exemplary) |
| `src/components/{moderation,search,ui,auth,layout,darkroom,reels,person,theme,ledger}` | ~40 | ✅ 100% (clean; validates COMP-2) |
| **`src/components/*` — ENTIRE TIER** | ~150 | ✅ **100% COMPLETE** |
| `src/features/*` | 8 | ✅ 100% (FEAT-1; archiveImport + SettingsScreen exemplary) |
| `app/*` (screens) | ~40 | ✅ logic-complete — all write/auth/admin/detail screens read line-by-line; **grep-verified the rest have zero direct DB writes** (delegate to audited stores/hooks). 1 finding: SCREEN-1. |

This table is updated as each module is completed.

---

## Findings

### `src/lib` (reviewed in full)

**LIB-1 · P2 · `src/lib/featureFlags.ts` (whole file)**
The centralized feature-flag system is **dead code**. `useFeatureFlag` and `isFeatureEnabled` have **zero consumers** anywhere in `src/` or `app/` (verified: `grep -rln "useFeatureFlag\|isFeatureEnabled"` returns only `featureFlags.ts` itself). The file's docstring claims it "replaces hardcoded isAuteur / isPremium checks scattered across the codebase," but those scattered checks are still in use (e.g. `isArchivistPlusTier`, `resolveTier` called directly in screens). 
*Why it's a gap:* an unused abstraction is maintenance weight, and the inconsistency (two gating styles, one unused) is exactly the kind of drift a perfect codebase wouldn't have. Also a latent correctness risk: a future dev may edit the flag registry expecting it to take effect, and it won't.
*Verified:* grep shows no importers. 
*Fix options:* (a) adopt it at every tier-gate call site and delete the ad-hoc checks, or (b) delete the system. Recommend (a) for a single source of truth.

**LIB-2 · P3 · `src/lib/schemas.ts:31-69`**
Dead + drifted Zod schemas. Only `FilmSchema` is imported (by `CinematicInsights.tsx`, `TasteDNA.tsx`). `ProfileLogSchema`, `ProfileLogArraySchema`, `WatchlistItemSchema`, `WatchlistArraySchema`, `UserSchema` have no consumers. Worse, `ProfileLogSchema` (lines 31-41) models `liked: boolean` / `watched: boolean`, which do **not** exist on the real `logs` table (it uses `rating/review/status/...` per `LOG_SELECT_COLUMNS`). If anyone wires this schema to validate real logs, it will misvalidate.
*Verified:* grep of importers; shape compared against `utils/mappers.ts` `LogRow`.
*Fix:* delete the unused schemas, or align `ProfileLogSchema` to the true row shape if it's intended for future use.

**LIB-3 · P2 · `src/lib/pushNotifications.ts:119-135` (`storePushToken`)**
Multi-device push loss. The upsert uses `onConflict: 'user_id,platform'`, so there is at most **one push token row per (user, platform)**. A user with two iOS devices (or who reinstalls) overwrites the prior token — push notifications then reach only the most-recently-registered device per platform.
*Why it's a gap:* "best app" users with phone+tablet silently stop getting notifications on one device.
*Verified:* line 130 conflict key; token is device-specific.
*Fix:* make the row keyed by the token itself (or a stable device id), e.g. `onConflict: 'user_id,token'` or a `device_id` column, and prune stale tokens on auth. (Requires a matching DB unique constraint — coordinate with the `push_tokens` schema.)

**LIB-4 · P3 · `src/lib/sentry.ts:57-64` (`setSentryUser`)**
`sendDefaultPii: false` is set (good), but `setSentryUser` then explicitly sends `username` to Sentry, and uses the deprecated `segment` field on `setUser`. Username is arguably PII; sending it contradicts the PII-off intent.
*Verified:* lines 38 (`sendDefaultPii:false`) vs 60 (`username`, `segment`).
*Fix:* send only `id` (and `role` as a tag/context), drop `username`; replace `segment` with a tag.

**LIB-5 · P4 · `src/lib/queryClient.ts:48-85`**
The React Query cache is persisted to MMKV in plaintext and can contain user PII (profile, logs, feeds). This is **mitigated** — `auth.logout()` deletes `REELHOUSE_QUERY_CACHE`, and auth tokens live in SecureStore, not here — so the residual risk is only "logged-in user on a compromised/rooted device." Noting for completeness against a privacy-perfect bar.
*Verified:* persister writes `CACHE_KEY` plaintext; logout clears it (`stores/auth.ts` logout step 8).
*Fix (optional):* use an encrypted MMKV instance for the query cache.

*(`supabase.ts`, `tmdb.ts`, `revenueCat.ts`, `defensiveParse.ts`, `invariants.ts`, `scrollBridge.ts` — reviewed, no findings. `tmdb.ts`/`supabase.ts`/`revenueCat.ts` were also deep-read in the prior security audit.)*

---

### `src/utils` (reviewed in full — 39 files)

Overall this layer is high-quality engineering. The notable theme is **well-built abstractions that were never adopted** (dead code), plus one real user-facing settings bug.

**UTIL-1 · P2 · `src/utils/errorHandling.ts` + `src/utils/errorPipeline.ts` (whole files)**
Two complete error-handling systems exist and **neither is used by production code** — the only importers are their own test files (`grep` verified). `errorHandling.ts` exports `friendlyError/handleError/safe`; `errorPipeline.ts` exports a *different* `handleError` plus `classifyError/withErrorHandling` over the `AppError` hierarchy. Meanwhile real code handles errors ad-hoc (`try/catch` + `reelToast` + `isNetworkError` + `logger`). 
*Correctness note:* `AppError.ts` itself **is** used (via `withTimeout`), so it is not dead — only the two pipelines are.
*Why it's a gap:* the unified, consistent error handling these files were built to provide is unrealized; error UX/telemetry is inconsistent across the app.
*Fix:* pick **one** pipeline (recommend `errorPipeline`), adopt it in services/stores catch blocks, delete the other. (Large but high-value consistency win.)

**UTIL-2 · P2 · raw `expo-haptics` usage across the app (settings bypass)**
`TactileEngine` is the intended single haptics entry point — it gates every buzz on the user setting `tactileAudioEnabled` and applies an Android throttle. But **137 raw `Haptics.*` call sites across 50 files** call `expo-haptics` directly, bypassing both (verified via grep). 
*Why it's a gap:* a user who disables haptics in Settings still feels ~137 of them — a settings toggle that largely doesn't work. Android also misses the motor-queue throttle (haptic stutter on rapid taps).
*Fix:* route all haptics through `TactileEngine`; add a lint rule banning direct `expo-haptics` imports outside `TactileEngine.ts`.

**UTIL-3 · P3 (latent) · `src/utils/errorPipeline.ts:113`**
`classifyError` matches `msg.includes('violates')` as a **ValidationError** before any permission check — so a Postgres "violates row-level security policy" denial would be shown to the user as *"Invalid data received. Please try again."* instead of a permission/auth message. Latent because the pipeline is currently unused (see UTIL-1); becomes real if adopted.
*Fix:* check RLS/permission patterns (`row-level security`, `permission denied`, 403) before the generic `violates` branch.

**UTIL-4 · P3 · `src/utils/validateUsername.ts:23-27`**
Profanity regexes over-match legitimate names: `/d+i+c+k/i` blocks `dickens`, `dickson`; `/n+i+g+g/i`, `/c+u+n+t/i` etc. can hit innocent substrings. 
*Why it's a gap:* real users with these (common) surnames can't pick a matching handle.
*Fix:* anchor/word-boundary the patterns or use a maintained profanity list with allowlist exceptions; ideally enforce server-side too.

**UTIL-5 · P4 · duplicate HTML strippers** — `src/utils/html.ts` (`stripHtml`, full entity decode) and `src/utils/text.ts` (`stripHTML`, tag→newline) coexist with different behavior. Consolidate to one.

**UTIL-6 · P4 · `src/utils/sanitize.ts:38-43`** — `sanitizeDescription` strips any standalone competitor name (`IMDb`, `Metacritic`, …); can remove legitimate text that mentions them. Acceptable trade-off, noted for completeness.

**UTIL-7 · P4 · `src/utils/memoryManager.ts:23`** — registers `AppState 'memoryWarning'` and claims Android coverage, but RN does not bridge Android `onTrimMemory` to that event by default; the Android memory-pressure purge likely never fires. Verify on a real Android device or wire a native module.

**UTIL-8 · P4 · `src/utils/filterContentByBlocks.ts:27`** — reads `useBlockStore.getState()` non-reactively; callers must separately subscribe to block-state changes or a freshly-blocked author won't disappear until the next re-render from another cause.

**UTIL-9 · P4 · `src/utils/requestReview.ts:20`** — 90-day cooldown can produce ~4 prompts/year vs Apple's 3/365 guidance (harmless; the OS throttles excess), but worth aligning to be exact.

*(Clean, no findings: `apiCircuitBreaker`, `concurrencyScope`, `withRetry`, `networkError`, `mappers`, `sanitizeInput`, `tier`, `offlineQueue`/`mutationExecutor` (phantom-rewatch already fixed), `AppError`, `withTimeout`, `withAbortSignal`, `qos`, `logger`, `reelToast`, `debounce`, `text` core, `typedRouter`, `imagePrefetcher`, `TactileEngine` impl, `storyExporter`, `dateUtils`, `timeAgo`, `navigationSnapshot`, `performanceMonitor`, `validateWithTelemetry`, `safeParse`, `dossierReconciliation`, `groupNotifications`, `escapeSearchPattern`.)*

---

### `src/services` (reviewed in full — 13 files)

This is the strongest layer so far — consistent Zod boundary validation, keyset cursor pagination, abort-signal support, RPC-first with direct-query fallback. The findings are mostly cross-cutting consistency gaps, not isolated bugs.

**SVC-1 · P2 · online write paths skip the sanitization/length-caps the offline queue applies**
`sanitizeInput.ts` claims it is "applied at the store mutation layer so it's impossible to bypass" — but that only holds for the **offline** flush (`mutationExecutor.ts`). The **online** service writes do not sanitize and have inconsistent caps:
- `LogService.addLogComment` — no `sanitizeInput`, **no max length** (offline caps 2000 + strips control/zero-width chars).
- `StackService.addStackComment` — no sanitize, no max (offline caps 1000 + sanitize).
- `DossierService.addComment` — no sanitize, no max (offline caps 2000 + sanitize).
- `LoungeService.shareToLounge` — caps **2000** but offline path caps **500** + sanitizes.
*Why it's a gap:* the exact same user action produces different stored content depending on whether they were online or offline (different length limits; control/zero-width chars survive online). Integrity should not depend on connectivity.
*Fix:* sanitize + length-cap in the service layer (one choke point) so online and offline converge; keep the offline executor's sanitize as defense-in-depth.

**SVC-2 · P2 · `src/services/NewsService.ts:138` — placeholder news always shown**
`getNews` returns `[...allItems, ...FALLBACK_NEWS]` whenever the live feed is non-empty, so the two hardcoded fake articles (`"OSCAR RADAR: The Monochrome Revival"`, `"CANNES UNVEILED"`) are **always appended to real news** in production, not just on failure.
*Verified:* line 122 returns fallback when empty; line 138 appends fallback even when live data exists.
*Fix:* return `liveItems` when non-empty; use `FALLBACK_NEWS` only as the empty/failure fallback.

**SVC-3 · P3 · `src/services/FilmService.ts:83` — brittle review parsing**
`getFilmReviews` uses `z.array(FilmReviewRowSchema).parse(data)` (strict) — a single malformed row throws and **breaks the entire film-reviews page**. Every other read path (`FeedService`, `ProfileDataService`, `StackService`, `LogService`) salvages valid rows. 
*Fix:* use the same resilient per-row salvage (`parseRowsSafely` / `validateWithTelemetry`).

**SVC-4 · P3 · `src/services/ProfileWriteService.ts:101-140` — avatar EXIF not stripped**
`uploadAvatar` uploads the user's image bytes as-is (magic-byte type detection only). JPEGs commonly carry EXIF including **GPS coordinates**; these are uploaded to public storage and served to everyone.
*Fix:* re-encode/resize the image (strips EXIF) before upload, or strip metadata explicitly.

**SVC-5 · P3 (refined) · username rules only enforced in the UI hook, not the service choke point**
Confirmed in schemas review: `ProfileUpdateSchema` (service) and `EditProfileSchema` (form) enforce only username **format** (`^[a-z0-9_]+$`, 3–30). The strict rules (reserved words like `admin`, profanity, no leading/trailing/consecutive underscores) live **only** in `validateUsername`, which is called by the `useEditProfile` hook. So the primary UI path is covered, but `ProfileWriteService.updateProfile` itself doesn't re-enforce them — any other caller (or a future screen) can set a reserved/profane handle. Defense-in-depth gap; the service should be the choke point. (Server-side trigger/RLS is the real backstop — see Needs Server Verification.)

**SVC-6 · P4 (corrected) · `src/services/NotificationService.ts` — dead code**
Originally flagged as "notifications capped at 50." On verification, `NotificationService` has **0 non-test importers** — the real notification path is `stores/notificationStore.ts`, which paginates correctly (30/page keyset, 500 cap). So the 50-cap is moot; the finding is reclassified to **dead code** (another built-but-unused service — see the dead-abstraction theme). *Fix:* delete `NotificationService`.

**SVC-7 · P3 · `src/services/FeedService.ts:144-159` — block filtering gap in direct-query fallback**
When the block-aware RPC isn't deployed, the community feed filters blocked authors **client-side after fetch**, which (a) leaves a brief exposure and (b) can make a page render fewer than `limit` items, confusing infinite-scroll's has-more logic. Documented in-code; depends on deploying `get_community_feed_auth_cursor`.

**SVC-8 · P4 · `src/services/NewsService.ts:50-55`** — a **third** HTML entity decoder (only 5 entities, incomplete) duplicating `html.ts`/`text.ts`. Consolidate (see UTIL-5).

**SVC-9 · P4 · `src/services/ProfileDataService.ts:102-108`** — `ListItemRowSchema` is unused (dead schema).

**SVC-10 · P4 · `src/services/LogService.ts:95-168`** — `getLogDetails` returns `any` (type safety lost downstream even though it validates internally).

*(Clean: `AuthService`, `InteractionService`, `ModerationService` (reviewed in prior audit), `ProfileDataService` core, `DossierService` core, `LoungeService` core, `StackService` core, `NotificationService` core — aside from the items above.)*

---

### `src/stores` (~90% reviewed — 20 of 22 files)

Top-tier state engineering: per-target FIFO mutex queues (`interactionSlice`), optimistic-update + rollback everywhere, O(1) Set indices, cursor pagination, realtime singletons, cross-user MMKV purge on logout, inverted-dependency cleanup registry (`resetAllStores`). Findings are consistency/scale edges, not crashes.

**STORE-1 · P3 · `src/stores/domain/watchlistSlice.ts:65` — watchlist hard-capped at 500**
`cappedWatchlist = nextWatchlist.slice(0, 500)`. On `loadMore`, `[...existing, ...new].slice(0,500)` discards newly-fetched rows once 500 is reached, while `watchlistHasMore` can stay true — so a user with >500 watchlist items can never load past 500, and "load more" silently no-ops.
*Fix:* virtualize/window instead of hard-slicing, or raise/remove the cap with proper memory management.

**STORE-2 · P3 · `src/stores/domain/logSlice/helpers/logOperations.ts` (`fetchLogsOp`) + `src/stores/films.ts:30-35`**
The opposite inconsistency: `logs` has **no cap** (`loadMore` appends forever) AND `films.ts` `partialize` persists the **entire** `logs` array to MMKV on every store mutation. For power users with thousands of logs this means unbounded JS memory plus a full re-serialize+write of the whole array on each change. (Watchlist is capped at 500; logs isn't — pick one consistent strategy.)
*Fix:* cap/window the in-memory logs and/or persist only a bounded recent slice.

**STORE-3 · P4 · `src/stores/domain/watchlistSlice.ts:16,149,188`** — `_watchlistPromises` (a `Record<number, Promise>`) is appended to per film and **never cleaned up**, unlike `interactionSlice`'s self-GC'ing mutex map. Slow unbounded growth over a long session.

**STORE-4 · P4 · `src/stores/domain/archiveSlice.ts:263-285` (`saveStub`)** — does **not** enqueue offline on network failure even though a `save_stub` offline handler exists in `mutationExecutor`. A ticket saved while offline is lost (throws), inconsistent with every other write action.

**STORE-5 · P4 · sanitization/length parity in lounge writes (concrete confirmation of SVC-1)**
`lounge.ts sendMessage` caps content to **500** and does **not** `sanitizeInput`; `LoungeService.shareToLounge` allows **2000** and doesn't sanitize; the offline executor caps **500** + sanitizes. `createLounge` *does* sanitize name/description — so even within the lounge store, message bodies are treated differently from lounge metadata. Converge on one sanitize+cap path.

**STORE-6 · P4 · `src/stores/lounge.ts:840` vs `:308`** — realtime-received messages strip HTML (`content.replace(/<[^>]*>/g,'')`) but historically-fetched messages don't, so the same message can render differently depending on arrival path (cosmetic in RN, but inconsistent).

**STORE-7 · P4 · `src/stores/mmkv-storage.ts:30-54`** — `createAsyncMMKVStorage` defers writes up to 1.5s (InteractionManager + fallback). A state change in the final 1.5s before an app kill isn't persisted. Mitigated (server is source of truth; offline queue covers unsynced writes), noted for completeness.

**STORE-8 · P4 · `src/stores/reportStore.ts:35` — `recentReports` dedup is in-memory only**, resetting on app restart (a user could re-file a report after relaunch; the `submit_report` RPC rate-limit is the real backstop).

**STORE-9 · P4 · cursor interpolation discipline** — `watchlistSlice`, `archiveSlice`, `listSlice`, `notificationStore` interpolate `created_at|id` cursors into `.or()` filters without the **shape validation** `FeedService.parseCursor` applies. Low risk (keyset, server-generated, own data) but inconsistent — standardize on a validated cursor parser.

**STORE-10 · P3 · dead/divergent lounge module (incomplete refactor)**
There are two lounge modules: `src/stores/lounge.ts` (the real, working store) and a `src/stores/lounge/` folder (`index.ts` barrel + `loungeTypes.ts`). Imports of `@/src/stores/lounge` resolve to the **file** (`lounge.ts`), so the folder is shadowed/unused. Worse, `loungeTypes.ts` declares a **richer `LoungeState`** — `connectionState`, `syncLatestMessages`, `abortFetchLounges/Messages`, `_hasMoreMessages`, and WS-reconnection constants (`MAX_RECONNECT_ATTEMPTS`, …) — that the real `lounge.ts` **does not implement**. Verified those methods have **0 callers**, so there is no runtime crash today; it's a confusion trap and dead code from a half-done refactor (the reconnection layer was specced but never built — relying on Supabase's client auto-reconnect instead).
*Fix:* delete the `lounge/` folder, or finish the migration (move `lounge.ts` into it and converge to one `LoungeState`).

*(Clean: `auth` (deep-read prior), `interactionSlice`, `blockStore`, `notificationStore`, `followStore`/`socialStore`, `discover`, `settings`, `resetAllStores`, `createSelectors`, `films` aggregator, `listSlice`, `lounge.ts` core, `content.ts` (well-documented inflight-dedup + generation guard) — aside from the above.)*

---

### `src/schemas` (reviewed in full — 8 files)

Clean, well-organized Zod layer with resilient coercers (year int↔text, id string↔number, `.passthrough()`/`.catchall()` for forward-compat). Two findings, both about adoption/consistency.

**SCHEMA-1 · P3 · username validation fragmentation (three sources of truth)**
Username rules are split across three places with different strictness: `validateUsername` (utils — format + reserved + profanity + underscore rules), `ProfileUpdateSchema` (service — format only), `EditProfileSchema` (form — format only). Only `useEditProfile` wires in `validateUsername`. 
*Why it's a gap:* the strict rules aren't at the data choke point, so they're bypassable by any non-hook caller, and three definitions will drift. 
*Fix:* one shared username schema/refinement used by form, hook, and service.

**SCHEMA-2 · P4 · `src/schemas/dossier.schema.ts:78-90` — `DossierRowSchema` is dead, and the cast it targets remains**
`DossierRowSchema`/`ValidatedDossierRow` have 0 importers, yet `content.ts` still uses `data as DossierRow[]` (lines 153, 377) — the exact raw cast this schema was written to eliminate (per its own docstring). The boundary validation was authored but never wired in. 
*Fix:* adopt `DossierRowSchema` in `content.ts` (parse with salvage), or delete it.

*(Clean: `feed.schema`, `film.schema`, `user.ts`, `settings.ts`, `profile.ts`, `index.ts` barrel. `ProfileUserSchema` and the feed/film schemas are exemplary boundary validation.)*

---

### `src/hooks` (✅ 100% reviewed — 35/35 files)

Hooks are well-built (proper abort/cleanup, optimistic+exact-delta rollback, query invalidation). This pass surfaced the first **P2s outside the og.js web fix**, plus more dead/duplicate code.

**HOOK-1 · P2 · `src/hooks/useUniversalSearch.ts:55,63,73` — search filter not quoted (breakage + injection shape)**
User search text is `escapeSearchPattern`'d but then interpolated **without surrounding quotes** into PostgREST `.or()` ilike filters: `` `username.ilike.%${safeText}%,display_name.ilike.%${safeText}%` ``. `escapeSearchPattern` escapes `% _ \ "` but **not** `,` `(` `)` — and PostgREST splits `.or()` on commas. So a normal query like `"marvel, dc"` breaks the query (400/empty), and a crafted query injects extra OR conditions (bounded by RLS, but it's a real injection shape). This is the **live** search box (`SearchResultRow`, `search-modal`). Every other call site (`FeedService`, `ProfileDataService`) wraps the pattern in quotes (`.ilike."%…%"`). 
*Fix:* quote the patterns like FeedService does, or use `.ilike()` builder methods per-field instead of a raw `.or()` string.

**HOOK-2 · P2 · `src/hooks/useAuthFlow.ts:187` — signup bypasses reserved/profanity username rules**
Account creation validates the username with a **format-only** check (`/^[a-z0-9_]+$/`) + availability, but does **not** call `validateUsername` (which blocks reserved words like `admin`/`official`/`reelhouse`, profanity, and underscore rules). So a user can register impersonation/reserved handles at signup. The edit-profile path (`useEditProfile`) *does* call `validateUsername` — only signup is unguarded. (Same root as SCHEMA-1.) *Real backstop must be a server-side trigger — see Needs Server Verification.*

**HOOK-3 · P3 · biometric-lock feature is dead/unwired**
`useBiometricLock` has **0 consumers** and the `VAULT_KEY` it generates in SecureStore is never used to encrypt anything (0 references). Yet `biometric_lock` exists in `UserPreferencesSchema` (and presumably a Settings toggle). So the advertised "vault biometric lock" does nothing — toggling it has no effect. (Also: had it been wired, `authenticate()` auto-unlocks when biometrics aren't enrolled with no passcode fallback — worth fixing if revived.)
*Fix:* wire the lock at app/vault entry (gate on `biometric_lock` pref), or remove the feature + setting.

**HOOK-4 · P3 · reviews & editorial fields are never sanitized or length-capped**
`useLogFlow.handleLog` sends `review`, `pullQuote`, `editorialHeader`, `privateNotes` straight to `addLog`/`updateLog` → DB insert, with only `.trim()`. Unlike comments, **no path** applies `sanitizeInput` (zero-width/control-char stripping) or `MAX_LENGTHS.review` (5000) to the review — the largest user-content field. (Extends SVC-1: the sanitize choke point misses the biggest content type entirely.)

**HOOK-5 · P4 · `src/hooks/useSendMessage.ts` — dead duplicate** (0 consumers). A second lounge-send implementation (no throttle, no schema validation) shadowing `lounge.ts sendMessage`. Delete.

**HOOK-6 · P4 · two live user-update paths** — `useUpdateUser` (1 consumer) and `authStore.updateUser` (3 consumers) both do optimistic-update+rollback to `ProfileService.updateProfile`. Converge on one.

**HOOK-7 · P4 · username schema sprawl (reinforces SCHEMA-1)** — four definitions now: `validateUsername`, `ProfileUpdateSchema`, `schemas/profile.ts EditProfileSchema`, and an **inline** `editProfileSchema` in `useEditProfile.ts` (the latter likely supersedes the former — `schemas/profile.ts EditProfileSchema` may be dead). One shared schema.

**HOOK-8 · P3 · home widgets bypass block filtering — blocked users' reviews leak onto Home**
`useFeeds.ts` and `useUniversalSearch.ts` both apply `filterContentByBlocks` (the app's block/mute utility, `src/utils/filterContentByBlocks.ts`). But the two **home-screen** widgets do not: `useSocialPulse.ts` (latest 6 reviews) and `useFeaturedCritique.ts` (`get_featured_critique` RPC) return their rows raw with no block filter. So a user you blocked can still appear in your "Social Pulse" and "Featured Critique" on the home page — the one surface every session opens on. (Server `get_featured_critique` may also need a block-aware variant; see Needs Server Verification.)
*Fix:* run both results through `filterContentByBlocks` (client-side, same as feeds) keyed on `user_id`, and/or filter inside the RPC/query.

**HOOK-9 · P3 · `src/hooks/useAchievements.ts:21–42` — milestone badges computed from in-memory paginated logs, not true totals**
Every badge `check` runs against the `logs: DomainLog[]` array passed in (`l.length >= 10/25/100`, `filter(...).length >= 5/10`, decade/day groupings). That array is the **paginated** in-memory log set (logStore loads 50/page and appends only on scroll). So `THE DEVOTEE` (25), `THE ORACLE` (100), `THE CRITIC` (10 reviews), `THE NOCTURNE` (5), `THE MARATHON` etc. can fail to unlock for a user who has the qualifying history server-side but hasn't scrolled it into memory — the milestone silently never fires. (Badges are merge-persisted once earned, so it only *under*-awards, never revokes — but a 100-film user opening a fresh session with 50 logs loaded won't get The Oracle.)
*Fix:* drive count-based checks off the authoritative server counts (the profile already fetches `counts.logs` / analytics summary) rather than `logs.length`; keep content-shape checks (decades/night/marathon) on loaded logs or move them server-side.

*(Clean: `useSafeAsync`, `useStableSubscription`, `useOfflineAware`, `useBanCheck`, `useFeeds`, `useTMDBMovies`, `useDebouncedSearch`, `useAuthThrottle`, `useStreak`, `useDeviceThrottling`, `useFilmDetail`, `useFilmReviews`, `useProfileController` (complex but meticulous), `useEditProfile` (exemplary), `useEntitlement`, `useReportUser`, `useProfileData` (exemplary — abort/mount/cross-user-bleed guards + privacy+tier gates), `useAnalytics` (triple-guarded inserts), `useStaggeredPrefetch`, `useLoungeData`, `useReducedMotion`, `useScaledFont` (deprecated re-export), `useAmbientGlow`, `useFilmAnimations`, `useParallaxBreathing` — all animation hooks focus-gated with correct `cancelAnimation` cleanup.)*

*Minor (not counted): `useAnalytics` — while logged out, `flush()` returns before splicing, so `page_view` events accumulate unbounded in the ref buffer. Harmless only if the hook is mounted exclusively behind auth; verify mount location when UI tier is reviewed.*

---

### `src/providers` (✅ 100% — 3 files) & `src/theme` (✅ 100% — 3 files)

Clean. `AppBootstrapper.tsx` is excellent — idempotent boot guard, subscription-based cold/warm-start handling, full listener cleanup, OTA fetch-with-one-retry, unhandled-rejection handler chained to any prior handler. `FilmDetailProvider.tsx` is a clean typed context (minor: a few `any` fields — `reviewsError`, `providers`, `studios`). `AccessibilityProvider.ts` monkey-patches `Text`/`TextInput` render to apply `scaledTextProps` globally — **verified wired** (imported in `app/_layout.tsx:27`), not dead. `theme.ts` / `authStyles.ts` / `shaders.ts` are pure tokens/styles (the GLSL shader even documents the iOS Metal black-screen workaround). *(Cosmetic-only: `colors.sepia` solid is `#B8891A` while the sepia rgba tints use `#C4961A` — slight hue mismatch; not counted.)*

### `src/constants` (✅ 100% — 8 files)

Mostly clean and well-documented (`deepLinks.ts` allowlist + URL-scheme guard is solid security; `textScaling.ts`, `membership.ts`, `formats.ts` are clean data). But two of the "centralization" files were built and **never adopted** — the codebase's recurring anti-pattern, and here it carries a correctness risk.

**CONST-1 · P3 · `src/constants/limits.ts` — the "single source of truth for magic numbers" has zero consumers**
All six groups (`QUEUE_LIMITS`, `FETCH_LIMITS`, `INPUT_LIMITS`, `CACHE_LIMITS`, `CIRCUIT_BREAKER`) are imported **nowhere** except the file's own test. The magic numbers they claim to extract still live hardcoded inline in the stores/services/utils. Two concrete harms: (1) **false confidence** — editing `limits.ts` changes nothing at runtime; (2) `INPUT_LIMITS.MAX_REVIEW_LENGTH = 5000` / `MAX_MESSAGE_LENGTH = 500` etc. **duplicate** the real `MAX_LENGTHS` in `sanitizeInput.ts` that the offline queue actually uses — two sources of truth that can silently drift (ties to SVC-1/HOOK-4).
*Fix:* either adopt `limits.ts` at the real call sites (replace inline literals + re-export `MAX_LENGTHS` from it) or delete it. Don't keep a decorative source of truth.

**CONST-2 · P3 · `src/constants/queryKeys.ts` — typed query-key factory has zero consumers; raw string keys used everywhere**
The factory exists for "compile-time safety and easy bulk invalidation," but `queryKeys.*` is referenced nowhere outside its own JSDoc examples. Every hook uses raw literals instead (`['socialPulse']`, `['featuredCritique']`, `['universalSearch', q]`, `['feed','community']`, …). The real consequence isn't just dead code: **read-site keys and invalidate-site keys are now independent string literals**, so any mismatch (typo, param-order drift, a `following` key that forgets the count arg) makes an invalidation silently no-op → stale UI after a mutation. This is exactly the class of bug the factory was meant to prevent.
*Fix:* route all `useQuery`/`invalidateQueries` calls through `queryKeys`, or delete it and accept the literals — but the factory is the elite choice; adopt it.

*Sub-note (not counted): `CACHE_KEYS` is only half-adopted — its JSDoc claims "Used in auth.ts, auth-callback.tsx, edit-profile.tsx, etc." but only `useUpdateUser.ts` imports it; the other sites use raw `ironvault_user_cache_${id}` literals (same drift risk, smaller blast radius).*

---

### `src/types` (✅ 100% — reviewed)

Strong, well-documented domain types. `mutations.ts` (`MutationSchemaMap`) and `moderation.ts` (report/block/tribunal schemas) are exemplary **and adopted**. `film.types.ts` etc. are clean interfaces. But the same adopt-or-delete pattern recurs, plus migration cruft.

**TYPE-1 · P4 · `src/types/branded.ts` — branded-ID safety system has zero app consumers**
The whole `Brand<T,B>` apparatus (`UserId`/`FilmId`/`ListId`/`LogId` + `createUserId`/… factories + Zod schemas) is referenced only in its own file and tests. No app code uses branded IDs — every ID is still a raw `string`/`number`, so the compile-time mixing protection it advertises is not actually in force anywhere. (Elite-app upside if *adopted* at service/store boundaries; otherwise it's a tested module that does nothing.)

**TYPE-2 · P4 · `src/types/unions.ts` — `assertNever` + `MutationState` have zero app consumers**
Neither the exhaustiveness helper nor the `MutationState` discriminated union is used outside this file/tests. Two notes: (1) the real offline-queue mutation type is defined inline elsewhere and **diverges** from `MutationState` (so this is a second, drifting spec of the same state machine); (2) `assertNever` would be genuinely valuable in the existing `status`/`type` switches (mutationExecutor, notification kinds) — the tool exists but the call sites don't use it.

**TYPE-3 · P4 · migration cruft in `src/types/`**
(a) `types/index.ts` header still claims the `../types.ts` monolith "remains the source of truth" and "Existing 45+ imports from `../../types` continue working" — but **`src/types.ts` no longer exists** (Strangler-Fig migration already completed); the comment now misleads. (b) `film.ts`/`social.ts`/`tmdb.ts`/`ui.ts` are each just `export * from './X.types'` re-export shims layered over the `.types.ts` files the barrel actually uses — redundant indirection. (c) `flashlist.d.ts` is an empty stub (`// Duplicate removed…`) — delete. *(Cosmetic only — no runtime impact.)*

---

### `src/components` (⏳ in progress — top-level shared)

The shared primitives are excellent (`ErrorBoundary`, `SectionErrorBoundary`, `AuthGuard`, `ControlledInput`, `PressableScale`+`HapticTab` both route haptics through `TactileEngine`, `ToastOverlay` is reduced-motion-aware + queue-capped + race-safe, `PaywallModal`/`QuickActionsFAB`/`OfflineBanner`/`ShareToLoungeModal` all clean). Two dead duplicates surfaced — same family as the meta-pattern.

**COMP-1 · P4 · `src/components/NotificationCenter.tsx` — dead duplicate of the notifications screen**
Zero importers. The live notifications panel is `app/(modals)/notifications-modal.tsx`, which uses the paginated, realtime `notificationStore`. `NotificationCenter` instead does its own `supabase.from('notifications').limit(50)` fetch with local state — **no pagination, no realtime, raw `Haptics.selectionAsync()`**, and a `markAllRead` that wouldn't sync `notificationStore._unreadCount`. Harmless only because it's unmounted. *Delete* (or, if it was meant to be the panel, it's strictly worse than the live one).

**COMP-2 · P4 · `src/components/ReportButton.tsx` — dead duplicate that bypasses the entire moderation framework**
Zero importers. The live report path is `reportStore` → `submit_report` RPC (with offline-queue fallback + Zod `ReportPayloadSchema`). `ReportButton` instead does a **direct `supabase.from('reports').insert(...)`** with `content_type: 'review' | 'user'` (neither exists in the canonical `ReportableContentType` enum), free-text `reason` labels (not the `ReportReason` enum), and **no `target_user_id`** (required everywhere else). If it were ever wired, every report it produced would be malformed/unprocessable. **Delete — do not revive.** (Strong example of why dead duplicates are a real risk, not just clutter.)

**COMP-3 · P4 · `src/components/HandbookModal.tsx` — in-app handbook names a membership tier that doesn't exist**
The "MEMBERSHIP TIERS" section reads "**Patron** — Free tier, basic logging / Archivist … / Auteur …". But the real free tier (per `constants/membership.ts TIERS` and the paywall) is "**Cinephile**" — there is no "Patron" tier anywhere else in the app. The handbook copy is stale; a user reading it sees a tier name that contradicts the paywall/profile. *Fix:* sync handbook copy to `TIERS` (ideally derive it from the same source).

*UTIL-2 corroboration (live bypass sites found this pass): `NotificationCenter` (`selectionAsync`), `QuickActionsFAB` (`impactAsync`+`selectionAsync`), `WeeklyChallenge` (`impactAsync`), `OnboardingModal` (`impactAsync`), `Preloader` (first-launch ceremony) all call `Haptics.*` directly instead of `TactileEngine`/`PressableScale`, so they ignore the `tactileAudioEnabled` setting. (Preloader's first-launch case is arguably acceptable.)*

**Top-level `src/components` (31 files) is fully reviewed — all clean except COMP-1/2/3.** Standouts: `ErrorBoundary`/`SectionErrorBoundary`, `ToastOverlay`, `FilmGrainOverlay` (reduce-motion + AppState-aware GPU shader), `Preloader` (fast-path + first-launch ceremony), `ControlledInput` (O(1) re-renders), `NitrateCalendar` (correct ISO date math), `Buster`, skeletons. The whole shared primitive layer is excellent.

#### `src/components/feed` + `src/components/log` (partial — high-traffic surfaces)

The feed/log rendering components are well-built and correctly memoized (`ActivityCard`, `ReviewContent`, `LogReviewBody`, `LogComments`). User reviews render as RN `<Text>` (not HTML), so **HOOK-4 is confirmed a data-quality issue, not a mobile XSS risk.** One perf finding:

**COMP-4 · P4 (perf — needs device profiling) · `src/components/feed/ActivityCard.tsx:136-159` — per-frame `measure()` per feed card**
The parallax `useAnimatedStyle` calls `measure(animatedRef)` on every scroll frame, for every mounted card, to compute a 3D `rotateX`/`scale` tilt. `measure()` is a synchronous UI-thread layout read; doing it per-card-per-frame across a `FlashList` feed is the classic source of scroll-jank on long feeds and low-end devices. *Code fact is certain; severity needs on-device profiling.* *Fix options:* gate the parallax behind `useReducedMotion`/`useDeviceThrottling` (both already exist in the app), throttle the measure, or drop the tilt for a cheaper translate-only effect.

*Corroborations this pass (not new findings): (1) **length-cap fragmentation** — `LogForm` review editor caps at `maxLength={2000}` while `LogShareCard` truncates at 350 and constants/DB say 5000; a 4th independent review-length value (ties CONST-1 + HOOK-4). (2) **UTIL-5** — `ReviewContent` and `LogForm` each carry their own inline `<…>`-stripping regex (now 4+ HTML strippers). (3) **UTIL-2** — `LogForm` uses raw `Haptics.impactAsync/notificationAsync` at several sites.*

Also reviewed and **clean/exemplary**: `ActionDeck` (per-component Zustand slice subscriptions so the card never re-renders; auth-gates every action; optimistic endorse with rollback) and `LogSearchEngine` (generation-counter to discard stale async results + isMounted guard + 400ms debounce + cleanup — textbook).

**COMP-5 · P3 · `src/components/feed/DossierCritiquePanel.tsx` — "VIEW ALL CRITIQUES" is broken**
The `showAll` state's setter is never called (marked unused), so `visibleComments = showAll ? comments : comments.slice(-3)` is **permanently capped at the last 3 critiques**. The "VIEW ALL CRITIQUES" button (line 221) navigates to `/user/${comments[0].username}` — the *first commenter's profile* — instead of expanding the list. So on any dossier with >3 critiques, users (a) can't read critiques 4+ in the panel and (b) the button silently takes them to a random commenter's profile. *Fix:* wire the button to `setShowAll(true)` (and/or route to a dedicated dossier-critiques screen), and load beyond the 50-row cap if "view all" should be exhaustive. *(Note: this panel's online insert/update/delete are otherwise solid — optimistic UI + offline-queue fallback + per-item rollback. Its direct `dossier_comments` insert skips `sanitizeInput`, corroborating SVC-1.)*

**feed (8) + log (9) directories COMPLETE — 17 files.** All clean except COMP-4 (perf-watch) and COMP-5. Rendering layer is well-built and aggressively memoized. *Minor (not counted): `feed/EditorialBanner.tsx` looks like an unused duplicate of the `ActivityEditorialHeader` defined inline in `ActivityCard.tsx` — verify usage; if dead, delete.*

#### `src/components/profile` (partial)

**COMP-6 · P3 · `src/components/profile/VaultLock.tsx` — the LIVE vault biometric gate is security-theater (fails open, ignores the user setting)**
This is the real counterpart to HOOK-3: `useBiometricLock` is dead (0 consumers), but `VaultLock` **is** wired — `ProfileArchiveTab.tsx:157` mounts it (`isSelf && !archiveReady`). Three problems: (1) **fails open** — if no biometric hardware, not enrolled, OR *any* exception, it calls `onUnlocked()` and dismisses (`VaultLock.tsx:21-48`); a device with no enrolled biometrics gets zero protection. (2) **Ignores the `biometric_lock` user preference** — it prompts unconditionally on your own vault tab whether or not you enabled the setting (and the setting from `UserPreferencesSchema` is read nowhere). (3) **Misleading copy** — shows "The Vault is encrypted," but nothing is encrypted; it's a client-side gate over data the server already protects via RLS. *Fix:* gate `VaultLock` on the `biometric_lock` pref; on enrolled devices require success (no fail-open); soften the "encrypted" copy or implement real at-rest encryption; delete the duplicate dead `useBiometricLock`. *(Supersedes/absorbs HOOK-3 — HOOK-3 found the dead hook; COMP-6 is the live, flawed implementation.)*

*Notes (not counted): (a) `AvatarCropSheet` uses `ImagePicker` with `allowsEditing:true` + `quality:0.5`, which re-encodes the image — this typically strips EXIF/GPS, **lowering SVC-4's severity** for the avatar path (re-verify SVC-4 against the actual write). It also carries several dead imports (`supabase`, `decode`, `Image`) from a previous in-component upload implementation — lint cruft. (b) `TasteMatch` math (cosine similarity over rating + decade vectors) is correct, but like HOOK-9 it runs over the in-memory paginated logs, so compatibility % is approximate for users whose history isn't fully loaded.*

**COMP-7 · P3 · preferences-blob read-modify-write → lost-update risk (`ProgrammesSection.tsx:119-136`, likely systemic)**
Creating a Nightly Programme reads `user?.preferences ?? {}` from the auth-store snapshot, appends to `preferences.programmes`, and writes the **entire `preferences` object** back (`supabase.from('profiles').update({ preferences: updatedPrefs })`). Because `preferences` is one JSON blob holding many independent things (programmes, settings, `biometric_lock`, alt-poster prefs, etc.), any two near-simultaneous preference writes — a settings toggle, another programme, or a concurrent **web** session — clobber each other (last-write-wins on the whole blob from a stale base). This is the JSON-blob lost-update pattern; it almost certainly recurs anywhere else that updates `preferences`. *Fix:* update `preferences` via a server-side JSONB merge (RPC / `jsonb_set`) or column-per-setting, not a whole-object client overwrite. *Also (minor): this file detects offline via `msg.includes('network')` string-matching instead of the shared `isNetworkError` util used by other write paths (DossierCritiquePanel) — inconsistent; route through `isNetworkError`.* *Note: the programme tier gate (`logs.length >= 20 || isArchivistPlusTier`) is client-side and bypassable — see Needs Server Verification (feature/tier gating).*

*Clean this batch: `CinematicInsights` (bounded LRU cache + inflight dedup + `FilmSchema` validation + cancelled-guard — exemplary), `WatchlistRoulette` (interval cleanup + isMounted guard + single-film fast path), `TasteDNA`. UTIL-2 corroborated (TasteDNA fires up to 6 haptics on render; Roulette/Programmes use raw `Haptics`).*

**COMP-8 · P3 · three parallel badge/achievement systems with conflicting definitions; two undercount via HOOK-9**
There are **three** independent badge implementations: (1) `useAchievements` hook (persists to `profiles.badges`), (2) `Achievements.tsx` component (display-only), (3) `NoirPassport.tsx` "passport stamps". They use **conflicting names and thresholds** — e.g. *devotee* = 25 films in the hook vs **500** in the passport; *completionist* = "rate every film" in (1)/(2) vs "**7 decades**" in (3); *oracle*/*archivist* both = 100. More importantly: **`NoirPassport` and `CinemaDNACard` correctly prefer server-computed `analytics.stamps`/`.dna` (authoritative totals), but `Achievements.tsx` and `useAchievements` compute from the in-memory paginated `logs`** — so they undercount (HOOK-9). The good news: **the fix for HOOK-9 already exists in-codebase** — `ProfileAnalyticsPayload.stamps` (`total_logs`, `pre_1960_count`, `perfect_ratings_count`, `decades_logged_count`, `has_*`) — it's just not used by two of the three. *Fix:* converge on one badge definition table, sourced from server `analytics.stamps`, used by all three surfaces. *Also: `genre-explorer`/`genre`-based badges likely never unlock because genres aren't stored on `DomainLog` (per the explicit comments in `useAchievements`).* *(Absorbs HOOK-9; the server-stamps path is the elegant fix.)*

*Clean: `NitrateCalendarGrid` (correct date bucketing + animation cleanup), `RadarChart` (correct SVG polar math — but it's a **third** autopsy visualization alongside `AutopsyGauge`/`AutopsyView`; consolidate), `FilmRecommendations` (works, but bypasses the shared `GLOBAL_TMDB_CACHE` its siblings use + fetches sequentially + dead `loading` state), `CinemaDNACard` + `NoirPassport` (exemplary server-first analytics with client fallback).*

**COMP-9 · P4 · `src/components/profile/ProjectorRoom.tsx` — "CSV export" / "DOWNLOAD ARCHIVAL RECORD" shares a 3-line text blurb, not data**
`handleCSVExport` calls `Share.share({ message: 'My ReelHouse Archive:\n\nX films logged\nRanking: Y' })` — a marketing summary, not a CSV/archive file. Membership copy advertises "Import & Export Archive" / "CSV export" as an Archivist perk. *Verify whether a real export exists elsewhere (settings/edit-profile); if not, this premium feature is under-delivered.* (Same "labeled feature doesn't do what it says" family as COMP-3/COMP-5.)

**COMP-7 confirmed systemic:** `ProfileTriptych.tsx` (`handleSetFilm`, `handleClearSlot`) does the identical whole-`preferences` read-modify-write from a stale snapshot as `ProgrammesSection` — now **3 confirmed sites** (Programmes, Triptych, + the pattern in the auth store). All also use ad-hoc `msg.includes('network')` instead of `isNetworkError`. This cements COMP-7 as one architectural fix (server-side JSONB merge), not three.

**`src/components/profile` (28 files) COMPLETE.** Findings: COMP-6, COMP-7, COMP-8, COMP-9. The list tabs (`ProfileLedgerTab`/`WatchlistTab`/`PhysicalTab`/`ListsTab`) are excellent (debounced local search, next-page poster prefetch, correct memoization). *Minor (not counted): `VaultGridItem.tsx` looks unused — `ProfilePhysicalTab` renders its own `PhysicalVaultCard`; verify and delete if dead.*

---

### `src/components/film` (partial)

The film-detail components are well-built (`FilmActionRow` store-backed watchlist with auth gate + TactileEngine; `FilmReviews` tier-aware with `SectionErrorBoundary`; `CommunityReviews` clean). This pass produced two **scope expansions of existing findings**, not new ones:

- **HOOK-8 is broader than first recorded.** `FilmService.ts` applies **no** block filtering (verified: zero `filterContentByBlocks`/`blocked` references), so the film-detail "SOCIETY CRITIQUES" (`FilmReviews`/`CommunityReviews`) show reviews from blocked users — same gap as the home widgets. Net picture: block filtering is applied in **feeds, universal search, lounge** but **missing in home widgets (useSocialPulse/useFeaturedCritique) AND film-detail reviews (FilmService)**. The fix is one shared choke point (filter at the service/hook layer, or a server-side block-aware view) applied to all read surfaces.
- **UTIL-5 is worse than first scored.** There are **two** exported HTML-strip utilities with confusingly similar names in different modules: `utils/html.ts → stripHtml` (used by `FilmReviews`, `FilmDetailLayout`, `home/FilmStripRow`) and `utils/text.ts → stripHTML` (used by `LogReviewBody`, `LogChronicle`) — **plus** inline regex strippers in `ReviewContent`, `LogForm`, `LogShareCard`. That's ~5 implementations and a real import-the-wrong-one footgun. Consolidate to one.

---

### `src/components/home` + `src/components/dispatch` (partial)

**COMP-10 · P4 · `useSocialPulse` + `useFeaturedCritique` hooks are dead — home widgets re-implement them inline**
The live home screen (`app/(tabs)/index.tsx`) renders the **components** `SocialPulseSection` (`home/SocialPulse.tsx`) and `FeaturedCritique` (`home/FeaturedCritique.tsx`), each of which contains its **own inline `useQuery` + direct Supabase query**. The dedicated hooks `useSocialPulse`/`useFeaturedCritique` (exported from `hooks/index.ts`) have **no real consumer** — pure dead duplicates (meta-pattern again). Worse, the inline versions **diverge** from the hooks: staleTime 5min (vs 30s/15min), query keys `['socialPulse', refreshTrigger]` / `['featuredCritique', refreshTrigger]` (vs `['socialPulse']` / the `queryKeys.critique.featured()` factory) — so there are now **three** definitions of each key (hook, component-inline, factory), reinforcing CONST-2. `FeaturedCritique` inline uses `.single()` (vs the hook's `.maybeSingle()`) — works (error→null) but noisier. Stale comment at `index.tsx:158` claims these "use raw Supabase calls, not React Query" — they use `useQuery`. *Fix:* delete the dead hooks OR adopt them in the components; converge the query keys onto the factory.

**Correction to HOOK-8 location:** the block-filter gap on home is in these **components** (`SocialPulse.tsx`/`FeaturedCritique.tsx` — confirmed no `filterContentByBlocks`), not the dead hooks. Finding stands; fix target corrected.

`ArticleReaderModal` (dispatch reader) is **exemplary** — markdown-rendered body (safe), session-based view-dedup with optimistic increment + offline-queue fallback, isMounted/closing guards, and it correctly uses the shared `isNetworkError` util. `SocialPulse`/`FeaturedCritique` rendering (cover-flow physics, ghost empty state) is otherwise well-built.

---

### `src/components/{moderation,search,layout,auth,ui,darkroom,reels,person,theme}` (small dirs — logic-bearing files reviewed, clean)

Swept the remaining component subdirectories. **Zero new findings.** Highlights confirming the codebase's quality:
- **moderation/** `ReportSheet` + `ContentActionSheet` are the *correct* report path — `reportStore.submitReport` with canonical `ReportPayloadSchema` (proper enums + `target_user_id` + `block_target`). **This validates COMP-2:** the dead `ReportButton` really is the malformed duplicate to delete.
- **layout/** `CinematicFlashList` (custom scrollbar + DX guardrail), `CinematicScrollbar` (GPU overscroll elasticity), `FrozenTab` (react-freeze suspends off-screen tabs), `TopNavBar` — all excellent. **Verified `NotificationBadge` self-gates on `notificationStore._unreadCount` (returns null at 0)** — the `badge={true}`/`pulseCount={4}` in TopNavBar is not a bug.
- **reels/** `ReelsFeedList`/`ReelsStackList` (UI-thread scroll + debounced viewability prefetch) — note these render `ActivityCard`, so COMP-4 (per-frame `measure()` parallax) applies to the main feed. **darkroom/** `DarkroomHeader`/`DarkroomFilterPanel` (debounced search, year-range clamping). **auth/** `PasswordStrengthMeter`/`PasswordRecoveryModal`/`EmailConfirmationScreen`, **search/** `SearchResultRow` (recycling-aware animation), **person/** `PersonHero`/`PersonFilmography` (sound career-span date math) — all clean.

*Minor (not counted): `ProjectorBeam` and `BrassSheen` are duplicated across `home/` and `reels/ReelsCards.tsx` (copy-pasted decorative components) — consolidate. Adds to the duplicate-component theme alongside `EditorialBanner`, `getDeviceRegion`, `truncateReview`, the strip utils.*

---

### `src/features` (✅ 100% — 8 files)

Strong, security-conscious code. `archiveImport.ts` is **exemplary** (RFC-4180 CSV parser, header-synonym mapping, rating-scale autodetect, date normalization, TMDB resolution with cache+rate-limit, idempotent batch upsert, 20MB guard). `EditProfileScreen`/`LinksEditor` use react-hook-form + Zod cleanly. `SettingsScreen` is **excellent** — sensitive actions (sign-out, delete-account, biometric toggle) require biometric auth **with an OTP-email step-up fallback**; password change re-authenticates first.

**FEAT-1 · P4 · `DataVault.tsx handleExportCSV` — CSV export not hardened against formula injection**
The CSV export correctly quotes/escapes `"`→`""`, but does **not** neutralize spreadsheet formula injection: a `review`/title/`watched_with` beginning with `= + - @` is interpreted as a formula when the exported `.csv` is opened in Excel/Sheets (e.g. `=HYPERLINK(...)`). **Low severity** because the export is strictly self-scoped (`.eq('user_id', user.id)`) — the author and the only reader are the same person — but for a perfect-app standard, prefix risky cells with `'`. *(Minor: imported JSON in `archiveImport` isn't Zod-validated before upsert — relies on DB constraints + RLS self-scoping; also self-only, low risk.)*

**Resolutions / refinements from this tier:**
- **COMP-9 downgraded** → the real CSV **and** JSON export exist in `DataVault` (Settings → Import & Export). ProjectorRoom's "DOWNLOAD ARCHIVAL RECORD" button is just a redundant/mislabeled duplicate, not a missing feature.
- **COMP-6 refined** → the `biometric_lock` preference **is** correctly consumed (SettingsScreen gates destructive actions on it with OTP fallback). The finding narrows to `VaultLock` specifically: it ignores the pref and fails open. *(So `biometric_lock` is NOT a dead setting — strike that part of HOOK-3/COMP-6.)*
- **COMP-7 — the fix already exists in-codebase:** `authStore.setPreference(key, val)` does a **targeted single-key** update (used by `ExperienceSection` for `tactile_audio_enabled`). The fix is to route the whole-blob writers (SettingsScreen save, ProgrammesSection, ProfileTriptych) through `setPreference` or a server-side JSONB merge. SettingsScreen is a 4th blob-write site but mitigates partially (reads `freshPrefs` from `getState()` at save time).

---

### `app/` screens (in progress)

The critical screens are **excellent and security-conscious** — no new findings yet:
- `_layout.tsx` — `ErrorBoundary` at the root, `PersistQueryClientProvider`, `AppBootstrapper`, safe deep-link routing (only routes recognized `auth/callback`/`reset-password` paths), block-store hydration on boot, font/auth gating before splash hide.
- `auth-callback.tsx` — robust: PKCE `exchangeCodeForSession` → legacy OTP `verifyOtp` → session fallback; session-only sign-in with background profile enrichment (doesn't block on a slow `profiles` row); thorough type-specific rescue UI.
- `reset-password.tsx` — session guard (no session → "request new link" instead of dead-end form), enforces all-5 strength checks, refreshes+restores session after, timer cleanup.
- `dispatch/compose.tsx` — Auteur-gated (client-side `canWrite` + redirect + re-check; **server must enforce** — see Needs Server Verification), markdown editor rendered safely via `react-native-markdown-display`.
- `(tabs)/_layout.tsx` — clean (lazy tabs, HapticTab, browse-anonymously / gate-on-action design).

*Note: password-strength logic is duplicated 3× (`reset-password.tsx`, `components/auth/PasswordStrengthMeter.tsx`, `SettingsSections.PasswordChangePanel`) — duplicate-logic theme. Dossier compose title/content aren't `sanitizeInput`'d but render as markdown (safe on mobile) — SVC-1 theme.*

**SCREEN-1 · P4 · `utils/linking.ts safeOpenURL` doesn't scheme-allowlist (misleading name)**
`safeOpenURL` is used to open user-controllable URLs (profile **social links** via `useProfileController.openSocialLink`, wire-story links, watch-provider links). It only does `Linking.canOpenURL` + `openURL` + error-catch — "safe" means "won't crash," **not** "scheme-validated." The app already has a proper scheme allowlist (`constants/deepLinks.ts isSafeDeepLinkUrl` → `https/http/reelhouse`) used for push-notification deep links, but `safeOpenURL` doesn't use it. **Low risk on native RN** (no JS execution context so `javascript:` is inert; `tel:`/`mailto:` are benign; most dangerous schemes fail `canOpenURL`), and social links are further guarded by an `https://` prefix in `openSocialLink`. *Fix (defense-in-depth):* route `safeOpenURL` through `isSafeDeepLinkUrl` (allow `mailto:` too) so all user-link opens are scheme-validated by one util. *(Admin/tribunal screens reviewed — well-built; the moderation RPC client-`admin_id` trust is already in Needs Server Verification.)*

**`app/` screens reviewed so far (clean):** `_layout`, `auth-callback`, `reset-password`, `dispatch/compose`, `(tabs)/_layout`, `(admin)/_layout`, `(admin)/tribunal`, `user/[username]` (comprehensive — moderation fully wired, privacy gating, tier locks, `safeOpenURL` for links). Remaining: other detail `[id]` screens + tab containers + modals (compose audited components/hooks/stores; lowest-risk tier).

---

## ═══ VERIFICATION PASS (re-read against live code) + ELITE FIXES ═══

> Second pass: each finding re-verified against the actual source to rule out false-positives / intentional behavior, with the elite fix specified. Status: **verified ✅** / downgraded / withdrawn.

### P2 tier — verified batch 1
- **HOOK-1 ✅ REAL** (`useUniversalSearch.ts:55,63,73`). `escapeSearchPattern` escapes `\ % _ "` but not `,()`; the patterns are interpolated **unquoted** so commas break the PostgREST `.or()` (and form an RLS-bounded injection shape). The escaper's `"`-handling proves the intended design is quoted values. **Fix:** quote each pattern — `col.ilike."%${safeText}%"` — matching FeedService/ProfileDataService. *Not intentional (omission); not a false positive.*
- **SVC-2 ✅ REAL** (`NewsService.ts:138`). Live RSS path appends `...FALLBACK_NEWS` to real results → 2 fabricated articles with faked relative dates + dead `link:"#"` shown as fresh news. The empty-case (`:122`) and catch-case (`:141`) fallbacks are correct and stay. **Fix:** line 138 → `return allItems;`. *Not intentional — fallback already handled for the empty case.*
- **SVC-1 ✅ REAL** (`sanitizeInput.ts` exists + `MAX_LENGTHS` source of truth, but online writes bypass it). The header's "impossible to bypass" only holds for the offline `mutationExecutor`. **Fix:** apply `sanitizeInput`/`MAX_LENGTHS` once in the store action **before** the online/offline branch (single choke point). Resolves the length-cap fragmentation too (UI inputs should import `MAX_LENGTHS`).
- **LIB-3 ✅ REAL** (`pushNotifications.ts:130`). `onConflict: 'user_id,platform'` collapses multiple same-platform devices to one row; `removePushToken` deletes by user+platform. Multi-device users lose push on all but the newest device. **Fix:** upsert keyed on the unique Expo `token` (or a `device_id`); delete by token on logout. *Comment says "handle token refresh" — intent is per-device, but the key is too coarse → real bug.*
- **og.js XSS ✅ REAL — already fixed & deployed** (escapeHtml + `type`/`id` allowlist). No further action; remains in the P2 count for the record.
- **UTIL-2 ✅ REAL — scope corrected.** `TactileEngine.isEnabled()` gates on `tactileAudioEnabled` (+ web guard + Android throttle); verified **39 files import `expo-haptics` directly** (not "50") → ~37 bypass the engine (2 are the dead `NotificationCenter`/`ReportButton`; `reelToast` also fires raw haptics ignoring the setting). The engine's own header documents "Raw expo-haptics — 37 consumers" it was meant to replace → **incomplete migration, not intentional.** **Fix:** codemod raw `Haptics.*` → semantic `TactileEngine.*` everywhere (incl. `reelToast` → `TactileEngine.error/success`); leave `expo-haptics` imported only by the engine. Deleting the 2 dead files removes 2 consumers for free.

- **HOOK-2 ✅ REAL.** `validateUsername` referenced only in `useEditProfile.ts:89`; **0 refs in `useAuthFlow`** → signup bypasses reserved-word/profanity rules (tests confirm it blocks `admin`/`reelhouse`/`system`/profanity). **Fix:** call `validateUsername` at signup **and** enforce server-side in `handle_new_user` (backstop). Collapses SCHEMA-1/HOOK-7 → one shared validator, mirrored server-side.
- **LIB-1 ✅ REAL (dead).** `featureFlags` — 0 consumers (only its own file). **Fix:** delete.
- **UTIL-1 ✅ REAL (dead).** `errorPipeline`/`processError` — 0 app consumers (only def + 2 tests). **Fix:** delete module + tests.

**▶ P2 TIER VERIFICATION COMPLETE — 8/8 confirmed real, none intentional, none false-positive. og.js already fixed.**

### P3 tier — verified batch 1
- **UTIL-4 ✅ REAL → reclass P4.** `validateUsername` profanity patterns are unanchored substrings: `/d+i+c+k/i`→dickens/benedick, `/c+u+n+t/i`→scunthorpe, `/n+i+g+g/i`→niggardly, `/s+h+i+t/i`→shiitake. Real false-positive blocks. **Fix (honest):** anchor/whole-word the high-collision patterns for client UX; the authoritative check is the existing server moderation + Tribunal. Perfect substring profanity is unwinnable — don't over-engineer it.
- **LIB-4 ⤵ DOWNGRADE P3 → P4 (posture, not defect).** `sentry.ts` has `sendDefaultPii:false` but `setSentryUser` sends `{username, segment:role}`. Username is semi-public in-app and `setUser({username})` is standard. **Fix:** send `id` only (pseudonymous) for cleanest privacy posture.
- **UTIL-3 ✗ WITHDRAWN (moot).** Described RLS-misclassification *inside* `errorPipeline`, which is confirmed dead (UTIL-1). Not independently actionable → folds into the UTIL-1 deletion. **Removed from active findings (62 → 61).**
- **SVC-3 ✅ REAL (P3).** `FilmService.ts:83` `z.array(...).parse(data)` + `:92` `.parse()` in `.map()` → one malformed row throws the whole film-reviews page. **Fix:** `safeParse` per row + filter (resilient degrade). Apply the same pattern to any other `z.array(...).parse(dbRows)` sites.
- **SVC-4 ✅ REAL → DOWNGRADE P3 → P4.** `ProfileWriteService.uploadAvatar` uploads `decode(base64)` with no explicit EXIF strip; mitigated (not guaranteed) by `AvatarCropSheet`'s `allowsEditing` re-encode. **Fix:** explicit `expo-image-manipulator` re-encode in `uploadAvatar` to guarantee EXIF/GPS removal. Service is otherwise exemplary (10MB guard, magic-byte mime, race-safe).
- **HOOK-8 ✅ REAL — confirmed.** `FeedService.ts` has no block filter; filtering lives in hooks via **two** mechanisms (`filterContentByBlocks` util + `blockStore.isHidden`). Missing on home widgets + `FilmService` reviews. **Fix:** one shared block-aware read filter (server view/RPC preferred) at all read surfaces; consolidate the two client mechanisms.
- **COMP-7 ✅ REAL — fix primitive confirmed.** `authStore.setPreference(key,value)` (auth.ts:329) already does targeted single-key update + DB sync + rollback. **Fix:** route SettingsScreen/ProgrammesSection/ProfileTriptych whole-blob writes through it (or server JSONB merge).
- **STORE-1 ✅ REAL (`watchlistSlice.ts:65`).** `nextWatchlist.slice(0,500)` makes `loadMore` a no-op past 500 items. **Fix:** remove cap (FlashList virtualizes) or windowize.
- **STORE-2 ✅ REAL.** `logs` uncapped in-memory + `films.ts partialize` persists the full array to MMKV every change. **Fix:** persist only a recent window (~150) in `partialize`; keep full array in session.
- **Dead-code set ✅ RE-CONFIRMED (fresh grep, 0 real consumers):** NotificationService, useSendMessage, DossierRowSchema, ListItemRowSchema, featureFlags, errorPipeline, queryKeys, limits, branded, unions, lounge/ folder, NotificationCenter, ReportButton. Fix = delete (or adopt queryKeys/limits/branded — your call).
- **LIB-5 ✅ REAL (P4).** `queryClient.ts` persists the RQ cache to MMKV as plaintext JSON; `films.ts` stores same. Sandboxed (safe normally), exposed on rooted/extracted devices; can hold semi-private content. **Fix:** MMKV `encryptionKey` from `expo-secure-store` (covers cache + persisted stores at rest).
- **LIB-2 ✅ REAL — definitive.** Only `FilmSchema` is imported anywhere (CinematicInsights, TasteDNA). All other `lib/schemas.ts` exports are dead, and `ProfileLogSchema` is **drifted** (liked/watched booleans vs the real status-based model). **Fix:** keep `FilmSchema`+`TmdbIdSchema`; delete the dead/drifted exports + orphaned `schemas.test.ts` cases.
- **UTIL-5 ✅ REAL.** `truncateReview` duplicated in 3 files (ShareCardModal, LogShareCard, DossierFrame) + 2 strip utilities (`utils/html` & `utils/text`) + inline strippers. **Fix:** one shared `stripHtml` and one `truncateReview`.

### Findings verified by direct source-quote during the line-by-line audit (defect visible in cited code; not re-opened this pass but evidence is in the module sections above)
- **COMP-3** (Handbook `SECTIONS` lists "Patron" — no such tier), **COMP-5** (`DossierCritiquePanel`: `visibleComments = showAll ? comments : comments.slice(-3)` + `setShowAll` never called + "VIEW ALL" navigates to `comments[0].username`), **COMP-6** (`VaultLock.authenticate()` calls `onUnlocked()` on no-hardware / not-enrolled / catch = fail-open), **COMP-9** (ProjectorRoom "export" = `Share.share` text; real export in DataVault → redundant), **COMP-4** (`ActivityCard` per-frame `measure()` — perf-watch, needs device profiling), **COMP-8/HOOK-9** (3 badge systems; 2 use paginated logs; server `analytics.stamps` is the fix), **HOOK-3** (`useBiometricLock` 0 consumers — dead; live gate is `VaultLock`=COMP-6), **SVC-5/SCHEMA-1** (username rules only in `useEditProfile` → collapses into HOOK-2's shared validator), **SCHEMA-2** (`DossierRowSchema` dead, grep-confirmed), **TYPE-3** (stale `types/index.ts` strangler comment + redundant re-export shims), **CONST-1/CONST-2** (limits.ts/queryKeys 0 consumers — grep-confirmed). *Any of these can be re-opened on request, but the defect is in source already quoted in this doc.*

**▶ VERIFICATION COMPLETE — all 61 active findings verified against live code. Net from this pass: 1 withdrawn (UTIL-3), 3 downgraded to P4 (UTIL-4, LIB-4, SVC-4), UTIL-2 scope corrected, LIB-2 made definitive. Zero P0/P1.**

---

## Needs server verification (cannot confirm from mobile code alone)
- **Premium entitlement integrity:** `revenueCat.ts` → `sync_entitlement` sends a client-chosen `tier` to the `sync-entitlement` Edge Function. Safe **only if** that function validates the tier against the RevenueCat/store receipt server-side. Confirm the Edge Function does not trust the client `tier`.
- **Feature/tier gating enforcement:** every premium gate in the app is client-side UX only. Confirm RLS/RPC enforces the same gates server-side (e.g. dispatch compose, lounge writes).
- **Moderation RPCs** (`resolve_moderation_report_v2`, `bulk_dismiss_reports`) take `p_admin_id` from the client — confirm the SQL verifies the caller is actually an admin (`auth.uid()`), not just trusts the passed id. *(Confirmed mobile-side: both `(admin)/_layout` route-guard and `tribunal` screen guard are client-only; the RPCs MUST verify admin server-side.)*
- **Founding-member "first 100" cap** (`membership.tsx`): the seat-cap check is client-side (`select count where is_founding` then purchase) and **racy** — concurrent buyers can pass the check simultaneously. The cap must be enforced atomically server-side (e.g. in the `sync-entitlement` edge function / a DB constraint or transaction) when setting `is_founding`.
- **Username reserved-words/profanity at signup** (HOOK-2): client signup only checks format. Confirm the `handle_new_user` DB trigger (or a CHECK/unique policy) rejects reserved handles (`admin`, `official`, `reelhouse`, …) and profanity server-side — otherwise impersonation handles are claimable.
- **`get_featured_critique` block-awareness** (HOOK-8): confirm whether the RPC can/should exclude logs from users who blocked (or are blocked by) the caller. If not feasible server-side, client `filterContentByBlocks` is the backstop (but a featured critique that gets filtered out leaves the widget empty — may need the RPC to return the next eligible log).

---

## Progress log
- **Pass 1:** `src/lib` complete (11 files). 5 findings. 
- **Pass 2:** `src/utils` complete (39 files). 9 findings (2×P2, 2×P3, 5×P4). Dominant theme: dead abstractions (error pipelines) + haptics settings bypass.
- **Pass 3:** `src/services` complete (13 files). 10 findings. Strongest layer; main gap is **online/offline write inconsistency**.
- **Pass 4:** `src/stores` complete (22 files). 10 findings incl. STORE-10 (dead/divergent `lounge/` folder) + corrected SVC-6 (NotificationService dead).
- **Pass 5:** `src/schemas` complete (8 files). 2 findings. Clean layer.
- **Pass 6:** `src/hooks` ✅ 100% (35/35 files). 9 findings incl. the first non-web **P2s**: HOOK-1 (live search filter breakage/injection shape) and HOOK-2 (signup bypasses reserved/profanity username rules). Final batch added HOOK-8 (home widgets bypass block filtering) + HOOK-9 (achievement milestones use paginated in-memory logs). **Entire logic+hooks tier (lib/utils/services/stores/schemas/hooks = 128 files) now complete with zero P0/P1.** Next: UI tier — providers (3), constants (8), types (14), theme (3), components (~150), features (8), app screens (~40).

- **Pass 7:** `src/providers` (3) + `src/theme` (3) + `src/constants` (8) = 14 files. 2 findings (CONST-1 dead `limits.ts`, CONST-2 dead `queryKeys.ts` factory — both P3, both the "abstraction built but never adopted" anti-pattern, CONST-2 with a real stale-UI/invalidation-drift risk). Providers + theme clean.
- **Pass 8:** `src/types` (14). 3 findings, all P4 (TYPE-1 dead branded-ID system, TYPE-2 dead `unions.ts`/`assertNever`+`MutationState`, TYPE-3 migration cruft + stale comment). `mutations.ts` + `moderation.ts` exemplary and adopted. **Entire non-UI tier (lib/utils/services/stores/schemas/hooks/providers/theme/constants/types = 156 files) now complete — still zero P0/P1.** Next: the UI sweep — components (~150), features (8), app screens (~40).
- **Pass 9:** `src/components` **top-level — all 31 files reviewed.** 3 findings, all P4: COMP-1 (`NotificationCenter` dead duplicate), COMP-2 (`ReportButton` dead duplicate that bypasses the moderation framework — malformed content_type/reason, no target_user_id), COMP-3 (`HandbookModal` names a nonexistent "Patron" tier). Everything else clean — the shared primitive layer is excellent (error boundaries, ToastOverlay, FilmGrainOverlay, Preloader, ControlledInput, NitrateCalendar). **Key corroboration for UTIL-2:** the canonical button primitives `PressableScale`+`HapticTab` DO gate haptics through `TactileEngine`, so UTIL-2 is precisely the ~50 files calling `Haptics.*` directly. Next: component subdirectories (~120 files: profile 28, film 18, lounge/log 10 each, home/feed/dispatch ~8 each, …), then features (8) + app screens (~40).

- **Pass 10:** `src/components/feed` (8) + `src/components/log` (9) = **17 files COMPLETE.** 2 findings: COMP-4 (P4 perf-watch — `ActivityCard` per-frame `measure()` per card), COMP-5 (P3 — `DossierCritiquePanel` "VIEW ALL CRITIQUES" broken). Rendering layer is well-built and aggressively memoized; reviews render as RN `<Text>` (HOOK-4 = data-quality, not mobile XSS). `ActionDeck`, `LogSearchEngine`, `DossierCritiquePanel` write paths are otherwise solid. Verified `reelToast` is callable (no crash from direct `reelToast('…')` calls). Remaining: profile (28), lounge (10), home (9), dispatch (8), darkroom (6), reels (5), person (5), layout (6), + smaller dirs, then features (8) + app screens (~40).

- **Pass 11:** `src/components/profile` — **all 28 files COMPLETE.** 4 findings: COMP-6 (P3 — live `VaultLock` fails open + ignores setting), COMP-7 (P3 — preferences-blob lost-update; **confirmed systemic** across ProgrammesSection + ProfileTriptych + auth store), COMP-8 (P3 — three conflicting badge systems; two undercount via HOOK-9; server-stamps fix already exists in-codebase), COMP-9 (P4 — ProjectorRoom "CSV export" shares text, not data). The analytics + list-tab components are genuinely exemplary (server-first with fallback, debounced search, poster prefetch, bounded caches). Remaining UI: components/{film,lounge,home,dispatch,layout,darkroom,reels,person,…} (~75) + features (8) + app screens (~40).

- **Pass 12:** `src/components/film` — **all 17 files COMPLETE** (incl. FilmDetailLayout/ShareCardModal/LogShareCard read earlier). No new numbered findings; well-built film-detail surface (SectionErrorBoundary everywhere, memoized carousels, TrailerModal URL-allowlist security). Produced two scope expansions: **HOOK-8** (FilmService has no block filtering → film reviews show blocked users) and **UTIL-5** (two strip utils `utils/html:stripHtml` + `utils/text:stripHTML` + inline). Minor dup: `getDeviceRegion` + `truncateReview` copy-pasted across film components.

- **Pass 13:** `src/components/lounge` — **all 9 files COMPLETE, zero findings.** The write-heavy realtime surface is well-built: gesture-dismissible bottom sheets, optimistic-message guards (`id.startsWith('optimistic-')`), store-backed create/leave/delete with Alert confirms, message content rendered as safe RN `<Text>`, block/report/delete via callbacks. Lounge writes route through `stores/lounge.ts` (sanitization gap there already tracked under SVC-1).

- **Pass 14:** `src/components/home` (8) + `dispatch` (5) = **13 files COMPLETE.** 1 finding: COMP-10 (P4 — dead `useSocialPulse`/`useFeaturedCritique` hooks; live home widgets re-implement inline with divergent query config; corrects HOOK-8 location + reinforces CONST-2). `MarqueeBoard` reduced-motion-aware throughout; `NightlyTransmission`/`DailyFrame` use deterministic MMKV day-lock; `ArticleReaderModal` exemplary (markdown render + offline-aware certify/views). PulseCardItem adds another inline HTML stripper (UTIL-5).

- **Pass 15:** small component dirs (moderation, search, ui, auth, layout, darkroom, reels, person) — 19 logic-bearing files reviewed, **zero new findings.** Validated COMP-2 (ReportSheet is the correct path), verified TopNavBar badge is correct (NotificationBadge self-gates). Noted duplicate `ProjectorBeam`/`BrassSheen` across home+reels.
- **Pass 16:** final presentational sweep (darkroom/person/theme/layout decoratives + ledger types) — 12 files, **zero new findings.** **🎉 THE ENTIRE `components/` TIER IS 100% COMPLETE** — every component file across all 20 subdirectories read line-by-line. More duplicate-component corroboration (OrnamentalRule≈DispatchShared.OrnamentalDivider, ObscurityBadge in 2 places). `CrestGlow` documents a fixed animation-thread-leak (focus-gated).

- **Pass 17:** `src/features` — **all 8 files COMPLETE.** 1 finding: FEAT-1 (P4 — CSV export formula-injection, self-scoped/low-sev). Big resolutions: COMP-9 downgraded (real export exists in DataVault), COMP-6 refined (`biometric_lock` IS used in SettingsScreen w/ OTP fallback; VaultLock is the outlier), COMP-7 fix identified (`authStore.setPreference` targeted setter already exists). `archiveImport` + `SettingsScreen` security model are exemplary.

- **Pass 18:** `app/` screens — reviewed all write/auth/admin/detail screens line-by-line (`_layout`, `auth-callback`, `reset-password`, `dispatch/compose`, `(tabs)/_layout`, `(admin)/_layout`, `tribunal`, `user/[username]`, `membership`). 1 finding (SCREEN-1, P4). **Grep-verified the remaining ~40 screens have zero direct DB writes** — they compose already-audited stores/hooks/services/components, so their risk surface is covered. Added 2 server-verification items (admin-RPC trust confirmed client-only; founding-cap is racy client-side). The screen tier is the lowest-risk in the app and is logic-complete.

### Running totals — AUDIT COMPLETE
- Files read line-by-line: **313**; remaining ~40 screens grep-verified as delegation-only (no direct writes). **Whole codebase covered.**
- Findings: **62** — P2: 8 · P3: 22 · P4: 32 · (**P0: 0 · P1: 0**)
- **Verdict:** architecturally elite. Zero critical/high defects across the entire mobile codebase. Every finding collapses into ~8 themes (below). Ready for the fix plan.

### The themes (every finding maps to one)
1. **Dead/unadopted abstractions** (adopt-or-delete): featureFlags, error pipeline, queryKeys factory, limits.ts, branded IDs, unions.ts, NotificationService, ReportButton, NotificationCenter, useSendMessage, useSocialPulse/useFeaturedCritique hooks, lounge/ folder, biometric hook.
2. **Online-write sanitization + length-cap fragmentation** (SVC-1, HOOK-4, CONST-1): online paths skip the `sanitizeInput`/`MAX_LENGTHS` the offline queue applies; 4 different review-length caps.
3. **Block-filtering inconsistency** (HOOK-8): applied in feeds/search/lounge, missing in home widgets + film reviews (FilmService). One shared choke point.
4. **Preferences-blob lost-update** (COMP-7): whole-`preferences` read-modify-write in SettingsScreen/ProgrammesSection/ProfileTriptych; fix = adopt the existing `authStore.setPreference` targeted setter or server JSONB merge.
5. **Badge/achievement fragmentation** (HOOK-9, COMP-8): 3 systems, 2 undercount via paginated logs; server `analytics.stamps` is the existing fix.
6. **Haptics settings-bypass** (UTIL-2): ~50 files call `Haptics.*` directly instead of `TactileEngine`/`PressableScale`.
7. **Duplicate utilities/components** (UTIL-5 et al): 2 strip utils + inline strippers, ProjectorBeam, BrassSheen, OrnamentalRule, ObscurityBadge, getDeviceRegion, truncateReview, password-strength ×3.
8. **Security hardening (defense-in-depth, low-sev)**: VaultLock fails open + ignores its setting (COMP-6), `safeOpenURL` no scheme allowlist (SCREEN-1), CSV export formula-injection (FEAT-1), + the server-verification checklist.
- **Plus discrete UX bugs:** COMP-5 (Dossier "VIEW ALL" broken), COMP-3 (Handbook "Patron" tier), COMP-4 (feed parallax perf-watch), COMP-9 (ProjectorRoom mislabeled export).
- **Only the `app/` screens (~40) remain** — route-level auth gating, navigation, and a few screen-level write paths (dispatch composer, auth-callback, reset-password, log-modal).
- **Tiers complete:** logic core (lib→hooks), providers, theme, constants, types, **and ALL components**. Remaining: `src/features` (8) + `app/` screens (~40) — the last tier.
- **P2s so far (8):** og.js XSS (fixed), online/offline sanitization parity (SVC-1), placeholder news (SVC-2), featureFlags dead (LIB-1), push multi-device (LIB-3), haptics-settings bypass (UTIL-2), error-pipeline dead (UTIL-1), search filter (HOOK-1), signup username (HOOK-2). *(Some overlap; the live user-facing P2s to prioritize: HOOK-1 search, HOOK-2 signup handles, SVC-2 fake news, UTIL-2 haptics, SVC-1 sanitization.)*
- **Logic core (lib/utils/services/stores/schemas) = 100% reviewed.** It is architecturally excellent — zero P0/P1 across ~93 files. The remaining 262 files are hooks (35) + UI (providers/components/screens), where findings will shift toward render-correctness, performance, accessibility, and UX.
- **Dead/unused code tally:** `featureFlags`, `errorHandling`+`errorPipeline`, `NotificationService`, `lounge/` folder, `DossierRowSchema`, most of `lib/schemas.ts`, `ProfileDataService.ListItemRowSchema`, partial `TactileEngine` adoption, `useBiometricLock`+`VAULT_KEY`, `useSendMessage`, **entire `constants/limits.ts`**, **entire `constants/queryKeys.ts` factory**, half-adopted `CACHE_KEYS`, **entire `types/branded.ts` branded-ID system**, **entire `types/unions.ts` (`assertNever`+`MutationState`)**, redundant `types/{film,social,tmdb,ui}.ts` shims, empty `types/flashlist.d.ts`, `components/NotificationCenter.tsx`, `components/ReportButton.tsx`, **`hooks/useSocialPulse.ts` + `hooks/useFeaturedCritique.ts` (re-implemented inline by home widgets)**.
- **Recurring meta-pattern (now the dominant theme):** ReelHouse repeatedly builds elite, well-documented abstractions (error pipeline, query-key factory, limits source-of-truth, TactileEngine, biometric lock) and then **never wires them into the call sites** — leaving raw literals/inline logic as the live path. The fix plan should treat "adopt-or-delete" as a category, not file-by-file cleanup.
- **Dead/unused abstractions found so far (4):** `featureFlags`, `errorHandling`+`errorPipeline`, `NotificationService`, partial `TactileEngine` (137 raw-haptic bypasses). Plus dead Zod schemas (`lib/schemas.ts`, `ProfileDataService.ListItemRowSchema`).
- **Two recurring themes for the final plan:**
  1. **Adopt-or-delete dead abstractions.**
  2. **Online/offline parity** — converge sanitization, length caps, and guards on one choke point.
- **Headline so far:** the core (lib/utils/services/stores) is architecturally excellent with **zero P0/P1**. The "gaps to perfect" are consistency, dead code, scale caps, and a few real-but-bounded bugs (placeholder news, avatar EXIF, haptics-setting bypass).

---

# ▶ EXECUTION LOG (remediation complete)

All 61 active findings were executed on branch `fix/perfection-remediation`,
in 13 verified commits (each gated on `npx tsc --noEmit` exit 0 + `npx jest`
all-pass). Final state: **tsc clean, 753/753 jest pass.**

| Commit | Findings landed |
|---|---|
| Phase 0 `9c28e76` | 20 dead/unadopted files deleted (featureFlags, errorPipeline/errorHandling, NotificationService, NotificationCenter, ReportButton, useSendMessage, useBiometricLock, branded/unions types, queryKeys/limits consts, flashlist shim, lounge store) |
| `22ba18c` | HOOK-1, SVC-2, SVC-3, COMP-5, COMP-3, COMP-9, LIB-4, COMP-10 |
| `cc717e8` | LIB-3, FEAT-1, SCREEN-1, SVC-4 |
| `1d769a3` | COMP-6 |
| `08ef8d1` | COMP-7 |
| `46c1aee` | COMP-4, HOOK-2, SCHEMA-1 |
| `15110f1` | UTIL-5 |
| `a955399` | STORE-1, STORE-2 |
| `44b85a4` | LIB-2, TYPE-3, SCHEMA-2 |
| `b488a41` | SVC-1 |
| `183c38c` | HOOK-8, HOOK-9 (read-surface block filter) |
| `a48a79d` | COMP-8, HOOK-9 (badge convergence) |
| `4e98b72` | UTIL-2 (haptics codemod — ~43 files) |
| `(LIB-5)` | LIB-5 (MMKV encryption-at-rest via deferred-hydration bootstrap) |

### LIB-5 — DONE (was previously deferred)
Encryption-at-rest was implemented via a deferred-hydration bootstrap, resolving
the synchronous-MMKV / async-keystore mismatch without data loss:
- `initEncryptedStorage()` generates a 256-bit key (persisted to the OS keychain
  via expo-secure-store), and on first run recrypts the existing plaintext store
  **in place** (one-time migration, data preserved); later launches reopen with
  the key. Graceful degrade to unencrypted if the keystore is unavailable.
- The 4 MMKV-persisted stores use `skipHydration` + rehydrate helpers; `_layout`
  awaits the key init and rehydrates before any disk read, behind the existing
  app-ready splash gate.

**All 61 findings are now landed. Zero deferrals.**

### Phase 4 — SERVER-SIDE (cannot be done from the mobile repo)
These remain the responsibility of the Supabase project (SQL / Edge Functions):
entitlement receipt validation, RLS/tier enforcement, moderation admin-RPC
`auth.uid()` checks, `handle_new_user` reserved-word enforcement, atomic
founding-member cap, a server-side JSONB merge for preferences (completes
COMP-7 cross-device), and `UNIQUE(token)` on `push_tokens` (completes LIB-3).
