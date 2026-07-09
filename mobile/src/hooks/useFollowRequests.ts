/**
 * useFollowRequests — state engine for the "At the Door" panel.
 * ─────────────────────────────────────────────────────────────
 * Cursor pagination + debounced server-side search + optimistic accept/decline
 * with rollback, all kept in sync with the store's pendingRequestCount (which
 * drives the Notices banner + profile door badge). Only mounts work while the
 * panel is open (`enabled`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import { FollowRequestService, FollowRequest } from '@/src/services/FollowRequestService';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';

/** Refresh the cached pending-request count (banner/badge). Safe to call anywhere. */
export async function refreshFollowRequestCount(): Promise<void> {
  const myId = useAuthStore.getState().user?.id;
  if (!myId) return;
  const n = await FollowRequestService.count(myId);
  useSocialStore.getState().setPendingRequestCount(n);
}

export function useFollowRequests(enabled: boolean) {
  const myId = useAuthStore(s => s.user?.id);
  const setCount = useSocialStore(s => s.setPendingRequestCount);

  const [items, setItems] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearchRaw] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const [hasMore, setHasMore] = useState(true);
  const isMounted = useRef(true);
  const reqSeq = useRef(0); // guards against out-of-order responses when searching
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more', searchTerm: string) => {
    if (!myId) return;
    const seq = ++reqSeq.current;
    if (mode === 'more') {
      if (!hasMoreRef.current || loadingMore) return;
      setLoadingMore(true);
    } else if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const cursor = mode === 'more' ? cursorRef.current : null;
      const page = await FollowRequestService.fetchPage({ myId, cursor, search: searchTerm });
      if (!isMounted.current || seq !== reqSeq.current) return; // stale response
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
    } finally {
      if (isMounted.current && seq === reqSeq.current) {
        setLoading(false); setLoadingMore(false); setRefreshing(false);
      }
    }
  }, [myId, loadingMore]);

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

  const loadMore = useCallback(() => { if (enabled) load('more', search); }, [enabled, load, search]);
  const refresh = useCallback(() => { cursorRef.current = null; hasMoreRef.current = true; load('refresh', search); }, [load, search]);
  const setSearch = useCallback((v: string) => setSearchRaw(v), []);

  // Optimistic resolve (accept/decline share the shape).
  const resolve = useCallback(async (req: FollowRequest, admit: boolean) => {
    if (busyId) return;
    setBusyId(req.requesterId);
    if (admit) TactileEngine.success(); else TactileEngine.selection();
    // Optimistic: drop the row + decrement the badge immediately.
    setItems(prev => prev.filter(r => r.requesterId !== req.requesterId));
    const cur = useSocialStore.getState().pendingRequestCount;
    setCount(cur - 1);
    const ok = admit
      ? await FollowRequestService.accept(req.requesterId)
      : await FollowRequestService.decline(req.requesterId);
    if (!isMounted.current) return;
    if (!ok) {
      // Rollback: restore row + badge.
      setItems(prev => [req, ...prev].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      setCount(useSocialStore.getState().pendingRequestCount + 1);
      reelToast.error(admit ? `Couldn't admit @${req.username}. Try again.` : `Couldn't decline. Try again.`);
    }
    setBusyId(null);
  }, [busyId, setCount]);

  const accept = useCallback((req: FollowRequest) => resolve(req, true), [resolve]);
  const decline = useCallback((req: FollowRequest) => resolve(req, false), [resolve]);

  const declineAll = useCallback(async () => {
    const snapshot = items;
    TactileEngine.warn();
    setItems([]);
    setCount(0);
    hasMoreRef.current = false;
    setHasMore(false);
    const n = await FollowRequestService.declineAll();
    if (!isMounted.current) return;
    if (n < 0) {
      // Failure: restore and re-count from the server.
      setItems(snapshot);
      reelToast.error("Couldn't clear the queue. Try again.");
      refreshFollowRequestCount();
    }
  }, [items, setCount]);

  return {
    items, loading, loadingMore, refreshing, hasMore, search, busyId,
    setSearch, loadMore, refresh, accept, decline, declineAll,
  };
}
