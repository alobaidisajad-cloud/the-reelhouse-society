/**
 * aNoticeIsNarrowedToItsOwner.test.ts — all four mutators, not three.
 * ─────────────────────────────────────────────────────────────────────────────
 * The store has four operations that write to `notifications`: markRead,
 * markAllRead, markGroupRead and dismiss (plus dismissGroup). Three narrowed by
 * `user_id`; markRead addressed the row by id alone, while the comments on its
 * siblings described the ownership filter as the pattern here.
 *
 * It was never a hole. Checked against production: a member updating another
 * member's notice by id alone touches 0 rows, because "Users can update own
 * notifications" is USING (auth.uid() = user_id) and scoped to authenticated.
 * RLS is and remains the real protection.
 *
 * This is the defence-in-depth layer, enumerated rather than listed — so the
 * next operation added here cannot quietly become the fourth exception.
 */
import { useNotificationStore } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';

type Call = { table: string; op: string; filters: Record<string, unknown> };
let calls: Call[] = [];

const chain = (table: string) => {
  const rec: Call = { table, op: '', filters: {} };
  calls.push(rec);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const op of ['update', 'delete', 'insert', 'upsert'] as const) {
    c[op] = () => { rec.op = op; return self(); };
  }
  c.eq = (col: string, val: unknown) => { rec.filters[col] = val; return self(); };
  c.in = (col: string, val: unknown) => { rec.filters[`in:${col}`] = val; return self(); };
  for (const f of ['select', 'order', 'limit', 'or', 'lt', 'gte', 'not'] as const) c[f] = () => self();
  c.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(res);
  return c;
};

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => chain(t), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: ME, username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));

const notice = (id: string, read = false) => ({
  id, type: 'critique', read, created_at: '2026-09-11T10:00:00Z',
  user_id: ME, from_user_id: null, message: 'x',
});

const writeTo = (table: string) => calls.filter((c) => c.table === table && c.op !== '');

beforeEach(() => {
  calls = [];
  useNotificationStore.setState({
    notifications: [notice('n1'), notice('n2')],
    _unreadCount: 2, _hasMore: false, _cursor: null, loading: false,
  } as never);
});

describe('every write to a notice names its owner', () => {
  it('markRead narrows by user_id, like its three siblings', async () => {
    await useNotificationStore.getState().markRead('n1');
    const w = writeTo('notifications')[0];
    expect(w).toBeTruthy();
    // Both halves: the row AND whose row it is.
    expect(w.filters).toMatchObject({ id: 'n1', user_id: ME });
  });

  it('markAllRead narrows by user_id', async () => {
    await useNotificationStore.getState().markAllRead();
    expect(writeTo('notifications')[0].filters).toMatchObject({ user_id: ME });
  });

  it('dismiss narrows by user_id', async () => {
    await useNotificationStore.getState().dismiss('n1');
    expect(writeTo('notifications')[0].filters).toMatchObject({ id: 'n1', user_id: ME });
  });

  it('markGroupRead narrows by user_id', async () => {
    await useNotificationStore.getState().markGroupRead(['n1', 'n2']);
    expect(writeTo('notifications')[0].filters).toMatchObject({ user_id: ME });
  });

  it('dismissGroup narrows by user_id', async () => {
    await useNotificationStore.getState().dismissGroup(['n1', 'n2']);
    expect(writeTo('notifications')[0].filters).toMatchObject({ user_id: ME });
  });

  it('NONE of them writes without naming an owner — the enumeration', async () => {
    const s = useNotificationStore.getState();
    await s.markRead('n1');
    await s.markAllRead();
    await s.dismiss('n2');
    await s.markGroupRead(['n1']);
    await s.dismissGroup(['n2']);

    const unscoped = writeTo('notifications')
      .filter((c) => c.filters.user_id === undefined)
      .map((c) => `${c.op} ${JSON.stringify(c.filters)}`);
    expect(unscoped).toEqual([]);
  });
});
