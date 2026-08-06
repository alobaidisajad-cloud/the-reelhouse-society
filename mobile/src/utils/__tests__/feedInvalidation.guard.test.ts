/**
 * feedInvalidation.guard.test.ts — #82, following someone left the feed unchanged
 * ─────────────────────────────────────────────────────────────────────────────
 * `socialSlice` had no connection to the query cache at all. The intended behaviour
 * existed in exactly ONE call site — MemberRegistry invalidated after a successful
 * follow — so following from the Registry refreshed the feed while following from the
 * PROFILE screen, the primary follow surface, did not.
 *
 * The impact as filed was wrong in the app's favour and worth recording, because it
 * changes what has to be tested: the following feed is DISABLED while you follow
 * nobody, so a member's very first follow flips it on and it loads. The audit called
 * that the worst case; it is the one case that already worked. The real bug is every
 * follow after the first (60s stale), every unfollow, and the stacks feed (5 minutes).
 *
 * These are source assertions. The behaviour they protect — "does React Query refetch"
 * — belongs to React Query, not to this codebase; what this codebase can get wrong is
 * calling the wrong key, in the wrong place, or not at all. That is exactly what is
 * pinned here.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const slice = fs.readFileSync(path.join(ROOT, 'stores', 'domain', 'socialSlice.ts'), 'utf8');
const feeds = fs.readFileSync(path.join(ROOT, 'hooks', 'useFeeds.ts'), 'utf8');
const queue = fs.readFileSync(path.join(ROOT, 'utils', 'offlineQueue.ts'), 'utf8');
const registry = fs.readFileSync(path.join(ROOT, 'components', 'reels', 'MemberRegistry.tsx'), 'utf8');

describe('the store refreshes the feeds it invalidates', () => {
  it('imports the query client and defines one refresher', () => {
    expect(slice).toMatch(/import\s*\{[^}]*queryClient[^}]*\}\s*from\s*['"][^'"]*queryClient['"]/);
    expect(slice).toMatch(/function refreshFollowGraphFeeds\(\)/);
  });

  it('invalidates BOTH follow-dependent feeds', () => {
    const fn = slice.slice(slice.indexOf('function refreshFollowGraphFeeds()'));
    expect(fn.slice(0, 500)).toMatch(/queryKey: \['feed', 'following'\]/);
    expect(fn.slice(0, 500)).toMatch(/queryKey: \['feed', 'stacks', 'following'\]/);
  });

  it('does NOT invalidate the community feed, which cannot change on a follow', () => {
    // getCommunityFeed takes no follow list — verified against FeedService. The audit
    // recommended the whole ['feed'] prefix; that would refetch it on every follow for
    // nothing. Narrower is both cheaper and more truthful about what changed.
    const fn = slice.slice(slice.indexOf('function refreshFollowGraphFeeds()'));
    expect(fn.slice(0, 500)).not.toMatch(/queryKey: \['feed'\]/);
    expect(fn.slice(0, 500)).not.toMatch(/'community'/);
  });

  it('is called on the success paths of BOTH follow and unfollow', () => {
    // Three: follow's insert, follow's already-interacted branch, and unfollow.
    const calls = slice.match(/^\s+refreshFollowGraphFeeds\(\);/gm) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);

    const follow = slice.slice(slice.indexOf('export async function followUser'),
                               slice.indexOf('export async function unfollowUser'));
    const unfollow = slice.slice(slice.indexOf('export async function unfollowUser'),
                                 slice.indexOf('export async function hydrateFollowing'));
    expect(follow).toMatch(/refreshFollowGraphFeeds\(\);/);
    expect(unfollow).toMatch(/refreshFollowGraphFeeds\(\);/);
  });

  it('never lets a failed refresh break a follow', () => {
    const fn = slice.slice(slice.indexOf('function refreshFollowGraphFeeds()'), slice.indexOf('// ── Public API ──'));
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch/);
  });
});

describe('a follow that syncs later still reaches the feed', () => {
  it('the flush invalidates once a social mutation actually ran', () => {
    // The gap the audit never found: nothing refreshed the feed after a flush, so an
    // offline follow synced successfully and still did not appear until a timer lapsed.
    expect(queue).toMatch(/SOCIAL_MUTATION_TYPES/);
    expect(queue).toMatch(/socialMutationSynced = true/);
    expect(queue).toMatch(/if \(socialMutationSynced\)/);
  });

  it('covers every queue type that changes the graph', () => {
    const set = queue.slice(queue.indexOf('const SOCIAL_MUTATION_TYPES'), queue.indexOf('const QUEUE_KEY'));
    for (const t of ['follow_user', 'follow_request_user', 'unfollow_user']) {
      expect(set).toContain(t);
    }
  });

  it('does NOT invalidate after an unrelated flush', () => {
    // A log, a stub or an archive row has no bearing on who you follow. The flag is set
    // only inside the social-type check, never unconditionally.
    expect(queue).not.toMatch(/successCount\+\+;\s*\r?\n\s*socialMutationSynced = true/);
  });
});

describe('the reactivity that never worked is gone, and the one that does is kept', () => {
  it('useStacksFeed no longer subscribes to the follow graph', () => {
    // It re-rendered on every follow and never refetched, because the key was
    // unchanged — someone wired it up, saw it do nothing, and silenced the lint.
    const stacks = feeds.slice(feeds.indexOf('export function useStacksFeed'));
    expect(stacks).not.toMatch(/const followingForEnabled = useSocialStore/);
    expect(stacks).not.toMatch(/eslint-disable-next-line @typescript-eslint\/no-unused-vars/);
  });

  it('useFollowingFeed KEEPS its subscription — it is load-bearing', () => {
    // That one drives `enabled`, which is what makes a member's first follow work.
    // Deleting it as "also dead" would break the one case that was never broken.
    const following = feeds.slice(feeds.indexOf('export function useFollowingFeed'),
                                  feeds.indexOf('export function useStacksFeed'));
    expect(following).toMatch(/const followingForEnabled = useSocialStore/);
    expect(following).toMatch(/enabled: followingForEnabled\.length > 0/);
  });

  it('the Registry no longer keeps a private copy of the rule', () => {
    expect(registry).not.toMatch(/invalidateQueries/);
    expect(registry).not.toMatch(/from '@\/src\/lib\/queryClient'/);
  });
});
