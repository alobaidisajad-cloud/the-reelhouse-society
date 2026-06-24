# Findings — `src/stores/*` (COMPLETE — 21 of 21 files audited)

All store files read in full, including the domain slices, `logOperations.ts` (799), `lounge.ts` (908), `content.ts`, `notificationStore.ts`, and the composite `films.ts` store.

Overall (so far): **elite.** Encryption-at-rest with deferred hydration, comprehensive logout cleanup, per-target FIFO mutex on endorsements, optimistic-update-with-rollback everywhere, block-supersedes-mute invariant, generation-guarded inflight fetch (content.ts), online/offline 23505 rewatch-merge parity (logOperations.ts). One MEDIUM (NOTIF-1) found; rest LOW.

---

## MEDIUM

### NOTIF-1 (MEDIUM) — Notifications fetch is all-or-nothing; one invalid row blanks the whole screen (amplifies SVC-1)
**File:** `src/stores/notificationStore.ts:103-107,161-165` (schema `:19-33`)

`fetchNotifications` and `loadMoreNotifications` validate the page with `z.array(RealtimeNotifSchema).safeParse(data)` and **`return` (discard the entire page) if any single row fails**. `RealtimeNotifSchema.message` is `z.string()` — **non-nullable, no default**. So a single notification row with a null/missing `message` makes the *whole* notifications list fail to render (falls back to stale MMKV cache or empty). The Realtime INSERT path correctly discards per-row (`:355-359`), but the batch fetch does not — and this contradicts the per-row salvage pattern used everywhere else (`parseDossierRows`, `parseRowsSafely`, `validateWithTelemetry`).
**Concrete trigger:** SVC-1 — the offline `add_list_comment` handler inserts a notification with **no `message`** (and non-canonical columns `actor_id`/`reference_id`/`entity_id`). If `notifications.message` is nullable in the DB, that row will fail `RealtimeNotifSchema` and blank the notifications screen on next fetch. (If the column is NOT NULL, the offline insert instead throws → the whole `add_list_comment` mutation dead-letters — also bad.)
**Fix:** Use per-row salvage in `fetchNotifications`/`loadMoreNotifications` (drop invalid rows, keep the rest, report count) like the rest of the codebase; and make `message` `.nullish()` with a sensible default. Then fix the offline notification shape (SVC-1) to the canonical `{ type, message, from_username, film_id, poster_path }`.

---

## LOW

### STORE-1 (LOW, conditional MEDIUM if web ships) — Logout skips MMKV cache purge on web → stale auth / cross-user data on shared browsers
**File:** `src/stores/auth.ts:249-256`

Logout steps 1–7 (Supabase signOut, `resetAllStores`, RevenueCat logout, Sentry clear, `queryClient.clear`, push-token removal) run on all platforms, but step 8 (deleting `ironvault_user_cache_*`, `last_user_id`, `REELHOUSE_QUERY_CACHE`, offline-mutations, feed cache from MMKV) is gated behind `Platform.OS !== 'web'`. On web, `restoreSession` (`:61-69`) reads `ironvault_user_cache_*` and optimistically sets `isAuthenticated: true` from it before the session check — so on a shared browser the next visitor can briefly see the previous user's cached profile/data.
**Why conditional:** only matters if web is a shipping target (the app is Expo mobile-first; `react-dom` is present). If web is dev-only, this is LOW. If web ships, it's a cross-user data exposure → MEDIUM.
**Fix:** Clear the MMKV keys on web too (MMKV's web backend supports `delete`), or document web as unsupported.

### STORE-2 (LOW) — `restoreSession` doesn't clear its optimistic auth state when no session is found
**File:** `src/stores/auth.ts:57-125`

`restoreSession` sets `{ user: cachedUser, isAuthenticated: true }` from MMKV (`:68`) for instant startup, then checks `getSession()`. If there's a valid session it proceeds; but if `getSession()` returns **no** session, it falls through to `set({ loading: false })` (`:124`) **without** clearing the optimistically-set authenticated state. This relies entirely on the global `SIGNED_OUT` listener in `AppBootstrapper.tsx:142-146` to call `logout()` and correct it — which it does for token-expiry, so in practice it self-heals. But the function is not self-consistent in isolation: a cold start with a locally-present cache but no/invalid session leaves a brief zombie-authenticated window.
**Fix:** In the no-session path, if the optimistic cache was applied, `set({ user: null, isAuthenticated: false })` (or call `logout()`), so correctness doesn't depend on a separate listener's timing.

---

## Confirmed elite (no action)
- `mmkv-storage.ts` — encryption-at-rest via SecureStore key + one-time recrypt migration + graceful degradation; deferred (InteractionManager + 1.5s fallback) serialization to protect the frame budget; critical auth data written synchronously (not deferred).
- `resetAllStores.ts` — inverted-dependency registry, `Promise.allSettled` so one handler's failure doesn't block others.
- `auth.ts` — role-stripping on `updateUser` (no client privilege escalation), comprehensive 10-step logout (cross-user leakage defense), optimistic+rollback + dirty-flag reconciliation for prefs/profile, username→email login RPC, background profile enrichment with retry, documented `setLocalTierHint` rationale.
- `domain/interactionSlice.ts` — per-target FIFO mutex with active GC, optimistic+rollback, 23505 idempotency, network→offline-queue routing.
- `blockStore.ts` — block-supersedes-mute invariant, self-block/mute prevention, optimistic+rollback, corruption-safe hydration, query invalidation, `registerStoreReset` wiring.
