/**
 * useScrollTrace — each scroll of a list is one Sentry transaction, from the
 * first drag until the list comes to rest (a fling's glide included), named by
 * its screen's route and, where a screen holds two lists, the list. The slow
 * and frozen frames the phone drew in it are counted there (startScrollSpan),
 * so a stutter while scrolling is measured on members' phones.
 *
 * A list that keeps an `isScrolling` value hands it to useScrollTraceOf; a
 * plain list spreads `traceProps` from useScrollTrace onto itself.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import * as Navigation from '@react-navigation/native';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { startScrollSpan } from '@/src/lib/sentry';

/** A drag that ends and the glide that follows are one scroll: the end waits this long for the glide. */
export const SCROLL_SETTLE_MS = 150;

/** Outside any screen (or where the navigation library is absent), a scroll has no route. */
const NO_ROUTE = createContext<{ name: string } | undefined>(undefined);
const ROUTE = (Navigation.NavigationRouteContext as typeof NO_ROUTE | undefined) ?? NO_ROUTE;

/** Where a scroll is named from no screen. */
export const NO_SCREEN = 'unrouted';

export function useScrollTrace(list?: string) {
  // The nearest screen's route, named as Sentry names its opening: 'reels', 'film/[id]'.
  const route = useContext(ROUTE)?.name ?? NO_SCREEN;
  const name = list ? `${route} ${list}` : route;
  const end = useRef<(() => void) | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = null;
    if (!end.current) end.current = startScrollSpan(name);
  }, [name]);

  const settle = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = setTimeout(() => {
      settling.current = null;
      end.current?.();
      end.current = null;
    }, SCROLL_SETTLE_MS);
  }, []);

  // A list that leaves mid-scroll closes its scroll then.
  useEffect(() => () => {
    if (settling.current) clearTimeout(settling.current);
    end.current?.();
    end.current = null;
  }, []);

  const traceProps = useMemo(() => ({
    onScrollBeginDrag: begin, onScrollEndDrag: settle, onMomentumScrollBegin: begin, onMomentumScrollEnd: settle,
  }), [begin, settle]);

  return { begin, settle, traceProps };
}

/** The same, driven by a list's own `isScrolling`: true on a drag or a glide, false as each ends. */
export function useScrollTraceOf(isScrolling: SharedValue<boolean>, list?: string) {
  const { begin, settle } = useScrollTrace(list);
  useAnimatedReaction(() => isScrolling.value, (now, before) => {
    if (now === before) return;
    runOnJS(now ? begin : settle)();
  }, [begin, settle]);
}
