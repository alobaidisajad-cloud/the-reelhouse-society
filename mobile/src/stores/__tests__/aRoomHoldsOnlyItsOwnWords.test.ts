/**
 * aRoomHoldsOnlyItsOwnWords.test.ts — a salon's words, read as the house holds them (P0.112).
 *
 * One `loading` flag served both the salons' read and the open room's: whichever ended first
 * lowered it for the other, so a room could call itself read with its words still coming, and
 * an empty room waited out the whole salons' read to say so. fetchMessages kept the last room's
 * words when another opened: they stood under the new room's name until its own came, and for
 * good when its read failed. A room's reactions were asked for after its words, a second round
 * trip; a page read on scrolling up never asked for them at all. And the salons were read in
 * five waves where two would do.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const msg = (n: number, room: string, user: string, at = `2026-10-2${n}T00:00:00Z`) => ({
  id: `44444444-4444-4444-8444-44444444444${n}`, lounge_id: room, user_id: user,
  content: `words ${n}`, type: 'text', created_at: at,
});
const reaction = (n: number, message: string, user: string) => ({
  id: `55555555-5555-4555-8555-55555555555${n}`, message_id: message, lounge_id: A, user_id: user, reaction: 'bravo',
});
const PEOPLE = [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }];

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

const words = () => useLoungeStore.getState().currentMessages.map((m) => m.content);

beforeEach(() => {
  mockToast.error.mockClear();
  useLoungeStore.setState({
    lounges: [], loungesFailed: false, loungesLoading: false,
    currentMessages: [], currentLoungeId: null, messagesLoading: false, messagesFailed: false,
  });
});

describe('a room holds only its own words', () => {
  it('lets the last room\'s words go the moment another opens, and keeps the same room\'s while it is read again', async () => {
    mockHouse = supabaseFake({ rows: { lounge_messages: [msg(1, A, ANA), msg(2, B, ANA)], profiles: PEOPLE, lounge_message_reactions: [] } });
    await useLoungeStore.getState().fetchMessages(A);
    expect(words()).toEqual(['words 1']);

    const again = useLoungeStore.getState().fetchMessages(A);
    expect(words()).toEqual(['words 1']);
    await again;

    const other = useLoungeStore.getState().fetchMessages(B);
    expect({ words: words(), reading: useLoungeStore.getState().messagesLoading }).toEqual({ words: [], reading: true });
    await other;
    expect({ words: words(), reading: useLoungeStore.getState().messagesLoading }).toEqual({ words: ['words 2'], reading: false });
  });

  it('a new room whose words could not be read is empty and says it failed, once, by the room and not a toast', async () => {
    mockHouse = supabaseFake({ rows: { lounge_messages: [msg(1, A, ANA)], profiles: PEOPLE, lounge_message_reactions: [] } });
    await useLoungeStore.getState().fetchMessages(A);
    mockHouse = supabaseFake({ fail: { lounge_messages: { code: '', message: 'Failed to fetch' } } });

    await useLoungeStore.getState().fetchMessages(B);
    const s = useLoungeStore.getState();
    expect({ words: words(), failed: s.messagesFailed, reading: s.messagesLoading }).toEqual({ words: [], failed: true, reading: false });
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('a room read again that could not be: its words kept, and nothing said over them (the room\'s own line says it is not live, or offline)', async () => {
    mockHouse = supabaseFake({ rows: { lounge_messages: [msg(1, A, ANA)], profiles: PEOPLE, lounge_message_reactions: [] } });
    await useLoungeStore.getState().fetchMessages(A);
    mockHouse = supabaseFake({ fail: { lounge_messages: { code: '', message: 'Failed to fetch' } } });
    await useLoungeStore.getState().fetchMessages(A);
    // A catch-up that failed: every return to the app toasted it, and marked a room it still drew failed.
    expect({ words: words(), failed: useLoungeStore.getState().messagesFailed }).toEqual({ words: ['words 1'], failed: false });
    expect(mockToast.error).not.toHaveBeenCalled();
    // What the next read brings is merged in: aSalonCatchesUpWithoutLosingAWord.test.ts.
  });
});

describe('the salons\' read and the room\'s read keep their own flags', () => {
  it('the salons read to the end lowers only theirs; the room read to the end lowers only its own', async () => {
    mockHouse = supabaseFake({
      rows: { lounge_members: [], lounges: [], lounge_messages: [], profiles: PEOPLE, lounge_message_reactions: [] },
      rpc: { get_lounge_unread_counts: [], get_salon_member_faces: [] },
    });
    useLoungeStore.setState({ currentLoungeId: A, messagesLoading: true });
    await useLoungeStore.getState().fetchLounges();
    expect({ salons: useLoungeStore.getState().loungesLoading, room: useLoungeStore.getState().messagesLoading })
      .toEqual({ salons: false, room: true });

    useLoungeStore.setState({ loungesLoading: true });
    await useLoungeStore.getState().fetchMessages(A);
    expect({ salons: useLoungeStore.getState().loungesLoading, room: useLoungeStore.getState().messagesLoading })
      .toEqual({ salons: true, room: false });
  });
});

describe('a page of words comes with its reactions, in one request', () => {
  const house = (extra: Partial<Parameters<typeof supabaseFake>[0]> = {}) => supabaseFake({
    rows: {
      lounge_messages: [msg(1, A, ANA), msg(2, A, ME)],
      profiles: PEOPLE,
      lounge_message_reactions: [reaction(1, msg(1, A, ANA).id, ME), reaction(2, msg(1, A, ANA).id, ANA)],
    },
    ...extra,
  });

  it('the first page: each word with its reactions, counted and marked mine, and nothing else asked', async () => {
    mockHouse = house();
    await useLoungeStore.getState().fetchMessages(A);
    const first = useLoungeStore.getState().currentMessages.find((m) => m.content === 'words 1');
    expect(first?.reactions).toEqual([{ reaction: 'bravo', count: 2, mine: true }]);
    expect(useLoungeStore.getState().currentMessages.find((m) => m.content === 'words 2')?.reactions).toBeUndefined();
    expect(mockHouse.asked.map((a) => a.table)).toEqual(['lounge_messages']);
  });

  it('the first page is ordered as the page above it is asked for: by its time, then its id', async () => {
    mockHouse = house();
    await useLoungeStore.getState().fetchMessages(A);
    expect(mockHouse.asked[0]?.order).toEqual([['created_at', false], ['id', false]]);
  });

  it('a page read on scrolling up brings its reactions too', async () => {
    const older = msg(3, A, ANA, '2026-10-20T00:00:00Z');
    // The scroll's page is filtered by or(), which the fake does not read: the test answers it.
    mockHouse = supabaseFake({
      rows: {
        profiles: PEOPLE,
        lounge_message_reactions: [reaction(3, older.id, ANA)],
      },
      answer: { lounge_messages: () => (useLoungeStore.getState().currentMessages.length ? [older] : [msg(1, A, ANA)]) },
    });
    await useLoungeStore.getState().fetchMessages(A);
    await useLoungeStore.getState().loadMoreMessages(A);
    const paged = useLoungeStore.getState().currentMessages.find((m) => m.content === 'words 3');
    expect(paged?.reactions).toEqual([{ reaction: 'bravo', count: 1, mine: false }]);
  });
});

describe('the salons are read in two waves, not five', () => {
  it('asks what needs only the member at once, and what needs their seats and rooms together after', async () => {
    const said: string[] = [];
    const tell = (what: string, rows: Record<string, unknown>[]) => () => { said.push(what); return rows; };
    const HOSTED = { id: B, name: 'Mine', description: '', is_private: false, creator_id: ME, created_at: '2026-10-01T00:00:00Z', member_count: 1 };
    const house = supabaseFake({
      answer: {
        lounge_members: (ask: Ask) => (ask.filters.some(([, c]) => c === 'status')
          ? tell('answered the door requests', [])()
          : tell('answered the seats', [{ lounge_id: A, user_id: ME, status: 'approved', last_read_at: null }])()),
        lounges: (ask: Ask) => {
          const by = ask.filters[0]?.[1];
          return by === 'creator_id' ? tell('answered the hosted', [HOSTED])()
            : by === 'id' ? tell('answered the joined', [])()
              : tell('answered the newest', [])();
        },
      },
      rpc: { get_lounge_unread_counts: () => { said.push('asked the unread'); return []; }, get_salon_member_faces: () => { said.push('asked the faces'); return []; } },
    });
    const from = house.client.from;
    mockHouse = { ...house, client: { ...house.client, from: (t: string) => { said.push(`asked ${t}`); return from(t); } } };

    await useLoungeStore.getState().fetchLounges();
    expect(said).toEqual([
      'asked lounge_members', 'asked lounges', 'asked lounges',
      'answered the seats', 'answered the newest', 'answered the hosted',
      'asked lounges', 'asked the unread', 'asked lounge_members', 'asked the faces',
      'answered the joined', 'answered the door requests',
    ]);
    expect(useLoungeStore.getState().lounges.map((l) => l.id)).toEqual([B]);
  });
});
