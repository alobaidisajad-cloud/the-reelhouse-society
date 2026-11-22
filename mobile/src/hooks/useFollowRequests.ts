/**
 * useFollowRequests — state engine for the "At the Door" panel.
 * ─────────────────────────────────────────────────────────────
 * Cursor pagination + debounced server-side search + optimistic accept/decline
 * with rollback, all kept in sync with the store's pendingRequestCount (which
 * drives the Notices banner + profile door badge). Only mounts work while the
 * panel is open (`enabled`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterContentByBlocks, useWhoIsHidden } from '@/src/utils/filterContentByBlocks';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useSocialStore } from '@/src/stores/followStore';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { stillSignedIn } from '@/src/stores/domain/helpers/sessionGuard';
import { FollowRequestService, FollowRequest } from '@/src/services/FollowRequestService';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';

/** Refresh the cached pending-request count (banner/badge). Safe to call anywhere. */
export async function refreshFollowRequestCount(): Promise<void> {
  const myId = useAuthStore.getState().user?.id;
  if (!myId) return;
  // The members the door leaves out (blocked or muted) are left out of its count too.
  const { blocked, muted } = useBlockStore.getState();
  const n = await FollowRequestService.count(myId, [...blocked, ...muted]);
  // A count that could not be read leaves the last one standing; one read for a member who has
  // signed out since is never laid on whoever is here now.
  if (n !== null && stillSignedIn(myId)) useSocialStore.getState().setPendingRequestCount(n);
}

export function useFollowRequests(enabled: boolean) {
  const myId = useAuthStore(s => s.user?.id);
  const setCount = useSocialStore(s => s.setPendingRequestCount);

  const [items, setItems] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearchRaw] = useState('');
  /** The rows being answered: each busy on its own, so a second ADMIT is taken while the first is out. */
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const busy = useRef(new Set<string>());
  /** The door could not be read: unknown, not empty. */
  const [failed, setFailed] = useState(false);
  /** The next page could not be read. */
  const [moreFailed, setMoreFailed] = useState(false);
  /**
   * The search the door last answered (or failed) for, while open; null before. A door whose
   * shown search is not the answered one is being read: its first frame, and a search's
   * debounce, came before any read began, and said "No one's at the door".
   */
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  // Shut, it answers for nothing: opened again, it reads afresh.
  if (!enabled && answeredFor !== null) setAnsweredFor(null);

  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const isMounted = useRef(true);
  /** Each read of the list from its top (opening, a search, a refresh, a retry): the latest is the one shown. */
  const reqSeq = useRef(0);
  /**
   * The list as it stands was begun by this read of its top. A next page carries the one it was
   * asked under, and is dropped once another began: its cursor belongs to a list no longer shown.
   */
  const listGen = useRef(0);
  /** A read of the list's top is out: no next page is asked of the list it will replace. */
  const topReading = useRef(false);
  /** The search the list shown answers (its last read of the top), for loadMore to refuse another's. */
  const answeredRef = useRef<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more', searchTerm: string) => {
    if (!myId) return;
    if (mode === 'more') {
      // Ref-based in-flight guard: keeping `loadingMore` STATE out of this
      // callback's deps keeps `load`'s identity stable — otherwise the first
      // loadMore would regenerate `load`, re-fire the reset effect, wipe the
      // list back to page 1 mid-scroll, and strand `loadingMore` as true
      // (killing all future pagination).
      if (!hasMoreRef.current || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    // A read of the top begins a new list; a next page belongs to the list it was asked under, and
    // never supersedes a read of the top still out (a search's answer was dropped for it, and the
    // door stayed "reading" until the words changed: review round 12).
    const top = mode !== 'more';
    const seq = top ? ++reqSeq.current : reqSeq.current;
    const gen = top ? ++listGen.current : listGen.current;
    if (top) topReading.current = true;
    if (mode === 'refresh') {
      setRefreshing(true);
    } else if (mode === 'initial') {
      setLoading(true);
    }
    /** This answer is still for the list shown: no later read of the top began. */
    const current = () => isMounted.current && seq === reqSeq.current && gen === listGen.current;
    try {
      const cursor = mode === 'more' ? cursorRef.current : null;
      const page = await FollowRequestService.fetchPage({ myId, cursor, search: searchTerm });
      if (!current()) return; // stale response
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.nextCursor !== null;
      setHasMore(page.nextCursor !== null);
      setItems(prev => {
        if (mode === 'more') {
          const seen = new Set(prev.map(r => r.requesterId));
          return [...prev, ...page.items.filter(r => !seen.has(r.requesterId))];
        }
        return page.items;
      });
      if (mode === 'more') setMoreFailed(false); else { setFailed(false); setMoreFailed(false); }
    } catch {
      if (!current()) return;
      if (mode === 'more') setMoreFailed(true);
      else { setItems([]); setFailed(true); }
    } finally {
      if (mode === 'more') {
        // Always release the pagination lock, even if a newer request
        // superseded this one — a stale 'more' must never wedge the list.
        loadingMoreRef.current = false;
        if (isMounted.current) setLoadingMore(false);
      } else if (isMounted.current && seq === reqSeq.current) {
        topReading.current = false;
        answeredRef.current = searchTerm;
        setLoading(false); setRefreshing(false);
        setAnsweredFor(searchTerm);
      }
    }
  }, [myId]);

  // Open / search changes → reset + reload (debounced for search).
  useEffect(() => {
    if (!enabled) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      cursorRef.current = null;
      hasMoreRef.current = true;
      load('initial', search);
      refreshFollowRequestCount();
    }, search ? 280 : 0);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [enabled, search, load]);

  // A next page only of the list shown, answered for the words in the box: never while its top is
  // being read again, nor while a search typed is still to be read (its debounce, or its read).
  const loadMore = useCallback(() => {
    if (!enabled || topReading.current || answeredRef.current !== search) return;
    load('more', search);
  }, [enabled, load, search]);
  const refresh = useCallback(() => { cursorRef.current = null; hasMoreRef.current = true; load('refresh', search); }, [load, search]);
  const retry = useCallback(() => { cursorRef.current = null; hasMoreRef.current = true; load('initial', search); }, [load, search]);
  const setSearch = useCallback((v: string) => setSearchRaw(v), []);

  // Optimistic resolve (accept/decline share the shape).
  const resolve = useCallback(async (req: FollowRequest, admit: boolean) => {
    // Only the same row twice is refused: another row's answer is its own.
    if (busy.current.has(req.requesterId)) return;
    busy.current.add(req.requesterId);
    setBusyIds(new Set(busy.current));
    // The press is a selection; an admission's success is felt only when the house admitted someone.
    TactileEngine.selection();
    const me = useAuthStore.getState().user?.id;
    // Optimistic: drop the row + decrement the badge immediately.
    setItems(prev => prev.filter(r => r.requesterId !== req.requesterId));
    const cur = useSocialStore.getState().pendingRequestCount;
    setCount(Math.max(0, cur - 1));
    const answer = admit
      ? await FollowRequestService.accept(req.requesterId)
      : (await FollowRequestService.decline(req.requesterId)) ? 'declined' : 'failed';
    const ok = answer !== 'failed';
    busy.current.delete(req.requesterId);
    // Answered: the house took its notice, and the bell lets it go too, whether or not the door
    // is still open. Never the next member's bell: theirs holds their own requests.
    if (ok && stillSignedIn(me)) useNotificationStore.getState().forgetRequestNotices(req.requesterId);
    if (answer === 'admitted' && stillSignedIn(me)) TactileEngine.success();
    // The request was no longer there (withdrawn meanwhile, or taken by a block): no one was
    // admitted, and the member is told so rather than left believing they were (review round 11).
    // The row and the badge stay as they are: the request is truly gone.
    if (answer === 'gone' && stillSignedIn(me)) reelToast(`@${req.username}'s request is no longer at the door.`);
    // A refusal is said, and the badge given back, though the door was closed meanwhile: the
    // member was told nothing, and the petitioner was silently back at the next opening (review
    // round 7). Never to the next member on the phone.
    if (!ok && stillSignedIn(me)) {
      setCount(useSocialStore.getState().pendingRequestCount + 1);
      reelToast.error(admit ? `Couldn't admit @${req.username}. Try again.` : `Couldn't decline. Try again.`);
    }
    if (!isMounted.current) return;
    // Rollback: the row back on the door still open.
    if (!ok) setItems(prev => [req, ...prev].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    setBusyIds(new Set(busy.current));
  }, [setCount]);

  const accept = useCallback((req: FollowRequest) => resolve(req, true), [resolve]);
  const decline = useCallback((req: FollowRequest) => resolve(req, false), [resolve]);

  const declineAll = useCallback(async () => {
    const snapshot = items;
    const hadMore = hasMoreRef.current;
    TactileEngine.warn();
    const me = useAuthStore.getState().user?.id;
    setItems([]);
    setCount(0);
    hasMoreRef.current = false;
    setHasMore(false);
    const n = await FollowRequestService.declineAll();
    if (n >= 0 && stillSignedIn(me)) useNotificationStore.getState().forgetRequestNotices(null);
    // Said, and counted again, though the door was closed meanwhile (as one answer is, above).
    if (n < 0 && stillSignedIn(me)) {
      reelToast.error("Couldn't clear the queue. Try again.");
      refreshFollowRequestCount();
    }
    if (!isMounted.current) return;
    if (n < 0) {
      // Failure: restore, paging included.
      setItems(snapshot);
      hasMoreRef.current = hadMore;
      setHasMore(hadMore);
    }
  }, [items, setCount]);

  // A member blocked or muted is never offered at the door, to be admitted across it.
  const whoIsHidden = useWhoIsHidden();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- whoIsHidden is the change that redraws it; filterContentByBlocks reads the block store itself
  const shown = useMemo(() => filterContentByBlocks(items, (r) => r.requesterId), [items, whoIsHidden]);

  return {
    items: shown, loading: loading || (enabled && answeredFor !== search), loadingMore, refreshing, hasMore, search, busyIds, failed, moreFailed,
    setSearch, loadMore, refresh, retry, accept, decline, declineAll,
  };
}
