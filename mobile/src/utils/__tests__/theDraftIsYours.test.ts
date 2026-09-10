/**
 * theDraftIsYours.test.ts — one member's unpublished essay was readable by the
 * next person to sign in on that phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * The writing room saved to `reelhouse_dispatch_draft`. One key, no member in
 * it. Logout cleared six named keys — the user cache, `last_user_id`, the query
 * cache, the feed cache, `recovery_pending` — and never that one.
 *
 * So a member wrote four thousand words, did not file them, and logged out. The
 * next person to sign in opened the writing room and found the essay sitting
 * there. Not merely readable: the FILE button was live, under their name.
 *
 * The app's own initiation flag has been keyed by user id since the day it was
 * written, and its comment says why — "two accounts on one phone each get their
 * own". The draft never was.
 *
 * ── AND THE DRAFTS THAT ALREADY EXIST ───────────────────────────────────────
 * Splitting the key orphans every essay in progress on a real phone. Both
 * obvious answers are wrong: hand the orphan to whoever signs in first, which
 * is the leak performed by the fix; or delete it, and throw away an evening.
 *
 * `last_user_id` is written on every sign-in and deleted on logout. If it is
 * still there and matches the member arriving, nobody has signed out since that
 * draft was written and it is theirs. Anything else is unattributable, and an
 * unattributable private essay is not something to gamble.
 */
import {
  adoptLegacyDraft, clearAllDrafts, clearDraft, draftKey, readDraft, writeDraft,
  DRAFT_VERSION, __LEGACY_KEY,
} from '@/src/utils/dispatchDrafts';

/** `mock`-prefixed, because jest hoists the factory above every import and
 *  refuses any other out-of-scope name inside it. */
const mockStore = new Map<string, string>();
let mockThrowOnWrite = false;
let mockThrowOnDelete = false;

jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => {
      if (mockThrowOnWrite) throw new Error('no space left on device');
      mockStore.set(k, v);
    },
    delete: (k: string) => {
      if (mockThrowOnDelete) throw new Error('no space left on device');
      mockStore.delete(k);
    },
  },
}));

const ANA = 'ana-uuid';
const DAN = 'dan-uuid';

beforeEach(() => {
  mockStore.clear();
  mockThrowOnWrite = false;
  mockThrowOnDelete = false;
});

describe('a draft belongs to the member who wrote it', () => {
  it('is written under a key carrying their id, not a shared one', () => {
    writeDraft(ANA, { title: 'The Empty Room', content: 'An opening line.' });
    expect(mockStore.has(draftKey(ANA))).toBe(true);
    // The old shared key must never be written again.
    expect(mockStore.has(__LEGACY_KEY)).toBe(false);
  });

  it('THE LEAK: another member on the same phone cannot see it', () => {
    writeDraft(ANA, { title: 'The Empty Room', content: 'Four thousand words.' });
    expect(readDraft(DAN)).toBeNull();
    // And the reverse, so this is not passing on an empty mockStore.
    expect(readDraft(ANA)?.content).toBe('Four thousand words.');
  });

  it('THE LEAK: logging out takes it with you', () => {
    writeDraft(ANA, { title: 'The Empty Room', content: 'Four thousand words.' });
    clearAllDrafts(ANA);
    expect(readDraft(ANA)).toBeNull();
    expect([...mockStore.keys()].some((k) => k.startsWith('reelhouse_dispatch_draft'))).toBe(false);
  });

  it('stamps a version and a time, so a draft can say when rather than imply now', () => {
    writeDraft(ANA, { title: 'x', content: 'y' });
    const raw = JSON.parse(mockStore.get(draftKey(ANA))!);
    expect(raw.v).toBe(DRAFT_VERSION);
    expect(Number.isNaN(Date.parse(raw.savedAt))).toBe(false);
  });

  it('reads a draft written by an older build, which has no version at all', () => {
    mockStore.set(draftKey(ANA), JSON.stringify({ title: 'Older', content: 'Still theirs.' }));
    const d = readDraft(ANA);
    expect(d?.title).toBe('Older');
    expect(d?.content).toBe('Still theirs.');
  });
});

describe('the drafts written before the keys were split', () => {
  const legacy = () => JSON.stringify({ title: 'Half Written', content: 'The opening line.' });

  it('is adopted when nobody has signed out since it was written', () => {
    mockStore.set(__LEGACY_KEY, legacy());
    mockStore.set('last_user_id', ANA);

    adoptLegacyDraft(ANA);

    expect(readDraft(ANA)?.title).toBe('Half Written');
    // The decision is made once per device: the old key is gone either way.
    expect(mockStore.has(__LEGACY_KEY)).toBe(false);
  });

  it('is DELETED UNREAD when it cannot be proved whose it is', () => {
    // `last_user_id` is deleted on logout, so its absence means somebody left.
    mockStore.set(__LEGACY_KEY, legacy());

    adoptLegacyDraft(DAN);

    expect(readDraft(DAN)).toBeNull();
    expect(mockStore.has(__LEGACY_KEY)).toBe(false);
  });

  it('is DELETED UNREAD when it belongs to somebody else', () => {
    mockStore.set(__LEGACY_KEY, legacy());
    mockStore.set('last_user_id', ANA);

    adoptLegacyDraft(DAN);

    expect(readDraft(DAN)).toBeNull();
    expect(mockStore.has(__LEGACY_KEY)).toBe(false);
  });

  it('never overwrites work the member already has', () => {
    mockStore.set('last_user_id', ANA);
    writeDraft(ANA, { title: 'Newer', content: 'Written since.' });
    mockStore.set(__LEGACY_KEY, legacy());

    adoptLegacyDraft(ANA);

    expect(readDraft(ANA)?.title).toBe('Newer');
    expect(mockStore.has(__LEGACY_KEY)).toBe(false);
  });

  it('keeps the old key when the adoption itself fails, so it can be tried again', () => {
    mockStore.set(__LEGACY_KEY, legacy());
    mockStore.set('last_user_id', ANA);
    mockThrowOnWrite = true;

    adoptLegacyDraft(ANA);

    // Nothing was thrown away on a failed write — the essay is still there to
    // adopt on the next launch.
    expect(mockStore.has(__LEGACY_KEY)).toBe(true);
  });
});

describe('a draft that cannot be written says so', () => {
  it('reports the failure rather than throwing inside a timer', () => {
    mockThrowOnWrite = true;
    // The saves run inside a debounce, where an exception is unhandled and
    // silent — and a save indicator that cannot report a failure is a promise
    // nothing checks.
    expect(writeDraft(ANA, { title: 'x', content: 'y' })).toBe(false);
  });

  it('reports success when it lands', () => {
    expect(writeDraft(ANA, { title: 'x', content: 'y' })).toBe(true);
  });

  it('survives a delete that throws', () => {
    writeDraft(ANA, { title: 'x', content: 'y' });
    mockThrowOnDelete = true;
    // If this threw, it would throw from the success path of FILING an essay —
    // after the row is already written.
    expect(() => clearDraft(ANA)).not.toThrow();
  });
});

describe('a draft that cannot be read', () => {
  it('is cleared rather than left to fail on every open', () => {
    mockStore.set(draftKey(ANA), 'not json at all');
    expect(readDraft(ANA)).toBeNull();
    // Gone, so the next open is not the same failure again.
    expect(mockStore.has(draftKey(ANA))).toBe(false);
  });

  it('and an entry with neither field is not a draft', () => {
    mockStore.set(draftKey(ANA), JSON.stringify({ savedAt: '2026-09-10T00:00:00Z' }));
    expect(readDraft(ANA)).toBeNull();
  });
});

describe('nobody signed in has no draft', () => {
  it('reads, writes and clears nothing without a member', () => {
    expect(readDraft(null)).toBeNull();
    expect(writeDraft(undefined, { title: 'x', content: 'y' })).toBe(false);
    expect(() => clearDraft(null)).not.toThrow();
    expect(mockStore.size).toBe(0);
  });
});
