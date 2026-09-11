/**
 * theTokenMustNotSurviveLogout.test.ts — whose notifications this phone gets.
 * ─────────────────────────────────────────────────────────────────────────────
 * If a push token survives a logout, the device goes on receiving the PREVIOUS
 * member's notifications on somebody else's phone. `logout` already knows that:
 * it is why removal runs BEFORE the session is revoked.
 *
 * It could not tell whether it had worked, three ways over. The delete is
 * narrowed by `user_id` against a policy of `user_id = auth.uid()`, so a
 * refusal matches no row and PostgREST answers 200 with no error; every throw
 * was swallowed; and it returned `void`, so logout had nothing to record.
 *
 * The case that matters is the ordinary one, not a hostile one: a session that
 * has ALREADY expired when logout runs — a refresh that failed while the app
 * was backgrounded. Then auth.uid() is null, the delete matches nothing, and
 * the token stays. Checked against production: RLS is on, the DELETE policy is
 * `user_id = auth.uid()`, and a caller who is not the owner gets ROWS_DELETED=0
 * with no error.
 */
import { removePushToken } from '../pushNotifications';

const OWNER = '88888888-8888-4888-8888-888888888888';

let mockSession: { user: { id: string } } | null = { user: { id: OWNER } };
let mockDeleteResult: { data: unknown; error: unknown } = { data: [{ id: 'tok' }], error: null };
let mockThrew = false;

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['delete', 'eq'] as const) c[f] = () => self();
  c.select = () => {
    if (mockThrew) throw new Error('network down');
    return Promise.resolve(mockDeleteResult);
  };
  return c;
};

jest.mock('../supabase', () => ({
  supabase: {
    from: () => chain(),
    auth: { getSession: async () => ({ data: { session: mockSession } }) },
  },
}));
jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => {
  mockSession = { user: { id: OWNER } };
  mockDeleteResult = { data: [{ id: 'tok' }], error: null };
  mockThrew = false;
});

describe('removing the push token', () => {
  it('REFUSES to claim success when the session is already gone', async () => {
    // The real failure mode: a refresh that failed while the app was
    // backgrounded. auth.uid() is null, the policy matches nothing, and the
    // token would have stayed — silently, before this.
    mockSession = null;
    expect(await removePushToken(OWNER)).toBe(false);
  });

  it('reports success when the row was removed', async () => {
    expect(await removePushToken(OWNER)).toBe(true);
  });

  it('treats an empty result as success when there IS a session', async () => {
    // Nothing came back because this member never registered a token. With a
    // live session the policy matches their rows, so empty means empty — not
    // refused. Getting this wrong would report a failure on every logout by a
    // member who never enabled notifications.
    mockDeleteResult = { data: [], error: null };
    expect(await removePushToken(OWNER)).toBe(true);
  });

  it('reports failure when the database refuses outright', async () => {
    mockDeleteResult = { data: null, error: { message: 'permission denied' } };
    expect(await removePushToken(OWNER)).toBe(false);
  });

  it('reports failure instead of swallowing a thrown error', async () => {
    mockThrew = true;
    expect(await removePushToken(OWNER)).toBe(false);
  });
});
