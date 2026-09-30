/**
 * aReplayThatCannotReadKeepsItsWrite.test.ts — a queued write whose replay must
 * first READ something.
 *
 * Eight replays ask the house a question before they write: is this certified
 * already, who is this handle, what history does this log hold, which log won
 * the race. supabase-js RESOLVES a failed read as `{ error }`, and each read only
 * `data` — so a failed read was "not certified", "no such member", "no history",
 * "no log", and the replay returned done. The queue then deleted the write: an
 * uncertify or unfollow made offline was never sent, a follow was skipped, a
 * log's offline review was dropped, and a log's history was overwritten.
 *
 * A replay that cannot read now throws, so the queue keeps the write (a network
 * failure) or dead-letters it with its reason (anything else) — never "done".
 */
import { executeMutation } from '../mutationExecutor';

const OFFLINE = { message: 'TypeError: Network request failed' };

/** What each `.maybeSingle()` answers, in order; the last repeats. */
let mockAnswers: { data: unknown; error: unknown }[] = [];
const mockWrites: string[] = [];

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member-1' } } } }) },
    rpc: async (fn: string) => { mockWrites.push(`rpc:${fn}`); return { data: null, error: null }; },
    from: (table: string) => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
      chain.insert = () => { mockWrites.push(`insert:${table}`); return chain; };
      chain.upsert = () => { mockWrites.push(`upsert:${table}`); return chain; };
      chain.update = () => { mockWrites.push(`update:${table}`); return chain; };
      chain.delete = () => { mockWrites.push(`delete:${table}`); return chain; };
      chain.maybeSingle = async () => (mockAnswers.length > 1 ? mockAnswers.shift()! : mockAnswers[0]);
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
      return chain;
    },
  },
}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

beforeEach(() => { mockAnswers = [{ data: null, error: OFFLINE }]; mockWrites.length = 0; });

describe('a replay that cannot read keeps its write', () => {
  it.each([
    ['an uncertify of a filing', 'certify_filing', { post_id: 'p1', desired_state: false }],
    ['an uncertify of a critique', 'certify_critique', { comment_id: 'c1', desired_state: false }],
    ['an uncertify of an essay', 'toggle_dossier_certify', { dossier_uuid: 'd1', desired_state: false }],
    ['an unfollow', 'unfollow_user', { user_id: 'member-1', target_username: 'kane' }],
    ['a follow', 'follow_user', { user_id: 'member-1', target_username: 'kane' }],
    ['a follow request', 'follow_request_user', { user_id: 'member-1', target_username: 'kane' }],
    ['a log whose history must be merged', 'update_log', { id: 'l1', updates: { viewing_history: [{ date: '2026-09-01' }] } }],
  ])('%s is raised, not reported done, and writes nothing', async (_what, type, payload) => {
    await expect(replay(type, payload)).rejects.toBeTruthy();
    expect(mockWrites).toEqual([]);
  });

  it('a log that lost the race to another device is merged — and if the winner cannot be read, raised', async () => {
    // The insert meets its unique key; the read of the winning row fails.
    mockAnswers = [{ data: null, error: { code: '23505', message: 'duplicate key value' } }, { data: null, error: OFFLINE }];
    await expect(replay('add_log', { user_id: 'member-1', film_id: 11, film_title: 'Sunrise' })).rejects.toBeTruthy();
  });

  it('a member who truly does not exist is still skipped, as before', async () => {
    mockAnswers = [{ data: null, error: null }];
    await expect(replay('follow_user', { user_id: 'member-1', target_username: 'nobody' })).resolves.toEqual({});
    expect(mockWrites).toEqual([]);
  });

  it('a mark already as the member wants it is left alone', async () => {
    mockAnswers = [{ data: null, error: null }];
    await expect(replay('certify_filing', { post_id: 'p1', desired_state: false })).resolves.toEqual({});
    expect(mockWrites).toEqual([]);
  });
});
