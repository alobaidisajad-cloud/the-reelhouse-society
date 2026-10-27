/**
 * useFeedTop — a feed read again on return or reconnect only while its list stands at its top (P4.7).
 *
 * A feed fetched again under the member's thumb moves every row they are reading. So a return to
 * the app, or the connection coming back, fetches a feed again only while its list is at its
 * top; below it nothing is fetched and nothing moves. The fetch missed below the top is kept: the
 * next time the member reaches the top, the feed is fetched once (if still older than a read
 * stays fresh) and its new rows are drawn there.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { focusManager, onlineManager, useQueryClient, type Query, type QueryKey } from '@tanstack/react-query';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';

/** Within this of the top, the list stands at it: a pull's overscroll and a hairline count. */
const TOP_SLACK = 24;

/**
 * Older than it stays fresh, measured now: a query's own stale mark waits on a timer, which a phone
 * in the background may never have run.
 */
const older = (q: Query) => {
  // The observer's options, staleTime among them, are what the query was built from.
  const { staleTime } = q.options as { staleTime?: unknown };
  return q.isStaleByTime(typeof staleTime === 'number' ? staleTime : undefined);
};

/** The return and reconnect rules a feed's query takes. */
export type FeedReturn = {
  refetchOnWindowFocus: () => boolean;
  refetchOnReconnect: () => 'always' | false;
};

export function useFeedTop(scrollY: SharedValue<number>, feeds: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const atTop = useRef(true);
  const missed = useRef(false);

  /** The list reached its top, or left it. */
  const reach = useCallback((top: boolean) => {
    atTop.current = top;
    if (!top || !missed.current) return;
    missed.current = false;
    for (const queryKey of feeds) void queryClient.refetchQueries({ queryKey, type: 'active', predicate: older });
  }, [feeds, queryClient]);

  // Heard from the UI thread only as the list crosses its top, never on every frame of a scroll.
  useAnimatedReaction(
    () => scrollY.value <= TOP_SLACK,
    (top, was) => { if (was !== null && top !== was) runOnJS(reach)(top); },
    [reach],
  );

  // A return or a reconnect while below the top is the fetch the member missed.
  useEffect(() => {
    const away = () => { if (!atTop.current) missed.current = true; };
    const offFocus = focusManager.subscribe((focused) => { if (focused) away(); });
    const offOnline = onlineManager.subscribe((online) => { if (online) away(); });
    return () => { offFocus(); offOnline(); };
  }, []);

  const whenBack = useMemo<FeedReturn>(() => ({
    refetchOnWindowFocus: () => atTop.current,
    refetchOnReconnect: () => (atTop.current ? 'always' : false),
  }), []);

  return { whenBack, reach };
}
