/**
 * handleNotice.test.ts — #50, signup silently gives you a different name
 * ─────────────────────────────────────────────────────────────────────
 * You ask for @morpho. The handle is taken. The trigger appends a suffix so an account
 * is ALWAYS created (deliberate, and right). The rename that follows fails silently.
 * You are signed in as @morpho_4f8a21 and nothing ever says so.
 *
 * There are TWO signup paths and the fix has to cover both:
 *   • confirmation disabled — session exists, the real handle is readable at signup
 *   • confirmation required — NO session; the profile already exists (suffix and all)
 *     but stays unreadable until the member confirms and logs in, possibly days later
 *
 * So signup records what was ASKED for, and the comparison happens whenever a real
 * handle resolves. These tests pin both halves, and the "exactly once" property that
 * makes the whole thing safe to run on every auth state change.
 *
 * The case-insensitivity tests matter most in daily use: the trigger lowercases every
 * handle, so asking for `Morpho` and getting `morpho` is the NORMAL path. If that
 * produced a notice, every mixed-case signup would be nagged about nothing — a bug that
 * would look like the feature working.
 */

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

// Deliberately after the mock: babel hoists jest.mock above imports, but `mockStore`
// itself is not hoisted, and the factory runs the moment handleNotice is required.
// Importing first would evaluate the factory while mockStore is still in its TDZ.
// eslint-disable-next-line import/first
import {
  clearRequestedHandle,
  describeHandleOutcome,
  readRequestedHandle,
  rememberRequestedHandle,
  resolveHandleNotice,
} from '../handleNotice';

const KEY = 'reelhouse_pending_handle';
beforeEach(() => mockStore.clear());

describe('describeHandleOutcome — is a notice owed?', () => {
  it('says nothing when you got the handle you asked for', () => {
    expect(describeHandleOutcome('morpho', 'morpho')).toBeNull();
  });

  it('says nothing when only the CASE differs — the trigger always lowercases', () => {
    expect(describeHandleOutcome('Morpho', 'morpho')).toBeNull();
    expect(describeHandleOutcome('MORPHO', 'morpho')).toBeNull();
    expect(describeHandleOutcome('MoRpHo', 'morpho')).toBeNull();
  });

  it('ignores stray whitespace on either side', () => {
    expect(describeHandleOutcome('  morpho  ', 'morpho')).toBeNull();
    expect(describeHandleOutcome('morpho', ' morpho ')).toBeNull();
  });

  it('speaks up when the suffix was appended — the actual live failure', () => {
    const msg = describeHandleOutcome('morpho', 'morpho_4f8a21');
    expect(msg).toContain('@morpho');
    expect(msg).toContain('@morpho_4f8a21');
  });

  it('names BOTH handles, so the member knows what they lost and what they got', () => {
    const msg = describeHandleOutcome('kane', 'kane_9b2c') as string;
    expect(msg.indexOf('@kane')).toBeLessThan(msg.indexOf('@kane_9b2c'));
  });

  it('points at where the fix lives instead of leaving them stuck', () => {
    expect(describeHandleOutcome('kane', 'kane_9b2c')).toContain('Edit Profile');
  });

  it('covers a fully different handle, not just the suffix shape', () => {
    // Reserved words, moderation renames, any future path that renames on the way in.
    expect(describeHandleOutcome('admin', 'guest_71f0')).not.toBeNull();
  });

  it('stays silent when either side is missing — never invent a notice', () => {
    expect(describeHandleOutcome(null, 'morpho')).toBeNull();
    expect(describeHandleOutcome('morpho', null)).toBeNull();
    expect(describeHandleOutcome(undefined, undefined)).toBeNull();
    expect(describeHandleOutcome('', 'morpho')).toBeNull();
    expect(describeHandleOutcome('morpho', '')).toBeNull();
    expect(describeHandleOutcome('   ', 'morpho')).toBeNull();
  });
});

describe('the request — written at signup, read whenever identity resolves', () => {
  it('survives a write and reads back intact', () => {
    rememberRequestedHandle('u1', 'morpho');
    expect(readRequestedHandle()).toMatchObject({ id: 'u1', requested: 'morpho' });
  });

  it('reading does NOT consume it — the handle may not have resolved yet', () => {
    rememberRequestedHandle('u1', 'morpho');
    expect(readRequestedHandle()).not.toBeNull();
    expect(readRequestedHandle()).not.toBeNull();
  });

  it('refuses to record a request with no id or no handle', () => {
    rememberRequestedHandle(null, 'morpho');
    expect(readRequestedHandle()).toBeNull();
    rememberRequestedHandle('u1', null);
    expect(readRequestedHandle()).toBeNull();
    rememberRequestedHandle('', '');
    expect(readRequestedHandle()).toBeNull();
  });

  it('expires after 30 days and clears itself — a request is not litter', () => {
    mockStore.set(KEY, JSON.stringify({ id: 'u1', requested: 'morpho', at: Date.now() - 31 * 24 * 3600 * 1000 }));
    expect(readRequestedHandle()).toBeNull();
    expect(mockStore.has(KEY)).toBe(false);
  });

  it('a 29-day-old request is still honoured — confirming late is not a crime', () => {
    mockStore.set(KEY, JSON.stringify({ id: 'u1', requested: 'morpho', at: Date.now() - 29 * 24 * 3600 * 1000 }));
    expect(readRequestedHandle()).not.toBeNull();
  });

  it('discards junk rather than throwing into a boot path', () => {
    mockStore.set(KEY, 'not json at all');
    expect(readRequestedHandle()).toBeNull();
    mockStore.set(KEY, JSON.stringify({ nonsense: true }));
    expect(readRequestedHandle()).toBeNull();
    mockStore.set(KEY, JSON.stringify({ id: 'u1', requested: 'x' })); // no timestamp
    expect(readRequestedHandle()).toBeNull();
  });

  it('a second signup replaces the first — never queues stale news', () => {
    rememberRequestedHandle('u1', 'first');
    rememberRequestedHandle('u2', 'second');
    expect(readRequestedHandle()).toMatchObject({ id: 'u2', requested: 'second' });
  });

  it('never throws if storage is unavailable — a courtesy must not break signup', () => {
    const mmkv = jest.requireMock('@/src/stores/mmkv-storage').storage as Record<string, unknown>;
    const real = { ...mmkv };
    mmkv.set = () => { throw new Error('mmkv unavailable'); };
    mmkv.getString = () => { throw new Error('mmkv unavailable'); };
    mmkv.delete = () => { throw new Error('mmkv unavailable'); };
    try {
      expect(() => rememberRequestedHandle('u1', 'morpho')).not.toThrow();
      expect(readRequestedHandle()).toBeNull();
      expect(() => clearRequestedHandle()).not.toThrow();
      expect(resolveHandleNotice({ id: 'u1', username: 'morpho_1' })).toBeNull();
    } finally {
      Object.assign(mmkv, real);
    }
  });
});

describe('resolveHandleNotice — the single reader', () => {
  it('the live failure: suffixed handle produces one notice', () => {
    rememberRequestedHandle('u1', 'morpho');
    const notice = resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' });
    expect(notice).toContain('@morpho_4f8a21');
  });

  it('fires EXACTLY once — this runs on every auth state change', () => {
    rememberRequestedHandle('u1', 'morpho');
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).not.toBeNull();
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).toBeNull();
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).toBeNull();
  });

  it('the ordinary signup consumes the request and says nothing', () => {
    rememberRequestedHandle('u1', 'Morpho');
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho' })).toBeNull();
    expect(readRequestedHandle()).toBeNull(); // consumed, not left to rot
  });

  it('WAITS when the username has not loaded yet — login sets the user before the profile', () => {
    // This is the email-confirmation path's first moment. Consuming here would burn the
    // only chance to say anything, so the request must survive an unresolved handle.
    rememberRequestedHandle('u1', 'morpho');
    expect(resolveHandleNotice({ id: 'u1', username: null })).toBeNull();
    expect(resolveHandleNotice({ id: 'u1', username: '' })).toBeNull();
    expect(resolveHandleNotice({ id: 'u1' })).toBeNull();
    expect(readRequestedHandle()).not.toBeNull(); // still waiting
    // …and when the enrich finally lands, it speaks
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).not.toBeNull();
  });

  it('NEVER nags a different member who signs in on the same phone', () => {
    rememberRequestedHandle('u1', 'morpho');
    expect(resolveHandleNotice({ id: 'someone-else', username: 'kane_9b2c' })).toBeNull();
    expect(readRequestedHandle()).not.toBeNull(); // and u1's request is untouched
  });

  it('does nothing when there is no request at all', () => {
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho' })).toBeNull();
  });

  it('tolerates a null user (logged out, or a store mid-reset)', () => {
    rememberRequestedHandle('u1', 'morpho');
    expect(resolveHandleNotice(null)).toBeNull();
    expect(resolveHandleNotice(undefined)).toBeNull();
    expect(readRequestedHandle()).not.toBeNull();
  });
});

describe('end to end — both signup paths', () => {
  it('PATH A, confirmation disabled: signup -> user set -> one notice', () => {
    rememberRequestedHandle('u1', 'morpho');           // in signup(), before set({user})
    const shown = resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' });
    expect(shown).toContain('@morpho');
    expect(shown).toContain('@morpho_4f8a21');
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).toBeNull();
  });

  it('PATH B, confirmation required: signup -> (days) -> login -> enrich -> one notice', () => {
    rememberRequestedHandle('u1', 'morpho');           // no session; nothing readable yet

    // days later: cold start, login sets the user before the profile enrich lands
    expect(resolveHandleNotice({ id: 'u1', username: undefined })).toBeNull();
    expect(readRequestedHandle()).not.toBeNull();

    // enrich lands with the handle the trigger actually gave them
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).toContain('@morpho_4f8a21');

    // every later app open is silent
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho_4f8a21' })).toBeNull();
  });

  it('PATH B, happy: the handle they asked for is the handle they got', () => {
    rememberRequestedHandle('u1', 'Morpho');
    expect(resolveHandleNotice({ id: 'u1', username: 'morpho' })).toBeNull();
    expect(readRequestedHandle()).toBeNull();
  });
});
