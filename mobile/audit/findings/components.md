# Findings — `src/components/*` (IN PROGRESS)

Read in full so far: `ErrorBoundary`, `SectionErrorBoundary`, `AuthGuard`, `ControlledInput`, `moderation/ReportSheet`, `film/TrailerModal`, `feed/DossierCritiquePanel` (comment logic). Plus a **systematic pattern sweep across all of `app/` + `src/components`** for the bug classes found elsewhere (direct DB writes, raw `.or()/.ilike()` interpolation, WebView/XSS, dead FlashList props).

## Sweep results (covers all 162 components + 44 screens at the pattern level)
- **Raw `.or()/.ilike()` template interpolation in UI:** none (the cursor/search injection surface stays contained to the services flagged in SVC-2). ✓
- **WebView/eval/dangerouslySetInnerHTML:** only `film/TrailerModal.tsx` (YouTube embed, scoped). ✓
- **Dead FlashList `inverted`:** only the lounge (TYPES-1, fixed). ✓
- **Direct DB writes bypassing the store/service layer:** 13 call sites across 6 files (dossier comments, dossier views/certify, profile preferences). See COMP-1.

---

## CRITICAL

### COMP-LOG-1 (CRITICAL / P0) — ✅ FIXED (commit 4f6df68) — The film-logging form's core fields were no-ops; a user could not set rating/review/status → could not log a film

**RESOLUTION:** Migrated all 16 `dispatch` call sites in `LogForm.tsx` to the typed setters `useLogFlow` already returned (`setStatus`/`setRating`/`setReview`/…), deleted the 7 dead wrapper `useCallback`s, and **removed the `dispatch` shim entirely** from `useLogFlow` — so any future reuse is now a compile error (the type system guards the bug class). Added `src/components/log/__tests__/LogForm.fields.test.tsx`, which renders the real `LogForm` with a real `useLogFlow` and asserts that typing a review and tapping the rating actually update state (both were no-ops on the broken path). Verified: `tsc` exit 0, eslint 0 errors, full Jest suite green + new regression test green. Chose option (a) over (b) — type-safe, removes the foot-gun permanently, reuses the proven-working setters. **Still warrants on-device confirmation.**

_Original analysis below (retained for the record):_
**Files:** `src/components/log/LogForm.tsx` (status `:138`, rating `:172`, review `:246`, date `:200-211`, watchedWith `:217`, abandonedReason `:154`, isSpoiler `:248`, physicalMedia `:292`, privateNotes `:311`, moreOpen `:182`, showDeleteConfirm `:68`) vs `src/hooks/useLogFlow.ts:409-418`; rendered by `app/(modals)/log-modal.tsx:78`.

`LogForm` updates **every** field by calling `flow.dispatch({ type: 'SET_FIELD', field, value })` (and `{ type: 'HYDRATE', payload }` for dates). But `useLogFlow.dispatch` is a "mock dispatch for backwards compatibility with flattened state" whose `switch(action.field)` handles **only 6 premium fields** — `dropCap`, `pullQuote`, `editorialHeader`, `autopsyOpen`, `isAutopsied`, `autopsy` — and has **no default case**. Therefore status, rating, review, date, watchedWith, abandonedReason, isSpoiler, physicalMedia, privateNotes, `moreOpen`, and `showDeleteConfirm` updates are **silently dropped**.

Consequences (static, high-confidence):
- Selecting a status, setting a rating, or typing a review does nothing (state stays at defaults `status='watched'`, `rating=0`, `review=''`).
- `validateLogSubmission` (`useLogFlow.ts:54-67`) blocks submit when `status!=='abandoned' && rating===0 && !review.trim()` → **a user can never log a watched film**.
- The "More Details" section can't even be expanded (`moreOpen` no-op); the in-form delete confirm can't open.
- Draft autosave (keyed on `review`/`rating`) never fires; `hasUnsavedChanges` is always false.

This is an **incomplete refactor**: `useLogFlow` was flattened to `useState` + individual setters (`setStatus`, `setRating`, `setReview`, … — all returned by the hook and working), and a partial `dispatch` shim was added that only covers the premium fields, but `LogForm` was never migrated off `dispatch`.
**Why P0:** logging a film is the app's primary action; if shipped as-is it is fundamentally broken on the main path.

**VERIFIED (runtime, not just static):** A `renderHook`-style harness invoking the exact `LogForm` calls produced:
`AFTER DISPATCH: r=0|rev=|st=watched` (dispatch = no-op) vs `AFTER SETTERS: r=4|rev=Via setter.|st=rewatched` (setters work). Also confirmed: CI runs only Jest unit tests (no Maestro e2e), and no unit test exercises the dispatch→state wiring — only the pure functions (`buildLogPayload`/`validateLogSubmission`). The `log_film_flow.yaml` e2e that "covers" this path is never executed in CI. (`setAltPoster` — the Auteur alt-poster picker — is also broken for the same reason.)
**Fix:** Either (a) migrate `LogForm` to call the returned setters (`flow.setStatus(...)`, `flow.setRating(...)`, etc. — they already exist and work), or (b) make the `dispatch` shim handle all `SET_FIELD` fields and the `HYDRATE` action (route every `action.field` to its setter, and `HYDRATE` to `setDate`/`setCalendarOpen`). Option (a) is cleaner; the shim should then be removed.

---

## MEDIUM

### COMP-SPOILER-1 (MEDIUM) — The "CONTAINS SPOILERS" toggle does nothing: `is_spoiler` is collected & persisted but never consumed by any UI
**Files (input/persist, all working):** `src/components/log/LogForm.tsx:248` (checkbox → `setIsSpoiler`), `src/hooks/useLogFlow.ts`, `src/utils/mappers.ts:180,186,198,233` (`is_spoiler` in `LOG_SELECT_COLUMNS`/`PUBLIC_LOG_COLUMNS`, mapped to domain `isSpoiler`), `src/services/LogService.ts:62`, `src/stores/domain/logSlice/helpers/logOperations.ts:251,319,608`, `app/log/[id].tsx:67,186`.
**The gap:** A full-text grep for `is_spoiler`/`isSpoiler`/`spoiler` across `src/` + `app/` shows the flag is written everywhere and **read into the domain model**, but **no rendering component ever branches on it**. The feed card (`ReviewContent.tsx`) doesn't receive it (not in its `Pick<FeedItem>`, and `feed.schema` omits it entirely). The log-detail review (`LogReviewBody.tsx`) has no `isSpoiler` prop. `app/log/[id].tsx:186` only copies the value into a local object — never blurs/hides/warns. So the review text of a film a user explicitly marked "CONTAINS SPOILERS" renders **unguarded** in the feed and on the log page.
**Why it matters:** In a film-review community this is a visible, broken trust feature — the control exists in the compose UI (creating a user expectation of protection) but is purely decorative. Not a crash/security issue; a product-completeness + trust gap.
**Fix:** Consume `isSpoiler` on the display side — e.g. blur/tap-to-reveal the review body in `LogReviewBody` (log detail) and add `is_spoiler` to `feed.schema` + `ReviewContent` for a spoiler veil in the feed. (Reader-side reveal state only; the data already flows through.)

### COMP-1 (MEDIUM) — Online comment writes (log, stack, dossier) skip `sanitizeInput` while offline writes sanitize; dossier comments also bypass the service layer; preference writes overwrite instead of merge

**Broadened scope (verified across the comment paths):** Every **online** comment write bypasses the `sanitizeInput` choke point that the **offline** `mutationExecutor` applies:
- Log comments: `LogService.addLogComment` (`services/LogService.ts:192-205`) validates with Zod but does **not** `sanitizeInput`; offline `mutationExecutor.add_log_comment` does.
- Stack comments: `StackService.addStackComment` (`services/StackService.ts:143-188`) — same gap.
- Dossier comments: `DossierCritiquePanel`/`app/dossier/[id].tsx` write `supabase.from('dossier_comments')` **directly** (bypassing `DossierService` entirely) and don't sanitize; offline `add_dossier_comment` does.

So zero-width/control characters from any comment enter the DB unsanitized on the online path, inconsistent with the offline path and with every other write (logs, dossier *content* via `content` store, lounge messages — those all sanitize). **Cleanest fix: move `sanitizeInput` into the service methods** (`LogService`/`StackService`/`DossierService`), so online and offline share one choke point; and route the dossier-comment UI through `DossierService` instead of raw `supabase`.

(Dossier *content* creation/edit via `compose.tsx` → `content` store `addDossier` IS sanitized — fine. The admin `/tribunal` route IS gated by `role==='admin'` — fine.)

---

### COMP-1-orig — Dossier interactions bypass `DossierService`/`content` store: online writes skip `sanitizeInput` + Zod, and duplicate offline-queue logic inline
**Files:** `src/components/feed/DossierCritiquePanel.tsx:105,148,181`, `app/dossier/[id].tsx:181,226,266,93`, `src/components/dispatch/ArticleReaderModal.tsx:98,143`, `src/components/profile/ProfileTriptych.tsx:246,270`, `src/components/profile/ProgrammesSection.tsx:136`

Dossier comment create/edit/delete is implemented with **raw `supabase.from('dossier_comments')` calls directly in the components**, not through `DossierService.addComment/updateComment/deleteComment` (which exist and are Zod-validated + audited). The component path does include optimistic update + rollback + offline-queue fallback + `.eq('user_id')` ownership filter (good), but:
- It **does not run the comment `body` through `sanitizeInput`**, while the *offline* executor (`mutationExecutor.add_dossier_comment`) **does** — so an online comment is stored unsanitized while the same comment queued offline is sanitized. Inconsistent, and bypasses the mutation-layer sanitization choke point.
- It **bypasses `DossierService`'s `CommentPayloadSchema` Zod validation**.
- It re-implements offline-queue plumbing that the service/store layer already encapsulates → duplication and drift risk (e.g., `app/dossier/[id].tsx` and `DossierCritiquePanel` are parallel implementations of the same feature).
Similarly, `ProfileTriptych`/`ProgrammesSection` write preferences with optimistic+rollback+offline (good) but **double-write**: `updateUser({preferences})` overwrites the *entire* `profiles.preferences` column via `ProfileService.updateProfile` (a full-blob `update`, **no merge**), *and then* a separate `update_my_preferences` RPC merges one key. The full-blob overwrite bypasses the server-side JSONB merge that `auth.setPreference` uses, so a concurrent cross-device change to a *different* preference key can be clobbered. Root cause: two preference-write paths exist — `auth.setPreference` (RPC merge, cross-device-safe) vs `auth.updateUser`/`ProfileService` (full-column overwrite). `SettingsScreen` also writes preferences via the overwrite path.
**Why it matters:** the app's safety guarantees (sanitization, validation, single-source offline handling) live in the service/store layer; every component that writes around them is a place those guarantees silently don't apply.
**Fix:** Route dossier comment writes through `DossierService` (add `sanitizeInput` inside the service so both online and offline paths share it), and route preference writes through `auth.setPreference`. Delete the duplicated inline DB logic.

---

## LOW

### COMP-2 (LOW) — `TrailerModal` WebView `originWhitelist` is broader than necessary
**File:** `src/components/film/TrailerModal.tsx:64`
`originWhitelist={['https://*']}` allows any HTTPS origin; the `onShouldStartLoadWithRequest` handler (`:65-69`) correctly narrows navigations to youtube.com/google.com, so this is defense-in-depth only. Tightening the whitelist to the YouTube/Google origins removes the reliance on the request handler alone. `videoId` is interpolated into the embed URL but originates from TMDB (trusted, alphanumeric keys).
**Fix:** `originWhitelist={['https://www.youtube.com', 'https://www.google.com']}`.

---

## `log/` directory — FULLY LINE-READ (post-COMP-LOG-1), confirmed clean
All 10 files read in full: `LogForm` (fixed), `AuteurToolkit`, `EditorialDesk`, `LogActionDeck`, `LogComments`, `LogChronicle`, `LogHero`, `LogReviewBody`, `LogSearchEngine`, `LogModalStyles` (pure styles).
- **AuteurToolkit/EditorialDesk** — confirm the COMP-LOG-1 fix wiring end-to-end: they call `setAltPoster`/`setAutopsy`/`setDropCap`/etc., which now resolve to the working setters (`setAltPoster` was the one silently broken pre-fix; premium fields worked via the old shim and still work).
- **LogSearchEngine** — elite: debounced (400ms) TMDB search with a generation counter discarding stale responses + `isMounted` guard + timeout cleanup. No injection (TMDB params encoded; trusted API).
- **LogChronicle** — defensively parses `viewing_history` as array-or-JSON-string (try/catch), UTC date display, memoized card w/ custom comparator.
- **LogReviewBody** — `privateNotes` client-gated by `isOwner`, but real protection is server-side (`private_notes` excluded from `PUBLIC_LOG_COLUMNS`). `stripHTML` on review.
- **Trivial nits (cosmetic, not bugs):** dead `TactileEngine` import in AuteurToolkit/EditorialDesk (already eslint-disabled); harmless dead `estimatedItemSize` prop on FlashList v2 (AuteurToolkit/EditorialDesk/LogSearchEngine); LogActionDeck's `autopsy` type lists 9 axes vs `AUTOPSY_INIT`'s 6 (permissive, not a bug).

## `feed/` directory — FULLY LINE-READ, confirmed clean (1 new finding + 1 dead file)
All 8 files read: `ActivityCard`, `ActionDeck`, `ReviewContent`, `AutopsyView`, `PosterFrame`, `UserAttributionRow`, `EditorialBanner`, `DossierCritiquePanel` (COMP-1, prior).
- **ActivityCard** — elite: memoized subcomponents for FlashList recycling, UI-thread parallax via Reanimated `measure` (correctly touches `parentScrollY.value` to force reactivity), Zod `FeedItem` as type source, clamped `getTimeAgo`.
- **ActionDeck** — elite: per-component granular Zustand selectors, view-recycling animation-bleed reset on `itemId` change, auth guards on every action, optimistic endorse (store rollback), 500ms double-fire debounce, tier-gated lounge (server-enforced).
- **AutopsyView** — resolves the 9-vs-6 axis question: intentional backward-compat mapping of legacy `screenplay`/`direction`/`pacing` onto the 6 canonical display axes.
- **PosterFrame** — correct `recyclingKey` + `sharedTransitionTag` for recycled expo-image.
- **New finding: COMP-SPOILER-1** (above) — `is_spoiler` never consumed in UI.
- **COMP-FEED-DEAD-1 (LOW):** `src/components/feed/EditorialBanner.tsx` is **dead code** — imported by no file (ActivityCard uses its own inline `ActivityEditorialHeader`; the `EditorialBanner` in `home/PulseCardItem.tsx:27` is a separate local component). Candidate for deletion. Also minor: `ReviewContent.tsx:33-37` re-implements HTML-strip inline instead of `utils/text.stripHTML` (perf-motivated per comment; harmless dup).

## `home/` directory — FULLY LINE-READ (9 files), clean
- **PulseCardItem** — confirms **HOOK-1** still live (reports via `useReportUser` → `user_reports`, line 104). Another **COMP-SPOILER-1** surface (renders `truncReview` unguarded). 3rd inline `stripHTML` re-impl. Otherwise clean (MuseumBreather cancels animation on blur, careful unicode drop-cap).
- **SocialPulse** — elite cover-flow physics, React Query w/ staleTime, `filterContentByBlocks` (HOOK-8), defensive profiles-join shape; query omits `is_spoiler` (reconfirms COMP-SPOILER-1).
- **MarqueeBoard** — elite: `useReducedMotion()` a11y across all animated children, stable JS-thread haptic wrapper (documented `this`-binding pitfall), `isMounted`-guarded count query, full animation cleanup.
- **FeaturedCritique** — `get_featured_critique` RPC + `filterContentByBlocks` (HOOK-8). **FilmStripRow/FilmTicker/MarqueeBulb/ProjectorBeam/VelvetRopeCTA** — clean decorative; ProjectorBeam GPU-culls when scrolled past hero. **types.ts** — `timeAgo` null/NaN-safe (3rd timeAgo variant in codebase — minor dup, not a bug).
- _Stale/over-applied eslint-disable directives on used imports in FeaturedCritique (cosmetic)._

## Top-level `src/components/*` (29 files) — FULLY LINE-READ, clean
Deep-read: ShareToLoungeModal (store-routed writes, Android-OOM delayed unmount), NitrateCalendar (correct local-date ISO-week math, no off-by-one), PressableScale (debounced onPress but press-in haptic always fires; 44×44 hitSlop), PaywallModal (TIERS SSOT), QuickActionsFAB (tab-height via Context w/ fallback), ToastOverlay (queue cap 5, race-safe removal, a11y live region), OfflineBanner (NetInfo elapsed, interval cleanup), AutopsyGauge (consistent backward-compat axis mapping), Preloader (first-launch MMKV, FAST_PATH, full cleanup), OnboardingModal, WeeklyChallenge (epoch-week rotation), HapticTab (elite a11y: press-in for touch, onPress fallback for VoiceOver/keyboard), EmptyStates, Buster (time-of-day mood), SkeletonPulse/SkeletonShimmer/ContentSkeleton, FilmGrainOverlay (Skia GPU shader, AppState-pause, reduce-motion), RatingLegend, HandbookModal, FilmGrain, CinematicOverlays, MasterLogo (@ts-nocheck pure SVG), ReelEyeIcon. AuthGuard/ControlledInput/ErrorBoundary/SectionErrorBoundary/Decorative previously confirmed elite.
- **No new findings.** Uniformly high quality: reduce-motion a11y, animation cleanup, view-recycling resets, store-routed writes throughout. Minor: ReviewContent/PulseCardItem inline-`stripHTML` dup (×3 total); possible Skia/Reanimated uniform interop in FilmGrainOverlay (cosmetic, needs device check).

## Confirmed elite (no action)
- `ErrorBoundary` — capped retry + stability-window reset + `queryClient.clear` + corrupt-router fallback + Sentry capture.
- `SectionErrorBoundary` — section-scoped recovery with inactive-query purge.
- `AuthGuard` — loading skeleton + zero-frame-flash `Redirect`.
- `ControlledInput` family — memoized O(1) re-render isolation, inline username charset sanitize matching `validateUsername`.
- `moderation/ReportSheet` — routes through `reportStore.submitReport` (the canonical Tribunal/`reports` path), enum-driven chips (single source of truth), "other"-reason validation, gesture dismiss, proper modal lifecycle. (This is the *correct* report path; HOOK-1 is specifically the `PulseCardItem` legacy path.)
- `film/TrailerModal` — YouTube-only navigation guard, JS-injection pause on close, inline playback config (originWhitelist nit aside).

---

## Still PENDING (not yet line-read; pattern-swept only)
~150 component files across `feed`, `film`, `home`, `lounge`, `profile`, `darkroom`, `dispatch`, `log`, `person`, `reels`, `layout`, `theme`, `ui`, and ~22 top-level components. The systemic sweeps above (injection, direct-writes, WebView, FlashList) cover them at the pattern level; full line-level reads remain for a continued pass.
