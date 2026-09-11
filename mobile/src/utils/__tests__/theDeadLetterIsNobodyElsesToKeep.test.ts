/**
 * theDeadLetterIsNobodyElsesToKeep.test.ts — one member's words on another's phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * `clearOfflineQueue()` runs at logout and emptied the main queue only.
 *
 * `QUEUE_KEY + '_dead_letter'` is written in FOUR places — an orphaned flush, a
 * ban, a schema error, a failed sync — and was cleared in none of them. It holds
 * failed mutations WITH their payloads: the body of a critique, the text of a
 * lounge message, a log's review. So one member's writing stayed on the device
 * after they signed out, and the next person to sign in was carrying it.
 *
 * Its only pruning is a 7-day age filter that runs when something NEW is
 * dead-lettered. With no further failures it sat there indefinitely.
 *
 * ── ERASED BY PREFIX, NOT BY A LIST ─────────────────────────────────────────
 * memberDrafts.clearAllDrafts already says why: four draft keys went unerased
 * for as long as they existed precisely because erasing them was a list
 * somebody had to remember. The test below adds an UNKNOWN key under the queue's
 * prefix and requires it to go too — which a hand-written list could not pass.
 */
import { clearOfflineQueue, enqueueMutation } from '../offlineQueue';
import { storage } from '@/src/stores/mmkv-storage';

const QUEUE_KEY = 'reelhouse-offline-mutations';
const DEAD = `${QUEUE_KEY}_dead_letter`;

beforeEach(() => {
  for (const k of storage.getAllKeys()) storage.delete(k);
});

describe('logout leaves no queue behind', () => {
  it('clears the DEAD-LETTER queue, not only the live one', () => {
    // A failed critique, exactly as the flush would have parked it.
    storage.set(DEAD, JSON.stringify([{
      id: 'm1', type: 'add_critique', timestamp: Date.now(),
      payload: { body: 'Eight hundred words about Tokyo Story.', _failReason: 'schema' },
    }]));
    enqueueMutation({ type: 'add_critique', payload: { body: 'Another.' } } as never);

    expect(storage.getString(DEAD)).toBeTruthy();

    clearOfflineQueue();

    expect(storage.getString(DEAD)).toBeUndefined();
  });

  it('takes a queue key it has never heard of — the sweep is not a list', () => {
    // The whole point. A fifth key added later must go without anyone
    // remembering to add it here.
    const invented = `${QUEUE_KEY}_some_future_shelf`;
    storage.set(invented, JSON.stringify([{ payload: { body: 'private words' } }]));

    clearOfflineQueue();

    expect(storage.getString(invented)).toBeUndefined();
  });

  it('leaves keys belonging to OTHER systems alone', () => {
    // A sweep that is too wide is its own bug: the drafts, the caches and the
    // member id are erased by their own owners, on their own terms.
    storage.set('reelhouse_dispatch_draft_u1_dossier', 'an unfinished essay');
    storage.set('last_user_id', 'u1');

    clearOfflineQueue();

    expect(storage.getString('reelhouse_dispatch_draft_u1_dossier')).toBe('an unfinished essay');
    expect(storage.getString('last_user_id')).toBe('u1');
  });

  it('still empties the live queue and zeroes the pending count', () => {
    enqueueMutation({ type: 'add_critique', payload: { body: 'x' } } as never);
    expect(JSON.parse(storage.getString(QUEUE_KEY) ?? '[]')).toHaveLength(1);

    clearOfflineQueue();

    expect(JSON.parse(storage.getString(QUEUE_KEY) ?? '[]')).toHaveLength(0);
  });
});
