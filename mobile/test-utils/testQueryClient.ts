/**
 * testQueryClient.ts — the one React Query client a test builds.
 *
 * It keeps the app's own rules (src/lib/queryPolicy.ts) — a read with no
 * connection fails rather than pausing, one more try, five minutes fresh — so
 * a screen is tested as the phone runs it, and changes only what a test must:
 *
 *   · gcTime Infinity, for reads and actions alike: no collection timer is
 *     started when the last observer goes. Five minutes (React Query's own
 *     default) or 0 both start one, and a timer still waiting when the file
 *     ends fails it (test-utils/timerCheckingEnvironment.js);
 *   · retryDelay 0: the one more try happens at once, inside the test, instead
 *     of a second later after it.
 *
 * And it hears what a read or an action threw. React Query keeps an error to
 * itself — nothing is logged — so a mock missing a method ("lte is not a
 * function") failed the read silently and the test passed. Every error goes to
 * jest.setup.ts's mock-gap check, which fails the test for that phrasing.
 *
 * `new QueryClient(` appears in no test but this one file
 * (everyTestClientKeepsTheHouseRules.test.ts).
 */
import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { QUERY_POLICY } from '@/src/lib/queryPolicy';

/** What a test changes of the app's rules, and only that. */
export const TEST_ONLY = { gcTime: Infinity, retryDelay: 0 } as const;

/** jest.setup.ts's mock-gap check, which reads an error the way it reads a logged one. */
const heard = (error: unknown) =>
  (globalThis as { __noteIfMockGap?: (args: unknown[]) => void }).__noteIfMockGap?.([error]);

export function testQueryClient(
  over: { queries?: DefaultOptions['queries']; mutations?: DefaultOptions['mutations'] } = {},
): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: heard }),
    mutationCache: new MutationCache({ onError: heard }),
    defaultOptions: {
      queries: { ...QUERY_POLICY.queries, ...TEST_ONLY, ...over.queries },
      mutations: { ...QUERY_POLICY.mutations, ...TEST_ONLY, ...over.mutations },
    },
  });
}
