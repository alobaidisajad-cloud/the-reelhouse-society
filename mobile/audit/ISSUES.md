# ISSUES — Aggregated (audit in progress: 96/432 files)

Flat, sortable list of every REAL issue found so far. Severity · file:line · description · fix.
Coverage to date: `src/types`, `src/constants`, `src/theme`, `src/schemas`, `src/lib`, `src/utils`, `src/services` (complete); `src/stores` (5/21). Everything below is verified against current code.

## CRITICAL
| ID | file:line | Issue | Fix |
|----|-----------|-------|-----|
| COMP-LOG-1 ✅FIXED | src/components/log/LogForm.tsx (status:138,rating:172,review:246,…) · src/hooks/useLogFlow.ts:409-418 · app/(modals)/log-modal.tsx:78 | **Film-logging form core fields are no-ops.** LogForm sent all field updates via `flow.dispatch({type:'SET_FIELD',field,value})`, but `useLogFlow.dispatch` only handled 6 premium fields (no default) → status/rating/review/date/etc. silently dropped. `validateLogSubmission` then blocked submit → **a user could not log a watched film.** Incomplete refactor (setters existed & worked; LogForm never migrated). | **FIXED** (commit 4f6df68) on `fix/log-form-core-fields`: migrated all 16 dispatch sites to typed setters, deleted 7 dead wrapper callbacks, **removed the dispatch shim** (reuse is now a compile error). Added LogForm.fields.test.tsx regression test. tsc/eslint/full-suite green. **Pending on-device check.** |

## HIGH
| ID | file:line | Issue | Fix |
|----|-----------|-------|-----|
| TYPES-1 ✅FIXED | src/types/flash-list.d.ts:18 · app/lounge/[id].tsx:507 · src/stores/lounge.ts:302,327 | **`inverted` is a no-op in FlashList 2.0.2** (verified in installed pkg); lounge chat removed its manual `.reverse()` relying on it and has no fallback scroll positioning → chat opened at the oldest message; `onEndReached` fired at the wrong end vs `loadMoreMessages` (loads older→prepends top); author/time grouping used `index+1` (newer). NOTE: `keyboardShouldPersistTaps`/`keyboardDismissMode` are NOT no-ops (inherited from ScrollViewProps in v2) — only `inverted`/`estimatedItemSize` are dead. | **FIXED** on `fix/lounge-flashlist-v2-chat-ordering`: `maintainVisibleContentPosition:{startRenderingFromBottom,autoscrollToBottomThreshold}` + `onStartReached` + grouping `index-1`. tsc/eslint clean. Pending on-device check; `.d.ts` cleanup deferred. |

## MEDIUM
| ID | file:line | Issue | Fix |
|----|-----------|-------|-----|
| LIB-1 ✅FIXED | src/lib/revenueCat.ts:182-201 · app/(modals)/membership.tsx:105,163 | `purchaseTier` matched RC **package** identifier by substring (`<tier>_annual`/`<tier>`); RC package defaults are `$rc_annual` etc. Live purchases may always throw "No package found". | **FIXED** (commit 7e1753e): match on `pkg.product.identifier`/`packageType` via pure exported `selectPackageForTier`; collect across all offerings (topology-agnostic); legacy package-id match kept as final fallback. 7-test suite green. **Caveat: RC dashboard must still have the products configured.** |
| LIB-2 ✅FIXED | src/lib/revenueCat.ts:51-71 | RevenueCat init/config failures log only via `__DEV__` console → invisible in production (disables all monetization silently). | **FIXED** (commit 338ca14): init paths routed through `logger` (forwards to Sentry) — missing key → warn, failure → error (stack preserved), success → info. |
| OFFQ-1 ✅FIXED | src/utils/offlineQueue.ts:280-307 · src/utils/networkError.ts:13-29 | Transient 500/429/408 fall through to dead-letter (only 502/503/504 are "network") → silent permanent loss of queued offline writes. | **FIXED** (commit 6620dd0): added `isTransientError` + bounded per-mutation `_retryCount` (envelope) — transient failures halt-and-retry up to 5 flushes, then dead-letter. Unit + 4 integration tests; full suite green. |
| SVC-1 | src/services/StackService.ts:166-171 · src/utils/mutationExecutor.ts:333-339 | List-comment notification has two divergent row shapes online (`type:'comment'`, `message`/`metadata`) vs offline (`type:'list_comment'`, `actor_id`/`reference_id`/`entity_id`). Canonical shape (per notificationStore) is `{type,message,from_username,film_id,poster_path}` — offline path omits `message`. | Single canonical shape in both paths (shared helper / RPC). |
| NOTIF-1 | src/stores/notificationStore.ts:103-107,161-165 | Fetch uses all-or-nothing `z.array(schema).safeParse`; one invalid row (e.g. offline list-comment notif with null `message`, which is non-nullable in schema) discards the ENTIRE page → blank notifications screen. Contradicts per-row salvage used everywhere else. | Per-row salvage (drop invalid, keep rest); make `message` `.nullish()` w/ default; fix SVC-1 shape. |
| COMP-1 | src/components/feed/DossierCritiquePanel.tsx:105 · app/dossier/[id].tsx:181 · ArticleReaderModal · ProfileTriptych:246 · ProgrammesSection:136 | Dossier comments + profile prefs use raw `supabase` writes in components, bypassing `DossierService`/`auth.setPreference`: online path skips `sanitizeInput` (offline path sanitizes — inconsistent) + Zod, duplicates offline-queue logic. | Route through service/store layer; put `sanitizeInput` in the service so both paths share it. |
| FOUND-1 ✅RESOLVED IN CODE | app/(modals)/membership.tsx:149-158 | 100-Founding-seat cap checked client-side (count → purchase) = TOCTOU race; two concurrent buyers can both pass. | **RESOLVED IN CODE** (no change needed): atomic row-locked `claim_founding_seat` RPC (migration 20260620) + `sync-entitlement` edge function calls it for founding; mobile `sync_entitlement` handler routes only through that function (never writes `is_founding`). Client count check is now a pre-flight UX guard. **Action: deploy migration + edge function.** |
| TYPES-3 | src/types/film.types.ts:9-66 · profile.types.ts:5-51 | Fragmented near-duplicate log/vault shapes; `autopsy:any`/`viewingHistory:any[]` defeat strict mode; pervasive snake/camel aliases. | Converge on `DomainLog`; derive others via Pick/Omit; type the `any`s; confine snake_case to row types. |
| TYPES-4 | src/types/react-native-purchases.d.ts:9-12 · src/lib/revenueCat.ts:44 | Stale stub types the installed SDK's default export as `unknown`; `Purchases:any` makes the entire payments layer uncompiled. | Delete stub; type handle as `typeof import('react-native-purchases').default`. |

| HOOK-1 | src/hooks/useReportUser.ts:15 · src/components/home/PulseCardItem.tsx:77 vs src/services/ModerationService.ts:4-17 | Home-feed report writes to `user_reports`; the Tribunal reads `reports` (via submit_report RPC). Reports from pulse cards may never reach moderators. | Route PulseCardItem report through `reportStore.submitReport` (same path as ReportSheet), or confirm server-side table unification. |
| COMP-SPOILER-1 | src/components/log/LogForm.tsx:248 · src/components/feed/ReviewContent.tsx · src/components/log/LogReviewBody.tsx · app/log/[id].tsx:186 · feed.schema.ts | **"CONTAINS SPOILERS" toggle does nothing.** `is_spoiler` is collected + persisted + read into the domain model (`mappers.ts:198`) but **no UI ever branches on it** — review text marked as spoiler renders unguarded in the feed and on the log page. Decorative control → trust gap. | Consume `isSpoiler` on display: blur/tap-to-reveal in `LogReviewBody`; add `is_spoiler` to `feed.schema` + `ReviewContent` for a feed spoiler veil. |

## LOW
| ID | file:line | Issue | Fix |
|----|-----------|-------|-----|
| TYPES-2 | src/types/mutations.ts:81-82 | `submit_report` inlines moderation enums instead of importing `ReportableContentType`/`ReportReason`; drift risk. | Import the shared z.enums. |
| SCHEMA-4b | src/schemas/profile.ts:20 · src/hooks/useEditProfile.ts:15-20 | Exported `EditProfileSchema` is dead (its documented consumer redefines it inline, dropping the `max(10)` links cap). | Import the shared schema in useEditProfile. |
| HOOK-2 | src/providers/AccessibilityProvider.ts:20-41 | Monkey-patches RN `Text.render`/`TextInput.render` (upgrade-fragile, has fallback). | Pin RN version in a comment + smoke test. |
| SCHEMA-1 | src/schemas/profile.ts:17,21-24 | `EditProfileSchema` username regex looser than `validateUsername` (accepts `_x`/`x_`/`x__y`); doc says "3-20" but code is max(30). | Use `superRefine(validateUsername)`; fix comment. |
| SCHEMA-2 | src/schemas/settings.ts:11-12 · user.ts:14-15 | Privacy enums not enforced in persisted `UserPreferencesSchema` (bare `z.string()`). | Share the `z.enum` across both. |
| SCHEMA-3 | src/schemas/feed.schema.ts:40,75,109 · user.ts:22-23 | `z.any()` for JSONB leaks `any`. | Use `z.unknown()` or concrete shapes. |
| SCHEMA-4 | src/schemas/film.schema.ts:6-63 · profile.ts/profile.schema.ts | `DomainLogSchema` hand-mirrors the interface (drift); confusing two-file profile schema split. | Derive type from schema via `z.infer`; consolidate/rename profile schema files. |
| CONST-1 | src/theme/theme.ts:23-27 | "Derived" sepia rgba uses a different hue (196,150,26) than base `sepia` (#B8891A). | Derive from base channels or rename. |
| CONST-2 | src/constants/index.ts:7-9 | Barrel omits `formats`/`textScaling` despite "all constants" claim. | Add exports or soften doc. |
| CONST-3 | src/constants/membership.ts:28-30,56-57 | Hardcoded USD prices risk drift from StoreKit localized pricing. | Source displayed price from RC offering's `priceString`. |
| LIB-3 | src/lib/defensiveParse.ts:8-12 | Header says "PROD returns raw data"; code throws. | Update header. |
| LIB-4 | ARCHITECTURE.md · (no file) | Documents non-existent `src/lib/featureFlags.ts`. | Remove doc section or restore impl. |
| LIB-5 | src/lib/schemas.ts:15 | `TmdbIdSchema` duplicates id coercion. | Share one coercer. |
| OFFQ-2 | src/utils/offlineQueue.ts:42-48 | `_queueUserId` write-only dead state; misleading "user-scoped" comment. | Remove or wire up; fix comment. |
| UTIL-1 | src/utils/mutationExecutor.ts:734-735 | Fixed 100ms delay before every mutation → ~10s for a full queue. | Yield every N, or smaller delay. |
| UTIL-2 | src/utils/withTimeout.ts:39-46 | External AbortError reported as "timed out". | Distinguish timeout signal from external abort. |
| UTIL-3 | src/utils/timeAgo.ts:24 | Drops year for dates >30 days (ambiguous old dates). | Include year past ~1yr. |
| UTIL-4 | src/utils/AppError.ts:162 | Generic "database error saving new user" mapped to "Username taken". | Only map on 23505 username unique-violation. |
| SVC-2 | src/services/ProfileDataService.ts:413,457 · FilmService.ts:72 · ProfileWriteService.ts:203,228 | Inconsistent cursor sanitization: raw `cursorDate` interpolated into `.or()` (RLS-contained but a known injection surface; `FeedService.parseCursor` is the fix). | Route all cursors through `parseCursor`-style ISO/UUID shape validation. |
| SVC-3 | src/services/NewsService.ts:50-55 | Local `decodeEntities` weaker than `utils/html.ts`. | Import shared decoder. |
| STORE-1 | src/stores/auth.ts:249-256 | Logout skips MMKV purge on web → stale auth/cross-user data on shared browser (MEDIUM if web ships). | Clear MMKV on web too, or drop web support. |
| STORE-2 | src/stores/auth.ts:57-125 | `restoreSession` leaves optimistic `isAuthenticated:true` if no session found (relies on a separate listener to correct). | Clear auth state in the no-session branch. |

## Needs server verification (not client defects)
- `tier.ts` client entitlement gating — ensure paid features are server-enforced (RLS/edge), not only client tier checks.
- Cross-user `notifications` inserts (StackService + mutationExecutor) — confirm RLS constrains them (spam vector).
- FeedService community-feed direct fallback can't filter blocks server-side — deploy `get_community_feed_auth_cursor`.
