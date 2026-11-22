/**
 * aRefusedWriteIsNotSuccess.test.ts — 200 OK, nothing changed.
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgREST answers a DELETE that matches no row with 200 and an empty body.
 * `error` is null. So a write REFUSED by an RLS policy or by its own predicate
 * is indistinguishable from one that worked — unless the call asks for the rows
 * back.
 *
 * Three operations drew a conclusion from that silence and told the member
 * something untrue:
 *
 *   leaveLounge     — "you have left", still a member
 *   deleteLounge    — the salon vanished from the list, still exists
 *   removeCritique  — the critique disappeared and the filing's count dropped,
 *                     while the critique stood for everybody else
 *
 * Proved against production first: a member running deleteLounge's exact
 * statement on a lounge they did not create gets 0 rows, no error, and the
 * lounge is still there afterwards.
 */
import { useLoungeStore } from '../lounge';

const L1 = '11111111-1111-4111-8111-111111111111';
const U1 = '33333333-3333-4333-8333-333333333333';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), rpc: (...a: unknown[]) => mockRpc(...a), channel: jest.fn() },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: U1, username: 'testuser' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
const mockToastError = jest.fn();
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn() });
  return { __esModule: true, default: fn };
});

/**
 * `deleteResult` is what the terminal `.select('id')` resolves to. The refusal
 * case is the one that matters: `{ data: [], error: null }` — exactly what the
 * live database returns for a row the member may not touch.
 */
let deleteResult: { data: unknown; error: unknown } = { data: [], error: null };
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

const chain = (): Record<string, unknown> => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  let isDelete = false;
  c.delete = () => { isDelete = true; return self(); };
  for (const f of ['update', 'insert', 'upsert', 'eq', 'in', 'order', 'limit', 'not', 'neq', 'or'] as const) {
    c[f] = () => self();
  }
  c.select = () => {
    const r = isDelete ? deleteResult : selectResult;
    return { then: (res: (v: unknown) => unknown) => Promise.resolve(r).then(res), ...c };
  };
  c.then = (res: (v: unknown) => unknown) =>
    Promise.resolve(isDelete ? deleteResult : selectResult).then(res);
  return c;
};

beforeEach(() => {
  mockFrom.mockReset().mockImplementation(() => chain());
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
  mockToastError.mockReset();
  deleteResult = { data: [], error: null };
  selectResult = { data: [], error: null };
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: null, sending: false,
    members: {}, messagesLoading: false, typingUsers: {},
  } as never);
});

describe('deleteLounge', () => {
  const own = { id: L1, name: 'The Salon', creator_id: U1, mine: true, membership_status: 'approved', member_count: 1, unread_count: 0 };

  it('REPORTS FAILURE when the delete touched no row', async () => {
    useLoungeStore.setState({ lounges: [own] } as never);
    // 200, empty body, no error — a refusal.
    deleteResult = { data: [], error: null };

    const ok = await useLoungeStore.getState().deleteLounge(L1);

    expect(ok).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });

  it('puts the room back where it stood when neither the delete nor the read back can reach the house', async () => {
    const other = { ...own, id: 'other', name: 'Another Room' };
    useLoungeStore.setState({ lounges: [other, own, { ...other, id: 'third' }] } as never);
    deleteResult = { data: null, error: { message: 'Network request failed' } };
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    expect(await useLoungeStore.getState().deleteLounge(L1)).toBe(false);

    expect(mockToastError).toHaveBeenCalledWith('Failed to incinerate lounge. Check your connection and try again.');
    expect(useLoungeStore.getState().lounges.map((l) => l.id)).toEqual(['other', L1, 'third']);
  });

  it('reports success when a row really was destroyed', async () => {
    useLoungeStore.setState({ lounges: [own] } as never);
    deleteResult = { data: [{ id: L1 }], error: null };

    expect(await useLoungeStore.getState().deleteLounge(L1)).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('leaveLounge', () => {
  const joined = { id: L1, name: 'The Salon', creator_id: 'someone-else', mine: true, membership_status: 'approved', member_count: 4, unread_count: 0 };

  it('TELLS THE MEMBER when the seat was not actually given up', async () => {
    useLoungeStore.setState({ lounges: [joined] } as never);
    deleteResult = { data: [], error: null };

    await useLoungeStore.getState().leaveLounge(L1);

    // The refusal must surface, not be swallowed into a cheerful no-op.
    expect(mockToastError).toHaveBeenCalled();
  });

  it('puts the seat back as it was when neither the leave nor the read back can reach the house', async () => {
    useLoungeStore.setState({ lounges: [joined] } as never);
    deleteResult = { data: null, error: { message: 'Network request failed' } };
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    expect(await useLoungeStore.getState().leaveLounge(L1)).toBe(false);

    expect(mockToastError).toHaveBeenCalledWith('Failed to leave. Check your connection and try again.');
    expect(useLoungeStore.getState().lounges).toEqual([joined]);
  });

  it('stays quiet when the row really was removed', async () => {
    useLoungeStore.setState({ lounges: [joined] } as never);
    deleteResult = { data: [{ id: 'membership-row' }], error: null };

    await useLoungeStore.getState().leaveLounge(L1);

    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("a host's act on a seat is said by why it failed", () => {
  const acts: [() => Promise<unknown>, string][] = [
    [() => useLoungeStore.getState().approveMember(L1, U1), 'Could not admit this guest.'],
    [() => useLoungeStore.getState().declineMember(L1, U1), 'Could not decline this request.'],
    [() => useLoungeStore.getState().setMemberStatus(L1, U1, 'muted'), 'Could not update this member.'],
    [() => useLoungeStore.getState().removeMember(L1, U1), 'Could not remove this member.'],
  ];

  it('admitting, declining, muting or removing: refused, said as refused; unreached, said as the connection', async () => {
    for (const [act, words] of acts) {
      mockToastError.mockClear();
      mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
      expect(await act()).toBe(false);
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
      expect(await act()).toBe(false);
      expect(mockToastError.mock.calls.map((c) => c[0])).toEqual([
        `${words} The house did not allow it.`, `${words} Check your connection and try again.`]);
    }
  });
});
