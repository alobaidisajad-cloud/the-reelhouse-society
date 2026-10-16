/**
 * whatThisPhoneHoldsIsSaid.test.ts — src/utils/keptOnThisPhone's words, asked
 * directly (TST-27: reached only through the sign-out sheet and the return
 * notice, which never handed them nothing, one thing, or a count they could
 * not make).
 */
import { erasedBySigningOut, keptAfterSignOutElsewhere, keptFromBefore } from '../keptOnThisPhone';
import type { QueuedMutation } from '../offlineQueue';

const queued = (type: string): QueuedMutation => ({ id: `q-${type}`, type, timestamp: 0, payload: {} } as unknown as QueuedMutation);

describe('at the member\'s own sign-out, which erases it', () => {
  it('says nothing when this phone holds nothing of theirs', () => {
    expect(erasedBySigningOut({ unsent: 0, drafts: 0, failedWords: 0 })).toBeNull();
  });

  it('says "it" of one thing, and "all of them" of more', () => {
    expect(erasedBySigningOut({ unsent: 1, drafts: 0, failedWords: 0 }))
      .toBe('Your membership will remain. This phone still holds, for you: 1 change not yet sent. Signing out erases it.');
    expect(erasedBySigningOut({ unsent: 2, drafts: 1, failedWords: 1 }))
      .toBe('Your membership will remain. This phone still holds, for you: 2 changes not yet sent, 1 draft and 1 piece of writing that could not be sent. Signing out erases all of them.');
  });

  it('says so when the drafts could not be counted, and never calls them one', () => {
    expect(erasedBySigningOut({ unsent: 0, drafts: null, failedWords: 0 }))
      .toBe('Your membership will remain. This phone still holds, for you: drafts it could not count. Signing out erases all of them.');
  });
});

describe('when the session ended without their hand, which keeps it', () => {
  it('says only that they were signed out, when nothing is kept', () => {
    expect(keptAfterSignOutElsewhere({ kept: 0, lapsed: 0, drafts: 0 })).toBe('You were signed out.');
    expect(keptAfterSignOutElsewhere({ kept: 0, lapsed: 0, drafts: null })).toBe('You were signed out.');
  });

  it('names what waits for their return, and the small marks that did not', () => {
    expect(keptAfterSignOutElsewhere({ kept: 1, lapsed: 1, drafts: 2 }))
      .toBe('You were signed out. Kept on this phone until you sign in again: 1 change not yet sent and 2 drafts. A small mark (a certify, an endorsement, a follow, a save) was not kept.');
    expect(keptAfterSignOutElsewhere({ kept: 0, lapsed: 3, drafts: 0 }))
      .toBe('You were signed out. 3 small marks (a certify, an endorsement, a follow, a save) were not kept.');
  });
});

describe('at their return', () => {
  it('says nothing when nothing was kept for them', () => {
    expect(keptFromBefore([])).toBeNull();
  });

  it('names words by their kind, and counts the rest as changes', () => {
    expect(keptFromBefore([queued('add_critique'), queued('add_critique'), queued('add_log_comment')]))
      .toBe('Kept for you from before you were signed out: 2 critiques and 1 comment, waiting on this phone to be sent.');
    expect(keptFromBefore([queued('add_filing'), queued('toggle_follow')]))
      .toBe('Kept for you from before you were signed out: 1 filing and 1 other change, waiting on this phone to be sent.');
    expect(keptFromBefore([queued('toggle_follow'), queued('toggle_follow')]))
      .toBe('Kept for you from before you were signed out: 2 changes, waiting on this phone to be sent.');
  });
});
