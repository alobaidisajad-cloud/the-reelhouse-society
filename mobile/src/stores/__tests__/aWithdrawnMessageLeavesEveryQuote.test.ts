/**
 * A message withdrawn or removed leaves every reply quoting it, on every phone holding the room
 * (review round 14, moderation).
 *
 * Bea posts an abusive message and Cal answers it, his reply quoting it. Bea withdraws it, or the
 * house removes it (REMOVE CONTENT): the house tombstones it and takes its words out of Cal's reply
 * (a_withdrawn_message_leaves_its_quotes). Every phone with the room open, or kept among its rooms,
 * still drew Cal's reply quoting the words for the rest of the run: the live change copied the
 * reply's words and tombstone but never its quote, the catch-up on returning to a kept room read
 * only newer messages and each held one's tombstone, and the member's own withdrawal left the quotes
 * of it in place. Now the quote is taken as the house leaves it, live and on return, and a member's
 * own withdrawal takes it at once (and puts it back if the house refuses).
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeMessage } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const BEA = '66666666-6666-4666-8666-666666666666';
const CAL = '77777777-7777-4777-8777-777777777777';
const PEOPLE = [{ id: ME, username: 'me' }, { id: BEA, username: 'bea' }, { id: CAL, username: 'cal' }];
const START = Date.parse('2026-11-19T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const atOf = (i: number) => new Date(START + i * 1000).toISOString();
const WORDS = 'the abusive words';

/** Bea's message (0), Cal's reply quoting it (1), and a word of Cal's quoting nothing (2). */
const said = (by: string, i: number, extra: Partial<LoungeMessage> = {}): LoungeMessage => ({
  id: idOf(i), lounge_id: ROOM, user_id: by, username: by === ME ? 'me' : by === BEA ? 'bea' : 'cal',
  content: i === 0 ? WORDS : `words ${i}`, type: 'text', created_at: atOf(i), ...extra,
} as LoungeMessage);
const room = (writer = BEA) => [
  said(writer, 0),
  said(CAL, 1, { reply_to_id: idOf(0), reply_to_username: 'bea', reply_to_content: WORDS }),
  said(CAL, 2),
];
const quoteOf = (i: number) => {
  const m = useLoungeStore.getState().currentMessages.find((x) => x.id === idOf(i));
  expect(m).toBeDefined();
  return m!.reply_to_content ?? null;
};

/** The house as the light read finds it: the held rows, each as it now stands. */
let mockServer: Record<string, unknown>[] = [];
let mockHouse = supabaseFake({ rows: {} });
const house = (withdraw?: unknown) => supabaseFake({
  rows: { profiles: PEOPLE, lounge_message_reactions: [] },
  answer: {
    lounge_messages: (ask: Ask) => {
      const from = ask.filters.find(([op]) => op === 'gte')?.[2] as string | undefined;
      const to = ask.filters.find(([op]) => op === 'lte')?.[2] as string | undefined;
      if (ask.ors?.length) return [];
      return from && to ? mockServer.filter((r) => (r.created_at as string) >= from && (r.created_at as string) <= to) : mockServer;
    },
  },
  rpc: { withdraw_lounge_message: withdraw ?? null },
});
const mockHandlers = new Map<string, (payload: { new?: unknown; old?: unknown }) => unknown>();
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (kind: string, filter: { event?: string; table?: string }, handler: (payload: { new?: unknown }) => unknown) => {
    mockHandlers.set(`${kind}:${filter?.event ?? ''}:${filter?.table ?? ''}`, handler);
    return mockChannel;
  },
  subscribe: () => mockChannel,
  track: jest.fn(), send: jest.fn(), presenceState: () => ({}),
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, channel: () => mockChannel, removeChannel: async () => 'ok' }; },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
/** The queue as this phone holds it. */
let mockQueue: { type: string; payload: Record<string, unknown> }[] = [];
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => mockQueue }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

let leave: (() => void) | null = null;
const live = (event: 'UPDATE') => {
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  const handler = mockHandlers.get(`postgres_changes:${event}:lounge_messages`);
  expect(handler).toBeDefined();
  return handler!;
};
beforeEach(() => {
  mockQueue = [];
  onlineManager.setOnline(true);
  mockHandlers.clear();
  mockHouse = house();
  useLoungeStore.setState({ currentLoungeId: ROOM, currentMessages: room(), messagesLoading: false, messagesFailed: false });
});
afterEach(() => { leave?.(); leave = null; });

it('the house takes the words out of Cal\'s reply: the room open here stops quoting them at once', () => {
  const heard = live('UPDATE');
  heard({ new: { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'words 1', type: 'text', reply_to_id: idOf(0),
    reply_to_content: null, created_at: atOf(1), deleted_at: null } });
  expect(quoteOf(1)).toBeNull();
  expect(quoteOf(2)).toBeNull();
});

it('Bea\'s message withdrawn or removed, heard live: every reply quoting it here loses the words with it', () => {
  const heard = live('UPDATE');
  heard({ new: { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: '', type: 'text', created_at: atOf(0), deleted_at: '2026-11-19T11:00:00Z' } });
  const gone = useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(0));
  expect(gone).toBeDefined();
  expect(gone!.content).toBe('');
  expect(quoteOf(1)).toBeNull();
});

it('back in a kept room after the removal, Cal\'s reply is read again without the words', async () => {
  mockServer = [
    { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: '', type: 'text', created_at: atOf(0), deleted_at: '2026-11-19T11:00:00Z' },
    { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'words 1', type: 'text', reply_to_id: idOf(0), reply_to_content: null, created_at: atOf(1), deleted_at: null },
    { id: idOf(2), lounge_id: ROOM, user_id: CAL, content: 'words 2', type: 'text', created_at: atOf(2), deleted_at: null },
  ];
  await useLoungeStore.getState().catchUpMessages(ROOM);
  expect(quoteOf(1)).toBeNull();
});

it('a quote the house gives back (a sealed stack opened again) is read again as it stands', async () => {
  useLoungeStore.setState({ currentMessages: room().map((m) => (m.id === idOf(1) ? { ...m, reply_to_content: null } : m)) });
  mockServer = [
    { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: WORDS, type: 'text', created_at: atOf(0), deleted_at: null },
    { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'words 1', type: 'text', reply_to_id: idOf(0), reply_to_content: WORDS, created_at: atOf(1), deleted_at: null },
    { id: idOf(2), lounge_id: ROOM, user_id: CAL, content: 'words 2', type: 'text', created_at: atOf(2), deleted_at: null },
  ];
  await useLoungeStore.getState().catchUpMessages(ROOM);
  expect(quoteOf(1)).toBe(WORDS);
});

it('the member withdraws their own message: the replies quoting it here lose the words at once', async () => {
  useLoungeStore.setState({ currentMessages: room(ME) });
  await useLoungeStore.getState().withdrawMessage(idOf(0));
  expect(quoteOf(1)).toBeNull();
});

it('the house refuses the withdrawal: the message and its quotes come back as they were', async () => {
  mockHouse = house({ error: { code: '42501', message: 'not yours' } });
  useLoungeStore.setState({ currentMessages: room(ME) });
  await useLoungeStore.getState().withdrawMessage(idOf(0));
  expect(quoteOf(1)).toBe(WORDS);
  const back = useLoungeStore.getState().currentMessages.find((m) => m.id === idOf(0));
  expect(back).toBeDefined();
  expect(back!.content).toBe(WORDS);
});

describe('withdrawn offline, the withdrawal still queued', () => {
  /** The house's copy: the withdrawal has not reached it, and Cal's reply still quotes the words. */
  const unsent = () => [
    { id: idOf(0), lounge_id: ROOM, user_id: ME, content: WORDS, type: 'text', created_at: atOf(0), deleted_at: null, metadata: {} },
    { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'words 1', type: 'text', reply_to_id: idOf(0), reply_to_content: WORDS, created_at: atOf(1), deleted_at: null, metadata: {} },
    { id: idOf(2), lounge_id: ROOM, user_id: CAL, content: 'words 2', type: 'text', created_at: atOf(2), deleted_at: null, metadata: {} },
  ];
  const stateOf = (i: number) => useLoungeStore.getState().currentMessages.find((x) => x.id === idOf(i));

  it('back in the room, the message stays withdrawn and the reply stays unquoted, as the member left them', async () => {
    useLoungeStore.setState({ currentMessages: room(ME).map((m) => (m.id === idOf(0) ? { ...m, content: '', deleted_at: '2026-11-19T11:00:00Z' }
      : m.id === idOf(1) ? { ...m, reply_to_content: null } : m)) });
    mockQueue = [{ type: 'withdraw_lounge_message', payload: { message_id: idOf(0) } }];
    mockServer = unsent();
    await useLoungeStore.getState().catchUpMessages(ROOM);
    expect(stateOf(0)?.content).toBe('');
    expect(stateOf(0)?.deleted_at).toBeTruthy();
    expect(quoteOf(1)).toBeNull();
  });

  it('the room read afresh (the app opened again) draws it withdrawn too', async () => {
    useLoungeStore.setState({ currentLoungeId: null, currentMessages: [] });
    mockQueue = [{ type: 'withdraw_lounge_message', payload: { message_id: idOf(0) } }];
    mockServer = unsent();
    await useLoungeStore.getState().fetchMessages(ROOM);
    expect(stateOf(0)?.content).toBe('');
    expect(stateOf(0)?.deleted_at).toBeTruthy();
    expect(quoteOf(1)).toBeNull();
    expect(stateOf(2)?.content).toBe('words 2');
  });
});

describe('a message or a card the house puts back (a verdict overturned) is drawn whole again, live and on return', () => {
  const withdrawnRoom = () => room().map((m) => (m.id === idOf(0) ? { ...m, content: '', deleted_at: '2026-11-19T11:00:00Z' }
    : m.id === idOf(1) ? { ...m, reply_to_content: null } : m));
  const stateOf = (i: number) => useLoungeStore.getState().currentMessages.find((x) => x.id === idOf(i));

  it('heard live: the message put back stands with its words, no longer withdrawn', () => {
    useLoungeStore.setState({ currentMessages: withdrawnRoom() });
    const heard = live('UPDATE');
    heard({ new: { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: WORDS, type: 'text', created_at: atOf(0), deleted_at: null } });
    expect(stateOf(0)?.content).toBe(WORDS);
    expect(stateOf(0)?.deleted_at ?? null).toBeNull();
  });

  it('heard live: a card taken down and made again by the house is drawn as the house now holds it', () => {
    const card = said(BEA, 3, { type: 'log_share', metadata: { log_id: 'l-1', gone: true, withheld: true }, film_title: null } as Partial<LoungeMessage>);
    useLoungeStore.setState({ currentMessages: [...room(), card] });
    const heard = live('UPDATE');
    heard({ new: { id: idOf(3), lounge_id: ROOM, user_id: BEA, content: '', type: 'log_share', created_at: atOf(3), deleted_at: null,
      metadata: { log_id: 'l-1', title: 'Vertigo', owner_username: 'bea' }, film_title: 'Vertigo', film_poster: '/v.jpg' } });
    expect(stateOf(3)?.metadata).toEqual({ log_id: 'l-1', title: 'Vertigo', owner_username: 'bea' });
    expect(stateOf(3)?.film_title).toBe('Vertigo');
  });

  it('back in a kept room: the message put back, its card made again, are read again as they stand', async () => {
    const card = said(BEA, 3, { type: 'list_share', metadata: { listId: 's-1', gone: true, withheld: true } } as Partial<LoungeMessage>);
    useLoungeStore.setState({ currentMessages: [...withdrawnRoom(), card] });
    mockServer = [
      { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: WORDS, type: 'text', created_at: atOf(0), deleted_at: null, metadata: {} },
      { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'words 1', type: 'text', reply_to_id: idOf(0), reply_to_content: WORDS, created_at: atOf(1), deleted_at: null, metadata: {} },
      { id: idOf(2), lounge_id: ROOM, user_id: CAL, content: 'words 2', type: 'text', created_at: atOf(2), deleted_at: null, metadata: {} },
      { id: idOf(3), lounge_id: ROOM, user_id: BEA, content: '', type: 'list_share', created_at: atOf(3), deleted_at: null,
        metadata: { listId: 's-1', title: 'Noir', filmCount: 3, curator: 'bea', topPosters: [] } },
    ];
    await useLoungeStore.getState().catchUpMessages(ROOM);
    expect(stateOf(0)?.content).toBe(WORDS);
    expect(stateOf(0)?.deleted_at ?? null).toBeNull();
    expect(quoteOf(1)).toBe(WORDS);
    expect(stateOf(3)?.metadata).toEqual({ listId: 's-1', title: 'Noir', filmCount: 3, curator: 'bea', topPosters: [] });
  });
});
