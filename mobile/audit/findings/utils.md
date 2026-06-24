# Findings — `src/utils/*`

All 38 source files read in full (resilience core, security cluster, mappers, data/format helpers). Tests not line-audited.

Overall: **the strongest tier in the codebase.** The write path (`offlineQueue.ts` + `mutationExecutor.ts`) is genuinely elite: compile-time exhaustive handler registry, idempotency guards against phantom rewatches, idMap remapping of dependent FKs, upsert-then-prune over destructive delete→insert, session + ban + cross-user-orphan enforcement, concurrency-safe final re-read. Security utilities (`sanitizeInput`, `escapeSearchPattern`, `csv`, `safeOpenURL`) show real adversarial awareness. Findings are one MEDIUM and several LOW; everything else is confirmed elite.

---

## MEDIUM

### OFFQ-1 (MEDIUM) — ✅ FIXED (commit 6620dd0) — Transient server errors (500 / 429 / 408) are dead-lettered as permanent failures → silent loss of offline writes
**RESOLUTION:** Added `isTransientError` (5xx / 429 / 408 / retryable Postgres SQLSTATEs / rate-limit messages) and a **bounded per-mutation retry counter** stored on the `QueuedMutation` envelope (`_retryCount`, off the payload so it never reaches the executor/Supabase or payload schema validation). On a transient failure the flush bumps the counter and **halts to preserve causal ordering** (same philosophy as the network branch), retrying on the next flush; only after `MAX_TRANSIENT_RETRIES` (5) is the mutation dead-lettered — so a brief outage never loses a write while a permanently-failing mutation can't wedge the queue forever. Genuine permanent errors (RLS, schema violations, non-408/429 4xx) still dead-letter immediately. Tests: `isTransientError` unit coverage + 4 integration cases (preserve-on-500, halt-on-429 causal order, exhaust-budget→dead-letter, transient-then-recover). Full suite green (91 suites / 899 tests).

_Original analysis below:_
**Files:** `src/utils/offlineQueue.ts:280-307`, `src/utils/networkError.ts:13-29`

In the flush loop, only `isNetworkError(error)` triggers halt-and-keep (line 292). `isNetworkError` recognizes fetch/network/offline/timeout messages and HTTP **502/503/504** + Postgres connection codes — but **not 500, 429, or 408**. A transient HTTP 500 (server hiccup), 429 (rate limited), or 408 (request timeout status) therefore falls through to the `else` branch (line 302) and is **dead-lettered** — the user's queued offline action (a log, a list edit, a comment) is permanently discarded after a single failed attempt. The offline queue's entire purpose is durability; under server load this silently loses writes.
**Why it matters:** Data loss on the core resilience mechanism, triggered by ordinary transient backend conditions. Especially wrong for 429 (rate limiting is by definition retryable).
**Fix:** Treat 429/408 (and arguably any 5xx) as transient: either add them to `isNetworkError` (so the loop halts and retries on next flush) or, better, add a per-mutation `attempts` counter and retry transient failures a bounded number of times before dead-lettering. Keep the current dead-letter behavior only for genuinely permanent errors (4xx client errors other than 408/429, schema violations).

---

## LOW

### OFFQ-2 (LOW) — `_queueUserId` is write-only dead state; "user-scoped queueing" comment is misleading
**File:** `src/utils/offlineQueue.ts:42-48`
`setQueueUserId` writes `_queueUserId`, but it is **never read** anywhere (grep-confirmed; the only other reference is a Jest mock). The queue uses a single global `QUEUE_KEY` and enforces ownership at flush time via the session check + orphan partition — not via `_queueUserId`. The "User-scoped queueing — prevents mutations from leaking between accounts" comment describes a mechanism that isn't wired up.
**Fix:** Remove `_queueUserId`/`setQueueUserId` (and the auth call site), or actually use it. Correct the comment to point at the flush-time ownership partition.

### UTIL-1 (LOW) — `executeMutation` adds a fixed 100ms delay before every mutation → up to ~10s flush latency
**File:** `src/utils/mutationExecutor.ts:734-735`
A `setTimeout(100ms)` runs before *every* handler. With a full queue (cap 100) that's ~10s of pure artificial delay on top of network time, all while `isFlushing` blocks concurrent flushes. The jank-prevention intent is reasonable but the cost scales linearly.
**Fix:** Yield only every N mutations (e.g. every 5th) or use a smaller delay / `InteractionManager.runAfterInteractions`, so large drains aren't needlessly slow.

### UTIL-2 (LOW) — `withTimeout` reports externally-cancelled requests as "timed out"
**File:** `src/utils/withTimeout.ts:39-46`
It maps both `TimeoutError` and `AbortError` to `AppError('TIMEOUT', 'Request timed out…')`. A request aborted by an *external* signal (e.g. `storeFetchScope` on logout, or a screen-unmount controller composed into `fn`) surfaces as a timeout, producing a misleading "Connection timed out" user message / Sentry breadcrumb instead of a cancellation.
**Fix:** Distinguish the engine's own timeout signal from an external abort (e.g. check `signal.aborted` / use the timeout signal's reason) and emit `NetworkError('ABORTED', …)` for genuine cancellations.

### UTIL-3 (LOW) — `timeAgo` drops the year for dates older than 30 days
**File:** `src/utils/timeAgo.ts:24`
Beyond 30 days it returns `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` with no year, so a log from 2023 and 2025 both render e.g. "JAN 5" — ambiguous on profile/log history.
**Fix:** Include the year once the date is older than ~1 year (or always, for history contexts).

### UTIL-4 (LOW) — `getUserMessage` maps a generic Supabase signup error to a username-specific message
**File:** `src/utils/AppError.ts:162`
`'database error saving new user'` → "Username is already taken." That Postgres trigger failure can occur for reasons unrelated to username uniqueness; users could see a misleading message.
**Fix:** Only claim "username taken" on an actual unique-violation (23505) on the username column; otherwise use the generic message.

---

## Needs server verification (not a client-code defect)
- **`tier.ts` client-side entitlement gating** (`resolveTier`, `isArchivistPlusTier`, `isAuteurPlusTier`): the "highest watermark" rule takes the max of locally-cached tier and DB role and never downgrades. This is fine for UX, but premium features must be enforced **server-side** (RLS / edge functions). If any paid capability is gated *only* by these client helpers, a user editing on-device MMKV could unlock it. Verify server enforcement for: lounge access, dossier publishing, alt-poster/curatorial features, breakdown engine. (App pre-release — flagging proactively.)
- **`add_list_comment` cross-user notification insert** (`mutationExecutor.ts:333`): client inserts a `notifications` row for the list owner. Requires an RLS policy permitting cross-user notification inserts — confirm it's constrained (e.g. via a SECURITY DEFINER RPC or a narrow policy) so it isn't a spam vector.

---

## Confirmed elite (no action)
`offlineQueue.ts` (minus OFFQ-1/2), `mutationExecutor.ts`, `mappers.ts` (pure/typed/null-safe, `PUBLIC_LOG_COLUMNS` omits `private_notes`), `apiCircuitBreaker.ts` (correct 3-state + single-probe HALF_OPEN + payload-aware breaking), `withRetry.ts`, `qos.ts`, `concurrencyScope.ts`, `AppError.ts` (Hermes `instanceof` fix), `sanitizeInput.ts`, `sanitize.ts`, `html.ts`, `escapeSearchPattern.ts`, `csv.ts` (formula-injection guard), `linking.ts` (scheme allowlist choke-point), `validateUsername.ts`, `validateWithTelemetry.ts`, `dossierReconciliation.ts`, `navigationSnapshot.ts`, `typedRouter.ts` (circular-nav guard + native-back sync), `logger.ts` (prod→Sentry), `groupNotifications.ts`, `memoryManager.ts`, `performanceMonitor.ts`, `TactileEngine.ts` (Android throttle), `requestReview.ts`, `text.ts` (Intl.Segmenter), `timeAgo.ts`/`dateUtils.ts` (invalid-date + UTC handling), `imagePrefetcher.ts`, `storyExporter.ts`, `debounce.ts`, `safeParse.ts`, `filterContentByBlocks.ts`, `reelToast.ts`, `escapeSearchPattern.ts`.
