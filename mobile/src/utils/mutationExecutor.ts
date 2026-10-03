/**
 * mutationExecutor.ts — what the offline queue does with each mutation it replays.
 * ─────────────────────────────────────────────────────────
 * Each mutation type maps to a handler through
 * Record<QueuedMutation['type'], MutationHandler>, so a missing handler is a
 * build error, not a runtime dead letter.
 *
 *   • UnknownMutationError routes an unknown type to the dead letters
 *   • dependent mutations have their offline ids remapped to the real ones
 *   • the JS thread breathes (a 0ms macrotask) between mutations
 */

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { InteractionService } from '../services/InteractionService';
import { VaultService } from '../services/VaultService';
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

/**
 * A queued stack's films as save_stack reads them — from either payload shape a
 * phone's queue may hold ({ film_id, film_title } or the store's { id, title }).
 * Not an array: the films are not being changed (null).
 */
function stackFilms(films: unknown): { film_id: number; film_title: string; poster_path: string | null; rank_position: number }[] | null {
    if (!Array.isArray(films)) return null;
    return (films as Record<string, unknown>[]).map((f, idx) => ({
        film_id: Number(f.film_id ?? f.id),
        film_title: String(f.film_title ?? f.title ?? 'Unknown'),
        poster_path: (f.poster_path ?? f.poster ?? null) as string | null,
        rank_position: typeof f.rank_position === 'number' ? f.rank_position : idx,
    }));
}

const throwIfError = <R extends { error: unknown }>(res: R): R => {
    if (res.error) throw res.error;
    return res;
};

/**
 * Like `throwIfError`, but a write that changed NOTHING is also a failure: RLS
 * refuses a WITHHELD or ENDED filing by matching no row, which PostgREST answers
 * with 200. Meaningful only when the caller asks for the rows back (`.select('id')`).
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
        // Select the entire row to preserve viewing_history. A read that failed is
        // raised: taken for "no row", the replay reported done and the log was lost.
        const existing = throwIfError(await supabase.from('logs').select('*').eq('user_id', dbPayload.user_id).eq('film_id', dbPayload.film_id).maybeSingle());
        if (existing.data) {
            const existingData = existing.data;

            // The same id: this insert committed and only its answer was lost, so it is a no-op,
            // not a phantom rewatch. A truly concurrent log has another id and merges below.
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

/**
 * The offline last gate for member prose. The queue PERSISTS in MMKV, so an older
 * build's unsanitised entry flushes through here after an update. `private_notes`
 * too, though owner-only: a rule with exceptions is a rule nobody can check.
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
 * full_content matters most: the markdown render cap assumes the write cap held.
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
    cap('subject_backdrop', 'subjectBackdrop');

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

    remove_endorsement: async (p: any) => {
        // Direct Supabase delete — mirrors the online path in interactionSlice.ts.
        const { user_id, target_log_id, target_list_id, type: endorseType } = p;
        
        // Invariant guard to prevent mass deletion
        if (!target_log_id && !target_list_id) {
            throw new Error('[MutationExecutor] remove_endorsement requires a valid target ID to prevent mass deletion.');
        }

        let deleteQuery = supabase.from('interactions').delete().eq('user_id', user_id as string);
        if (target_log_id)          deleteQuery = deleteQuery.eq('target_log_id', target_log_id as string).eq('type', 'endorse_log');
        else if (target_list_id)    deleteQuery = deleteQuery.eq('target_list_id', target_list_id as string).eq('type', (endorseType as string) ?? 'endorse_list');
        
        throwIfError(await deleteQuery);
        return {};
    },

    // ── The Vault ──
    // Each of these names the viewing it is about, and the server treats a
    // repeat of one that already happened as nothing: adding a viewing that is
    // already there returns it, removing one that is no longer current answers
    // with the current one, and a note is written by viewing, not appended. So a
    // queue flushed twice — the classic way a retry becomes a second rewatch —
    // leaves the archive exactly as one flush would.
    add_viewing: async (p: any) => {
        await VaultService.addViewing(p.log_id as string, p.viewing_id as string, (p.fields ?? {}) as Record<string, unknown>);
        return {};
    },
    remove_viewing: async (p: any) => {
        await VaultService.removeViewing(p.log_id as string, p.viewing_id as string);
        return {};
    },
    set_viewing_note: async (p: any) => {
        // Cleaned here as well as at the source, for the same reason every other
        // prose does: this queue PERSISTS, so an entry written by an older build
        // flushes through this code long after the source was fixed.
        const notes = typeof p.notes === 'string' ? sanitizeInput(p.notes, 'review') : '';
        await VaultService.setNote(p.log_id as string, p.viewing_id as string, notes);
        return {};
    },
    remove_viewing_note: async (p: any) => {
        await VaultService.removeNote(p.viewing_id as string);
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
            // Raised when it fails: unread, the phone's history would overwrite the
            // server's — the erasure this merge exists to prevent.
            const { data } = throwIfError(await supabase.from('logs').select('viewing_history').eq('id', id).maybeSingle());
            if (data && Array.isArray(data.viewing_history)) {
                const serverHistory = data.viewing_history;
                const offlineHistory = upds.viewing_history;
                
                // A composite key: `date` alone merges two rewatches on one day (date-only watches
                // sit at T12:00:00Z); the other fields tell two quick marks apart.
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
        // Owner-filtered behind RLS, as online: no cross-member delete on a wrong session.
        if (user_id) {
            throwIfError(await supabase.from('logs').delete().eq('id', log_id).eq('user_id', user_id));
        } else {
            // An older payload may carry no user_id: RLS alone decides.
            throwIfError(await supabase.from('logs').delete().eq('id', log_id));
        }
        return {};
    },

    add_log_comment: async (p: any) => {
        const { id, log_id, user_id, body } = p;
        // log_comments.username is NOT NULL and filled by no trigger (display joins profiles).
        const username = (p.username as string) || useAuthStore.getState().user?.username || 'anonymous';
        // Zero-width and control characters stripped; MAX_LENGTHS.logComment enforced.
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
        // Merged, not overwritten: a queued change must not clobber another device's prefs.
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
        const { films, _tempId, id, title, description, is_private, is_ranked } = p;
        // Whole, or not at all (save_stack, 20260930_01) — and a replay of a create
        // that already landed is a no-op, not a duplicate. The last gate, as
        // cleanProse: a stack queued by an older build flushes raw otherwise.
        const { data } = throwIfError(await supabase.rpc('save_stack', {
            p_id: id,
            p_title: typeof title === 'string' ? sanitizeInput(title, 'listTitle') : null,
            p_description: typeof description === 'string' ? sanitizeInput(description, 'listDescription') : null,
            p_is_private: is_private ?? false,
            p_is_ranked: is_ranked ?? false,
            p_films: stackFilms(films) ?? [],
            p_create: true,
        }));
        const listId = (data as { id?: string } | null)?.id ?? id;
        if (_tempId) return { newId: listId, fakeId: _tempId as string };
        return {};
    },

    delete_list: async (p: any) => {
        const { list_id } = p;
        // One atomic call, as the store's own delete makes it. A fallback for a
        // database without the function deleted table by table, other members'
        // critiques included, for a database this app never meets.
        throwIfError(await supabase.rpc('delete_list_cascade', { p_list_id: list_id }));
        return {};
    },

    add_list_comment: async (p: any) => {
        const { id, list_id, user_id, content } = p;
        const dbPayload = {
            id,
            list_id,
            user_id,
            content: sanitizeInput(content as string, 'listComment')
        };
        // By its own id, and a row already there is left as it is: a send whose
        // answer was lost is replayed, and must not file the critique twice.
        throwIfError(await supabase.from('list_comments')
            .upsert([dbPayload], { onConflict: 'id', ignoreDuplicates: true }));

        // The notice is the `tr_notify_list_comment` trigger's, on the INSERT above.
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
        // Whole, or not at all (save_stack, 20260930_01): the details, and — when
        // the payload carries them — exactly its films. A payload's own
        // removed_film_ids (an older build's) is implied by the films it lists.
        const { list_id, updates, films } = p;
        const u = (updates ?? {}) as Record<string, unknown>;
        throwIfError(await supabase.rpc('save_stack', {
            p_id: list_id,
            // Same last gate as create_list above — a queued EDIT from an older build.
            p_title: typeof u.title === 'string' ? sanitizeInput(u.title, 'listTitle') : null,
            p_description: typeof u.description === 'string' ? sanitizeInput(u.description, 'listDescription') : null,
            p_is_private: typeof u.is_private === 'boolean' ? u.is_private : null,
            p_is_ranked: typeof u.is_ranked === 'boolean' ? u.is_ranked : null,
            p_films: stackFilms(films),
        }));
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

    // No build enqueues this (its table is gone): succeeding drains a stray, never a wedge.
    save_stub: async () => ({}),

    // ── Social ──
    follow_user: async (p: any) => {
        // Social graph offline queue — follow
        // Use pre-resolved target_user_id from enqueue time when available.
        // Falls back to username resolution only if ID wasn't cached at enqueue time.
        const { user_id, target_username, target_user_id } = p;
        let resolvedId = target_user_id as string | null;
        if (!resolvedId && target_username) {
            // No such member is `null`, and skipped; a read that failed is raised, so
            // the queue keeps the write instead of reporting it done.
            const { data: targetProfile } = throwIfError(await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle());
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
            // No such member is `null`, and skipped; a read that failed is raised, so
            // the queue keeps the write instead of reporting it done.
            const { data: targetProfile } = throwIfError(await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle());
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
            // No such member is `null`, and skipped; a read that failed is raised, so
            // the queue keeps the write instead of reporting it done.
            const { data: targetProfile } = throwIfError(await supabase.from('profiles').select('id').eq('username', target_username as string).maybeSingle());
            resolvedId = targetProfile?.id ?? null;
        }
        if (resolvedId) {
            // BOTH types, as online: a cancelled pending request must not stand at their door.
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
        const { id, lounge_id, user_id, username, content, type: msgType, _tempId, film_id, film_title, film_poster, reply_to_id, reply_to_username, reply_to_content, metadata } = p;
        const dbPayload = {
            // The message's own id, as the live send: a send whose answer was lost
            // has already landed, and a retry must hit the key (23505, "landed")
            // rather than post the message twice.
            id: id ?? _tempId,
            lounge_id, user_id, username,
            // One cap, the composer's: MAX_LENGTHS.loungeMessage.
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
     * An older build's kind, still in members' persisted queues: without it their deletion
     * would dead-letter and the message reappear. Completed as today's withdrawal (a
     * tombstone); the RPC takes the caller from auth.uid(), so user_id is ignored.
     */
    delete_lounge_message: async (p: any) => {
        const { message_id } = p;
        const { error } = await supabase.rpc('withdraw_lounge_message', { p_message_id: message_id as string });
        if (error) throw error;
        return {};
    },

    withdraw_lounge_message: async (p: any) => {
        // The RPC, never a hard delete: a tombstone keeps a reply's parent in the transcript.
        // It checks authorship itself and ignores a row already gone, so a repeat is harmless.
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

        // No session: kept for later, never reported done (the tier would never sync). A plain
        // error would be dead-lettered; the 503 is a classifier hint — isNetworkError halts the
        // flush with the mutation intact — and honest: auth really is unavailable.
        if (!session?.access_token) {
            const err: any = new Error('sync_entitlement: no session — keeping queued for retry');
            err.status = 503;
            throw err;
        }

        // Queued for another account: the function applies the tier to THIS JWT's member, so
        // it is refused and dead-lettered — no retry can make it right.
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

        // The reply matters: seatClaimed=false (the founding seats were full, Auteur given
        // instead) and applied=false (the entitlement rule refused) must reach the member.
        try {
            return await response.json();
        } catch {
            return {};
        }
    },

    // ── Dossiers ────────────────────────────────────────────────────────────
    // Older builds' kinds, still in persisted queues. They work: each table below is a
    // view over dispatch_posts / dispatch_comments with an INSTEAD OF trigger. They can go
    // once no device can hold one — the launch build out longer than the 24h staleness window.
    add_dossier: async (p: any) => {
        // No id: the view's trigger (dossiers_write) files the essay under a fresh one and
        // ignores any sent, so the answer's id is what the optimistic row is renamed to.
        const dbPayload = {
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
        // Zero-width and control characters stripped; MAX_LENGTHS.dossierComment enforced.
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
        // Raised when it fails: read as "not certified", an uncertify was reported
        // done and never sent.
        const { data: current } = throwIfError(await supabase
            .from('dossier_certifications')
            .select('id')
            .eq('dossier_id', dossier_uuid)
            .eq('user_id', session.user.id)
            .maybeSingle());
        
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
            // The optimistic row's id: a retry hits the key (23505, "landed"), never a copy.
            id: _tempId,
            kind: raw.kind,
            user_id: raw.user_id,
            // NOT NULL, but overwritten from profiles (trg_derive_username): a placeholder.
            author_username: raw.author_username ?? '',
            subject_kind: raw.subject_kind, subject_id: raw.subject_id,
            subject_title: raw.subject_title, subject_sub: raw.subject_sub,
            // The poster AND the cover, as online (dispatchOfflineParity).
            subject_image: raw.subject_image, subject_backdrop: raw.subject_backdrop,
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
            // The cover travels with the film, or the old still stays behind a new title.
            'subject_sub', 'subject_image', 'subject_backdrop', 'series_id', 'series_title',
            'part_number', 'is_published'] as const;
        const u = (updates ?? {}) as Record<string, unknown>;
        const safe: Record<string, unknown> = {};
        for (const k of ALLOWED) if (u[k] !== undefined) safe[k] = u[k];
        // The kind is lent to cleanFiling for the body's cap and never written (a take turned
        // dossier would meet new CHECKs retrospectively). Missing, the tighter cap applies:
        // a trimmed body is recoverable, a refused write is not.
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

    // Certifications reconcile to a DESIRED STATE, never flip: the server is read first, so
    // a stale or repeated flush cannot land on the wrong side. A trigger keeps the count.
    certify_filing: async (p: any) => {
        const { post_id, desired_state } = p;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return {};
        // Raised when it fails, as in toggle_dossier_certify: "not certified" is not
        // what a failed read says.
        const { data: current } = throwIfError(await supabase.from('dispatch_certifications')
            .select('id').eq('post_id', post_id).eq('user_id', session.user.id).maybeSingle());
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
        const { data: current } = throwIfError(await supabase.from('dispatch_certifications')
            .select('id').eq('comment_id', comment_id).eq('user_id', session.user.id).maybeSingle());
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

    // A replayed vote hits the UNIQUE key (23505, "landed"). The deadline is RLS's
    // (votes_still_open): the server's clock, not a phone that was offline.
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
            // The last gate: an older build's report has raw details, and a moderator reads them.
            p_details: typeof details === 'string' ? sanitizeInput(details, 'reportDetails') : null,
            p_target_user_id: target_user_id,
        }));
        return {};
    },
};

// A mutation type with no handler is a compile error here.
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
    const payloadCommentId = mapped.comment_id as string | undefined;
    const payloadMessageId = mapped.message_id as string | undefined;
    const payloadReplyToId = mapped.reply_to_id as string | undefined;
    // A critique, mark, vote or answer may name a filing queued with it: remapped, or it fails.
    const payloadPostId = mapped.post_id as string | undefined;
    const payloadAnswerId = mapped.answer_id as string | undefined;

    if (payloadId && Object.prototype.hasOwnProperty.call(idMap, payloadId)) mapped.id = idMap[payloadId];
    if (payloadLogId && Object.prototype.hasOwnProperty.call(idMap, payloadLogId)) mapped.log_id = idMap[payloadLogId];
    if (payloadListId && Object.prototype.hasOwnProperty.call(idMap, payloadListId)) mapped.list_id = idMap[payloadListId];
    if (payloadDossierId && Object.prototype.hasOwnProperty.call(idMap, payloadDossierId)) mapped.dossier_id = idMap[payloadDossierId];
    if (payloadDossierUuid && Object.prototype.hasOwnProperty.call(idMap, payloadDossierUuid)) mapped.dossier_uuid = idMap[payloadDossierUuid];
    if (payloadTargetLogId && Object.prototype.hasOwnProperty.call(idMap, payloadTargetLogId)) mapped.target_log_id = idMap[payloadTargetLogId];
    if (payloadTargetListId && Object.prototype.hasOwnProperty.call(idMap, payloadTargetListId)) mapped.target_list_id = idMap[payloadTargetListId];
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

    // A 0ms yield keeps a full queue from janking the UI without adding latency per item.
    await new Promise(resolve => setTimeout(resolve, 0));

    return handler(mapped, idMap);
}
