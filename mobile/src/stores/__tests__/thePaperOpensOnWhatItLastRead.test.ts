/**
 * thePaperOpensOnWhatItLastRead.test.ts — the Dispatch opens on the paper it last read (WORKLIST P4.53).
 *
 * The Reel's feeds are kept on the phone, so a launch draws them at once; the Dispatch kept nothing,
 * and every launch drew its skeletons until the house answered. The paper as it opens (every
 * section, latest first) is kept now, as the house sent it, for the member who read it, a day at
 * most (utils/keptPaper): a launch draws it at once and reads the paper again beneath. Against the
 * house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';
import { resetAllStores } from '../resetAllStores';
import { KEPT_FOR_MS, keepPaper, keptPaper } from '@/src/utils/keptPaper';

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const HIDDEN = '66666666-6666-4666-8666-666666666666';
const idOf = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

/** A take filed by `user_id`, as the house holds it. */
const take = (n: number, user_id = AUTHOR) => ({
  id: idOf(n), kind: 'take', user_id, author_username: user_id === HIDDEN ? 'hidden' : 'mara', title: null,
  body: `Take number ${n}.`, is_published: true, withheld_at: null, ended_at: null,
  certify_count: 0, comment_count: 0, created_at: `2026-11-07T1${n}:00:00Z`,
});
const profile = (id: string, username: string) =>
  ({ id, username, avatar_url: null, member_no: 7, tier: 'cinephile', role: 'cinephile', is_founding: false });

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
let mockHidden: string[] = [];
jest.mock('@/src/stores/blockStore', () => ({
  useBlockStore: { getState: () => ({ isHidden: (id: string | null | undefined) => !!id && mockHidden.includes(id) }) },
}));
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    isStorageEncrypted: () => true,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
    setSensitive: jest.fn((k: string, v: string) => store.set(k, v)),
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
      __store: store,
    },
  };
});
const disk = (jest.requireMock('@/src/stores/mmkv-storage') as { storage: { __store: Map<string, string> } }).storage.__store;

/** The house holding these takes, their authors, and none of the member's marks. */
const holding = (...takes: ReturnType<typeof take>[]) => {
  mockHouse = supabaseFake({ rows: {
    dispatch_posts: takes,
    profiles: [profile(AUTHOR, 'mara'), profile(HIDDEN, 'hidden')],
    dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [],
  } });
};
const drawn = () => useDispatch.getState().filings.map((f) => f.id);

beforeEach(async () => {
  disk.clear();
  mockHidden = [];
  await resetAllStores();
});

it('draws the paper it kept for this member at once, reads it again beneath, and keeps what it read', async () => {
  keepPaper(ME, [take(1)]);
  holding(take(2), take(3));
  const read = useDispatch.getState().fetch();
  expect(drawn()).toEqual([idOf(1)]);
  expect(useDispatch.getState().pageState).toBe('kept');
  await read;
  expect(drawn()).toEqual([idOf(3), idOf(2)]);
  expect(useDispatch.getState().pageState).toBe('read');
  expect((keptPaper(ME) as { id: string }[]).map((r) => r.id)).toEqual([idOf(3), idOf(2)]);
});

it("never draws another member's kept paper", async () => {
  keepPaper(OTHER, [take(1)]);
  holding(take(2));
  const read = useDispatch.getState().fetch();
  expect(drawn()).toEqual([]);
  expect(useDispatch.getState().pageState).toBe('unread');
  await read;
  expect(drawn()).toEqual([idOf(2)]);
});

it('leaves out of the kept paper anyone the member has hidden since', async () => {
  keepPaper(ME, [take(1, HIDDEN), take(2)]);
  mockHidden = [HIDDEN];
  holding(take(2));
  const read = useDispatch.getState().fetch();
  expect(drawn()).toEqual([idOf(2)]);
  await read;
});

it('keeps the kept paper drawn when the house cannot be reached', async () => {
  keepPaper(ME, [take(1)]);
  mockHouse = supabaseFake({ rows: { dispatch_posts: [] }, fail: { dispatch_posts: { message: 'Failed to fetch', code: '' } } });
  await useDispatch.getState().fetch();
  expect(drawn()).toEqual([idOf(1)]);
  expect(useDispatch.getState().pageState).toBe('kept');
});

it('keeps and draws only the paper as it opens, never a section or the saved list', async () => {
  keepPaper(ME, [take(1)]);
  holding(take(2));
  useDispatch.setState({ section: 'TAKES' });
  const read = useDispatch.getState().fetch();
  expect(drawn()).toEqual([]);
  await read;
  expect((keptPaper(ME) as { id: string }[]).map((r) => r.id)).toEqual([idOf(1)]);
});

it('draws a kept paper a day old at most, and lets go of one it cannot read', () => {
  const at = Date.parse('2026-11-07T12:00:00Z');
  keepPaper(ME, [take(1)], at);
  expect(keptPaper(ME, at + KEPT_FOR_MS)).toHaveLength(1);
  expect(keptPaper(ME, at + KEPT_FOR_MS + 1)).toBeNull();
  disk.set(`kept_paper_${ME}`, '{not json');
  expect(keptPaper(ME)).toBeNull();
  expect(disk.has(`kept_paper_${ME}`)).toBe(false);
});
