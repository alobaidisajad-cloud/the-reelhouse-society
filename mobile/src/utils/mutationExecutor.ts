/**
 * mutationExecutor.ts — Typed Mutation Handler Registry
 * ─────────────────────────────────────────────────────────
 * BLOCK2-A: Extracted from offlineQueue.ts to decompose the
 * 620-line monolith. Each mutation type maps to a handler function
 * via Record<QueuedMutation['type'], MutationHandler>, providing
 * compile-time exhaustiveness checking — a missing handler is a
 * build error, not a runtime dead-letter.
 *
 * Architecture:
 *   • Typed handler registry: Record<QueuedMutation['type'], ...>
 *   • UnknownMutationError class for dead-letter routing
 *   • ID remapping for dependent mutations (offline optimistic IDs)
 *   • JS thread breathing (100ms setTimeout) between mutations
 */

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { InteractionService } from '../services/InteractionService';
import { logger } from './logger';
import type { QueuedMutation } from './offlineQueue';
import { sanitizeInput, type FieldType } from './sanitizeInput';

// ── Types ──────────────────────────────────────────────────────

type MutationResult = { newId?: string; fakeId?: string };

type MutationHandler = (
    payload: Record<string, unknown>,
    idMap: Record<string, string>
) => Promise<MutationResult>;

// ── Helpers ────────────────────────────────────────────────────

const throwIfError = <T>(res: { error: unknown; data?: T }) => {
    if (res.error) throw res.error;
    return res;
};

/**
 * Like `throwIfError`, but a write that changed NOTHING is also a failure.
 *
 * ── WHY THE DISPATCH REPLAYS NEED THIS ──────────────────────────────────────
 * A member may amend their own filing, but not one the house has WITHHELD for
 * review or already ENDED. RLS enforces that by matching no ROW — which is not
 * an error. PostgREST answers 200 with an empty body, `res.error` is null, and
 * a queued amendment replayed against a filing that was withheld while the
 * member was offline would report success and change nothing.
 *
 * The caller must ask for the rows back (`.select('id')`) for this to mean
 * anything; an update with no `select` returns no data either way.
 */
const throwIfRefused = <T>(res: { error: unknown; data?: T[] | null }, where: string) => {
    if (res.error) throw res.error;
    if (!res.data || res.data.length === 0) {
        throw new Error(`${where}: the house refused it — the filing is withheld, ended, or not yours`);
    }
    return res;
};

const handleDuplicateLogMerge = async (error: any, dbPayload: any, _fakeId?: string): Promise<MutationResult | null> => {
    const errLower = String(error.message || '').toLowerCase();
    if (error.code === '23505' || errLower.includes('duplicate') || errLower.includes('unique')) {
        // Select the entire row to preserve viewing_history.
        const existing = await supabase.from('logs').select('*').eq('user_id', dbPayload.user_id).eq('film_id', dbPayload.film_id).maybeSingle();
        if (existing.data) {
            const existingData = existing.data;

            // Idempotency guard for at-least-once delivery.
            // If the conflicting row shares this mutation's client-generated id, the
            // original insert already committed and only its response was lost (e.g. a
            // 504 / dropped connection misread as a network failure, then re-queued with
            // the SAME id). This is the exact same operation — treat it as a no-op rather
            // than archiving the row into its own viewing_history and inflating view_count
            // (a phantom rewatch). A genuinely concurrent log has a DIFFERENT id and still
            // falls through to the rewatch merge below.
            if (existingData.id === dbPayload.id) {
                return _fakeId ? { newId: existingData.id, fakeId: _fakeId as string } : {};
            }

            const oldHistory = Array.isArray(existingData.viewing_history) ? existingData.viewing_history : [];
            const archivedEntry = {
                date: existingData.watched_date ?? existingData.created_at ?? new Date().toISOString(),
                rating: existingData.rating ?? 0,
                review: existingData.review ?? '',
                watchedWith: existingData.watched_with ?? null,
                physicalMedia: existingData.physical_media ?? 'None',
                status: existingData.status ?? 'watched',
                abandonedReason: existingData.abandoned_reason ?? null,
                isAutopsied: existingData.is_autopsied ?? false,
                autopsy: existingData.autopsy ?? null,
                altPoster: existingData.alt_poster ?? null,
                editorialHeader: existingData.editorial_header ?? null,
                dropCap: existingData.drop_cap ?? false,
                pullQuote: existingData.pull_quote ?? '',
                privateNotes: existingData.private_notes ?? null,
                isSpoiler: existingData.is_spoiler ?? false,
                videoUrl: existingData.video_url ?? null,
                format: existingData.format ?? 'digital',
            };
            const newHistory = [archivedEntry, ...oldHistory];
            
            const { id: _dropId, created_at: _dropCreatedAt, ...updatePayload } = dbPayload;
            
            // Inject preserved history and increment view count
            updatePayload.viewing_history = newHistory;
            updatePayload.view_count = (existingData.view_count || 1) + 1;
            
            throwIfError(await supabase.from('logs').update(updatePayload).eq('id', existingData.id));
            if (_fakeId) {
                return { newId: existingData.id, fakeId: _fakeId as string };
            }
        }
        return {};
    }
    return null;
};

// ── Error Classes ──────────────────────────────────────────────

export class UnknownMutationError extends Error {
    constructor(type: string) {
        super(`Unknown mutation type: ${type}`);
        this.name = 'UnknownMutationError';
    }
}

// ── Handler Registry ───────────────────────────────────────────
// TypeScript enforces exhaustiveness: if a new type is added to
// QueuedMutation['type'] but no handler is defined here, this
// Record will produce a compile error.

/**
 * The offline last gate for member prose.
 *
 * Every online path already sanitises before enqueueing. This exists because the
 * offline queue PERSISTS IN MMKV: an entry written by the build currently on
 * TestFlight — which does not sanitise — flushes AFTER the launch build lands, going
 * straight past the fix. Cleaning only at the source misses exactly those rows.
 *
 * It is also the convention this codebase already had for comments (LogService AND
 * mutationExecutor both clean logComment). Logs, lists and reports were the outliers.
 *
 * `private_notes` is included even though it is owner-only, so the surface is uniform:
 * a rule with exceptions is a rule nobody can check.
 */
function cleanProse<T extends Record<string, unknown>>(o: T): T {
    if (typeof o.review === 'string') (o as Record<string, unknown>).review = sanitizeInput(o.review, 'review');
    if (typeof o.private_notes === 'string') (o as Record<string, unknown>).private_notes = sanitizeInput(o.private_notes, 'review');
    return o;
}

/**
 * The dossier equivalent. Kept separate because `title` is ambiguous across the app —
 * a stack title caps at 100 and a dossier title at 200 — so one generic field→profile
 * map would silently apply the wrong limit to whichever it saw first.
 *
 * full_content matters most: it is the markdown these very fixes render, and the render
 * cap assumes the write cap held. Offline, it did not.
 */
function cleanDossier<T extends Record<string, unknown>>(o: T): T {
    const w = o as Record<string, unknown>;
    if (typeof w.title === 'string') w.title = sanitizeInput(w.title, 'dossierTitle');
    if (typeof w.excerpt === 'string') w.excerpt = sanitizeInput(w.excerpt, 'dossierExcerpt');
    if (typeof w.full_content === 'string') w.full_content = sanitizeInput(w.full_content, 'dossierContent');
    return o;
}

/**
 * The Dispatch's equivalent, and the last gate a filing passes before Postgres.
 *
 * Every field here maps to exactly one CHECK constraint on dispatch_posts. That
 * is the whole point: if a string arrives longer than its column allows, the
 * insert fails at the database and the member sees a constraint error naming a
 * column they have never heard of — after pressing FILE, with their words gone.
 * Capping here turns that into a quiet trim.
 *
 * ── WHY THE BODY'S CAP IS NOT A CONSTANT ───────────────────────────────────
 * `body` is 2000 for a take, a seeking, a wire and a ballot, and 500 for a
 * dossier — where it is the excerpt and the essay lives in full_content. That is
 * two constraints on one column (body_ceiling and excerpt_ceiling), so the cap
 * has to be chosen per row. A single number would either refuse 1500 characters
 * a take is entitled to, or let a dossier excerpt through to be refused by the
 * database.
 *
 * ── AND WHY THE OPTIONS ARE WALKED ─────────────────────────────────────────
 * A ballot's options are a jsonb array of films, and the column is fenced on the
 * SERIALISED length of the whole array. Capping each title is what keeps six of
 * them inside that fence, and it is the only field in the app where a member's
 * text reaches the database inside a structure rather than as a column.
 */
function cleanFiling<T extends Record<string, unknown>>(o: T): T {
    const w = o as Record<string, unknown>;
    const cap = (k: string, f: FieldType) => {
        if (typeof w[k] === 'string') w[k] = sanitizeInput(w[k] as string, f);
    };

    cap('title', 'filingTitle');
    cap('body', w.kind === 'dossier' ? 'filingExcerpt' : 'filingBody');
    cap('full_content', 'filingEssay');
    cap('source', 'wireSource');
    cap('source_url', 'sourceUrl');
    cap('spoiler_label', 'spoilerLabel');
    cap('series_title', 'seriesTitle');
    cap('subject_title', 'subjectTitle');
    cap('subject_sub', 'subjectSub');
    cap('subject_image', 'subjectImage');

    if (Array.isArray(w.options)) {
        w.options = (w.options as unknown[]).map((opt) => {
            if (!opt || typeof opt !== 'object') return opt;
            const o2 = { ...(opt as Record<string, unknown>) };
            if (typeof o2.title === 'string') o2.title = sanitizeInput(o2.title, 'ballotOption');
            return o2;
        });
    }
    return o;
}

const insertLog = async (p: any): Promise<MutationResult> => {
    const { _fakeId, _tempId, ...raw } = p;
    cleanProse(raw);
    const dbPayload = {
        id: raw.id,
        user_id: raw.user_id, film_id: raw.film_id, film_title: raw.film_title,
        poster_path: raw.poster_path, rating: raw.rating, review: raw.review,
        watched_date: raw.watched_date, status: raw.status, year: raw.year,
        decade: raw.decade, autopsy: raw.autopsy, viewing_history: raw.viewing_history,
        genres: raw.genres, watched_with: raw.watched_with, physical_media: raw.physical_media,
        is_autopsied: raw.is_autopsied, alt_poster: raw.alt_poster,
        editorial_header: raw.editorial_header, drop_cap: raw.drop_cap,
        pull_quote: raw.pull_quote, abandoned_reason: raw.abandoned_reason,
        is_spoiler: raw.is_spoiler, private_notes: raw.private_notes,
        video_url: raw.video_url, format: raw.format, view_count: raw.view_count,
    };
    // Strip undefined values to let DB defaults apply
    const cleaned = Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined));
    try {
        const result = throwIfError(await supabase.from('logs').insert([cleaned]).select('id').maybeSingle());
        if (_fakeId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: _fakeId as string };
        }
        return {};
    } catch (error: any) {
        const mergeResult = await handleDuplicateLogMerge(error, cleaned, _fakeId as string | undefined);
        if (mergeResult !== null) return mergeResult;
        throw error;
    }
};

const handlers: Record<QueuedMutation['type'], MutationHandler> = {
    // ── Endorsements ──
    endorse_log: async (p: any) => { await InteractionService.addEndorsement({ ...p, type: 'endorse_log' }); return {}; },
    endorse_list: async (p: any) => { await InteractionService.addEndorsement({ ...p, type: 'endorse_list' }); return {}; },
    endorse_film: async (p: any) => { await InteractionService.addEndorsement({ ...p, type: 'endorse_film' }); return {}; },
    endorse_review: async (p: any) => { await InteractionService.addEndorsement({ ...p, type: 'endorse_review' }); return {}; },

    remove_endorsement: async (p: any) => {
        // Direct Supabase delete — mirrors the online path in interactionSlice.ts.
        const { user_id, target_log_id, target_list_id, target_film_id, target_review_id, type: endorseType } = p;
        
        // Invariant guard to prevent mass deletion
        if (!target_log_id && !target_list_id && !target_film_id && !target_review_id) {
            throw new Error('[MutationExecutor] remove_endorsement requires a valid target ID to prevent mass deletion.');
        }

        let deleteQuery = supabase.from('interactions').delete().eq('user_id', user_id as string);
        if (target_log_id)          deleteQuery = deleteQuery.eq('target_log_id', target_log_id as string).eq('type', 'endorse_log');
        else if (target_list_id)    deleteQuery = deleteQuery.eq('target_list_id', target_list_id as string).eq('type', (endorseType as string) ?? 'endorse_list');
        else if (target_film_id)    deleteQuery = deleteQuery.eq('target_film_id', target_film_id as string).eq('type', 'endorse_film');
        else if (target_review_id)  deleteQuery = deleteQuery.eq('target_review_id', target_review_id as string).eq('type', 'endorse_review');
        
        throwIfError(await deleteQuery);
        return {};
    },

    // ── Logs ──
    mark_watched: insertLog,

    add_log: insertLog,

    update_log: async (p: any) => {
        const { id, updates } = p;
        const upds = cleanProse(updates as Record<string, unknown>);
        
        // Protect viewing_history array from Last-Write-Wins offline erasure
        if (upds.viewing_history && Array.isArray(upds.viewing_history)) {
            const { data } = await supabase.from('logs').select('viewing_history').eq('id', id).maybeSingle();
            if (data && Array.isArray(data.viewing_history)) {
                const serverHistory = data.viewing_history;
                const offlineHistory = upds.viewing_history;
                
                // Composite dedup key prevents same-day rewatch collisions.
                // Previous implementation used `entry.date` alone, which caused Map
                // collisions when a user watched the same film multiple times on the
                // same day (watchedDate is anchored to T12:00:00Z for date-only inputs).
                // Added watchedWith + physicalMedia + index fallback to prevent
                // collision when rating/status/review are identical (e.g. two quick marks
                // on the same day with no review).
                const compositeKey = (entry: any, index: number): string => {
                    if (!entry) return `__null_${index}`;
                    return `${entry.date ?? ''}::${entry.rating ?? 0}::${entry.status ?? ''}::${entry.review?.slice(0, 40) ?? ''}::${entry.watchedWith ?? ''}::${entry.physicalMedia ?? ''}`;
                };
                
                const mergedMap = new Map();
                serverHistory.forEach((entry: any, idx: number) => {
                    if (entry) mergedMap.set(compositeKey(entry, idx), entry);
                });
                offlineHistory.forEach((entry: any, idx: number) => {
                    const key = compositeKey(entry, idx + serverHistory.length);
                    // Only overwrite if the entry is genuinely the same (not a distinct rewatch)
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, entry);
                    }
                });
                
                upds.viewing_history = Array.from(mergedMap.values()).sort((a: any, b: any) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
            }
        }
        
        throwIfError(await supabase.from('logs').update(upds).eq('id', id));
        return {};
    },

    remove_log: async (p: any) => {
        const { log_id, user_id } = p;
        // Defense-in-depth ownership filter — matches online path.
        // RLS is the primary guard, but this prevents accidental cross-user deletes
        // if the offline queue ever executes with a mismatched session.
        if (user_id) {
            throwIfError(await supabase.from('logs').delete().eq('id', log_id).eq('user_id', user_id));
        } else {
            // Legacy payloads enqueued before this fix may lack user_id — fall through to RLS
            throwIfError(await supabase.from('logs').delete().eq('id', log_id));
        }
        return {};
    },

    add_log_comment: async (p: any) => {
        const { id, log_id, user_id, body } = p;
        // log_comments.username is NOT NULL and no trigger populates it. Supply the
        // author's username (denormalized column; display uses the profiles join).
        const username = (p.username as string) || useAuthStore.getState().user?.username || 'anonymous';
        // Sanitize comment body — strips zero-width chars, control chars,
        // and enforces MAX_LENGTHS.logComment (2000) before database write.
        const cleanBody = sanitizeInput(body as string, 'logComment');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result = throwIfError(await supabase.from('log_comments').upsert([{ id, log_id, user_id, username, body: cleanBody }], { onConflict: 'id' }).select('id').maybeSingle());
        return {};
    },

    remove_log_comment: async (p: any) => {
        const { comment_id, user_id } = p;
        throwIfError(await supabase.from('log_comments').delete()
            .eq('id', comment_id)
            .eq('user_id', user_id));
        return {};
    },

    // ── Profile ──
    update_profile: async (p: any) => {
        const { preferences } = p;
        // Merge (not overwrite) so a queued offline change can't clobber prefs
        // set on another device while this one was offline (COMP-7).
        throwIfError(await supabase.rpc('update_my_preferences', { p_preferences: preferences }));
        return {};
    },

    // ── Watchlist ──
    add_watchlist: async (p: any) => {
        const dbPayload = {
            user_id: p.user_id,
            film_id: p.film_id,
            film_title: p.film_title,
            poster_path: p.poster_path,
            year: p.year
        };
        const cleaned = Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined));
        throwIfError(await supabase.from('watchlists').insert([cleaned]));
        return {};
    },

    remove_watchlist: async (p: any) => {
        const { user_id, film_id } = p;
        throwIfError(await supabase.from('watchlists').delete().eq('user_id', user_id).eq('film_id', film_id));
        return {};
    },

    // ── Lists ──
    create_list: async (p: any) => {
        const { films, _tempId, ...listPayload } = p;
        // #68, last gate. listSlice already cleans these before enqueueing, so this is
        // belt AND braces — and it is not theoretical: the offline queue PERSISTS in
        // MMKV, so a stack queued by the build currently on TestFlight (which does not
        // sanitise) would otherwise flush raw after the launch build lands.
        //
        // This is also the convention the codebase already follows for comments —
        // LogService AND mutationExecutor both sanitise logComment. Lists were the
        // outlier, on both halves.
        if (typeof listPayload.title === 'string') listPayload.title = sanitizeInput(listPayload.title, 'listTitle');
        if (typeof listPayload.description === 'string') listPayload.description = sanitizeInput(listPayload.description, 'listDescription');
        const result = throwIfError(await supabase.from('lists').upsert([listPayload], { onConflict: 'id' }).select('id').maybeSingle());
        if (result.data) {
            const listId = (result.data as { id: string }).id;
            if (Array.isArray(films) && films.length > 0) {
                const items = (films as Record<string, unknown>[]).map((f) => ({ list_id: listId, film_id: f.film_id, film_title: f.film_title, poster_path: f.poster_path, rank_position: f.rank_position }));
                // Upsert merge strategy replaces destructive delete-all-reinsert.
                throwIfError(await supabase.from('list_items').upsert(items, { onConflict: 'list_id,film_id' }));
            }
            if (_tempId) {
                return { newId: listId, fakeId: _tempId as string };
            }
        }
        return {};
    },

    delete_list: async (p: any) => {
        const { list_id, user_id } = p;
        // Atomic cascade via server-side RPC.
        // Falls back to sequential deletes if the RPC doesn't exist yet
        // (e.g., migration hasn't been applied in this environment).
        try {
            throwIfError(await supabase.rpc('delete_list_cascade', { p_list_id: list_id }));
        } catch (rpcErr: any) {
            // If RPC doesn't exist (42883 = undefined_function), fall back to sequential cascade
            const code = String(rpcErr?.code ?? '');
            const msg = String(rpcErr?.message ?? '').toLowerCase();
            if (code === '42883' || msg.includes('function') && msg.includes('does not exist')) {
                logger.warn('[MutationExecutor] delete_list_cascade RPC not found — falling back to sequential cascade');
                throwIfError(await supabase.from('list_items').delete().eq('list_id', list_id));
                throwIfError(await supabase.from('list_comments').delete().eq('list_id', list_id));
                throwIfError(await supabase.from('interactions').delete().eq('target_list_id', list_id));
                throwIfError(await supabase.from('lists').delete().eq('id', list_id).eq('user_id', user_id));
            } else {
                throw rpcErr;
            }
        }
        return {};
    },

    add_list_comment: async (p: any) => {
        const { list_id, user_id, content } = p;
        const dbPayload = {
            list_id,
            user_id,
            content: sanitizeInput(content as string, 'listComment')
        };
        throwIfError(await supabase.from('list_comments').insert([dbPayload]).select('id, list_id').maybeSingle());

        // SVC-1: the previous manual notification insert here used columns that exist
        // in no migration (actor_id/reference_id/entity_id), an invalid `type`
        // ('list_comment' violates the notifications type CHECK), and omitted the
        // NOT NULL `message` — so it always failed silently. The `tr_notify_list_comment`
        // DB trigger already emits the correct notification on the list_comments INSERT
        // above, so we rely on that single source of truth (no manual insert).
        return {};
    },

    remove_list_comment: async (p: any) => {
        const { comment_id, user_id } = p;
        throwIfError(await supabase.from('list_comments').delete()
            .eq('id', comment_id)
            .eq('user_id', user_id));
        return {};
    },

    add_film_to_list: async (p: any) => {
        const { list_id, film_id, film_title, poster_path, rank_position } = p;
        throwIfError(await supabase.from('list_items').upsert([{ list_id, film_id, film_title, poster_path, rank_position }], { onConflict: 'list_id,film_id' }));
        return {};
    },

    remove_film_from_list: async (p: any) => {
        const { list_id, film_id, trailing_films } = p;
        throwIfError(await supabase.from('list_items').delete().eq('list_id', list_id).eq('film_id', film_id));
        if (Array.isArray(trailing_films) && trailing_films.length > 0) {
            const rows = trailing_films.map((f: any) => ({
                list_id, 
                film_id: f.film_id ?? f.id, 
                film_title: f.film_title ?? f.title ?? 'Unknown',
                poster_path: f.poster_path ?? f.poster ?? null, 
                rank_position: f.rank_position
            }));
            throwIfError(await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,film_id' }));
        }
        return {};
    },

    add_list_items: async (p: any) => {
        // Flush handler for orphaned add_list_items mutations
        const { list_id, items } = p;
        if (Array.isArray(items) && items.length > 0) {
            const rows = (items as Record<string, unknown>[]).map((f) => ({
                list_id, film_id: f.film_id, film_title: f.film_title,
                poster_path: f.poster_path, rank_position: f.rank_position,
            }));
            throwIfError(await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,film_id' }));
        }
        return {};
    },

    update_list: async (p: any) => {
        // Upsert-then-prune replaces destructive delete→insert.
        // Previous pattern: DELETE all → INSERT new. If DELETE succeeded but INSERT
        // failed (network drop, 5xx, rate limit), all list items were permanently lost.
        // New pattern: UPSERT new items first (so they exist), THEN prune orphans.
        // Worst-case partial failure: user sees old+new items temporarily (safe).
        const { list_id, user_id, updates, films } = p;
        if (updates && Object.keys(updates as object).length > 0) {
            // Same last gate as create_list above — a queued EDIT from an older build.
            const u = updates as Record<string, unknown>;
            if (typeof u.title === 'string') u.title = sanitizeInput(u.title, 'listTitle');
            if (typeof u.description === 'string') u.description = sanitizeInput(u.description, 'listDescription');
            throwIfError(await supabase.from('lists').update(u).eq('id', list_id).eq('user_id', user_id));
        }
        if (Array.isArray(films)) {
            if (films.length > 0) {
                const rows = (films as Record<string, unknown>[]).map((f, idx) => ({
                    list_id, 
                    film_id: f.film_id ?? f.id, 
                    film_title: f.film_title ?? f.title ?? 'Unknown',
                    poster_path: f.poster_path ?? f.poster ?? null, 
                    rank_position: f.rank_position ?? idx,
                }));
                throwIfError(await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,film_id' }));
                // Prune removed items
                if (Array.isArray(p.removed_film_ids) && p.removed_film_ids.length > 0) {
                    for (let i = 0; i < p.removed_film_ids.length; i += 100) {
                        const chunk = p.removed_film_ids.slice(i, i + 100);
                        const { error: pruneError } = await supabase.from('list_items').delete().eq('list_id', list_id).in('film_id', chunk);
                        if (pruneError) {
                            throw pruneError;
                        }
                    }
                } else if (!p.removed_film_ids || p.removed_film_ids.length === 0) {
                    // Fallback for queued mutations created before this update
                    const keepIds = rows.map(f => f.film_id);
                    const { error: pruneError } = await supabase
                        .from('list_items')
                        .delete()
                        .eq('list_id', list_id as string)
                        .not('film_id', 'in', `(${keepIds.join(',')})`);
                    if (pruneError) {
                        throw pruneError;
                    }
                }
            } else {
                // Empty list — safe to delete all items
                throwIfError(await supabase.from('list_items').delete().eq('list_id', list_id as string));
            }
        }
        return {};
    },

    restore_list_items: async (p: any) => {
        // Re-inserts list items lost during a failed fallback rollback.
        const { list_id, items } = p;
        if (Array.isArray(items) && items.length > 0) {
            const rows = (items as Record<string, unknown>[]).map((f) => ({
                list_id, film_id: f.film_id, film_title: f.film_title,
                poster_path: f.poster_path, rank_position: f.rank_position,
            }));
            throwIfError(await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,film_id' }));
        }
        return {};
    },

    // ── Archive ──
    add_archive: async (p: any) => {
        const { user_id, film_id, film_title, poster_path, year, formats, notes, condition } = p;
        throwIfError(await supabase.from('physical_archive').upsert([{
            user_id, film_id, film_title, poster_path, year, formats, notes, condition,
        }], { onConflict: 'user_id, film_id' }));
        return {};
    },

    remove_archive: async (p: any) => {
        const { user_id, film_id } = p;
        throwIfError(await supabase.from('physical_archive').delete().eq('user_id', user_id).eq('film_id', film_id));
        return {};
    },

    update_archive: async (p: any) => {
        const { user_id, film_id, updates } = p;
        throwIfError(await supabase.from('physical_archive').update(updates as Record<string, unknown>).eq('user_id', user_id as string).eq('film_id', film_id as number));
        return {};
    },

    // `save_stub` wrote to `tickets`, a table from the abandoned cinema-booking
    // feature that batch 31 dropped. Nothing ever enqueued it — verified across
    // the whole app and the shipped TestFlight build — so no persisted queue can
    // hold one.
    //
    // Kept as a no-op rather than deleted, which is how this file already treats
    // legacy kinds. Deleting the handler would leave any queued item retrying
    // forever against a table that no longer exists; succeeding immediately
    // drains it. The cost of being wrong about "nothing enqueued it" is then a
    // discarded ticket stub for a feature that does not exist, instead of a
    // permanently wedged offline queue.
    save_stub: async () => ({}),

    // ── Social ──
    follow_user: async (p: any) => {
        // Social graph offline queue — follow
        // Use pre-resolved target_user_id from enqueue time when available.
        // Falls back to username resolution only if ID wasn't cached at enqueue time.
        const { user_id, target_username, target_user_id } = p;
        let resolvedId = target_user_id as string | null;
        if (!resolvedId && target_username) {
            const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle();
            resolvedId = targetProfile?.id ?? null;
        }
        if (resolvedId) {
            throwIfError(await supabase.from('interactions').upsert([{
                user_id, target_user_id: resolvedId, type: 'follow',
            }], { onConflict: 'user_id,target_user_id,type', ignoreDuplicates: true }));
        } else {
            logger.warn(`[MutationExecutor] follow_user: Could not resolve @${target_username} — skipping.`);
        }
        return {};
    },

    follow_request_user: async (p: any) => {
        const { user_id, target_username, target_user_id } = p;
        let resolvedId = target_user_id as string | null;
        if (!resolvedId && target_username) {
            const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle();
            resolvedId = targetProfile?.id ?? null;
        }
        if (resolvedId) {
            throwIfError(await supabase.from('interactions').upsert([{
                user_id, target_user_id: resolvedId, type: 'follow_request',
            }], { onConflict: 'user_id,target_user_id,type', ignoreDuplicates: true }));
        } else {
            logger.warn(`[MutationExecutor] follow_request_user: Could not resolve @${target_username} — skipping.`);
        }
        return {};
    },

    unfollow_user: async (p: any) => {
        // Social graph offline queue — unfollow
        // Use pre-resolved target_user_id from enqueue time when available.
        const { user_id, target_username, target_user_id } = p;
        let resolvedId = target_user_id as string | null;
        if (!resolvedId && target_username) {
            const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle();
            resolvedId = targetProfile?.id ?? null;
        }
        if (resolvedId) {
            // BOTH types, mirroring the online path in socialSlice. Deleting only
            // 'follow' meant cancelling a pending request offline removed it locally
            // and left the row standing at the target's door — where it reappeared in
            // the requester's UI after the next hydrate (#78).
            throwIfError(await supabase.from('interactions').delete()
                .eq('user_id', user_id as string)
                .eq('target_user_id', resolvedId)
                .in('type', ['follow', 'follow_request']));
        }
        return {};
    },

    // ── Lounge ──
    send_lounge_message: async (p: any) => {
        // Flush handler for lounge messages queued while offline.
        // Preserves rich metadata, threading, and username for offline list shares.
        const { lounge_id, user_id, username, content, type: msgType, _tempId, film_id, film_title, film_poster, reply_to_id, reply_to_username, reply_to_content, metadata } = p;
        const dbPayload = {
            lounge_id, user_id, username,
            // sanitizeInput enforces MAX_LENGTHS.loungeMessage on its own; the
            // `.slice(0, 500)` that used to sit here was a stricter duplicate cap
            // that would have truncated a queued message at 500 regardless of what
            // the composer accepted. One cap, one place — see the online path.
            content: sanitizeInput(content as string, 'loungeMessage'),
            type: msgType ?? 'text',
            film_id, film_title, film_poster, reply_to_id, reply_to_username, reply_to_content, metadata
        };
        const cleaned = Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined));
        const result = throwIfError(await supabase.from('lounge_messages').insert([cleaned]).select('id').maybeSingle());
        if (_tempId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: _tempId as string };
        }
        return {};
    },

    /**
     * LEGACY ALIAS — do not remove until well past the release that drops it.
     *
     * Builds before the tombstone migration queued 'delete_lounge_message' when
     * a member deleted their own message offline. Those entries can still be
     * sitting in a live member's MMKV queue at the moment they update. Without a
     * handler the executor throws UnknownMutationError, the queue dead-letters
     * it and moves on — no jam, but the member's deletion is silently lost and
     * the message they took down reappears.
     *
     * Completing it as a WITHDRAWAL honours the intent using the current
     * semantics: the row is tombstoned, never hard-deleted. The old payload
     * carried { message_id, user_id }; the RPC needs only the id and derives the
     * caller from auth.uid(), so user_id is simply ignored.
     */
    delete_lounge_message: async (p: any) => {
        const { message_id } = p;
        const { error } = await supabase.rpc('withdraw_lounge_message', { p_message_id: message_id as string });
        if (error) throw error;
        return {};
    },

    withdraw_lounge_message: async (p: any) => {
        // Flush handler for a withdrawal queued while offline. Goes through the
        // RPC, never a hard delete — the row must survive as a tombstone so the
        // transcript doesn't grow a hole where a reply's parent used to be.
        // The RPC enforces authorship itself (auth.uid() must be the author or
        // the lounge creator) and returns silently if the row is already gone,
        // so a duplicate flush is harmless.
        const { message_id } = p;
        const { error } = await supabase.rpc('withdraw_lounge_message', { p_message_id: message_id as string });
        if (error) throw error;
        return {};
    },

    // ── Entitlements ──
    sync_entitlement: async (p: any) => {
        // Entitlement tier sync queued when Edge Function was unreachable.
        const { tier, user_id } = p;
        const { data: { session } } = await supabase.auth.getSession();

        // ⚠️ This used to be `if (session?.access_token) { ... }` with no else — so with
        // no session it skipped the request and fell through to `return {}`, reporting
        // SUCCESS. The queue then deleted the mutation and that member's tier never
        // synced at all.
        //
        // Throwing plainly would be no better: an unrecognised error is dead-lettered
        // (offlineQueue.ts:366-370), losing it the same way by a different route. The
        // 503 marks it as "retry later" so isNetworkError classifies it and the flush
        // halts with the mutation intact. It is a classifier hint, not an HTTP response
        // — and an honest one: a flush with no session means auth really is unavailable.
        if (!session?.access_token) {
            const err: any = new Error('sync_entitlement: no session — keeping queued for retry');
            err.status = 503;
            throw err;
        }

        // Defence in depth behind the queue's ownership partition. The edge function
        // derives the account from this JWT and applies the tier faithfully, so a
        // mismatch here would silently move one member's entitlement onto another
        // account. Retrying can never fix that, so this throws a plain error and is
        // dead-lettered for post-mortem rather than kept.
        if (user_id && session.user?.id && user_id !== session.user.id) {
            throw new Error('sync_entitlement: queued for a different account — refusing');
        }

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const response = await fetch(`${supabaseUrl}/functions/v1/sync-entitlement`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tier }),
        });
        if (!response.ok) throw new Error(`Edge Function sync-entitlement returned ${response.status}`);

        // ⚠️ finding 100 — this used to `return {}`, throwing the reply away. The server sends
        // seatClaimed=false when the 100 founding seats were already full and the member
        // was granted Auteur instead, so someone who paid for a seat that no longer
        // existed was never told. It also sends applied=false when the entitlement rule
        // refused the write. Returning the body makes both reachable.
        try {
            return await response.json();
        } catch {
            return {};
        }
    },

    // ── Dossiers ────────────────────────────────────────────────────────────
    // ⚠️ THESE STAY, AND THEY MUST. The Dispatch replaced them with add_filing,
    // add_critique and certify_filing — but this queue PERSISTS IN MMKV, and the
    // build in members' hands right now writes THESE types. An entry queued
    // today flushes after the launch build lands, and a handler that no longer
    // exists is an UnknownMutationError and a member's essay in a dead letter.
    //
    // They still work, deliberately: every table named below is now a view over
    // dispatch_posts / dispatch_comments with an INSTEAD OF trigger behind it,
    // which is the entire reason step one built a compatibility layer instead of
    // renaming and moving on. Same reasoning as `delete_lounge_message` above.
    //
    // They can be deleted when no device can still be holding one — which is
    // after the launch build has been out longer than the queue's 24h staleness
    // window, not before.
    //
    // (P0-DOSSIER FIX) Previously, dossier offline mutations reused archive
    // types, executing against supabase.from('physical_archive') — wrong table.
    add_dossier: async (p: any) => {
        const dbPayload = {
            // The SAME id the optimistic row already carries.
            //
            // Omitting it let Postgres mint a different one, so the local row and
            // the server row were two different dossiers and both rendered — and
            // worse, a transient failure retries this up to five times, each
            // attempt creating ANOTHER copy. With the id supplied the insert is
            // idempotent: a retry hits the unique key and the queue already
            // treats a duplicate as "the write landed" and drops it.
            //
            // The online path has always inserted this id (content.ts), which is
            // what proves the column accepts a client-generated UUID; insertLog
            // above does the same thing for logs.
            id: p._tempId,
            user_id: p.user_id,
            author_username: p.author_username,
            title: p.title,
            excerpt: p.excerpt,
            full_content: p.full_content,
            is_published: p.is_published,
            created_at: p.created_at
        };
        const cleaned = cleanDossier(Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined)));
        const result = throwIfError(await supabase.from('dispatch_dossiers').insert([cleaned]).select('id').maybeSingle());
        if (p._tempId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: p._tempId as string };
        }
        return {};
    },

    update_dossier: async (p: any) => {
        const { id, user_id, updates } = p;
        throwIfError(await supabase.from('dispatch_dossiers').update(cleanDossier(updates as Record<string, unknown>)).eq('id', id).eq('user_id', user_id));
        return {};
    },

    delete_dossier: async (p: any) => {
        const { id, user_id } = p;
        throwIfError(await supabase.from('dispatch_dossiers').delete().eq('id', id).eq('user_id', user_id));
        return {};
    },

    add_dossier_comment: async (p: any) => {
        const { _tempId, dossier_id, user_id, username, body } = p;
        // Sanitize comment body — strips zero-width chars, control chars,
        // and enforces MAX_LENGTHS.dossierComment (2000) before database write.
        const cleanBody = sanitizeInput(body as string, 'dossierComment');
        const result = throwIfError(await supabase.from('dossier_comments').insert([{ dossier_id, user_id, username, body: cleanBody }]).select('id').maybeSingle());
        if (_tempId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: _tempId as string };
        }
        return {};
    },

    update_dossier_comment: async (p: any) => {
        const { id, user_id, updates } = p;
        throwIfError(await supabase.from('dossier_comments').update(updates as Record<string, unknown>).eq('id', id).eq('user_id', user_id));
        return {};
    },

    delete_dossier_comment: async (p: any) => {
        const { comment_id, user_id } = p;
        throwIfError(await supabase.from('dossier_comments').delete().eq('id', comment_id).eq('user_id', user_id));
        return {};
    },

    toggle_dossier_certify: async (p: any) => {
        const { dossier_uuid, desired_state } = p;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return {};
        // Idempotency check: ensures offline toggle matches desired server state exactly
        const { data: current } = await supabase
            .from('dossier_certifications')
            .select('id')
            .eq('dossier_id', dossier_uuid)
            .eq('user_id', session.user.id)
            .maybeSingle();
        
        const isCertified = !!current;
        if (isCertified !== desired_state) {
            throwIfError(await supabase.rpc('toggle_dossier_certify', { dossier_uuid }));
        }
        return {};
    },

    increment_dossier_views: async (p: any) => {
        const { dossier_uuid } = p;
        throwIfError(await supabase.rpc('increment_dossier_views', { dossier_uuid }));
        return {};
    },

    // ── The Dispatch ────────────────────────────────────────────────────────
    // Five kinds of filing share one table, so these handlers are written
    // against the table and not against the kind: the database's own CHECK
    // constraints are what decide that a wire has a source and a ballot has
    // options, and duplicating that judgement here would be a second opinion
    // that can drift from the first.
    add_filing: async (p: any) => {
        const { _tempId, _fakeId, ...raw } = p;
        const dbPayload = {
            // The id the optimistic row already carries, for the same reason
            // add_dossier supplies one: without it a transient failure retries
            // and each attempt files ANOTHER copy. With it, a retry hits the
            // primary key, the queue reads 23505 as "the write landed", and the
            // mutation is dropped.
            id: _tempId,
            kind: raw.kind,
            user_id: raw.user_id,
            // NOT NULL, so something must be sent — but the database derives the
            // real handle from profiles on write (trg_derive_username), so
            // whatever is sent here is overwritten. It is a placeholder, not a
            // claim, and that is why an empty string is a safe default.
            author_username: raw.author_username ?? '',
            subject_kind: raw.subject_kind, subject_id: raw.subject_id,
            subject_title: raw.subject_title, subject_sub: raw.subject_sub,
            subject_image: raw.subject_image,
            title: raw.title, body: raw.body, full_content: raw.full_content,
            source: raw.source, source_url: raw.source_url,
            options: raw.options, closes_at: raw.closes_at,
            series_id: raw.series_id, series_title: raw.series_title,
            part_number: raw.part_number,
            spoiler_label: raw.spoiler_label,
            is_published: raw.is_published,
            created_at: raw.created_at,
        };
        const cleaned = cleanFiling(Object.fromEntries(Object.entries(dbPayload).filter(([, v]) => v !== undefined)));
        const result = throwIfError(await supabase.from('dispatch_posts').insert([cleaned]).select('id').maybeSingle());
        if (_tempId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: _tempId as string };
        }
        return {};
    },

    // A WHITELIST, not a blacklist. The row carries columns a member must never
    // set from the client — the counters, the tombstone, a ballot's frozen
    // result, the moderator's withheld_at — and a blacklist is a list of what
    // has been thought of so far. Anything not named here is dropped.
    //
    // `options` and `closes_at` are deliberately absent: changing a ballot's
    // choices or its deadline after votes are cast would silently reinterpret
    // votes people already gave. A ballot is filed once.
    update_filing: async (p: any) => {
        const { id, user_id, updates } = p;
        const ALLOWED = ['title', 'body', 'full_content', 'source', 'source_url',
            'spoiler_label', 'subject_kind', 'subject_id', 'subject_title',
            'subject_sub', 'subject_image', 'series_id', 'series_title',
            'part_number', 'is_published'] as const;
        const u = (updates ?? {}) as Record<string, unknown>;
        const safe: Record<string, unknown> = {};
        for (const k of ALLOWED) if (u[k] !== undefined) safe[k] = u[k];
        // cleanFiling picks the body's cap from the kind — 500 for a dossier's
        // excerpt, 2000 otherwise — so the kind is lent to it for the call and
        // taken straight back. It is never written: changing a take into a
        // dossier would change which CHECK constraints the row must satisfy,
        // retrospectively, on text already written under the other rules.
        //
        // The schema makes kind REQUIRED on this mutation, so it is present. If
        // it somehow is not, the tighter cap is used rather than the looser one:
        // a wrongly-trimmed body is recoverable and a rejected write is not.
        safe.kind = p.kind ?? 'dossier';
        cleanFiling(safe);
        delete safe.kind;
        if (Object.keys(safe).length === 0) return {};
        safe.updated_at = new Date().toISOString();
        safe.edited_at = safe.updated_at;
        throwIfRefused(await supabase.from('dispatch_posts').update(safe)
            .eq('id', id).eq('user_id', user_id).select('id'), 'update_filing');
        return {};
    },

    // Not a delete. `end_filing` erases the text and leaves the row, so the
    // critiques other members wrote underneath it survive — and the RPC checks
    // ownership itself, which is why no user_id is sent to be trusted.
    end_filing: async (p: any) => {
        throwIfError(await supabase.rpc('end_filing', { p_post: p.id, p_by: 'author' }));
        return {};
    },

    add_critique: async (p: any) => {
        const { _tempId, post_id, user_id, author_username, body } = p;
        const result = throwIfError(await supabase.from('dispatch_comments').insert([{
            id: _tempId,
            post_id,
            user_id,
            author_username: author_username ?? '',   // derived server-side; see add_filing
            body: sanitizeInput(body as string, 'critique'),
        }]).select('id').maybeSingle());
        if (_tempId && result.data) {
            return { newId: (result.data as { id: string }).id, fakeId: _tempId as string };
        }
        return {};
    },

    update_critique: async (p: any) => {
        const { id, user_id, body } = p;
        throwIfRefused(await supabase.from('dispatch_comments').update({
            body: sanitizeInput(body as string, 'critique'),
            edited_at: new Date().toISOString(),
        }).eq('id', id).eq('user_id', user_id).select('id'), 'update_critique');
        return {};
    },

    remove_critique: async (p: any) => {
        const { id, user_id } = p;
        throwIfError(await supabase.from('dispatch_comments').delete().eq('id', id).eq('user_id', user_id));
        return {};
    },

    // Both certifications reconcile to a DESIRED STATE rather than flipping.
    // A queued toggle flushed after the member already tapped again on another
    // device lands on the wrong side; reading the server first and acting only
    // on a disagreement makes the flush idempotent no matter how often it runs
    // or how stale it is. The counter is maintained by trigger, so nothing here
    // touches a number.
    certify_filing: async (p: any) => {
        const { post_id, desired_state } = p;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return {};
        const { data: current } = await supabase.from('dispatch_certifications')
            .select('id').eq('post_id', post_id).eq('user_id', session.user.id).maybeSingle();
        if (!!current === desired_state) return {};
        if (desired_state) {
            throwIfError(await supabase.from('dispatch_certifications')
                .insert([{ user_id: session.user.id, post_id }]));
        } else {
            throwIfError(await supabase.from('dispatch_certifications')
                .delete().eq('post_id', post_id).eq('user_id', session.user.id));
        }
        return {};
    },

    certify_critique: async (p: any) => {
        const { comment_id, desired_state } = p;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return {};
        const { data: current } = await supabase.from('dispatch_certifications')
            .select('id').eq('comment_id', comment_id).eq('user_id', session.user.id).maybeSingle();
        if (!!current === desired_state) return {};
        if (desired_state) {
            throwIfError(await supabase.from('dispatch_certifications')
                .insert([{ user_id: session.user.id, comment_id }]));
        } else {
            throwIfError(await supabase.from('dispatch_certifications')
                .delete().eq('comment_id', comment_id).eq('user_id', session.user.id));
        }
        return {};
    },

    // One vote per member per ballot is a UNIQUE constraint, so a replayed vote
    // raises 23505 and the queue reads that as "already landed" and drops it.
    // The deadline is enforced by RLS (votes_still_open), not here: a ballot that
    // closed while the phone was offline must refuse the vote, and a check in
    // this process would be a check against a clock that was wrong.
    cast_vote: async (p: any) => {
        const { post_id, user_id, option_index } = p;
        throwIfError(await supabase.from('dispatch_votes')
            .insert([{ post_id, user_id, option_index }]));
        return {};
    },

    // answer_id may be null: taking the answer back is the same act, undone.
    take_answer: async (p: any) => {
        const { post_id, user_id, answer_id } = p;
        throwIfRefused(await supabase.from('dispatch_posts')
            .update({ answer_id }).eq('id', post_id).eq('user_id', user_id).select('id'), 'take_answer');
        return {};
    },

    save_filing: async (p: any) => {
        const { post_id, user_id } = p;
        throwIfError(await supabase.from('dispatch_saves')
            .insert([{ user_id, post_id }]));
        return {};
    },

    unsave_filing: async (p: any) => {
        const { post_id, user_id } = p;
        throwIfError(await supabase.from('dispatch_saves')
            .delete().eq('post_id', post_id).eq('user_id', user_id));
        return {};
    },

    // ── Moderation ──
    submit_report: async (p: any) => {
        const { reporter_id, content_id, content_type, reason, details, target_user_id } = p;
        throwIfError(await supabase.rpc('submit_report', {
            p_reporter_id: reporter_id,
            p_content_id: content_id,
            p_content_type: content_type,
            p_reason: reason,
            // Last gate — a report queued by the pre-fix build carries raw details,
            // and a moderator is the person who reads it.
            p_details: typeof details === 'string' ? sanitizeInput(details, 'reportDetails') : null,
            p_target_user_id: target_user_id,
        }));
        return {};
    },
};

// ── Compile-time exhaustiveness guard ──
// If a new type is added to QueuedMutation['type'] but no handler exists,
// TypeScript will error on this line at compile time.
const _exhaustiveCheck: Record<QueuedMutation['type'], MutationHandler> = handlers;
void _exhaustiveCheck; // Prevent unused variable warning

// ── Public API ─────────────────────────────────────────────────

export function applyIdMapToPayload(payload: Record<string, unknown>, idMap: Record<string, string>): Record<string, unknown> {
    const mapped: Record<string, unknown> = { ...payload };
    const payloadId = mapped.id as string | undefined;
    const payloadLogId = mapped.log_id as string | undefined;
    const payloadListId = mapped.list_id as string | undefined;
    const payloadDossierId = mapped.dossier_id as string | undefined;
    const payloadDossierUuid = mapped.dossier_uuid as string | undefined;
    const payloadTargetLogId = mapped.target_log_id as string | undefined;
    const payloadTargetListId = mapped.target_list_id as string | undefined;
    const payloadTargetReviewId = mapped.target_review_id as string | undefined;
    const payloadCommentId = mapped.comment_id as string | undefined;
    const payloadMessageId = mapped.message_id as string | undefined;
    const payloadReplyToId = mapped.reply_to_id as string | undefined;
    // ── The Dispatch ──
    // A critique, a certification, a vote, a save and an answer are all written
    // against a filing that may itself still be queued — filed and critiqued in
    // the same offline stretch. Without these two lines the dependent mutation
    // carries the temporary id past the point where the real one is known, and
    // the write fails a foreign key for a row that does exist.
    const payloadPostId = mapped.post_id as string | undefined;
    const payloadAnswerId = mapped.answer_id as string | undefined;

    if (payloadId && Object.prototype.hasOwnProperty.call(idMap, payloadId)) mapped.id = idMap[payloadId];
    if (payloadLogId && Object.prototype.hasOwnProperty.call(idMap, payloadLogId)) mapped.log_id = idMap[payloadLogId];
    if (payloadListId && Object.prototype.hasOwnProperty.call(idMap, payloadListId)) mapped.list_id = idMap[payloadListId];
    if (payloadDossierId && Object.prototype.hasOwnProperty.call(idMap, payloadDossierId)) mapped.dossier_id = idMap[payloadDossierId];
    if (payloadDossierUuid && Object.prototype.hasOwnProperty.call(idMap, payloadDossierUuid)) mapped.dossier_uuid = idMap[payloadDossierUuid];
    if (payloadTargetLogId && Object.prototype.hasOwnProperty.call(idMap, payloadTargetLogId)) mapped.target_log_id = idMap[payloadTargetLogId];
    if (payloadTargetListId && Object.prototype.hasOwnProperty.call(idMap, payloadTargetListId)) mapped.target_list_id = idMap[payloadTargetListId];
    if (payloadTargetReviewId && Object.prototype.hasOwnProperty.call(idMap, payloadTargetReviewId)) mapped.target_review_id = idMap[payloadTargetReviewId];
    if (payloadCommentId && Object.prototype.hasOwnProperty.call(idMap, payloadCommentId)) mapped.comment_id = idMap[payloadCommentId];
    if (payloadMessageId && Object.prototype.hasOwnProperty.call(idMap, payloadMessageId)) mapped.message_id = idMap[payloadMessageId];
    if (payloadReplyToId && Object.prototype.hasOwnProperty.call(idMap, payloadReplyToId)) mapped.reply_to_id = idMap[payloadReplyToId];
    if (payloadPostId && Object.prototype.hasOwnProperty.call(idMap, payloadPostId)) mapped.post_id = idMap[payloadPostId];
    if (payloadAnswerId && Object.prototype.hasOwnProperty.call(idMap, payloadAnswerId)) mapped.answer_id = idMap[payloadAnswerId];

    return mapped;
}

/**
 * Executes a single queued mutation with ID remapping for dependent mutations.
 * Throws UnknownMutationError for types not in the registry (routed to dead-letter).
 */
export async function executeMutation(
    mutation: QueuedMutation,
    idMap: Record<string, string>
): Promise<MutationResult> {
    const handler = handlers[mutation.type];
    if (!handler) {
        throw new UnknownMutationError(mutation.type);
    }

    // Apply ID remapping for dependent mutations (offline optimistic IDs → real DB IDs)
    const mapped = applyIdMapToPayload(mutation.payload, idMap);

    // UTIL-1: yield to the event loop so a full queue doesn't jank the UI — but a
    // 0ms macrotask yield (not a fixed 100ms × N) so flushing N mutations no longer
    // adds ~N×100ms of artificial latency (~10s for a full 100-item queue).
    await new Promise(resolve => setTimeout(resolve, 0));

    return handler(mapped, idMap);
}
