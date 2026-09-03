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
  CRITIQUE_COLUMNS,
  FILING_CARD_COLUMNS,
  FILING_FULL_COLUMNS,
  parseCritiqueRows,
  parseFilingRows,
  type BallotOption,
  type Critique,
  type Filing,
  type FilingKind,
} from './dispatchTypes';

// ── THE DEPARTMENTS ─────────────────────────────────────────────────────────

export const SECTIONS = ['ALL', 'TAKES', 'SEEKING', 'WIRE', 'BALLOTS', 'DOSSIER'] as const;
export type Section = typeof SECTIONS[number];
export type Sort = 'LATEST' | 'CERTIFIED';

/**
 * The index says TAKES; a row says `take`. One table maps the two, so the
 * plural in the chrome and the singular in the column can never disagree.
 * ALL maps to nothing because it is the absence of a filter, not a sixth kind.
 */
const SECTION_KIND: Record<Section, FilingKind | null> = {
  ALL: null,
  TAKES: 'take',
  SEEKING: 'seeking',
  WIRE: 'wire',
  BALLOTS: 'ballot',
  DOSSIER: 'dossier',
};

/** One page. Twenty is what the old feed asked for and what the RPC still caps. */
const PAGE = 20;

/**
 * Every read is bounded AND its cursor is derived from the same bound.
 *
 * Batch 20's finding, in one sentence: bounding a query and keeping its "is
 * there more?" answer honest are ONE job. A page that asks for 20 and decides
 * `hasMore` from anything other than "did I get 20 back" will either stop early
 * or loop forever.
 */
const gotFullPage = (n: number) => n === PAGE;

// ── STATE ───────────────────────────────────────────────────────────────────

export interface DispatchState {
  filings: Filing[];
  /** Filed by this member and not yet acknowledged by the server. */
  section: Section;
  sort: Sort;
  savedOnly: boolean;

  loading: boolean;
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
  certifiedCritiqueIds: Set<string>;

  setSection: (s: Section) => void;
  setSort: (s: Sort) => void;
  setSavedOnly: (on: boolean) => void;

  /** How many filings have arrived above the page since it was drawn. */
  newCount: number;

  fetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  /**
   * Is there new paper above what is on screen?
   *
   * ── WHY A COUNT AND NOT A SOCKET ─────────────────────────────────────────
   * The obvious build is a realtime subscription. It is the wrong tool here for
   * three reasons, and each one is a cost the member pays:
   *
   *   · it needs `dispatch_posts` in the realtime publication, so EVERY write
   *     to the table — every certify, every counter tick — is replicated to
   *     every subscriber, to answer a question asked once a minute;
   *   · it is a second persistent connection on the app's main tab, beside the
   *     one the Lounge already holds for chat, which genuinely needs it;
   *   · a feed that gains a few filings an hour is not a chat. The pill's whole
   *     job is "there is new paper", and a HEAD count answers that exactly as
   *     well for the price of one bounded query.
   *
   * It is RLS-filtered like any other read, so a filing from somebody the member
   * has blocked is not counted — a pill that promises three and delivers two is
   * the page lying about something the member can check in one tap.
   */
  checkForNew: () => Promise<void>;
  /** One filing, with its essay, for the reader. */
  hydrate: (id: string) => Promise<Filing | null>;

  file: (draft: FilingDraft) => Promise<{ id: string; offline?: boolean } | null>;
  amend: (id: string, updates: FilingUpdate) => Promise<void | { offline: boolean }>;
  end: (id: string) => Promise<void | { offline: boolean }>;

  certify: (id: string, next: boolean) => void;
  save: (id: string, next: boolean) => void;
  vote: (id: string, optionIndex: number) => void;
  takeAnswer: (postId: string, critiqueId: string | null) => void;

  fetchCritiques: (postId: string) => Promise<void>;
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
  film?: { id: number; title: string; sub?: string | null; image?: string | null } | null;
  options?: BallotOption[] | null;
  closesAt?: string | null;
  seriesId?: string | null;
  seriesTitle?: string | null;
  partNumber?: number | null;
  spoilerLabel?: string | null;
}

export type FilingUpdate = Partial<Omit<FilingDraft, 'kind' | 'options' | 'closesAt'>>;

// A fetch in flight, and the generation that decides whether its answer is still
// wanted. Changing section or sort bumps the generation, so a slow response for
// TAKES can never paint over a fast one for WIRE.
let inflight: Promise<void> | null = null;
let generation = 0;

const emptyState = () => ({
  filings: [] as Filing[],
  section: 'ALL' as Section,
  sort: 'LATEST' as Sort,
  savedOnly: false,
  loading: false,
  loadingMore: false,
  hasMore: true,
  droppedRows: 0,
  newCount: 0,
  certifiedIds: new Set<string>(),
  savedIds: new Set<string>(),
  myVotes: {} as Record<string, number>,
  critiques: {} as Record<string, Critique[]>,
  critiquesLoading: {} as Record<string, boolean>,
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
    set({ section: s, filings: [], hasMore: true, newCount: 0 });
    void get().fetch();
  },
  setSort: (s) => {
    if (get().sort === s) return;
    set({ sort: s, filings: [], hasMore: true, newCount: 0 });
    void get().fetch();
  },
  setSavedOnly: (on) => {
    if (get().savedOnly === on) return;
    set({ savedOnly: on, filings: [], hasMore: true, newCount: 0 });
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
        if (gen !== generation || !memberUnchanged(startedAs)) return;
        const { filings, dropped } = parseFilingRows(rows);
        set({ filings, hasMore: gotFullPage(rows.length), droppedRows: dropped, newCount: 0 });
        if (dropped > 0) {
          logger.warn(`[dispatch] dropped ${dropped} malformed filing row(s)`);
        }
        await loadViewerState(filings, set, startedAs);
      } catch (e) {
        if (gen !== generation) return;
        if (!isNetworkError(e)) captureError(e, { where: 'dispatch.fetch' });
        throw e;
      } finally {
        if (gen === generation) set({ loading: false });
        inflight = null;
      }
    })();

    inflight = run;
    return run;
  },

  checkForNew: async () => {
    const s = get();
    // Only under LATEST, and only once there is a page to be newer THAN.
    //
    // Under CERTIFIED the list is not chronological, so "new above you" names a
    // position that does not exist — a filing certified once an hour from now
    // belongs in the middle of the page, not at the top. And the saved page is
    // not an edition: nothing arrives on it that the member did not put there.
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
      // The generation guard matters here too: a check begun under TAKES that
      // lands after the member moved to WIRE would announce takes on a page of
      // wires.
      if (get().sort !== 'LATEST' || get().savedOnly) return;
      set({ newCount: count ?? 0 });
    } catch (e) {
      // A pill that could not be counted simply does not appear. Failing the
      // feed over an ornament would be the wrong trade.
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.checkForNew' });
    }
  },

  loadMore: async () => {
    const s = get();
    // Three separate reasons not to: already fetching a page, already at the
    // end, or nothing loaded yet — in which case this is a first fetch and
    // `fetch` owns it.
    if (s.loadingMore || s.loading || !s.hasMore || s.filings.length === 0) return;
    const gen = generation;
    const startedAs = useAuthStore.getState().user?.id ?? null;
    set({ loadingMore: true });
    try {
      const rows = await pageQuery(s, s.filings[s.filings.length - 1]);
      if (gen !== generation || !memberUnchanged(startedAs)) return;
      const { filings: page } = parseFilingRows(rows);
      // De-duplicated on the way in. A row filed between the two requests shifts
      // the window, and without this the same filing appears twice — which
      // FlashList then renders with a duplicate key.
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
      // Kept on the row rather than in the reader's own state: the reader reads
      // the store, so a body held in a component would be discarded on the next
      // render and the essay would silently fall back to its 500-character
      // opening. Caching it also makes re-opening instant.
      set((st) => ({
        filings: st.filings.some((f) => f.id === id)
          ? st.filings.map((f) => (f.id === id ? one : f))
          : st.filings,
      }));
      await loadViewerState([one], set, startedAs);
      return one;
    } catch (e) {
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.hydrate' });
      return null;
    }
  },

  // ── FILING ────────────────────────────────────────────────────────────────
  file: async (draft) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;
    const startedAs = user.id;

    // One choke point. The optimistic row, the online insert and the queued
    // payload all read the SAME cleaned values, so what is shown, what is sent
    // and what is replayed can never be three different strings.
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
        tier: 'free',
        avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
      },
      film: clean.film
        ? { title: clean.film.title, director: clean.film.sub ?? null, posterPath: clean.film.image ?? null }
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
      // Nothing the member has just written is under review. The house has not
      // seen it yet.
      withheldAt: null,
      endedAt: null,
      endedBy: null,
      certifyCount: 0,
      commentCount: 0,
      createdAt: now,
      editedAt: null,
    };

    // Shown only where it belongs. Filing a wire while reading TAKES must not
    // drop a wire into the takes column — the row is real either way, and the
    // next fetch of its own department will show it.
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

  amend: async (id, updates) => {
    const user = useAuthStore.getState().user;
    const filing = get().filings.find((f) => f.id === id);
    if (!user || !filing) return;
    const startedAs = user.id;

    const clean = cleanUpdate(filing.kind, updates);
    const before = filing;
    const now = new Date().toISOString();

    set((st) => ({
      filings: st.filings.map((f) =>
        f.id === id
          ? {
            ...f,
            title: clean.title !== undefined ? clean.title : f.title,
            body: clean.body !== undefined ? clean.body : f.body,
            fullContent: clean.fullContent !== undefined ? clean.fullContent : f.fullContent,
            source: clean.source !== undefined ? clean.source : f.source,
            sourceUrl: clean.sourceUrl !== undefined ? clean.sourceUrl : f.sourceUrl,
            spoilerLabel: clean.spoilerLabel !== undefined ? clean.spoilerLabel : f.spoilerLabel,
            editedAt: now,
          }
          : f,
      ),
    }));

    const dbUpdates = toUpdateRow(clean);
    try {
      const { error } = await supabase
        .from('dispatch_posts')
        .update({ ...dbUpdates, edited_at: now, updated_at: now })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
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
        set((st) => ({ filings: st.filings.map((f) => (f.id === id ? before : f)) }));
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
    const before = get().filings.find((f) => f.id === id);
    if (!user || !before) return;
    const startedAs = user.id;

    const ended: Filing = {
      ...before,
      body: '', fullContent: null, title: null, source: null, spoilerLabel: null,
      endedAt: new Date().toISOString(), endedBy: 'author',
    };
    set((st) => ({ filings: st.filings.map((f) => (f.id === id ? ended : f)) }));

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
        set((st) => ({ filings: st.filings.map((f) => (f.id === id ? before : f)) }));
      }
      throw e;
    }
  },

  // ── THE ACTS ──────────────────────────────────────────────────────────────
  // Each moves the number the member can see, then writes the row that makes the
  // trigger move it for real. The local count and the server count therefore
  // agree by construction on the next fetch, without this file ever writing one.
  certify: (id, next) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const had = get().certifiedIds.has(id);
    if (had === next) return;

    set((st) => {
      const ids = new Set(st.certifiedIds);
      next ? ids.add(id) : ids.delete(id);
      return {
        certifiedIds: ids,
        filings: st.filings.map((f) =>
          f.id === id ? { ...f, certifyCount: Math.max(0, f.certifyCount + (next ? 1 : -1)) } : f,
        ),
      };
    });

    void writeThrough(
      async () => {
        const q = next
          ? supabase.from('dispatch_certifications').insert([{ user_id: user.id, post_id: id }])
          : supabase.from('dispatch_certifications').delete().eq('post_id', id).eq('user_id', user.id);
        const { error } = await q;
        if (error) throw error;
      },
      { type: 'certify_filing', payload: { post_id: id, desired_state: next } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => {
        const ids = new Set(st.certifiedIds);
        next ? ids.delete(id) : ids.add(id);
        return {
          certifiedIds: ids,
          filings: st.filings.map((f) =>
            f.id === id ? { ...f, certifyCount: Math.max(0, f.certifyCount + (next ? -1 : 1)) } : f,
          ),
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

    set((st) => {
      const ids = new Set(st.savedIds);
      next ? ids.add(id) : ids.delete(id);
      // On the saved page, unsaving removes the entry — it no longer belongs to
      // the page it is on, and leaving it there would be the page lying.
      const filings = !next && st.savedOnly ? st.filings.filter((f) => f.id !== id) : st.filings;
      return { savedIds: ids, filings };
    });

    void writeThrough(
      async () => {
        const q = next
          ? supabase.from('dispatch_saves').insert([{ user_id: user.id, post_id: id }])
          : supabase.from('dispatch_saves').delete().eq('post_id', id).eq('user_id', user.id);
        const { error } = await q;
        if (error) throw error;
      },
      { type: next ? 'save_filing' : 'unsave_filing', payload: { post_id: id, user_id: user.id } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => {
          const ids = new Set(st.savedIds);
          next ? ids.delete(id) : ids.add(id);
          return { savedIds: ids };
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
        if (error) throw error;
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
    const before = get().filings.find((f) => f.id === postId);
    if (!user || !before) return;

    set((st) => ({
      filings: st.filings.map((f) => (f.id === postId ? { ...f, answerId: critiqueId } : f)),
    }));

    void writeThrough(
      async () => {
        const { error } = await supabase
          .from('dispatch_posts')
          .update({ answer_id: critiqueId })
          .eq('id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
      },
      { type: 'take_answer', payload: { post_id: postId, user_id: user.id, answer_id: critiqueId } },
      () => {
        if (!memberUnchanged(user.id)) return;
        set((st) => ({
          filings: st.filings.map((f) => (f.id === postId ? { ...f, answerId: before.answerId } : f)),
        }));
      },
      'dispatch.takeAnswer',
      user.id,
    );
  },

  // ── CRITIQUES ─────────────────────────────────────────────────────────────
  fetchCritiques: async (postId) => {
    const startedAs = useAuthStore.getState().user?.id ?? null;
    set((st) => ({ critiquesLoading: { ...st.critiquesLoading, [postId]: true } }));
    try {
      const { data, error } = await timed(
        (signal) =>
          withAbortSignal(
            supabase
              .from('dispatch_comments')
              .select(CRITIQUE_COLUMNS)
              .eq('post_id', postId)
              .order('created_at', { ascending: false })
              .limit(50),
            signal,
          ),
        'dispatch.fetchCritiques',
      );
      if (error) throw error;
      if (!memberUnchanged(startedAs)) return;
      const { critiques } = parseCritiqueRows(data ?? []);
      set((st) => ({ critiques: { ...st.critiques, [postId]: critiques } }));
      await loadCritiqueCertifications(critiques, set, startedAs);
    } catch (e) {
      if (!isNetworkError(e)) captureError(e, { where: 'dispatch.fetchCritiques' });
    } finally {
      set((st) => ({ critiquesLoading: { ...st.critiquesLoading, [postId]: false } }));
    }
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
        tier: 'free',
        avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
      },
      body: clean,
      certifyCount: 0,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };

    set((st) => ({
      critiques: { ...st.critiques, [postId]: [optimistic, ...(st.critiques[postId] ?? [])] },
      filings: st.filings.map((f) => (f.id === postId ? { ...f, commentCount: f.commentCount + 1 } : f)),
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
          filings: st.filings.map((f) =>
            f.id === postId ? { ...f, commentCount: Math.max(0, f.commentCount - 1) } : f,
          ),
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
      const { error } = await supabase
        .from('dispatch_comments')
        .update({ body: clean, edited_at: now })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
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
      filings: st.filings.map((f) =>
        f.id === postId ? { ...f, commentCount: Math.max(0, f.commentCount - 1) } : f,
      ),
    }));

    try {
      const { error } = await supabase
        .from('dispatch_comments')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'remove_critique', payload: { id, user_id: user.id } });
        flushOfflineQueue();
        return;
      }
      // Put back where it was, not at the top — a critique that jumps position
      // because the network failed is the app rewriting the argument's order.
      if (memberUnchanged(startedAs)) {
        set((st) => {
          const next = [...(st.critiques[postId] ?? [])];
          next.splice(Math.min(at, next.length), 0, before);
          return {
            critiques: { ...st.critiques, [postId]: next },
            filings: st.filings.map((f) =>
              f.id === postId ? { ...f, commentCount: f.commentCount + 1 } : f,
            ),
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
        dir === 1 ? ids.add(id) : ids.delete(id);
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
        if (error) throw error;
      },
      { type: 'certify_critique', payload: { comment_id: id, desired_state: next } },
      undo,
      'dispatch.certifyCritique',
      user.id,
    );
  },
}));

registerStoreReset(() => useDispatch.setState(emptyState()));

/**
 * A timed, cancellable read — without the two casts per call site.
 *
 * A Supabase query builder is THENABLE but is not a Promise, so `withTimeout`'s
 * signature refuses it; `content.ts` gets past that with `as any` on the way in
 * and `as { data: any; error: any }` on the way out, at every call. That second
 * cast is the costly one: it throws away the row type, so a column renamed in
 * the select is no longer a compile error anywhere downstream.
 *
 * Awaiting the builder inside is all it takes. The types survive, the timeout
 * still fires, and the abort signal still cancels the request in flight.
 */
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
    // ── THE UNDO RUNS AFTER AN AWAIT, AND THAT IS THE WHOLE PROBLEM ────────
    // If the member signed out while the write was in flight, the store has
    // already been cleared by the logout reset — and this rollback would write
    // the PREVIOUS member's counts straight back into it. A store change also
    // triggers a disk write, so it can re-create the persisted copy the reset
    // exists to delete.
    //
    // Nothing to roll back for a member who is no longer here: their whole
    // store is gone, which is a stronger undo than this one.
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
    // No saved filings means no page — and asking with an empty `in.()` list is
    // a request PostgREST refuses, so the empty case is answered here.
    if (ids.length === 0) return [];
    q = q.in('id', ids);
  }

  if (state.sort === 'CERTIFIED') {
    q = q.order('certify_count', { ascending: false }).order('id', { ascending: false });
    if (after) {
      // Two columns order this page, so the cursor needs both or the tie is
      // broken differently on each request and a row can be skipped.
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
  } catch (e) {
    // A page that draws without the member's own marks is still a readable page.
    // Failing the whole feed because the marks did not arrive would be worse.
    if (!isNetworkError(e)) captureError(e, { where: 'dispatch.viewerState' });
  }
}

async function loadCritiqueCertifications(
  critiques: Critique[],
  set: (fn: (st: DispatchState) => Partial<DispatchState>) => void,
  startedAs: string | null,
): Promise<void> {
  if (!startedAs || critiques.length === 0) return;
  try {
    const { data } = await supabase
      .from('dispatch_certifications')
      .select('comment_id')
      .eq('user_id', startedAs)
      .in('comment_id', critiques.map((c) => c.id));
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
