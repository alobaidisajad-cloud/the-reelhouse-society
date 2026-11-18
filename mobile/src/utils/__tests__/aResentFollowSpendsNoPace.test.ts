/**
 * A resent follow spends no pace (review round 13, the queue's follows).
 *
 * A follow that landed but whose answer was lost is queued and sent again. Sent as an insert of a
 * row already there, it made nothing, yet the house's pace counted it (its trigger runs before the
 * conflict is judged): two such resends and one real unfollow and follow held the member's next
 * follow of that member for up to an hour. The queue now reads the follow first, as the online
 * follow does, and sends nothing when the house already holds it.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { executeMutation, type MutationResult } from '../mutationExecutor';
import type { QueuedMutation } from '../offlineQueue';

const ME = '11111111-1111-4111-8111-111111111111';
const ADA = '22222222-2222-4222-8222-000000000001';

/** Whether the house holds the follow already, and every write asked of it. */
let mockHeld = false;
const mockWrites: Ask[] = [];
const mockHouse = supabaseFake({
  answer: {
    interactions: (ask) => {
      if (ask.op !== 'select') { mockWrites.push(ask); return []; }
      return mockHeld ? [{ id: '99999999-9999-4999-8999-999999999999', user_id: ME, target_user_id: ADA, type: 'follow' }] : [];
    },
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const queued = (type: 'follow_user' | 'follow_request_user'): QueuedMutation => ({
  id: 'q', type, timestamp: 1, owner: ME, payload: { user_id: ME, target_username: 'ada', target_user_id: ADA },
});

beforeEach(() => { mockHeld = false; mockWrites.length = 0; });

for (const type of ['follow_user', 'follow_request_user'] as const) {
  describe(type, () => {
    it('already held at the house, it is done without an insert', async () => {
      mockHeld = true;
      const done: MutationResult = await executeMutation(queued(type), {});
      expect(done).toEqual({});
      expect(mockWrites).toEqual([]);
    });

    it('not yet held, it is inserted, once', async () => {
      await executeMutation(queued(type), {});
      expect(mockWrites.map((w) => [w.op, w.values?.[0]?.type])).toEqual([['upsert', type === 'follow_user' ? 'follow' : 'follow_request']]);
    });
  });
}
