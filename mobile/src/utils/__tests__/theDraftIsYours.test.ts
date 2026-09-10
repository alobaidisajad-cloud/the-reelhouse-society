/**
 * theDraftIsYours.test.ts — everything a member left unfinished was readable by
 * the next person to sign in on that phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR keys, none of them carrying a member, none of them cleared by logout:
 *
 *   reelhouse_dispatch_draft   an unpublished essay
 *   reelhouse_log_draft        a review, a rating, and PRIVATE NOTES
 *   reelhouse_handle_history   every username they have had
 *   reelhouse_pending_handle   a username they asked for
 *
 * `private_notes` is the sharpest of them. It is owner-only at the row level,
 * there is a trigger that diverts it, and a guard names it as a column anon must
 * never read. On the phone it was public to whoever held the phone: sign out,
 * hand it over, open the log modal, and there they are with SAVE live.
 *
 * ── THE FAULT WAS NEVER ONE KEY ─────────────────────────────────────────────
 * It was that erasing them was a LIST somebody had to remember to add to, and
 * four keys in a row were forgotten. So the test that matters most here is not
 * any single key: it is that logout SWEEPS a prefix, and a draft kind invented
 * next year is carried out with the rest without anybody remembering anything.
 */
import {
  adoptLegacyDrafts, clearAllDrafts, clearDraft, draftKey, evictOldest,
  readDraft, writeDraft, DRAFT_PREFIX, SCOPED_KEPT, __LEGACY_KEYS,
} from '@/src/utils/memberDrafts';

/** `mock`-prefixed: jest hoists the factory above every import. */
const mockStore = new Map<string, string>();
let mockThrowOnWrite = false;
let mockThrowOnDelete = false;

jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    getAllKeys: () => [...mockStore.keys()],
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

describe('unfinished work belongs to the member who wrote it', () => {
  it('every kind is written under a key carrying their id', () => {
    writeDraft(ANA, 'dossier', { title: 'The Empty Room', content: 'An opening.' });
    writeDraft(ANA, 'log', { review: 'A first watch.', rating: 4, privateNotes: 'I cried.' });

    for (const key of mockStore.keys()) {
      expect(`${key} carries the member: ${key.includes(ANA)}`).toMatch(/true$/);
    }
  });

  it('THE LEAK: another member on the same phone sees none of it', () => {
    writeDraft(ANA, 'dossier', { title: 'The Empty Room', content: 'Four thousand words.' });
    writeDraft(ANA, 'log', { review: 'x', rating: 4, privateNotes: 'Nobody else’s business.' });

    expect(readDraft(DAN, 'dossier')).toBeNull();
    expect(readDraft(DAN, 'log')).toBeNull();

    // And the reverse, so this is not passing against an empty store.
    expect(readDraft<{ privateNotes: string }>(ANA, 'log')?.data.privateNotes)
      .toBe('Nobody else’s business.');
  });

  it('THE LEAK: logging out takes ALL of it, by sweep and not by a list', () => {
    writeDraft(ANA, 'dossier', { title: 'a', content: 'b' });
    writeDraft(ANA, 'log', { review: 'c', privateNotes: 'd' });
    writeDraft(ANA, 'edit', { body: 'e' }, 'filing-1');
    writeDraft(ANA, 'critique', { body: 'f' }, 'post-1');
    // A kind that does not exist yet, written by hand — the whole point of a
    // prefix sweep is that it goes too.
    mockStore.set(`${DRAFT_PREFIX}${ANA}_somethingNobodyHasInventedYet`, '{}');
    // And another member's work, which must survive.
    writeDraft(DAN, 'dossier', { title: 'theirs', content: 'theirs' });

    clearAllDrafts(ANA);

    expect([...mockStore.keys()].filter((k) => k.includes(ANA))).toEqual([]);
    expect(readDraft(DAN, 'dossier')).not.toBeNull();
  });

  it('reads back what was written, with the time it was written', () => {
    writeDraft(ANA, 'dossier', { title: 'x', content: 'y' });
    const held = readDraft<{ title: string }>(ANA, 'dossier');
    expect(held?.data.title).toBe('x');
    expect(Number.isNaN(Date.parse(held!.savedAt!))).toBe(false);
  });

  it('reads a bare payload written before there were envelopes', () => {
    mockStore.set(draftKey(ANA, 'dossier'), JSON.stringify({ title: 'Older', content: 'Still theirs.' }));
    expect(readDraft<{ title: string }>(ANA, 'dossier')?.data.title).toBe('Older');
  });
});

describe('the four keys written before any of this', () => {
  it('names the two that are drafts, and only those', () => {
    expect([...__LEGACY_KEYS].sort()).toEqual([
      'reelhouse_dispatch_draft',
      'reelhouse_log_draft',
    ]);
  });

  it('adopts work when nobody has signed out since it was written', () => {
    mockStore.set('reelhouse_dispatch_draft', JSON.stringify({ title: 'Half Written', content: 'The opening.' }));
    mockStore.set('reelhouse_log_draft', JSON.stringify({ review: 'Half a review.', privateNotes: 'Mine.' }));
    mockStore.set('last_user_id', ANA);

    adoptLegacyDrafts(ANA);

    expect(readDraft<{ title: string }>(ANA, 'dossier')?.data.title).toBe('Half Written');
    expect(readDraft<{ privateNotes: string }>(ANA, 'log')?.data.privateNotes).toBe('Mine.');
    // The decision is made once per device: the old keys are gone either way.
    for (const k of __LEGACY_KEYS) expect(mockStore.has(k)).toBe(false);
  });

  it('DELETES UNREAD when it cannot be proved whose it is', () => {
    // `last_user_id` is deleted on logout, so its absence means somebody left.
    mockStore.set('reelhouse_dispatch_draft', JSON.stringify({ title: 'Half Written', content: 'x' }));
    mockStore.set('reelhouse_log_draft', JSON.stringify({ privateNotes: 'Not yours.' }));

    adoptLegacyDrafts(DAN);

    expect(readDraft(DAN, 'dossier')).toBeNull();
    expect(readDraft(DAN, 'log')).toBeNull();
    for (const k of __LEGACY_KEYS) expect(mockStore.has(k)).toBe(false);
  });

  it('DELETES UNREAD when it belongs to somebody else', () => {
    mockStore.set('reelhouse_log_draft', JSON.stringify({ privateNotes: 'Ana’s.' }));
    mockStore.set('last_user_id', ANA);

    adoptLegacyDrafts(DAN);

    expect(readDraft(DAN, 'log')).toBeNull();
    expect(mockStore.has('reelhouse_log_draft')).toBe(false);
  });

  it('LEAVES the handle keys alone — they are not drafts and deleting them breaks a feature', () => {
    /**
     * `reelhouse_handle_history` and `reelhouse_pending_handle` also carried no
     * member in the key and also survived logout, and the obvious move is to
     * sweep them up with everything else. It would have deleted a member's own
     * handle history the first time they opened the writing room — and that
     * history is what redirects a stale link to their old name onto their
     * profile.
     *
     * They are different: both hold the member id INSIDE the payload and every
     * read checks it, so a second member cannot read them. What was wrong was
     * that they outlived their member, and that is a LOGOUT job — both modules
     * have exported the eraser all along and nothing called either.
     */
    mockStore.set('reelhouse_handle_history', JSON.stringify({ id: ANA, handles: ['oldname'] }));
    mockStore.set('reelhouse_pending_handle', JSON.stringify({ id: ANA, requested: 'newname' }));
    mockStore.set('last_user_id', ANA);

    adoptLegacyDrafts(ANA);

    expect(mockStore.has('reelhouse_handle_history')).toBe(true);
    expect(mockStore.has('reelhouse_pending_handle')).toBe(true);
  });

  it('never overwrites work the member already has', () => {
    mockStore.set('last_user_id', ANA);
    writeDraft(ANA, 'dossier', { title: 'Newer', content: 'Written since.' });
    mockStore.set('reelhouse_dispatch_draft', JSON.stringify({ title: 'Older', content: 'x' }));

    adoptLegacyDrafts(ANA);

    expect(readDraft<{ title: string }>(ANA, 'dossier')?.data.title).toBe('Newer');
  });

  it('keeps the old key when the adoption itself fails, so it can be tried again', () => {
    mockStore.set('reelhouse_dispatch_draft', JSON.stringify({ title: 'x', content: 'y' }));
    mockStore.set('last_user_id', ANA);
    mockThrowOnWrite = true;

    adoptLegacyDrafts(ANA);

    // A full disk must not be how somebody loses an essay.
    expect(mockStore.has('reelhouse_dispatch_draft')).toBe(true);
  });
});

describe('scoped drafts are bounded by eviction, not by one slot', () => {
  it('keeps several, so returning to the first one finds it', () => {
    // One slot per kind looks tidy and silently eats the rewrite of essay A the
    // moment you open essay B — which is the fault all of this exists to fix.
    writeDraft(ANA, 'edit', { body: 'A' }, 'filing-A');
    writeDraft(ANA, 'edit', { body: 'B' }, 'filing-B');

    expect(readDraft<{ body: string }>(ANA, 'edit', 'filing-A')?.data.body).toBe('A');
    expect(readDraft<{ body: string }>(ANA, 'edit', 'filing-B')?.data.body).toBe('B');
  });

  it('evicts the OLDEST once there are more than it keeps', () => {
    const at = (n: number) => new Date(2026, 0, n).toISOString();
    for (let i = 1; i <= SCOPED_KEPT + 2; i++) {
      mockStore.set(draftKey(ANA, 'edit', `f${i}`), JSON.stringify({
        v: 2, savedAt: at(i), data: { body: `body ${i}` },
      }));
    }
    evictOldest(ANA, 'edit');

    const left = [...mockStore.keys()].filter((k) => k.includes('_edit_'));
    expect(left).toHaveLength(SCOPED_KEPT);
    // The oldest two went; the newest survived.
    expect(readDraft(ANA, 'edit', 'f1')).toBeNull();
    expect(readDraft(ANA, 'edit', `f${SCOPED_KEPT + 2}`)).not.toBeNull();
  });

  it('evicts one member’s and never another’s', () => {
    const at = (n: number) => new Date(2026, 0, n).toISOString();
    for (let i = 1; i <= SCOPED_KEPT + 1; i++) {
      mockStore.set(draftKey(ANA, 'edit', `f${i}`), JSON.stringify({ v: 2, savedAt: at(i), data: {} }));
    }
    mockStore.set(draftKey(DAN, 'edit', 'f1'), JSON.stringify({ v: 2, savedAt: at(1), data: {} }));

    evictOldest(ANA, 'edit');

    expect(readDraft(DAN, 'edit', 'f1')).not.toBeNull();
  });
});

describe('a draft that cannot be written, read or cleared', () => {
  it('reports a failed write rather than throwing inside a timer', () => {
    mockThrowOnWrite = true;
    expect(writeDraft(ANA, 'dossier', { title: 'x', content: 'y' })).toBe(false);
  });

  it('reports success when it lands', () => {
    expect(writeDraft(ANA, 'dossier', { title: 'x', content: 'y' })).toBe(true);
  });

  it('survives a delete that throws', () => {
    writeDraft(ANA, 'dossier', { title: 'x', content: 'y' });
    mockThrowOnDelete = true;
    // This runs on the SUCCESS path of filing, after the row is already written.
    expect(() => clearDraft(ANA, 'dossier')).not.toThrow();
    expect(() => clearAllDrafts(ANA)).not.toThrow();
  });

  it('clears an unreadable draft rather than failing on every open', () => {
    mockStore.set(draftKey(ANA, 'dossier'), 'not json at all');
    expect(readDraft(ANA, 'dossier')).toBeNull();
    expect(mockStore.has(draftKey(ANA, 'dossier'))).toBe(false);
  });
});

describe('nobody signed in has nothing', () => {
  it('reads, writes, clears and sweeps nothing without a member', () => {
    expect(readDraft(null, 'dossier')).toBeNull();
    expect(writeDraft(undefined, 'dossier', { title: 'x' })).toBe(false);
    expect(() => clearDraft(null, 'dossier')).not.toThrow();
    expect(() => clearAllDrafts(undefined)).not.toThrow();
    expect(mockStore.size).toBe(0);
  });
});
