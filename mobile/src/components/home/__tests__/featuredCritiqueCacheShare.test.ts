/**
 * featuredCritiqueCacheShare.test.ts
 * ──────────────────────────────────
 * The Lobby shows a Lead Story (FeaturedCritique) and a wire of recent reviews
 * (SocialPulse), and with the archive at its current size the same log routinely
 * fills both. SocialPulse removes the duplicate by reading the featured id out
 * of the query cache with an observer that has NO queryFn and is disabled, so it
 * never issues a request of its own:
 *
 *     useQuery({ queryKey: ['featuredCritique', refreshTrigger], enabled: false })
 *
 * That leans on a real subtlety in @tanstack/query-core. Two observers share one
 * Query, and EVERY observer pushes its own options onto it (QueryObserver line
 * ~94: `this.#currentQuery.setOptions(this.options)`), where Query.setOptions
 * does a full replacement — `{ ...defaults, ...options }`. So the observer
 * without a queryFn genuinely does wipe the queryFn off the shared Query.
 *
 * It is saved by a fallback inside Query.fetch:
 *
 *     if (!this.options.queryFn) {
 *       const observer = this.observers.find((x) => x.options.queryFn);
 *       if (observer) this.setOptions(observer.options);
 *     }
 *
 * That fallback is internal library behaviour, not part of the public API — a
 * react-query upgrade could drop it, and the failure would be quiet: cached data
 * would still render, and only a REFETCH (pull-to-refresh, staleTime expiry,
 * invalidate) would break, showing an empty Lead Story. So it is pinned here.
 *
 * If this test fails after a react-query bump, do not delete it — switch
 * SocialPulse to reading the cache without an observer (useSyncExternalStore
 * over queryCache.subscribe + getQueryData), which cannot clobber anything.
 */
import { QueryClient, QueryObserver } from '@tanstack/query-core';

const KEY = ['featuredCritique', 0];

function makeClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('SocialPulse observing the featured critique cache', () => {
    it('does not stop FeaturedCritique from refetching', async () => {
        const client = makeClient();
        let calls = 0;
        const queryFn = async () => { calls += 1; return { id: 'log-123' }; };

        const owner = new QueryObserver(client, { queryKey: KEY, queryFn });
        const unsubOwner = owner.subscribe(() => {});
        // SocialPulse: observes only.
        const watcher = new QueryObserver(client, { queryKey: KEY, enabled: false });
        const unsubWatcher = watcher.subscribe(() => {});

        await new Promise((r) => setTimeout(r, 30));
        expect(calls).toBe(1);

        await client.refetchQueries({ queryKey: KEY });
        await new Promise((r) => setTimeout(r, 30));

        // The refetch actually ran and the data survived.
        expect(calls).toBe(2);
        expect(client.getQueryData(KEY)).toEqual({ id: 'log-123' });

        unsubOwner(); unsubWatcher();
        client.clear();
    });

    it('survives the watcher mounting FIRST, before the owner exists', async () => {
        const client = makeClient();
        let calls = 0;
        const queryFn = async () => { calls += 1; return { id: 'log-456' }; };

        // Mount order is not guaranteed, so prove the harder direction too:
        // the Query gets CREATED by the observer that has no queryFn.
        const watcher = new QueryObserver(client, { queryKey: KEY, enabled: false });
        const unsubWatcher = watcher.subscribe(() => {});

        const owner = new QueryObserver(client, { queryKey: KEY, queryFn });
        const unsubOwner = owner.subscribe(() => {});

        await new Promise((r) => setTimeout(r, 30));

        expect(calls).toBe(1);
        expect(client.getQueryData(KEY)).toEqual({ id: 'log-456' });

        unsubOwner(); unsubWatcher();
        client.clear();
    });

    it('the watcher reads the id the owner fetched, which is the whole point', async () => {
        const client = makeClient();
        const owner = new QueryObserver(client, {
            queryKey: KEY,
            queryFn: async () => ({ id: 'log-789' }),
        });
        const unsubOwner = owner.subscribe(() => {});
        const watcher = new QueryObserver<{ id?: string } | undefined>(client, {
            queryKey: KEY,
            enabled: false,
        });
        const unsubWatcher = watcher.subscribe(() => {});

        await new Promise((r) => setTimeout(r, 30));

        expect(watcher.getCurrentResult().data?.id).toBe('log-789');

        unsubOwner(); unsubWatcher();
        client.clear();
    });
});
