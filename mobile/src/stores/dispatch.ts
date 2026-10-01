/**
 * The Dispatch — the feed, and every act a member can perform on it.
 * ─────────────────────────────────────────────────────────────────────────────
 * Five kinds of filing share one table, so this store is written against the
 * TABLE and not against the kind. What a wire must carry and what a ballot must
 * carry are CHECK constraints on `dispatch_posts`; re-stating them here would be
 * a second opinion that can drift from the first.
 *
 * ── EVERY NUMBER ON THIS PAGE IS A REAL ONE ─────────────────────────────────
 * `certify_count` and `comment_count` are maintained by database triggers, so
 * they survive a cascade delete and cannot drift the way the old hand-maintained
 * dossier counter did. Nothing in this file ever writes a counter; it writes the
 * ROW that causes the counter to move, and reads the counter back.
 *
 * ── OPTIMISM, AND WHAT PAYS FOR IT ──────────────────────────────────────────
 * Every act applies locally first so the page never waits on a network. Each one
 * therefore carries its own undo, and each one keeps the id it invented so a
 * retry lands on the same row. Offline, the act goes to the mutation queue built
 * in step 2 — where the toggles reconcile to a DESIRED STATE rather than
 * flipping, so a flush is idempotent however stale it is.
 *
 * ── NOT PERSISTED ───────────────────────────────────────────────────────────
 * Same reasoning as the dossier store it replaces: this is server-canonical
 * editorial content, and a stale copy on disk is worse than a fetch on launch.
 */
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';
import { logger } from '../utils/logger';
import { isNetworkError } from '../utils/networkError';
import { enqueueMutation, flushOfflineQueue } from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { sanitizeInput } from '../utils/sanitizeInput';
import { withAbortSignal } from '../utils/withAbortSignal';
import { withTimeout } from '../utils/withTimeout';
import { useAuthStore } from './auth';
import { memberUnchanged } from './domain/helpers/sessionGuard';
import { registerStoreReset } from './resetAllStores';
import {
  COMMENT_PAGE_SIZE,
  CRITIQUE_COLUMNS,
  FILING_CARD_COLUMNS,
  FILING_FULL_COLUMNS,
  PAGE_SIZE,
  parseCritiqueRows,
  parseFilingRows,
  paperTierOf,
  SECTIONS,
  type Section,
  type BallotOption,
  type Critique,
  type CritiqueOrder,
  type Filing,
  type FilingKind,
} from './dispatchTypes';

// ── THE DEPARTMENTS ─────────────────────────────────────────────────────────

export { SECTIONS, type Section };
export type Sort = 'LATEST' | 'CERTIFIED';

/**
 * The index says TAKES; a row says `take`. One table maps the two, so the
 * plural in the chrome and the singular in the column can never disagree.
 * ALL maps to nothing because it is the absence of a filter, not a sixth kind.
 *
 * ESSAYS maps to `dossier` for the same reason `KIND_NAME` exists: the column is
 * a live value on rows already filed, and what a member reads is a separate
 * decision from what the wire carries.
 */
const SECTION_KIND: Record<Section, FilingKind | null> = {
  ALL: null,
  TAKES: 'take',
  SEEKING: 'seeking',
  WIRE: 'wire',
  BALLOTS: 'ballot',
  ESSAYS: 'dossier',
};

/** One page: PAGE_SIZE, the one binding paperMetrics' empty state and skeleton also read. */
const PAGE = PAGE_SIZE;

/** "Is there more?" is "did a full page come back": any other test stops early or loops. */
const gotFullPage = (n: number) => n === PAGE;

// ── STATE ───────────────────────────────────────────────────────────────────

export interface DispatchState {
  filings: Filing[];
  /** Filings opened by address (a notice, a link), which the page does not hold. See heldFiling. */
  opened: Record<string, Filing>;
  section: Section;
  sort: Sort;
  savedOnly: boolean;

  loading: boolean;
  /**
   * Whether the page on screen has been read: 'unread' before its first answer
   * (so an empty list is not yet an empty paper), 'failed' when that read
   * failed and nothing is shown. A failed refresh keeps the page, and 'read'.
   */
  pageState: 'unread' | 'read' | 'failed';
  loadingMore: boolean;
  hasMore: boolean;
  /** Rows the boundary refused. Surfaced so a schema change is visible, not quiet. */
  droppedRows: number;

  certifiedIds: Set<string>;
  savedIds: Set<string>;
  /** post id → the option index this member marked. */
  myVotes: Record<string, number>;

  critiques: Record<string, Critique[]>;
  critiquesLoading: Record<string, boolean>;
  /** Fetching the NEXT page, which is a different state from fetching the first. */
  critiquesLoadingMore: Record<string, boolean>;
  /** Whether the server has more beyond what has been asked for. */
  critiquesHasMore: Record<string, boolean>;
  /** The order the loaded pages were fetched IN, so a page can be continued. */
  critiquesOrder: Record<string, CritiqueOrder>;
  certifiedCritiqueIds: Set<string>;

  setSection: (s: Section) => void;
  setSort: (s: Sort) => void;
  setSavedOnly: (on: boolean) => void;

  /** How many filings have arrived above the page since it was drawn. */
  newCount: number;

  /**
   * Never rejects: the outcome is in `pageState`, and in the answer — true when
   * the page was read. A refresh that failed over a page keeps the page and
   * 'read', so a caller that pulled learns it only from here.
   */
  fetch: () => Promise<boolean>;
  loadMore: () => Promise<void>;
  /** Is there new paper above the page? A count, not a socket (see its implementation). */
  checkForNew: () => Promise<void>;
  /**
   * One filing, with its essay, for the reader: null when it is not there (or
   * not readable), 'unreachable' when the read itself failed, which says
   * nothing about whether it exists.
   */
  hydrate: (id: string) => Promise<Filing | null | 'unreachable'>;

  /** This member's marks on filings the store did not fetch (a room's own page). */
  loadMarks: (filings: Filing[]) => Promise<void>;

  file: (draft: FilingDraft) => Promise<{ id: string; offline?: boolean } | null>;
  amend: (id: string, updates: FilingUpdate) => Promise<void | { offline: boolean }>;
  end: (id: string) => Promise<void | { offline: boolean }>;

  certify: (id: string, next: boolean) => void;
  save: (id: string, next: boolean) => void;
  vote: (id: string, optionIndex: number) => void;
  takeAnswer: (postId: string, critiqueId: string | null) => void;

  /** `order` is required: the screen knows it, and a default here would be a second opinion. */
  fetchCritiques: (postId: string, order: CritiqueOrder) => Promise<void>;
  loadMoreCritiques: (postId: string) => Promise<void>;
  addCritique: (postId: string, body: string) => Promise<void | { offline: boolean }>;
  amendCritique: (id: string, postId: string, body: string) => Promise<void>;
  removeCritique: (id: string, postId: string) => Promise<void>;
  certifyCritique: (id: string, postId: string, next: boolean) => void;
}

export interface FilingDraft {
  kind: FilingKind;
  title?: string | null;
  body: string;
  fullContent?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  /**
   * `image` is the POSTER, which the feed card prints. `backdrop` is the wide
   * still an essay bleeds behind its title — two different pictures of one
   * film, both wanted at once, which is why they are two fields and not one.
   */
  film?: {
    id: number; title: string; sub?: string | null;
    image?: string | null; backdrop?: string | null;
  } | null;
  options?: BallotOption[] | null;
  closesAt?: string | null;
  seriesId?: string | null;
  seriesTitle?: string | null;
  partNumber?: number | null;
  spoilerLabel?: string | null;
}

export type FilingUpdate = Partial<Omit<FilingDraft, 'kind' | 'options' | 'closesAt'>>;

/**
 * What every change of page resets. `loadingMore` too: a next page still on its
 * way for the old page is dropped by the generation check, and without this its
 * spinner would stay, and hold off every next page of the new one.
 */
const A_NEW_PAGE = {
  filings: [] as Filing[], hasMore: true, newCount: 0,
  loadingMore: false, pageState: 'unread' as DispatchState['pageState'],
};

// A fetch in flight, and the generation that says whether its answer is still wanted:
// a slow TAKES response never paints over a fast WIRE one.
let inflight: Promise<boolean> | null = null;
let generation = 0;

/**
 * The page now asks for something else. Both go: the stale answer must not paint
 * the new department, and the next fetch must not be handed the old request
 * (`fetch` returns whatever is in flight).
 */
const invalidateInflight = () => {
  generation++;
  inflight = null;
};

/** Twelve: the map only lets an act find the row being read, and an essay is 25,000 chars. */
const OPENED_KEPT = 12;

/** Insertion-ordered, oldest dropped. `delete` first so a re-open moves to the end. */
function capOpened(
  opened: Record<string, Filing>,
  id: string,
  one: Filing,
): Record<string, Filing> {
  const next = { ...opened };
  delete next[id];
  next[id] = one;
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - OPENED_KEPT; i++) delete next[keys[i]];
  return next;
}

/** The filing, wherever it is held — the page, or the map of those opened by address.
 *  Every act that needs the ROW asks here, so none quietly does nothing on a cold open. */
const heldFiling = (st: DispatchState, id: string): Filing | null =>
  st.filings.find((f) => f.id === id) ?? st.opened[id] ?? null;

/**
 * Change a filing in BOTH places at once.
 *
 * Written once because every optimistic update and every rollback has to touch
 * the pair, and a version that updated only `filings` would leave the reader —
 * which falls back to `opened` — showing the state before the act.
 */
const patchFiling = (
  st: DispatchState,
  id: string,
  next: (f: Filing) => Filing,
): Pick<DispatchState, 'filings' | 'opened'> => {
  const held = st.opened[id];
  return {
    filings: st.filings.map((f) => (f.id === id ? next(f) : f)),
    opened: held ? { ...st.opened, [id]: next(held) } : st.opened,
  };
};

const emptyState = () => ({
  filings: [] as Filing[],
  opened: {} as Record<string, Filing>,
  section: 'ALL' as Section,
  sort: 'LATEST' as Sort,
  savedOnly: false,
  loading: false,
  pageState: 'unread' as DispatchState['pageState'],
  loadingMore: false,
  hasMore: true,
  droppedRows: 0,
  newCount: 0,
  certifiedIds: new Set<string>(),
  savedIds: new Set<string>(),
  myVotes: {} as Record<string, number>,
  critiques: {} as Record<string, Critique[]>,
  critiquesLoading: {} as Record<string, boolean>,
  critiquesLoadingMore: {} as Record<string, boolean>,
  critiquesHasMore: {} as Record<string, boolean>,
  critiquesOrder: {} as Record<string, CritiqueOrder>,
  certifiedCritiqueIds: new Set<string>(),
});

export const useDispatch = create<DispatchState>((set, get) => ({
  ...emptyState(),

  // ── THE INDEX AND THE TOOLS ───────────────────────────────────────────────
  // Each of these re-fetches rather than filtering what is already loaded. A
  // client-side filter over one page would show four takes out of a hundred and
  // call it the TAKES department.
  setSection: (s) => {
    if (get().section === s) return;
    set({ section: s, ...A_NEW_PAGE });
    invalidateInflight();
    void get().fetch();
  },
  setSort: (s) => {
    if (get().sort === s) return;
    set({ sort: s, ...A_NEW_PAGE });
    invalidateInflight();
    void get().fetch();
  },
  setSavedOnly: (on) => {
    if (get().savedOnly === on) return;
    set({ savedOnly: on, ...A_NEW_PAGE });
    invalidateInflight();
    void get().fetch();
  },

  // ── READING ───────────────────────────────────────────────────────────────
  fetch: async () => {
    if (inflight) return inflight;
    const gen = ++generation;
    const startedAs = useAuthStore.getState().user?.id ?? null;
    set({ loading: true });

    const run = (async () => {
      try {
        const rows = await pageQuery(get(), null);
        if (gen !== generation || !memberUnchanged(startedAs)) return false;
        const { filings, dropped } = parseFilingRows(rows);
        set({ filings, hasMore: gotFullPage(rows.length), droppedRows: dropped, newCount: 0, pageState: 'read' });
        if (dropped > 0) {
          logger.warn(`[dispatch] dropped ${dropped} malformed filing row(s)`);
        }
        await loadViewerState(filings, set, startedAs);
        return true;
      } catch (e) {
        if (gen !== generation) return false;
        if (!isNetworkError(e)) captureError(e, { where: 'dispatch.fetch' });
        if (get().filings.length === 0) set({ pageState: 'failed' });
        return false;
      } finally {
        // Both guarded: a superseded request must not clear the slot of the one that replaced it.
        if (gen === generation) {
          set({ loading: false });
          inflight = null;
        }
      }
    })();

    inflight = run;
    return run;
  },

  // A HEAD count, not a realtime socket: a socket needs the table in the publication (every
  // certify replicated to every reader) and a second connection, to answer "is there new
  // paper?" once a minute. RLS filters it, so a blocked member's filing is not counted.
  checkForNew: async () => {
    const s = get();
    // Only under LATEST, once there is a page to be newer than: under CERTIFIED "above you" is
    // no position, and the saved page gains only what the member puts there.
    if (s.sort !== 'LATEST' || s.savedOnly || s.filings.length === 0) return;
    if (s.loading || s.loadingMore) return;

    const newest = s.filings[0].createdAt;
    const kind = SECTION_KIND[s.section];
    const startedAs = useAuthStore.getState().user?.id ?? null;

    try {
      let q = supabase
        .from('dispatch_posts')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
        .is('withheld_at', null)
        .gt('created_at', newest);
      if (kind) q = q.eq('kind', kind);

      const { count, error } = await timed((sig) => withAbortSignal(q, sig), 'dispatch.checkForNew');
      if (error) throw error;
      if (!memberUnchanged(startedAs)) return;
      // A check that lands after the member changed the page announces nothing.
      if (get().sort !== 'LATEST' || get().savedOnly) return;
      set({ newCount: count ?? 0 });
    } catch (e) {
      // An uncounted pill simply does not appear.
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.checkForNew' });
    }
  },

  loadMore: async () => {
    const s = get();
    // Not while a page is on its way, at the end, or before the first page (fetch's job).
    if (s.loadingMore || s.loading || !s.hasMore || s.filings.length === 0) return;
    const gen = generation;
    const startedAs = useAuthStore.getState().user?.id ?? null;
    set({ loadingMore: true });
    try {
      const rows = await pageQuery(s, s.filings[s.filings.length - 1]);
      if (gen !== generation || !memberUnchanged(startedAs)) return;
      const { filings: page } = parseFilingRows(rows);
      // De-duplicated: a filing can arrive twice, and FlashList would draw a duplicate key.
      const seen = new Set(get().filings.map((f) => f.id));
      const fresh = page.filter((f) => !seen.has(f.id));
      set((st) => ({ filings: [...st.filings, ...fresh], hasMore: gotFullPage(rows.length) }));
      await loadViewerState(fresh, set, startedAs);
    } catch (e) {
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.loadMore' });
    } finally {
      if (gen === generation) set({ loadingMore: false });
    }
  },

  hydrate: async (id) => {
    const startedAs = useAuthStore.getState().user?.id ?? null;
    try {
      const { data, error } = await timed(
        (signal) =>
          withAbortSignal(
            supabase.from('dispatch_posts').select(FILING_FULL_COLUMNS).eq('id', id).maybeSingle(),
            signal,
          ),
        'dispatch.hydrate',
      );
      if (error) throw error;
      if (!data || !memberUnchanged(startedAs)) return null;
      const { filings } = parseFilingRows([data]);
      const one = filings[0] ?? null;
      if (!one) return null;
      // Kept on the row, where the reader reads it: in a component the essay would fall back
      // to its 500-character opening on the next render. Re-opening is then instant.
      set((st) => ({
        filings: st.filings.some((f) => f.id === id)
          ? st.filings.map((f) => (f.id === id ? one : f))
          : st.filings,
        // Recorded (bounded) whether or not the page holds it, so acts find it after a cold open.
        opened: capOpened(st.opened, id, one),
      }));
      await loadViewerState([one], set, startedAs);
      return one;
    } catch (e) {
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.hydrate' });
      return 'unreachable';
    }
  },

  // Without these a member's own room draws every mark empty, and tapping one already true
  // is refused as a duplicate. It merges, never clears, so pages cannot wipe each other.
  loadMarks: async (filings) => {
    await loadViewerState(filings, set, useAuthStore.getState().user?.id ?? null);
  },

  // ── FILING ────────────────────────────────────────────────────────────────
  file: async (draft) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;
    const startedAs = user.id;

    // One choke point: what is shown, sent and replayed are the same cleaned values.
    const clean = cleanDraft(draft);
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: Filing = {
      id,
      kind: clean.kind,
      authorId: user.id,
      author: {
        name: user.username ?? '',
        memberNo: (user as { member_no?: number }).member_no ?? 0,
        tier: paperTierOf(user),
        avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
      },
      film: clean.film
        ? {
          title: clean.film.title, director: clean.film.sub ?? null,
          posterPath: clean.film.image ?? null, backdropPath: clean.film.backdrop ?? null,
        }
        : null,
      subjectId: clean.film?.id ?? null,
      subjectKind: clean.film ? 'film' : null,
      title: clean.title ?? null,
      body: clean.body,
      fullContent: clean.fullContent ?? null,
      source: clean.source ?? null,
      sourceUrl: clean.sourceUrl ?? null,
      options: clean.options ?? null,
      closesAt: clean.closesAt ?? null,
      frozenTotals: null,
      answerId: null,
      seriesId: clean.seriesId ?? null,
      seriesTitle: clean.seriesTitle ?? null,
      partNumber: clean.partNumber ?? null,
      spoilerLabel: clean.spoilerLabel ?? null,
      // Nothing just written is under review: the house has not seen it yet.
      withheldAt: null,
      endedAt: null,
      endedBy: null,
      certifyCount: 0,
      commentCount: 0,
      createdAt: now,
      editedAt: null,
    };

    // Shown only where it belongs: a wire filed from TAKES waits for its own department.
    const visibleHere = get().section === 'ALL' || SECTION_KIND[get().section] === clean.kind;
    if (visibleHere && !get().savedOnly) {
      set((st) => ({ filings: [optimistic, ...st.filings] }));
    }

    const row = toInsertRow(id, user.id, user.username ?? '', clean, now);

    try {
      const { error } = await supabase.from('dispatch_posts').insert([row]);
      if (error) throw error;
      return { id };
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'add_filing', payload: { _tempId: id, ...row } });
        flushOfflineQueue();
        reelToast.success('Filed. It goes out when the wire is back.');
        return { id, offline: true };
      }
      if (memberUnchanged(startedAs)) {
        set((st) => ({ filings: st.filings.filter((f) => f.id !== id) }));
      }
      throw e;
    }
  },

  /**
   * An amend, from the reader's AMEND (`/dispatch/compose?edit=<id>`): the writing room
   * for an essay, the short desks for the rest. It sets `edited_at`, which the card's
   * EDITED mark reads.
   */
  amend: async (id, updates) => {
    const user = useAuthStore.getState().user;
    const filing = heldFiling(get(), id);
    if (!user || !filing) return;
    const startedAs = user.id;

    const clean = cleanUpdate(filing.kind, updates);
    const before = filing;
    const now = new Date().toISOString();

    set((st) => patchFiling(st, id, (f) => ({
      ...f,
      title: clean.title !== undefined ? clean.title : f.title,
      body: clean.body !== undefined ? clean.body : f.body,
      fullContent: clean.fullContent !== undefined ? clean.fullContent : f.fullContent,
      source: clean.source !== undefined ? clean.source : f.source,
      sourceUrl: clean.sourceUrl !== undefined ? clean.sourceUrl : f.sourceUrl,
      spoilerLabel: clean.spoilerLabel !== undefined ? clean.spoilerLabel : f.spoilerLabel,
      editedAt: now,
    })));

    const dbUpdates = toUpdateRow(clean);
    try {
      // `posts_update_own` refuses a WITHHELD or ENDED filing by matching no row, which
      // PostgREST answers with 200. `.select('id')` turns that silence into an answer.
      const { data, error } = await supabase
        .from('dispatch_posts')
        .update({ ...dbUpdates, edited_at: now, updated_at: now })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('dispatch.amend: refused');
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'update_filing',
          payload: { id, user_id: user.id, kind: filing.kind, updates: dbUpdates },
        });
        flushOfflineQueue();
        return { offline: true };
      }
      if (memberUnchanged(startedAs)) {
        set((st) => patchFiling(st, id, () => before));
      }
      throw e;
    }
  },

  /**
   * Ending is not deleting.
   *
   * The row stays so the critiques other members wrote underneath it stay, and
   * the server erases the text — this never sends empty strings, because an
   * erasure written by the client is an erasure a client can get wrong.
   */
  end: async (id) => {
    const user = useAuthStore.getState().user;
    const before = heldFiling(get(), id);
    if (!user || !before) return;
    const startedAs = user.id;

    // The page empties what the house empties (dispatch_empty_filing): the
    // words, the stills and cover, the source and its link.
    const ended: Filing = {
      ...before,
      body: '', fullContent: null, title: null, source: null, sourceUrl: null, spoilerLabel: null,
      film: before.film ? { ...before.film, posterPath: null, backdropPath: null } : null,
      endedAt: new Date().toISOString(), endedBy: 'author',
    };
    set((st) => patchFiling(st, id, () => ended));

    try {
      const { error } = await supabase.rpc('end_filing', { p_post: id, p_by: 'author' });
      if (error) throw error;
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'end_filing', payload: { id, user_id: user.id } });
        flushOfflineQueue();
        return { offline: true };
      }
      if (memberUnchanged(startedAs)) {
        set((st) => patchFiling(st, id, () => before));
      }
      throw e;
    }
  },

  // ── THE ACTS ──────────────────────────────────────────────────────────────
  // Each moves the visible number, then writes the row a trigger counts; this file never
  // writes a count, so the two agree on the next fetch.
  certify: (id, next) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const had = get().certifiedIds.has(id);
    if (had === next) return;

    set((st) => {
      const ids = new Set(st.certifiedIds);
      if (next) ids.add(id); else ids.delete(id);
      return {
        certifiedIds: ids,
        ...patchFiling(st, id, (f) => ({
          ...f, certifyCount: Math.max(0, f.certifyCount + (next ? 1 : -1)),
        })),
      };
    });

    void writeThrough(
      async () => {
        const q = next
          ? supabase.from('dispatch_certifications').insert([{ user_id: user.id, post_id: id }])
          : supabase.from('dispatch_certifications').delete().eq('post_id', id).eq('user_id', user.id);
        const { error } = await q;
        if (refusedMark(error, next)) throw error;
      },
      { type: 'certify_filing', payload: { post_id: id, desired_state: next } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => {
          const ids = new Set(st.certifiedIds);
          if (next) ids.delete(id); else ids.add(id);
          return {
            certifiedIds: ids,
            ...patchFiling(st, id, (f) => ({
              ...f, certifyCount: Math.max(0, f.certifyCount + (next ? -1 : 1)),
            })),
          };
        });
      },
      'dispatch.certify',
      user.id,
    );
  },

  save: (id, next) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    if (get().savedIds.has(id) === next) return;

    // Where it was: an unsave takes the card off the saved page, and a refusal puts back both.
    const removedAt = get().filings.findIndex((f) => f.id === id);
    const removed = removedAt >= 0 ? get().filings[removedAt] : null;

    set((st) => {
      const ids = new Set(st.savedIds);
      if (next) ids.add(id); else ids.delete(id);
      // On the saved page, an unsaved entry no longer belongs there.
      const filings = !next && st.savedOnly ? st.filings.filter((f) => f.id !== id) : st.filings;
      return { savedIds: ids, filings };
    });

    void writeThrough(
      async () => {
        const q = next
          ? supabase.from('dispatch_saves').insert([{ user_id: user.id, post_id: id }])
          : supabase.from('dispatch_saves').delete().eq('post_id', id).eq('user_id', user.id);
        const { error } = await q;
        if (refusedMark(error, next)) throw error;
      },
      { type: next ? 'save_filing' : 'unsave_filing', payload: { post_id: id, user_id: user.id } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => {
          const ids = new Set(st.savedIds);
          if (next) ids.delete(id); else ids.add(id);
          // Back where it was, not at the top (as removeCritique does).
          const gone = removed && !st.filings.some((f) => f.id === id);
          const filings = gone ? [...st.filings] : st.filings;
          if (gone) filings.splice(Math.min(removedAt, filings.length), 0, removed);
          return { savedIds: ids, filings };
        });
      },
      'dispatch.save',
      user.id,
    );
  },

  /**
   * A vote is cast once and never changed.
   *
   * The database enforces it — UNIQUE (post_id, user_id) — so this refuses a
   * second vote locally rather than showing a mark that the server will reject.
   * The deadline is NOT checked here: a ballot that closed while the phone was
   * asleep must be refused by the server's clock, not by this one.
   */
  vote: (id, optionIndex) => {
    const user = useAuthStore.getState().user;
    if (!user || get().myVotes[id] !== undefined) return;

    set((st) => ({ myVotes: { ...st.myVotes, [id]: optionIndex } }));

    void writeThrough(
      async () => {
        const { error } = await supabase
          .from('dispatch_votes')
          .insert([{ post_id: id, user_id: user.id, option_index: optionIndex }]);
        if (!error) return;
        // A vote the house already holds (another device, or a mark this phone could not
        // read) stands: the ballot shows the one it holds, not a refusal.
        if (error.code === '23505') {
          const { data: held, error: unread } = await supabase
            .from('dispatch_votes')
            .select('option_index')
            .eq('post_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!unread && held && memberUnchanged(user.id)) {
            set((st) => ({ myVotes: { ...st.myVotes, [id]: held.option_index as number } }));
            return;
          }
        }
        throw error;
      },
      { type: 'cast_vote', payload: { post_id: id, user_id: user.id, option_index: optionIndex } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => {
          const votes = { ...st.myVotes };
          delete votes[id];
          return { myVotes: votes };
        });
      },
      'dispatch.vote',
      user.id,
    );
  },

  takeAnswer: (postId, critiqueId) => {
    const user = useAuthStore.getState().user;
    const before = heldFiling(get(), postId);
    if (!user || !before) return;

    set((st) => patchFiling(st, postId, (f) => ({ ...f, answerId: critiqueId })));

    void writeThrough(
      async () => {
        // `.select('id')`, as in amend: a withheld or ended filing matches no row, silently.
        const { data, error } = await supabase
          .from('dispatch_posts')
          .update({ answer_id: critiqueId })
          .eq('id', postId)
          .eq('user_id', user.id)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('dispatch.takeAnswer: refused');
      },
      { type: 'take_answer', payload: { post_id: postId, user_id: user.id, answer_id: critiqueId } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => ({
          ...patchFiling(st, postId, (f) => ({ ...f, answerId: before.answerId })),
        }));
      },
      'dispatch.takeAnswer',
      user.id,
    );
  },

  // ── CRITIQUES ─────────────────────────────────────────────────────────────
  fetchCritiques: async (postId, order) => {
    // The write after the await is guarded too: a logout mid-read must not put this id
    // back into a store the reset just cleared (staleWriteGuard).
    const startedAs = useAuthStore.getState().user?.id ?? null;
    set((st) => ({
      critiquesLoading: { ...st.critiquesLoading, [postId]: true },
      critiquesOrder: { ...st.critiquesOrder, [postId]: order },
    }));
    await readCritiquePage(postId, order, 0, set);
    if (!memberUnchanged(startedAs)) return;
    set((st) => ({ critiquesLoading: { ...st.critiquesLoading, [postId]: false } }));
  },

  /** The next page of critiques: COMMENT_PAGE_SIZE, the one number the footer also prints. */
  loadMoreCritiques: async (postId) => {
    const st0 = get();
    if (st0.critiquesLoading[postId] || st0.critiquesLoadingMore[postId]) return;
    if (!st0.critiquesHasMore[postId]) return;

    // Its own write lands after the await too, so it is guarded as fetchCritiques' is.
    const startedAs = useAuthStore.getState().user?.id ?? null;
    const order = st0.critiquesOrder[postId] ?? 'NEWEST';
    const from = (st0.critiques[postId] ?? []).length;
    set((s) => ({ critiquesLoadingMore: { ...s.critiquesLoadingMore, [postId]: true } }));
    await readCritiquePage(postId, order, from, set);
    if (!memberUnchanged(startedAs)) return;
    set((s) => ({ critiquesLoadingMore: { ...s.critiquesLoadingMore, [postId]: false } }));
  },

  addCritique: async (postId, body) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const startedAs = user.id;
    const clean = sanitizeInput(body, 'critique');
    if (!clean) return;

    const id = Crypto.randomUUID();
    const optimistic: Critique = {
      id,
      postId,
      authorId: user.id,
      author: {
        name: user.username ?? '',
        memberNo: (user as { member_no?: number }).member_no ?? 0,
        tier: paperTierOf(user),
        avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
      },
      body: clean,
      certifyCount: 0,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };

    set((st) => ({
      critiques: { ...st.critiques, [postId]: [optimistic, ...(st.critiques[postId] ?? [])] },
      ...patchFiling(st, postId, (f) => ({ ...f, commentCount: f.commentCount + 1 })),
    }));

    const row = { id, post_id: postId, user_id: user.id, author_username: user.username ?? '', body: clean };
    try {
      const { error } = await supabase.from('dispatch_comments').insert([row]);
      if (error) throw error;
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'add_critique', payload: { _tempId: id, ...row } });
        flushOfflineQueue();
        return { offline: true };
      }
      if (memberUnchanged(startedAs)) {
        set((st) => ({
          critiques: { ...st.critiques, [postId]: (st.critiques[postId] ?? []).filter((c) => c.id !== id) },
          ...patchFiling(st, postId, (f) => ({
            ...f, commentCount: Math.max(0, f.commentCount - 1),
          })),
        }));
      }
      throw e;
    }
  },

  amendCritique: async (id, postId, body) => {
    const user = useAuthStore.getState().user;
    const before = (get().critiques[postId] ?? []).find((c) => c.id === id);
    if (!user || !before) return;
    const startedAs = user.id;
    const clean = sanitizeInput(body, 'critique');
    if (!clean) return;
    const now = new Date().toISOString();

    set((st) => ({
      critiques: {
        ...st.critiques,
        [postId]: (st.critiques[postId] ?? []).map((c) =>
          c.id === id ? { ...c, body: clean, editedAt: now } : c,
        ),
      },
    }));

    try {
      // `.select('id')`, as in amend: under a withheld or ended filing no row matches, silently.
      const { data, error } = await supabase
        .from('dispatch_comments')
        .update({ body: clean, edited_at: now })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('dispatch.amendCritique: refused');
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'update_critique', payload: { id, user_id: user.id, body: clean } });
        flushOfflineQueue();
        return;
      }
      if (memberUnchanged(startedAs)) {
        set((st) => ({
          critiques: {
            ...st.critiques,
            [postId]: (st.critiques[postId] ?? []).map((c) => (c.id === id ? before : c)),
          },
        }));
      }
      throw e;
    }
  },

  removeCritique: async (id, postId) => {
    const user = useAuthStore.getState().user;
    const list = get().critiques[postId] ?? [];
    const before = list.find((c) => c.id === id);
    if (!user || !before) return;
    const startedAs = user.id;
    const at = list.indexOf(before);

    set((st) => ({
      critiques: { ...st.critiques, [postId]: (st.critiques[postId] ?? []).filter((c) => c.id !== id) },
      ...patchFiling(st, postId, (f) => ({
        ...f, commentCount: Math.max(0, f.commentCount - 1),
      })),
    }));

    try {
      // A refused delete matches no row and answers 200: `.select('id')` turns it into the
      // rollback below, or the critique vanishes for its author and stands for everyone else.
      const { data: removed, error } = await supabase
        .from('dispatch_comments')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!removed || removed.length === 0) throw new Error('critique not removed');
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'remove_critique', payload: { id, user_id: user.id } });
        flushOfflineQueue();
        return;
      }
      // Back where it was, not at the top: a failed network must not reorder an argument.
      if (memberUnchanged(startedAs)) {
        set((st) => {
          const next = [...(st.critiques[postId] ?? [])];
          next.splice(Math.min(at, next.length), 0, before);
          return {
            critiques: { ...st.critiques, [postId]: next },
            ...patchFiling(st, postId, (f) => ({ ...f, commentCount: f.commentCount + 1 })),
          };
        });
      }
      throw e;
    }
  },

  certifyCritique: (id, postId, next) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    if (get().certifiedCritiqueIds.has(id) === next) return;

    const move = (dir: 1 | -1) =>
      set((st) => {
        const ids = new Set(st.certifiedCritiqueIds);
        if (dir === 1) ids.add(id); else ids.delete(id);
        return {
          certifiedCritiqueIds: ids,
          critiques: {
            ...st.critiques,
            [postId]: (st.critiques[postId] ?? []).map((c) =>
              c.id === id ? { ...c, certifyCount: Math.max(0, c.certifyCount + dir) } : c,
            ),
          },
        };
      });

    move(next ? 1 : -1);
    const undo = () => { if (memberUnchanged(user.id)) move(next ? -1 : 1); };

    void writeThrough(
      async () => {
        const q = next
          ? supabase.from('dispatch_certifications').insert([{ user_id: user.id, comment_id: id }])
          : supabase.from('dispatch_certifications').delete().eq('comment_id', id).eq('user_id', user.id);
        const { error } = await q;
        if (refusedMark(error, next)) throw error;
      },
      { type: 'certify_critique', payload: { comment_id: id, desired_state: next } },
      undo,
      'dispatch.certifyCritique',
      user.id,
    );
  },
}));

registerStoreReset(() => {
  useDispatch.setState(emptyState());
  // The module's own request too: the next member must not be handed the last one's fetch.
  invalidateInflight();
});

/** A timed, cancellable read that keeps the row type: a query builder is thenable, not a
 *  Promise, and awaiting it inside is what spares every call site a type-erasing cast. */
function timed<T>(build: (signal: AbortSignal) => PromiseLike<T>, label: string): Promise<T> {
  return withTimeout(async (signal) => await build(signal), 15_000, label);
}

// ── THE SHARED SHAPE OF AN ACT ──────────────────────────────────────────────

/**
 * Try it; queue it if the wire is down; undo it if it was refused.
 *
 * Written once because all six acts have exactly this shape, and six copies of
 * it is six chances for one of them to forget the rollback — which is how a
 * count ends up one higher than the row it counts, forever, on one device.
 */
/**
 * A mark added that the house already holds STANDS — made on another device, or
 * missing from this phone's copy. Its unique key answers 23505, which is a yes:
 * undoing the mark and saying "The house did not accept that" was false twice.
 */
function refusedMark(error: { code?: string } | null, adding: boolean): boolean {
  return !!error && !(adding && error.code === '23505');
}

async function writeThrough(
  online: () => Promise<void>,
  queued: Parameters<typeof enqueueMutation>[0],
  undo: () => void,
  where: string,
  startedAs: string,
): Promise<void> {
  try {
    await online();
  } catch (e) {
    if (isNetworkError(e)) {
      enqueueMutation(queued);
      flushOfflineQueue();
      return;
    }
    // After a logout the store is already clear: undoing would write the last member's
    // counts back into it (and to disk). Their whole store is gone, a stronger undo.
    if (!memberUnchanged(startedAs)) return;
    undo();
    captureError(e, { where });
    reelToast.error('The house did not accept that.');
  }
}

// ── THE QUERIES ─────────────────────────────────────────────────────────────

/**
 * One page of the current department, in the current order.
 *
 * Keyset, not offset. An offset page re-reads everything before it and shifts
 * under any new filing, so a member scrolling while the house is busy sees rows
 * twice and misses others; a keyset cursor reads the row after the last one it
 * showed, whatever has happened above.
 */
async function pageQuery(state: DispatchState, after: Filing | null): Promise<unknown[]> {
  const kind = SECTION_KIND[state.section];

  let q = supabase
    .from('dispatch_posts')
    .select(FILING_CARD_COLUMNS)
    .eq('is_published', true)
    .is('withheld_at', null);

  if (kind) q = q.eq('kind', kind);

  if (state.savedOnly) {
    const ids = [...state.savedIds];
    // PostgREST refuses an empty `in.()`, so no saved filings is answered here.
    if (ids.length === 0) return [];
    q = q.in('id', ids);
  }

  if (state.sort === 'CERTIFIED') {
    q = q.order('certify_count', { ascending: false }).order('id', { ascending: false });
    if (after) {
      // Two columns order the page, so the cursor carries both or a tied row is skipped.
      q = q.or(
        `certify_count.lt.${after.certifyCount},and(certify_count.eq.${after.certifyCount},id.lt.${after.id})`,
      );
    }
  } else {
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false });
    if (after) {
      q = q.or(
        `created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`,
      );
    }
  }

  const { data, error } = await timed((signal) => withAbortSignal(q.limit(PAGE), signal), 'dispatch.page');
  if (error) throw error;
  return data ?? [];
}

/**
 * What THIS member has done to the filings on screen — certified, saved, voted.
 *
 * Three small indexed reads in parallel rather than three round trips, and only
 * for the ids actually on the page. Fetching the member's entire history would
 * grow without bound and be mostly about filings they are not looking at.
 *
 * A signed-out reader has none of these; the page is public and the marks are
 * not, so this returns early rather than asking a question with no subject.
 */
async function loadViewerState(
  filings: Filing[],
  set: (fn: (st: DispatchState) => Partial<DispatchState>) => void,
  startedAs: string | null,
): Promise<void> {
  if (!startedAs || filings.length === 0) return;
  const ids = filings.map((f) => f.id);

  try {
    const [certs, saves, votes] = await Promise.all([
      supabase.from('dispatch_certifications').select('post_id').eq('user_id', startedAs).in('post_id', ids),
      supabase.from('dispatch_saves').select('post_id').eq('user_id', startedAs).in('post_id', ids),
      supabase.from('dispatch_votes').select('post_id, option_index').eq('user_id', startedAs).in('post_id', ids),
    ]);
    if (!memberUnchanged(startedAs)) return;

    set((st) => {
      const certified = new Set(st.certifiedIds);
      for (const r of certs.data ?? []) if (r.post_id) certified.add(r.post_id as string);
      const saved = new Set(st.savedIds);
      for (const r of saves.data ?? []) if (r.post_id) saved.add(r.post_id as string);
      const myVotes = { ...st.myVotes };
      for (const r of votes.data ?? []) myVotes[r.post_id as string] = r.option_index as number;
      return { certifiedIds: certified, savedIds: saved, myVotes };
    });
    // The reads that answered are merged above; one that failed is still a failure, reported.
    const failed = certs.error ?? saves.error ?? votes.error;
    if (failed) throw failed;
  } catch (e) {
    // A page without the member's marks is still a readable page.
    if (!isNetworkError(e)) captureError(e, { where: 'dispatch.viewerState' });
  }
}

/**
 * One page of critiques, in one order, merged into what is already there.
 *
 * ── OFFSET, NOT KEYSET, AND WHY THAT IS RIGHT HERE ─────────────────────────
 * The FEED pages by keyset, because a feed is unbounded and a member scrolls it
 * for a long time while new filings land at the top. A filing's critiques are
 * neither: they are tens, occasionally hundreds, read in one sitting. `.range()`
 * costs nothing at that size and — the part that matters — it works IDENTICALLY
 * for both orders. A keyset over `certify_count` needs a three-column cursor
 * with a tiebreaker, and a wrong one silently skips rows rather than failing.
 *
 * ── THE ORDER IS THE SERVER'S ──────────────────────────────────────────────
 * Ordered on the device, CERTIFIED would rank only what is loaded and call it the
 * most certified. Ordered here, both orders are true of the whole filing, and a
 * change of order re-reads from the first page — which is why `critiquesOrder`
 * is recorded.
 *
 * A page is merged rather than appended, keyed by id: an optimistic critique the
 * member has just written is already at the top, and the server will hand it back
 * in a later page.
 */
async function readCritiquePage(
  postId: string,
  order: CritiqueOrder,
  from: number,
  set: (fn: (st: DispatchState) => Partial<DispatchState>) => void,
): Promise<void> {
  const startedAs = useAuthStore.getState().user?.id ?? null;
  try {
    let q = supabase
      .from('dispatch_comments')
      .select(CRITIQUE_COLUMNS)
      .eq('post_id', postId);

    q = order === 'CERTIFIED'
      // created_at breaks ties, so equal counts keep one order across pages.
      ? q.order('certify_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });

    const { data, error } = await timed(
      (signal) => withAbortSignal(q.range(from, from + COMMENT_PAGE_SIZE - 1), signal),
      from === 0 ? 'dispatch.fetchCritiques' : 'dispatch.moreCritiques',
    );
    if (error) throw error;
    if (!memberUnchanged(startedAs)) return;

    const { critiques } = parseCritiqueRows(data ?? []);

    set((st) => {
      const existing = from === 0 ? [] : (st.critiques[postId] ?? []);
      const seen = new Set(existing.map((c) => c.id));
      const merged = [...existing, ...critiques.filter((c) => !seen.has(c.id))];
      return {
        critiques: { ...st.critiques, [postId]: merged },
        // A short page is the end of the list. A full one MIGHT be, and the next
        // press finds out — which costs one query and never hides a critique.
        critiquesHasMore: {
          ...st.critiquesHasMore,
          [postId]: critiques.length === COMMENT_PAGE_SIZE,
        },
      };
    });
    await loadCritiqueCertifications(critiques, set, startedAs);
  } catch (e) {
    // Not marked "no more": the footer's control stays, so a failed page can be pressed again.
    if (!isNetworkError(e)) captureError(e, { where: 'dispatch.readCritiquePage' });
  }
}

async function loadCritiqueCertifications(
  critiques: Critique[],
  set: (fn: (st: DispatchState) => Partial<DispatchState>) => void,
  startedAs: string | null,
): Promise<void> {
  if (!startedAs || critiques.length === 0) return;
  try {
    const { data, error } = await supabase
      .from('dispatch_certifications')
      .select('comment_id')
      .eq('user_id', startedAs)
      .in('comment_id', critiques.map((c) => c.id));
    if (error) throw error;
    if (!memberUnchanged(startedAs)) return;
    set((st) => {
      const ids = new Set(st.certifiedCritiqueIds);
      for (const r of data ?? []) if (r.comment_id) ids.add(r.comment_id as string);
      return { certifiedCritiqueIds: ids };
    });
  } catch (e) {
    if (!isNetworkError(e)) captureError(e, { where: 'dispatch.critiqueCerts' });
  }
}

// ── CLEANING, ONCE ──────────────────────────────────────────────────────────

/**
 * Every field capped at the number its column allows.
 *
 * The caps come from `MAX_LENGTHS`, which `dispatchFieldCaps.test.ts` reconciles
 * against the live CHECK constraints — so a value that passes here cannot be
 * refused by the database for its length. `body` takes the dossier's tighter
 * excerpt cap, because for a dossier the body IS the excerpt.
 */
function cleanDraft(d: FilingDraft): FilingDraft {
  return {
    ...d,
    title: d.title ? sanitizeInput(d.title, 'filingTitle') : null,
    body: sanitizeInput(d.body, d.kind === 'dossier' ? 'filingExcerpt' : 'filingBody'),
    fullContent: d.fullContent ? sanitizeInput(d.fullContent, 'filingEssay') : null,
    source: d.source ? sanitizeInput(d.source, 'wireSource') : null,
    sourceUrl: d.sourceUrl ? sanitizeInput(d.sourceUrl, 'sourceUrl') : null,
    seriesTitle: d.seriesTitle ? sanitizeInput(d.seriesTitle, 'seriesTitle') : null,
    spoilerLabel: d.spoilerLabel ? sanitizeInput(d.spoilerLabel, 'spoilerLabel') : null,
    film: d.film
      ? {
        ...d.film,
        title: sanitizeInput(d.film.title, 'subjectTitle'),
        sub: d.film.sub ? sanitizeInput(d.film.sub, 'subjectSub') : null,
        image: d.film.image ? sanitizeInput(d.film.image, 'subjectImage') : null,
        backdrop: d.film.backdrop ? sanitizeInput(d.film.backdrop, 'subjectBackdrop') : null,
      }
      : null,
    options: d.options
      ? d.options.map((o) => ({ ...o, title: sanitizeInput(o.title, 'ballotOption') }))
      : null,
  };
}

function cleanUpdate(kind: FilingKind, u: FilingUpdate): FilingUpdate {
  const out: FilingUpdate = {};
  if (u.title !== undefined) out.title = u.title ? sanitizeInput(u.title, 'filingTitle') : null;
  if (u.body !== undefined) out.body = sanitizeInput(u.body, kind === 'dossier' ? 'filingExcerpt' : 'filingBody');
  if (u.fullContent !== undefined) out.fullContent = u.fullContent ? sanitizeInput(u.fullContent, 'filingEssay') : null;
  if (u.source !== undefined) out.source = u.source ? sanitizeInput(u.source, 'wireSource') : null;
  if (u.sourceUrl !== undefined) out.sourceUrl = u.sourceUrl ? sanitizeInput(u.sourceUrl, 'sourceUrl') : null;
  if (u.spoilerLabel !== undefined) out.spoilerLabel = u.spoilerLabel ? sanitizeInput(u.spoilerLabel, 'spoilerLabel') : null;
  if (u.seriesTitle !== undefined) out.seriesTitle = u.seriesTitle ? sanitizeInput(u.seriesTitle, 'seriesTitle') : null;
  return out;
}

/**
 * `author_username` is sent because the column is NOT NULL, and it is
 * immediately overwritten by the database from `profiles` — so what goes here is
 * a placeholder, not a claim. That is the whole point of deriving it server-side:
 * a client that lies about who wrote something is ignored rather than believed.
 */
function toInsertRow(
  id: string,
  userId: string,
  username: string,
  d: FilingDraft,
  createdAt: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id,
    kind: d.kind,
    user_id: userId,
    author_username: username,
    body: d.body,
    is_published: true,
    created_at: createdAt,
  };
  if (d.title) row.title = d.title;
  if (d.fullContent) row.full_content = d.fullContent;
  if (d.source) row.source = d.source;
  if (d.sourceUrl) row.source_url = d.sourceUrl;
  if (d.spoilerLabel) row.spoiler_label = d.spoilerLabel;
  if (d.options) row.options = d.options;
  if (d.closesAt) row.closes_at = d.closesAt;
  if (d.seriesId) { row.series_id = d.seriesId; row.series_title = d.seriesTitle; row.part_number = d.partNumber; }
  if (d.film) {
    row.subject_kind = 'film';
    row.subject_id = d.film.id;
    row.subject_title = d.film.title;
    row.subject_sub = d.film.sub ?? null;
    row.subject_image = d.film.image ?? null;
    row.subject_backdrop = d.film.backdrop ?? null;
  }
  return row;
}

function toUpdateRow(u: FilingUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (u.title !== undefined) row.title = u.title;
  if (u.body !== undefined) row.body = u.body;
  if (u.fullContent !== undefined) row.full_content = u.fullContent;
  if (u.source !== undefined) row.source = u.source;
  if (u.sourceUrl !== undefined) row.source_url = u.sourceUrl;
  if (u.spoilerLabel !== undefined) row.spoiler_label = u.spoilerLabel;
  if (u.seriesTitle !== undefined) row.series_title = u.seriesTitle;
  return row;
}
