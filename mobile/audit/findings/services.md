# Findings — `src/services/*`

All 12 files read in full: `AuthService`, `InteractionService`, `ModerationService`, `ProfileWriteService`, `FeedService`, `ProfileDataService`, `LogService`, `StackService`, `DossierService`, `LoungeService`, `FilmService`, `NewsService`.

Overall: **elite tier.** Consistent CQRS read layer: every boundary is Zod-validated, `parseRowsSafely`/`validateWithTelemetry` salvage valid rows instead of failing whole pages, cursor (keyset) pagination throughout, AbortSignal support, explicit session-authorization on writes, defense-in-depth ownership filters on deletes, privacy-aware column sets. `ProfileService.updateProfile` (session check + role-exclusion + Zod), `uploadAvatar` (size guard + magic-byte MIME), `purgeLegacyAvatars` (chronological race protection), and `ProfileDataService` (PUBLIC vs SELF columns, tier-gated vault/analytics) are standout. Findings: one MEDIUM, two LOW.

---

## MEDIUM

### SVC-1 (MEDIUM) — List-comment notifications have two divergent row shapes (online vs offline) for the same action
**Files:** `src/services/StackService.ts:166-171` vs `src/utils/mutationExecutor.ts:333-339`

Commenting on a stack/list creates a `notifications` row, but the **online** and **offline** paths write incompatible shapes:
- Online (`StackService.addStackComment`): `{ user_id, type: 'comment', message: 'Someone commented…', metadata: { list_id, user_id } }`
- Offline (`mutationExecutor.add_list_comment`): `{ user_id, type: 'list_comment', actor_id, reference_id, entity_id }`

Different `type` value **and** different columns (`message`/`metadata` vs `actor_id`/`reference_id`/`entity_id`). Whichever shape the notifications schema + `notificationStore`/`groupNotifications` mapping expects, the other path produces a malformed/blank notification. Same logical event, two outcomes depending on connectivity.
**Fix:** Pick one canonical notification row shape for list-comment events and use it in both paths (ideally route both through a single helper or a SECURITY DEFINER RPC). Verify against the `notifications` table schema and the notification-rendering mapper. (Cross-ref the `add_list_comment` cross-user-insert RLS note in utils.md.)

---

## LOW

### SVC-2 (LOW, security-hygiene/consistency) — Inconsistent cursor sanitization before PostgREST `.or()` interpolation
**Files (safe, gold standard):** `FeedService.ts:84-96` (`parseCursor` — anchored ISO/UUID regex validation), `ProfileDataService.ts:290-291,517` (escapes `"`→`""`).
**Files (raw interpolation — gap):** `ProfileDataService.ts:413` (`fetchOtherUserVault`), `:457` (`fetchOtherUserLists`), `FilmService.ts:72` (`getFilmReviews`), `ProfileWriteService.ts:203,228` (`getSocialConnections` — interpolates `cursorDate` raw).

Several keyset-pagination paths interpolate the client-round-tripped `cursorDate` directly into a PostgREST `.or()` filter without the shape-validation/escaping the codebase already established in `parseCursor`. Impact is contained by RLS (an attacker can only perturb ordering/filtering within data they may already read), so this is LOW — but it's an inconsistent treatment of a known injection surface in an otherwise rigorous layer, and the fix already exists in-repo.
**Fix:** Route every cursor through `FeedService.parseCursor` (or an equivalent shared validator) so `cursorDate` must match `ISO_TIMESTAMP_RE` and the id must match `UUID_RE`/numeric before interpolation; treat malformed cursors as "first page."

### SVC-3 (LOW) — `NewsService.decodeEntities` duplicates `html.ts` entity decoding (weaker)
**File:** `src/services/NewsService.ts:50-55`
A local 5-entity decoder duplicates the far more complete `decodeEntities`/`stripHtml` in `src/utils/html.ts`. RSS titles with `&#8217;`, `&hellip;`, etc. will render as raw entities here.
**Fix:** Import `stripHtml`/`decodeEntities` from `utils/html.ts`.

---

## Needs server verification (not client defects)
- **FeedService direct-query fallback can't filter blocks server-side** (documented at `:144-147`): block/mute filtering for the community feed fallback path happens client-side only. Deploy `get_community_feed_auth_cursor` so page length used for pagination matches what's rendered (already noted in-code). Confirm the RPC is deployed before launch, or blocked-author rows will create short/uneven pages.
- **Cross-user `notifications` inserts** (StackService + mutationExecutor): confirm RLS constrains who can insert a notification for another user (spam vector) — ideally via SECURITY DEFINER RPC.

---

## Confirmed elite (no action)
`AuthService` (bounded retry + hard timeout), `InteractionService` (Zod boundary + mass-delete guard), `ModerationService` (thin RPC wrappers), `ProfileWriteService` (auth + role-exclusion + avatar OOM guard + avatar race protection), `FeedService` (RPC-first/direct-fallback, `parseCursor`, row salvage, 150-id URI cap), `ProfileDataService` (privacy column split, tier gating, 10K cap + JS-yield), `LogService` (offline-aware detail reconciliation, private_notes sync trap, ownership guards), `StackService` (schema-validated reduce, N+1 elimination), `DossierService` (fully Zod-validated, ownership guards), `LoungeService` (Zod + telemetry salvage, `z.record` metadata), `FilmService` (cursor pagination, raw-page-derived `hasMore` so row drops can't truncate, block filtering), `NewsService` (edge proxy + timeout + non-fabricating fallback).
