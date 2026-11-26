/**
 * aSalonAnswerIsLaidInItsTurn.test.ts — the Lounge never lays an older answer over a newer state.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each read here is asked twice, or under an act, and the answers are let go in the order that went
 * wrong: the older last. The corridor read again went back to the older counts, and a read asked
 * before a leave drew the room the member had left as theirs again; a room read whole twice lost the
 * words of the newer read; a page of older words asked of a room read again since was laid above the
 * new list, with a gap between; a catch-up asked before a withdrawal put the words back; a send tried
 * again twice was sent twice, the first answer over the second. Against the house as strict as it is
 * (test-utils/supabaseFake), each answer worked out when asked and held until the test lets it go.
 */
import { onlineManager } from '@tanstack/react-query';
import { heldClient } from '@/test-utils/heldClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { MESSAGE_WINDOW, useLoungeStore, type LoungeMessage } from '../lounge';

const ME = '33333333-3333-4333-8333-333333333333';
const HOST = '55555555-5555-4555-8555-555555555555';
const ANA = '66666666-6666-4666-8666-666666666666';
const R1 = '00000000-0000-4000-9000-0000000000a1';
const START = Date.UTC(2026, 10, 1);
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
/** Message i of the salon, said i seconds in. */
const said = (i: number) => ({ id: idOf(i), lounge_id: R1, user_id: ANA, content: `words ${i}`, type: 'text', created_at: new Date(START + i * 1000).toISOString(), deleted_at: null as string | null });
const heldWords = (i: number) => ({ ...said(i), username: 'ana' } as unknown as LoungeMessage);
const room = { id: R1, name: 'Salon', description: 'Talk', is_private: false, creator_id: HOST, created_at: '2026-11-01T12:00:00Z', member_count: 3, cover_image: null };

/** The corridor as the house holds it when asked: the member's seat, and the salon's unread. */
let mockSeated = true;
let mockUnread = 3;
const houseOf = (words: ReturnType<typeof said>[]) => supabaseFake({
  rows: {
    lounge_messages: words, lounge_message_reactions: [], profiles: [{ id: ANA, username: 'ana' }],
    lounge_members: [{ id: '77777777-7777-4777-8777-777777777777', lounge_id: R1, user_id: ME, status: 'approved' }],
  },
  rpc: {
    get_lounge_list: () => ({
      memberships: mockSeated ? [{ lounge_id: R1, last_read_at: null, status: 'approved' }] : [],
      newest: [room], hosted: [], joined: mockSeated ? [room] : [],
      unread: mockSeated ? [{ lounge_id: R1, unread_count: mockUnread, last_message_at: null }] : [],
      pending: [], faces: [], last_words: [],
    }),
  },
});
let mockHouse = houseOf([]);
let mockHeld = heldClient(mockHouse.client, { rpcs: ['get_lounge_list'] });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [], letHeldGo: jest.fn(), sendHeldAgain: jest.fn(),
}));
/** Whether the send is still held in the queue (refused for the rank while offline). */
let mockStillHeld = false;
jest.mock('../offlineQueueStore', () => ({ stillHeld: () => mockStillHeld }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const words = () => useLoungeStore.getState().currentMessages.map((m) => m.id);
const corridor = () => useLoungeStore.getState().lounges.find((l) => l.id === R1);
const open = (messages: LoungeMessage[]) => useLoungeStore.setState({
  currentLoungeId: R1, currentMessages: messages, messagesLoading: false, messagesFailed: false,
});

beforeEach(() => {
  mockSeated = true;
  mockUnread = 3;
  mockStillHeld = false;
  onlineManager.setOnline(true);
  useLoungeStore.setState({ lounges: [], loungesRead: false, currentLoungeId: null, currentMessages: [], messagesLoading: false });
  // An empty house, its corridor held, before every test: put back by one block's hooks alone, a
  // test of another block met the house and the held answers the test before it left.
  mockHouse = houseOf([]);
  mockHeld = heldClient(mockHouse.client, { rpcs: ['get_lounge_list'] });
});

describe('the corridor', () => {

  it('read twice, lays the later asked, whichever lands last', async () => {
    const first = useLoungeStore.getState().fetchLounges();
    await settle();
    mockUnread = 5;
    const second = useLoungeStore.getState().fetchLounges();
    await mockHeld.release('get_lounge_list', 1);
    await second;
    await mockHeld.release('get_lounge_list', 0);
    await first;
    expect(corridor()?.unread_count).toBe(5);
    expect(useLoungeStore.getState().loungesLoading).toBe(false);
  });

  it('a read asked before a leave never draws the room left as the member\'s again', async () => {
    const before = useLoungeStore.getState().fetchLounges();
    await mockHeld.release('get_lounge_list');
    await before;
    expect(corridor()?.mine).toBe(true);

    const read = useLoungeStore.getState().fetchLounges();
    await settle();
    const leave = useLoungeStore.getState().leaveLounge(R1);
    await mockHeld.release('lounge_members');
    await leave;
    mockSeated = false;
    // The read asked before the leave lands after it, and is asked again.
    await mockHeld.release('get_lounge_list');
    await mockHeld.releaseAll();
    await read;
    expect(corridor()?.mine).toBe(false);
  });
});

describe('a room\'s words', () => {
  it('read whole twice keep the newer read\'s words when the older lands last', async () => {
    mockHouse = houseOf([said(1)]);
    mockHeld = heldClient(mockHouse.client);
    const first = useLoungeStore.getState().fetchMessages(R1);
    await settle();
    mockHouse.rows('lounge_messages').push(said(2));
    const second = useLoungeStore.getState().fetchMessages(R1);
    await mockHeld.release('lounge_messages', 1);
    await second;
    await mockHeld.release('lounge_messages', 0);
    await first;
    expect(words()).toEqual([idOf(1), idOf(2)]);
    expect(useLoungeStore.getState().messagesLoading).toBe(false);
  });

  it('a page of older words asked before the room was read again from its newest is asked again of the new list', async () => {
    mockHouse = houseOf(Array.from({ length: 1000 }, (_, i) => said(i)));
    mockHeld = heldClient(mockHouse.client);
    open(Array.from({ length: 100 }, (_, i) => heldWords(900 + i)));
    const page = useLoungeStore.getState().loadMoreMessages(R1);
    await settle();
    // More was said meanwhile than the room holds: the catch-up reads the room again from its newest.
    mockHouse.rows('lounge_messages').push(...Array.from({ length: MESSAGE_WINDOW }, (_, i) => said(1000 + i)));
    const catchUp = useLoungeStore.getState().catchUpMessages(R1);
    await mockHeld.release('lounge_messages', 1);
    await mockHeld.release('lounge_messages', 1);
    await catchUp;
    // The page asked of the old list lands last.
    await mockHeld.release('lounge_messages', 0);
    await mockHeld.releaseAll();
    await page;
    const newest = 1000 + MESSAGE_WINDOW;
    expect(words()).toEqual(Array.from({ length: 200 }, (_, i) => idOf(newest - 200 + i)));
  });

  it('a catch-up asked before a withdrawal never puts the words back', async () => {
    mockHouse = houseOf([said(1), said(2)]);
    mockHeld = heldClient(mockHouse.client);
    open([heldWords(1), heldWords(2)]);
    const older = useLoungeStore.getState().catchUpMessages(R1);
    // Its first read answered: its read of the words held is asked, before the withdrawal.
    await mockHeld.release('lounge_messages', 0);
    // Withdrawn on the house, and caught up on again: the newer catch-up lands first.
    const row = mockHouse.rows('lounge_messages').find((r) => r.id === idOf(2));
    if (row) row.deleted_at = new Date(START + 5000).toISOString();
    const newer = useLoungeStore.getState().catchUpMessages(R1);
    await mockHeld.release('lounge_messages', 1);
    await mockHeld.release('lounge_messages', 1);
    await newer;
    expect(useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(2))?.deleted_at).toBeTruthy();
    await mockHeld.release('lounge_messages', 0);
    await mockHeld.releaseAll();
    await older;
    expect(useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(2))?.deleted_at).toBeTruthy();
    expect(useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(2))?.content).toBe('');
  });

  it('a send held in the queue, tried again twice, is tried once, and stands sent', async () => {
    mockStillHeld = true;
    mockHouse = houseOf([]);
    mockHeld = heldClient(mockHouse.client);
    const failed = { ...heldWords(3), user_id: ME, username: 'me', status: 'failed' } as LoungeMessage;
    open([failed]);
    const first = useLoungeStore.getState().retryMessage(idOf(3));
    const second = useLoungeStore.getState().retryMessage(idOf(3));
    await settle();
    expect(mockHeld.count('lounge_messages')).toBe(1);
    await mockHeld.releaseAll();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(3))?.status).toBe('sent');
  });
});
