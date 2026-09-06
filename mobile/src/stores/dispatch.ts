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
  type BallotOption,
  type Critique,
  type CritiqueOrder,
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

/**
 * One page. Twenty is what the old feed asked for and what the RPC still caps.
 *
 * Taken from `dispatchTypes` rather than declared here, because the empty state
 * and the skeleton row in `paperMetrics` print numbers about this page and used
 * to hold their own copy of it. One binding, so they cannot drift.
 */
const PAGE = PAGE_SIZE;

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
  /**
   * Filings opened by their own address, which the FEED does not hold.
   *
   * ── WHY THIS HAD TO EXIST ──────────────────────────────────────────────────
   * `filings` is the page, not a cache of everything — so a filing opened from a
   * notification, a share link or a lounge quote was never in it. Three acts
   * looked the filing up there before doing anything:
   *
   *     const filing = get().filings.find((f) => f.id === id);
   *     if (!user || !filing) return;
   *
   * so on a cold open WITHDRAW did nothing, silently, and AMEND did nothing
   * while the writing room said "Dossier updated" and navigated away. An edit
   * reported as saved and discarded is the worst failure this app has.
   *
   * `hydrate` records what it read here, every act keeps the two in step, and
   * the reader reads whichever holds the filing.
   */
  opened: Record<string, Filing>;
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

  /**
   * `order` is REQUIRED, not defaulted.
   *
   * It had a default of NEWEST, and the reader's own state started at CERTIFIED.
   * Two defaults, in two files, and they disagreed: the header lit CERTIFIED
   * over a list ordered by date, and pressing CERTIFIED changed nothing because
   * it was already selected. A default here is a second opinion about something
   * the screen already knows.
   */
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

/**
 * What the page is asking for has changed; the answer on its way is not it.
 *
 * ── THIS DID NOT EXIST, AND THE COMMENT ABOVE SAID IT DID ──────────────────
 * `fetch` opens with `if (inflight) return inflight`, and the three index
 * controls did not touch `inflight` — so tapping WIRE while the first page was
 * still loading handed back the ALL request, and:
 *
 *   · that response passed its generation check and painted takes into WIRE,
 *   · and no request for WIRE was ever issued at all,
 *
 * so the member sat on a department showing another department's filings until
 * they pulled to refresh. It only happens during the first seconds after a cold
 * open, which is exactly when somebody is most likely to be tapping around.
 *
 * Bumping the generation alone would have discarded the stale answer and left
 * the page empty forever, because the new `fetch` would still return the same
 * in-flight promise. Both have to go.
 */
const invalidateInflight = () => {
  generation++;
  inflight = null;
};

/**
 * How many opened filings are kept.
 *
 * Twelve, because the only thing this map is for is letting an act find the row
 * the member is looking at — and nobody acts on the twelfth filing back. A
 * dossier holds up to 25,000 characters, so an unbounded map is an evening's
 * reading held in memory for no reason.
 */
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

/**
 * The filing, wherever it is being held.
 *
 * The feed when the member scrolled to it, the opened map when they arrived by
 * its address. Every act that needs the ROW — rather than only its id — asks
 * here, so none of them can quietly do nothing again.
 */
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
    set({ section: s, filings: [], hasMore: true, newCount: 0 });
    invalidateInflight();
    void get().fetch();
  },
  setSort: (s) => {
    if (get().sort === s) return;
    set({ sort: s, filings: [], hasMore: true, newCount: 0 });
    invalidateInflight();
    void get().fetch();
  },
  setSavedOnly: (on) => {
    if (get().savedOnly === on) return;
    set({ savedOnly: on, filings: [], hasMore: true, newCount: 0 });
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
        // BOTH guarded by the generation. Clearing `inflight` unconditionally
        // meant a superseded request could null out the slot holding the one
        // that replaced it — and the next call would then issue a second query
        // for a page already on its way.
        if (gen === generation) {
          set({ loading: false });
          inflight = null;
        }
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
        // Recorded whether or not the feed holds it, so the acts that need the
        // ROW can find it after a cold open — and BOUNDED, because a dossier
        // carries up to 25,000 characters and a member reading for an evening
        // would otherwise accumulate every one of them for the life of the
        // process. The most recent handful is all any act needs.
        opened: capOpened(st.opened, id, one),
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
        tier: paperTierOf(user),
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

  /**
   * ⚠️ NOTHING IN THIS APP CALLS THIS, AND THAT IS ON PURPOSE — BUT SAY SO.
   *
   * `amend` is reachable only from `/dispatch/compose?edit=<id>`, and no screen
   * ever navigates there: swept the whole of `src` and `app` for an `edit`
   * param and for anything supplying `initialTitle`/`initialContent`, and there
   * is nothing. `amendCritique` below has no caller at all.
   *
   * That matches the decision the reader states in its own words — "on your own
   * filing there is one act: withdraw it" — so this is an unbuilt door, not a
   * broken one. A member cannot fix a typo in a filing or a critique. Whether
   * that is right is a product question and it is recorded in
   * DEFERRED-ACTIONS.md rather than answered here.
   *
   * It is kept rather than deleted for one concrete reason: the offline queue
   * carries `update_filing` and `update_critique` mutation types, and removing
   * the path that drains them is only safe once nothing can have enqueued one.
   *
   * The EDITED mark a card prints reads `edited_at`, which this app therefore
   * never sets. On 2026-09-04 the live table held no row with it set — and one
   * filing in total, so that proves the column is unused rather than proving
   * this app is what would have used it.
   */
  amend: async (id, updates) => {
    const user = useAuthStore.getState().user;
    // Wherever it is held. This read the feed alone, so amending a filing
    // opened by its own address did nothing while the writing room reported
    // success and navigated away.
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
      /**
       * ── A REFUSED ROW IS NOT AN ERROR, AND THAT IS THE TRAP ────────────────
       * `posts_update_own` no longer reaches a filing that is WITHHELD or
       * ENDED — the house is reading it, or has already struck it. RLS refuses
       * those by matching no ROW, which is not an error: PostgREST answers 200
       * with nothing changed.
       *
       * So `if (error) throw` sees nothing wrong, the optimistic edit stays on
       * screen, and the member is told their words were saved while the
       * database refused them. `.select('id')` is what turns silence into an
       * answer — an empty array means the row was not theirs to change.
       *
       * Selecting `id` is safe under the narrowed grants: a member can always
       * read their own filing.
       */
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
    // Wherever it is held — the feed, or the map of what has been opened by its
    // own address. This read the feed alone, so WITHDRAW on a filing reached
    // from a notification did nothing at all, and said nothing about it.
    const before = heldFiling(get(), id);
    if (!user || !before) return;
    const startedAs = user.id;

    const ended: Filing = {
      ...before,
      body: '', fullContent: null, title: null, source: null, spoilerLabel: null,
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
        if (error) throw error;
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

    /**
     * Where it was, so it can go back there.
     *
     * The optimistic step below takes the card off the saved page, and the undo
     * used to restore only `savedIds` — so a REFUSED unsave left the filing
     * saved according to the store and gone from the screen, the two disagreeing
     * silently until the next refresh. Every other act in this file rolls back
     * everything it moved; this one moved two things and put back one.
     */
    const removedAt = get().filings.findIndex((f) => f.id === id);
    const removed = removedAt >= 0 ? get().filings[removedAt] : null;

    set((st) => {
      const ids = new Set(st.savedIds);
      if (next) ids.add(id); else ids.delete(id);
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
          if (next) ids.delete(id); else ids.add(id);
          // Back where it was, not at the top — the same rule `removeCritique`
          // already follows. A card that jumps to the front because the network
          // failed is the app rewriting the page's order.
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
    // Wherever it is held, for the same reason as `end` and `amend`.
    const before = heldFiling(get(), postId);
    if (!user || !before) return;

    set((st) => patchFiling(st, postId, (f) => ({ ...f, answerId: critiqueId })));

    void writeThrough(
      async () => {
        // `.select('id')` for the same reason as `amend`: taking an answer on a
        // filing that has been withheld or ended matches no row, and a refusal
        // that matches no row comes back as a success with nothing changed.
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
    set((st) => ({
      critiquesLoading: { ...st.critiquesLoading, [postId]: true },
      critiquesOrder: { ...st.critiquesOrder, [postId]: order },
    }));
    await readCritiquePage(postId, order, 0, set);
    set((st) => ({ critiquesLoading: { ...st.critiquesLoading, [postId]: false } }));
  },

  /**
   * The next page of critiques.
   *
   * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
   * It did not, and the page said it did. `CritiqueFooter` printed
   * `162 MORE · 30 AT A TIME` under a filing whose critiques stopped at the
   * fiftieth, and that line was a Text — not a control, not a spinner, nothing
   * to press. A hundred and sixty-two critiques a member could see counted and
   * could not reach, with the page telling them so.
   *
   * Two numbers were wrong at once, which is how it stayed hidden: the store
   * fetched 50 and the footer promised 30. Both now come from COMMENT_PAGE_SIZE,
   * so there is one number and no way for them to disagree again.
   */
  loadMoreCritiques: async (postId) => {
    const st0 = get();
    if (st0.critiquesLoading[postId] || st0.critiquesLoadingMore[postId]) return;
    if (!st0.critiquesHasMore[postId]) return;

    const order = st0.critiquesOrder[postId] ?? 'NEWEST';
    const from = (st0.critiques[postId] ?? []).length;
    set((s) => ({ critiquesLoadingMore: { ...s.critiquesLoadingMore, [postId]: true } }));
    await readCritiquePage(postId, order, from, set);
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
      // `.select('id')` for the same reason as `amend`: a critique under a
      // filing that has been withheld or ended matches no row, and a refusal
      // that matches no row is not an error. Without this the member is told
      // their amendment went through while the database refused it.
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
 * It used to be done on the device, over whatever had been loaded. That is fine
 * when everything is loaded and a lie the moment it is not: CERTIFIED would have
 * ranked the fifty newest and called them the most certified. Ordering here means
 * both orders are true about the whole filing, and changing order re-reads from
 * the first page — which is why `critiquesOrder` is recorded.
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
      // `created_at` is the tiebreaker, so two critiques on the same count keep
      // a stable order between pages instead of drifting and duplicating.
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
    // The footer keeps its control, so a failed page can simply be pressed
    // again. Marking it as "no more" would turn one bad request into a
    // permanent dead end.
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
