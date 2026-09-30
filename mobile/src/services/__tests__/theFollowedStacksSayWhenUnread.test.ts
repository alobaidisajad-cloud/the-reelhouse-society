/**
 * theFollowedStacksSayWhenUnread.test.ts — the stacks of members you follow,
 * read without the server's own function (the fallback it keeps for a database
 * that lacks it).
 *
 * Its first step asks who you follow. A failed answer was read as "nobody", and
 * the page drew empty — "follow members to see their stacks" — to a member who
 * follows fifty. The logs' fallback beside it already said it could not read;
 * now both do.
 */
import { FeedService } from '../FeedService';

let mockProfiles: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    // The server's function is absent: the fallback runs.
    rpc: async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }),
    from: (table: string) => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'in', 'or', 'lt', 'abortSignal']) chain[m] = () => chain;
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(table === 'profiles' ? mockProfiles : { data: [], error: null }).then(res, rej);
      return chain;
    },
  },
}));

describe('the stacks of members you follow', () => {
  it('say they could not be read, rather than that you follow no one', async () => {
    mockProfiles = { data: null, error: { message: 'TypeError: Network request failed' } };
    await expect(FeedService.getStacksFeed('following', '', {}, ['kane', 'ozu_fan'])).rejects.toBeTruthy();
  });

  it('are empty only when the answer is that none of them exist', async () => {
    mockProfiles = { data: [], error: null };
    await expect(FeedService.getStacksFeed('following', '', {}, ['kane'])).resolves.toEqual([]);
  });
});
