/**
 * socialSlice.hydrationReconcile.test.ts — the follow that vanished on relaunch
 * ───────────────────────────────────────────────────────────────────────────
 * NOT in the audit register. Found by asking what else was wrong in the same area.
 *
 * Follow someone offline: the mutation is queued and the UI updates optimistically.
 * Relaunch before it flushes and `hydrateFollowing` replaces the whole list with the
 * server's copy — which does not have it yet. The follow disappears from the screen
 * even though it is queued and will sync. The offline handler never touches the store
 * either, so it does not reappear until the NEXT launch re-hydrates.
 *
 * The same in reverse: an offline unfollow is undone on screen because the server row
 * is still standing.
 *
 * Neither is fixed by the missing unique constraint — both survive it — which is why
 * this had to be part of the same batch. Fixing the flush alone would still have shown
 * a follow disappearing and coming back a launch later.
 */
import { reconcileGraphWithPendingMutations as reconcile } from '../domain/socialSlice';

const follow = (u: string) => ({ type: 'follow_user', payload: { target_username: u } });
const request = (u: string) => ({ type: 'follow_request_user', payload: { target_username: u } });
const unfollow = (u: string) => ({ type: 'unfollow_user', payload: { target_username: u } });

describe('a pending follow survives hydration', () => {
  it('the headline case: followed offline, relaunched before it flushed', () => {
    const { following } = reconcile([], [], [follow('morpho')]);
    expect(following).toEqual(['morpho']);
  });

  it('is added alongside what the server already knows', () => {
    const { following } = reconcile(['banen'], [], [follow('morpho')]);
    expect(following.sort()).toEqual(['banen', 'morpho']);
  });

  it('a pending REQUEST lands in requested, not following', () => {
    const { following, requested } = reconcile([], [], [request('secretive')]);
    expect(following).toEqual([]);
    expect(requested).toEqual(['secretive']);
  });
});

describe('a pending unfollow is not resurrected by hydration', () => {
  it('the server still has the row; the queue says it is going', () => {
    const { following } = reconcile(['morpho'], [], [unfollow('morpho')]);
    expect(following).toEqual([]);
  });

  it('a cancelled request is not resurrected either', () => {
    const { requested } = reconcile([], ['secretive'], [unfollow('secretive')]);
    expect(requested).toEqual([]);
  });
});

describe('queue ORDER is meaning, not decoration', () => {
  it('follow then unfollow ends unfollowed', () => {
    expect(reconcile([], [], [follow('x'), unfollow('x')]).following).toEqual([]);
  });

  it('unfollow then follow ends followed', () => {
    expect(reconcile(['x'], [], [unfollow('x'), follow('x')]).following).toEqual(['x']);
  });

  it('a long churn resolves to the last word', () => {
    const q = [follow('x'), unfollow('x'), follow('x'), unfollow('x'), follow('x')];
    expect(reconcile([], [], q).following).toEqual(['x']);
  });

  it('a follow supersedes an earlier request for the same member', () => {
    // The privacy trigger can downgrade it server-side; locally the last word wins.
    const { following, requested } = reconcile([], [], [request('x'), follow('x')]);
    expect(following).toEqual(['x']);
    expect(requested).toEqual([]);
  });
});

describe('it leaves everything else alone', () => {
  it('ignores non-social mutations entirely', () => {
    const q = [
      { type: 'add_log', payload: { film_id: 1 } },
      { type: 'send_lounge_message', payload: { content: 'hi' } },
      { type: 'submit_report', payload: { target_username: 'morpho' } },
    ];
    const { following, requested } = reconcile(['banen'], ['secretive'], q);
    expect(following).toEqual(['banen']);
    expect(requested).toEqual(['secretive']);
  });

  it('an empty queue changes nothing at all', () => {
    const { following, requested } = reconcile(['a', 'b'], ['c'], []);
    expect(following).toEqual(['a', 'b']);
    expect(requested).toEqual(['c']);
  });

  it('survives malformed queue entries rather than throwing into a cold start', () => {
    const q = [
      { type: 'follow_user' },
      { type: 'follow_user', payload: {} },
      { type: 'follow_user', payload: { target_username: '' } },
      { type: 'follow_user', payload: { target_username: 42 } },
      follow('real'),
    ] as never[];
    expect(reconcile([], [], q).following).toEqual(['real']);
  });
});

describe('identity is case-insensitive, like the store index', () => {
  it('does not duplicate a member whose case differs', () => {
    const { following } = reconcile(['Morpho'], [], [follow('morpho')]);
    expect(following).toHaveLength(1);
  });

  it('an unfollow matches regardless of case', () => {
    expect(reconcile(['Morpho'], [], [unfollow('MORPHO')]).following).toEqual([]);
  });

  it('keeps the first spelling seen, so display does not flicker', () => {
    expect(reconcile(['Morpho'], [], [follow('morpho')]).following).toEqual(['Morpho']);
  });
});
