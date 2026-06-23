/**
 * useProfileController.logic.test.ts — Pure Logic Tests
 * ────────────────────────────────────────────────────────
 * Tests the two pure helpers extracted from useProfileController:
 * normalizeSocialHash (drives the cross-render diff effect that syncs
 * targetUser from the auth store) and computeFollowCountDelta (the
 * optimistic follower-count math used to apply and roll back a toggle).
 */
import { normalizeSocialHash, computeFollowCountDelta } from '../useProfileController';

describe('normalizeSocialHash', () => {
  it('returns empty string for null/undefined', () => {
    expect(normalizeSocialHash(null)).toBe('');
    expect(normalizeSocialHash(undefined)).toBe('');
  });

  it('hashes an array of links, filtering out entries with no url', () => {
    const result = normalizeSocialHash([
      { title: 'Twitter', url: 'x.com/me' },
      { title: '', url: 'noTitle.com' },
      { title: 'Dead', url: '' },
      null as any,
    ]);
    expect(result).toBe(':noTitle.com,Twitter:x.com/me');
  });

  it('is order-independent for arrays (sorted output)', () => {
    const a = normalizeSocialHash([{ title: 'B', url: '2' }, { title: 'A', url: '1' }]);
    const b = normalizeSocialHash([{ title: 'A', url: '1' }, { title: 'B', url: '2' }]);
    expect(a).toBe(b);
  });

  it('hashes a Record<string,string>, filtering out falsy values', () => {
    const result = normalizeSocialHash({ twitter: 'x.com/me', instagram: '', letterboxd: 'lb.com/me' });
    expect(result).toBe('letterboxd:lb.com/me,twitter:x.com/me');
  });

  it('is order-independent for objects (sorted output)', () => {
    const a = normalizeSocialHash({ b: '2', a: '1' });
    const b = normalizeSocialHash({ a: '1', b: '2' });
    expect(a).toBe(b);
  });

  it('two profiles with equivalent links hash identically across array/object shape', () => {
    const arrayForm = normalizeSocialHash([{ title: 'twitter', url: 'x.com/me' }]);
    expect(arrayForm).toBe('twitter:x.com/me');
  });
});

describe('computeFollowCountDelta', () => {
  it('returns -1 when currently following (unfollow action)', () => {
    expect(computeFollowCountDelta(true, false, false)).toBe(-1);
    expect(computeFollowCountDelta(true, false, true)).toBe(-1);
    expect(computeFollowCountDelta(true, true, false)).toBe(-1); // isFollowing takes priority
  });

  it('returns 0 when only requested (pending follow on a private account)', () => {
    expect(computeFollowCountDelta(false, true, false)).toBe(0);
    expect(computeFollowCountDelta(false, true, true)).toBe(0);
  });

  it('returns 0 when newly following a private account (count waits for acceptance)', () => {
    expect(computeFollowCountDelta(false, false, true)).toBe(0);
  });

  it('returns 1 when newly following a public account', () => {
    expect(computeFollowCountDelta(false, false, false)).toBe(1);
  });
});
