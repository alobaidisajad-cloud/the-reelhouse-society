/**
 * nothingIsLostQuietly.test.tsx — the three composers that had no protection,
 * and the two sentences that were the same when they should not be.
 * ─────────────────────────────────────────────────────────────────────────────
 * The essay was kept. Nothing else was:
 *
 *   AN AMEND  every draft effect in the writing room began `if (edit) return`,
 *             so rewriting a filed essay had no protection at all.
 *   A CRITIQUE  eight hundred words under somebody's dossier, gone to a phone
 *             call.
 *   A BALLOT   two to six film searches and a question, the same.
 *
 * And when a filing was refused, everybody got `Transmission failed` — while
 * the essay's words were on the phone and the take's were only in the field.
 * One sentence for both is a promise kept for one of them.
 */
import {
  clearDraft, draftKey, readDraft, writeDraft, evictOldest, SCOPED_KEPT,
} from '@/src/utils/memberDrafts';

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    getAllKeys: () => [...mockStore.keys()],
    set: (k: string, v: string) => { mockStore.set(k, v); },
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

const ANA = 'ana-uuid';
beforeEach(() => mockStore.clear());

describe('an amend is kept, and kept APART', () => {
  it('never shares a slot with the unfinished new essay', () => {
    // The room's own test — "never touches the NEW-dossier draft" — exists
    // because an amend overwriting an unfiled essay is the worst thing this
    // screen can do. Scoping the amend to its filing is what makes that
    // impossible rather than merely avoided.
    writeDraft(ANA, 'dossier', { title: 'Unfinished', content: 'Elsewhere.' });
    writeDraft(ANA, 'edit', { title: 'A rewrite', content: 'Second version.' }, 'filing-1');

    expect(readDraft<{ title: string }>(ANA, 'dossier')?.data.title).toBe('Unfinished');
    expect(readDraft<{ title: string }>(ANA, 'edit', 'filing-1')?.data.title).toBe('A rewrite');
  });

  it('keeps one per filing, so going back to the first finds it', () => {
    writeDraft(ANA, 'edit', { content: 'rewrite of A' }, 'A');
    writeDraft(ANA, 'edit', { content: 'rewrite of B' }, 'B');
    expect(readDraft<{ content: string }>(ANA, 'edit', 'A')?.data.content).toBe('rewrite of A');
  });

  it('is bounded — the oldest goes once there are more than it keeps', () => {
    const at = (n: number) => new Date(2026, 0, n).toISOString();
    for (let i = 1; i <= SCOPED_KEPT + 1; i++) {
      mockStore.set(draftKey(ANA, 'edit', `f${i}`), JSON.stringify({
        v: 2, savedAt: at(i), data: { content: `v${i}` },
      }));
    }
    evictOldest(ANA, 'edit');
    expect(readDraft(ANA, 'edit', 'f1')).toBeNull();
    expect([...mockStore.keys()]).toHaveLength(SCOPED_KEPT);
  });

  it('goes when the amend lands, and takes nothing else with it', () => {
    writeDraft(ANA, 'dossier', { title: 'Unfinished' });
    writeDraft(ANA, 'edit', { content: 'rewrite' }, 'filing-1');

    clearDraft(ANA, 'edit', 'filing-1');

    expect(readDraft(ANA, 'edit', 'filing-1')).toBeNull();
    expect(readDraft(ANA, 'dossier')).not.toBeNull();
  });
});

describe('a critique is kept per filing', () => {
  it('does not bleed from one essay into another', () => {
    // A member reading two dossiers, half a critique under each.
    writeDraft(ANA, 'critique', { body: 'On Ozu.' }, 'post-1');
    writeDraft(ANA, 'critique', { body: 'On Tarkovsky.' }, 'post-2');

    expect(readDraft<{ body: string }>(ANA, 'critique', 'post-1')?.data.body).toBe('On Ozu.');
    expect(readDraft<{ body: string }>(ANA, 'critique', 'post-2')?.data.body).toBe('On Tarkovsky.');
    // And a filing with nothing written under it has nothing to restore.
    expect(readDraft(ANA, 'critique', 'post-3')).toBeNull();
  });
});

describe('a ballot is kept, and its deadline cannot go stale', () => {
  it('holds the question, the films and the RELATIVE deadline', () => {
    writeDraft(ANA, 'ballot', {
      question: 'Which Tarkovsky should the house watch?',
      slots: [{ film: { title: 'Stalker' }, id: 1 }, null],
      closes: '2 DAYS',
    });
    const held = readDraft<{ closes: string; slots: unknown[] }>(ANA, 'ballot');

    /**
     * `2 DAYS`, not a timestamp — and that is the whole reason this is safe to
     * restore. The absolute time is worked out at FILING, so a draft opened on
     * Thursday closes two days from Thursday. Had the desk stored `closes_at`,
     * restoring a two-day-old draft would have opened a ballot that had already
     * closed, and `frozen_totals` would have been written over a vote nobody
     * could cast.
     */
    expect(held?.data.closes).toBe('2 DAYS');
    expect(held?.data.slots).toHaveLength(2);
  });
});

describe('the two sentences a refusal gets', () => {
  const read = (p: string) => require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', '..', '..', p), 'utf8',
  );

  it('the essay says its words are KEPT, because they are on the phone', () => {
    const room = read('app/dispatch/compose.tsx');
    expect(room).toContain('It did not go. Your words are kept.');
    // And it stops promising that when the phone refused the draft too.
    expect(room).toContain('your phone is out of space');
  });

  it('the take says they are STILL HERE, because that desk keeps no draft', () => {
    // "Kept" would be a promise this form does not make, and the member would
    // find out by closing the desk.
    const desks = read('src/components/dispatch/ComposeDesks.tsx');
    expect(desks).toContain('It did not go. Your words are still here.');
    expect(desks).not.toContain('Your words are kept');
  });

  it('and neither of them says "Transmission failed" any more', () => {
    // It named the wire and told the member nothing about their work.
    const room = read('app/dispatch/compose.tsx');
    const strings = room.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(strings).not.toContain("reelToast.error('Transmission failed')");
  });
});
