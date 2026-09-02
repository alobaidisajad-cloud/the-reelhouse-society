import { z } from 'zod';
// TYPES-2: reuse the single source of truth for moderation enums instead of
// inlining the value lists (which silently drift from the canonical enums).
import { ReportableContentType, ReportReason } from './moderation';

/**
 * mutations.ts — Runtime Mutation Payload Schemas
 * ────────────────────────────────────────────────────────────
 * Replaced z.object({}).passthrough() facade with
 * per-mutation field-existence schemas. Each schema requires
 * the fields the corresponding handler in mutationExecutor.ts
 * actually destructures.
 *
 * Design decisions:
 *   • z.string() over z.string().uuid() — Phase 1 catches
 *     structural corruption (missing fields), not format
 *     violations. UUID strictness could dead-letter legitimate
 *     payloads during transition.
 *   • .passthrough() preserved — existing MMKV queues may
 *     contain extra fields (e.g. _tempId, metadata). Stripping
 *     them would break handlers. Phase 2 can remove it after
 *     verifying every handler's fields match the schema.
 *   • z.number() for film_id — film IDs are always numeric
 *     (TMDB integers). This catches string-corrupted film IDs.
 */

export const MutationSchemaMap: Record<string, z.ZodTypeAny> = {
  // ── Endorsements ──
  endorse_log: z.object({ user_id: z.string(), type: z.string(), target_log_id: z.string() }).passthrough(),
  endorse_list: z.object({ user_id: z.string(), type: z.string(), target_list_id: z.string() }).passthrough(),
  endorse_film: z.object({ user_id: z.string(), type: z.string(), target_film_id: z.union([z.string(), z.number()]) }).passthrough(),
  endorse_review: z.object({ user_id: z.string(), type: z.string(), target_review_id: z.string() }).passthrough(),
  remove_endorsement: z.object({ user_id: z.string() }).passthrough(),

  // ── Logs ──
  mark_watched: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  add_log: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  update_log: z.object({ id: z.string() }).passthrough(),
  remove_log: z.object({ log_id: z.string() }).passthrough(),
  add_log_comment: z.object({ log_id: z.string(), user_id: z.string(), body: z.string() }).passthrough(),
  remove_log_comment: z.object({ comment_id: z.string(), user_id: z.string() }).passthrough(),

  // ── Profile ──
  update_profile: z.object({ user_id: z.string() }).passthrough(),

  // ── Watchlist ──
  add_watchlist: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  remove_watchlist: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),

  // ── Lists (Stacks) ──
  create_list: z.object({ id: z.string(), user_id: z.string() }).passthrough(),
  delete_list: z.object({ list_id: z.string(), user_id: z.string() }).passthrough(),
  add_film_to_list: z.object({ list_id: z.string(), film_id: z.number() }).passthrough(),
  remove_film_from_list: z.object({ list_id: z.string(), film_id: z.number() }).passthrough(),
  add_list_items: z.object({ list_id: z.string() }).passthrough(),
  restore_list_items: z.object({ list_id: z.string() }).passthrough(),
  update_list: z.object({ list_id: z.string(), user_id: z.string() }).passthrough(),
  add_list_comment: z.object({ list_id: z.string(), user_id: z.string(), content: z.string() }).passthrough(),
  remove_list_comment: z.object({ comment_id: z.string(), user_id: z.string() }).passthrough(),

  // ── Physical Archive (Vault) ──
  add_archive: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  remove_archive: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  update_archive: z.object({ user_id: z.string(), film_id: z.number() }).passthrough(),
  save_stub: z.object({ user_id: z.string() }).passthrough(),

  // ── Social ──
  follow_user: z.object({ user_id: z.string() }).passthrough(),
  follow_request_user: z.object({ user_id: z.string() }).passthrough(),
  unfollow_user: z.object({ user_id: z.string() }).passthrough(),

  // ── Lounge ──
  send_lounge_message: z.object({ lounge_id: z.string(), user_id: z.string(), content: z.string() }).passthrough(),
  // No user_id: withdraw_lounge_message derives the caller from auth.uid() and
  // refuses anyone who is neither the author nor the lounge creator, so there is
  // nothing for a queued payload to assert (or spoof).
  withdraw_lounge_message: z.object({ message_id: z.string() }).passthrough(),
  // Legacy shape from pre-tombstone builds; user_id is accepted but unused
  // (the RPC derives the caller). Kept so a queue persisted by an older
  // install still validates and flushes instead of dead-lettering.
  delete_lounge_message: z.object({ message_id: z.string() }).passthrough(),

  // ── Entitlement ──
  // ⚠️ user_id is REQUIRED, and this is a security boundary, not bookkeeping.
  //
  // The queue partitions pending work by `payload.user_id` and dead-letters anything
  // belonging to a previous account (offlineQueue.ts:242-251). Mutations WITHOUT a
  // user_id are treated as "session-scoped and therefore safe" — true for
  // increment_dossier_views, false for this one. sync-entitlement derives the account
  // from the JWT, so a tier queued by one member and flushed after someone else signs
  // in on that device is applied FAITHFULLY to the wrong account.
  //
  // An entry queued by an older build has no user_id, fails this schema, and is
  // dead-lettered instead of executed (offlineQueue.ts:305-317). That is the safe
  // direction — the member simply taps Restore Purchases again.
  //
  // No .passthrough() — sync_entitlement has no extra fields by design.
  sync_entitlement: z.object({ tier: z.string(), user_id: z.string().uuid() }),

  // ── Moderation ──
  submit_report: z.object({
    reporter_id: z.string().uuid(),
    content_id: z.string().uuid(),
    content_type: ReportableContentType,
    reason: ReportReason,
    details: z.string().max(500).nullable().optional(),
    target_user_id: z.string().uuid(),
  }),

  // ── Dossier ──
  add_dossier: z.object({ user_id: z.string() }).passthrough(),
  update_dossier: z.object({ id: z.string(), user_id: z.string() }).passthrough(),
  delete_dossier: z.object({ id: z.string(), user_id: z.string() }).passthrough(),
  add_dossier_comment: z.object({ dossier_id: z.string(), user_id: z.string(), body: z.string() }).passthrough(),
  update_dossier_comment: z.object({ id: z.string(), user_id: z.string() }).passthrough(),
  delete_dossier_comment: z.object({ comment_id: z.string(), user_id: z.string() }).passthrough(),
  toggle_dossier_certify: z.object({ dossier_uuid: z.string() }).passthrough(),
  increment_dossier_views: z.object({ dossier_uuid: z.string() }),

  // ── The Dispatch ──
  //
  // ⚠️ A MISSING ENTRY HERE IS NOT A COMPILE ERROR AND NOT A RUNTIME ERROR.
  // The flush reads `const schema = MutationSchemaMap[type]; if (schema) { … }`
  // — so a type with no schema is executed with NO validation at all, quietly.
  // Every Dispatch type therefore has an entry, and
  // dispatchMutationRegistry.test.ts fails the build if one is ever missing.
  //
  // `user_id` is required wherever the row is owned, for the reason spelled out
  // above sync_entitlement: the queue partitions pending work by payload.user_id
  // and treats a payload WITHOUT one as session-scoped and safe to run for
  // whoever is signed in when the network returns. A filing is not session-
  // scoped. The two that legitimately omit it are the toggles, which derive the
  // member from auth.uid() inside the RPC and so have nothing to spoof.

  // kind is validated as an enum because it decides which CHECK constraints the
  // row must satisfy, and a corrupted kind is the difference between a 2000-
  // character body being accepted and being refused.
  add_filing: z.object({
    _tempId: z.string(),
    user_id: z.string(),
    kind: z.enum(['take', 'seeking', 'wire', 'ballot', 'dossier']),
  }).passthrough(),
  // kind is REQUIRED on an edit as well as on a filing, and it is not
  // bookkeeping: cleanFiling chooses the body's cap from it — 500 for a
  // dossier's excerpt, 2000 for everything else. Without it an edited excerpt
  // would be capped at 2000, sail past the app, and be refused by the 500 fence
  // at the database, losing the edit the member had just made. The caller always
  // knows the kind; it is drawing the filing.
  update_filing: z.object({
    id: z.string(),
    user_id: z.string(),
    kind: z.enum(['take', 'seeking', 'wire', 'ballot', 'dossier']),
  }).passthrough(),
  // No body: ending a filing erases it, and the erasure is written by the
  // server. `by` is 'author' here always — the house's own path is the Tribunal.
  end_filing: z.object({ id: z.string(), user_id: z.string() }).passthrough(),

  add_critique: z.object({
    _tempId: z.string(), post_id: z.string(), user_id: z.string(), body: z.string(),
  }).passthrough(),
  update_critique: z.object({ id: z.string(), user_id: z.string(), body: z.string() }).passthrough(),
  remove_critique: z.object({ id: z.string(), user_id: z.string() }).passthrough(),

  // desired_state, not a toggle: a toggle replayed from a queue lands on
  // whichever side of the coin the delay leaves it. The handler reads the
  // server's current state and acts only if it disagrees, so a flush is
  // idempotent however many times it runs — the pattern toggle_dossier_certify
  // already uses.
  certify_filing: z.object({ post_id: z.string(), desired_state: z.boolean() }).passthrough(),
  certify_critique: z.object({ comment_id: z.string(), desired_state: z.boolean() }).passthrough(),

  cast_vote: z.object({
    post_id: z.string(), user_id: z.string(), option_index: z.number().int().min(0).max(5),
  }).passthrough(),
  // Both ids matter: the post whose answer is being set, and the critique being
  // named. answer_id may be null — taking the answer back is the same mutation.
  take_answer: z.object({
    post_id: z.string(), user_id: z.string(), answer_id: z.string().nullable(),
  }).passthrough(),

  save_filing: z.object({ post_id: z.string(), user_id: z.string() }).passthrough(),
  unsave_filing: z.object({ post_id: z.string(), user_id: z.string() }).passthrough(),
};
