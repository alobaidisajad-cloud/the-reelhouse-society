/**
 * queryPolicy.ts — the rules every read and every action keeps.
 *
 * Their one home: the app's client (queryClient.ts) is built from them, and so
 * is every client a test builds (test-utils/testQueryClient.ts), so a screen is
 * tested under the rules the phone runs. This file starts nothing — no
 * listener, no storage — so a test can load it freely.
 */

import { onlineManager, type DefaultOptions } from '@tanstack/react-query';
import { isTmdbUnreachable } from './tmdbErrors';

/**
 * One more try, once — never for a failure that another try cannot mend: the
 * phone has no connection, or the catalogue was already tried three times
 * inside fetchTMDB. Those go straight to the screen, which says so.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  return failures < 1 && onlineManager.isOnline() && !isTmdbUnreachable(error);
}

export const QUERY_POLICY = {
  queries: {
    staleTime: 5 * 60 * 1000,        // 5 min — data is "fresh" for this window
    gcTime: 30 * 60 * 1000,           // 30 min — garbage collect unused queries
    retry: shouldRetry,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    // Asked even with no connection, so a read fails and the screen says it
    // could not reach the house. React Query's default ('online') instead
    // PAUSES the read: it is neither loading nor failed, and a page opened
    // offline read its missing data as "this film does not exist". What a
    // pause was for, running again when the connection returns, the
    // reconnect refetch below does for every screen on show.
    networkMode: 'always',
    // Coming back to the app never reorders a feed under the member's thumb;
    // a screen that wants word of what is new asks for it (the Dispatch's pill).
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  },
  // An action taken offline fails and is said to have failed; paused, a
  // report or a ruling waited unseen, its button busy, for a connection.
  mutations: { networkMode: 'always' },
} satisfies DefaultOptions;
