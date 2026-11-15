/**
 * aSentMessageStaysWhereItWasSent.test.ts — a message the house took stays on the screen, sent.
 *
 * A message is written with its own id, so the house's answer names the message on screen itself.
 * The answer took that for a second copy and took the message off the screen; it came back only
 * with the channel's echo, and an echo heard first had already marked it sent, so it was gone.
 * And a send answered after the member opened another room was lost: the room's kept words held
 * it 'sending' for good, never offered again (a failure) nor marked sent.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const U2 = '44444444-4444-4444-8444-444444444444';
const SENT_AT = '2026-11-15T09:01:00.000Z';

/** The messages the house holds, as the room's check read (withdrawn or gone since?) answers. */
const mockHouseHolds = new Set<string>();
/** How the house answers the send: taken, or refused. */
let mockRefused = false;
/** While set, the send's answer waits for it: the write is on its way. */
let mockHold: Promise<void> | null = null;

const mockHouse = supabaseFake({
  rows: { lounge_message_reactions: [] },
  answer: {
    lounge_messages: (ask: Ask) => {
      if (ask.op === 'upsert') {
        if (mockRefused) return { code: '42501', message: 'permission denied' };
        const written = ask.values?.at(0);
        mockHouseHolds.add(String(written?.id));
        return [{ ...written, created_at: SENT_AT }];
      }
      // The check read (withdrawn or gone since?) names what the house holds; the room's other
      // reads (its words, what it missed) find nothing new.
      return ask.columns.includes('deleted_at') ? [...mockHouseHolds].map((id) => ({ id, deleted_at: null })) : [];
    },
  },
});
/** The fake's client, the send's answer held while mockHold is set (the fake answers at once). */
function mockHeld(client: typeof mockHouse.client): typeof mockHouse.client {
  const from = (table: string) => {
    const query = client.from(table);
    let write = false;
    const held: unknown = new Proxy(query, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'single') {
          const gate = write ? mockHold : null;
          return () => (gate ?? Promise.resolve()).then(() => target.single());
        }
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (key === 'upsert') write = true;
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          return out === target ? held : out;
        };
      },
    });
    return held as ReturnType<typeof client.from>;
  };
  return { ...client, from };
}
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld(mockHouse.client); } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: U1, username: 'ana', role: 'cinephile' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn().mockReturnValue([]),
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

/** The send held on its way; answer() lets the house's answer through. */
const holdTheSend = () => { let answer: () => void = () => {}; mockHold = new Promise<void>((r) => { answer = r; }); return answer; };

const RESETS = (jest.requireMock('../resetAllStores') as { registerStoreReset: jest.Mock }).registerStoreReset.mock.calls
  .map(([handler]) => handler as (previous: string | null) => void);

const HEARD = { id: 'a0000000-0000-4000-8000-000000000001', lounge_id: L1, user_id: U2, username: 'ben', content: 'Before.', type: 'text', created_at: '2026-11-15T09:00:00.000Z' };
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const mine = (words = useLoungeStore.getState().currentMessages) => words.filter((m) => m.user_id === U1);

beforeEach(() => {
  for (const forget of RESETS) forget(null);
  mockHold = null;
  mockRefused = false;
  mockHouseHolds.clear();
  mockHouseHolds.add(HEARD.id);
  useLoungeStore.setState({
    lounges: [], currentMessages: [HEARD], currentLoungeId: L1, sending: false,
    members: {}, messagesLoading: false, messagesFailed: false, typingUsers: {},
  } as never);
});

describe('a message the house took', () => {
  it('stays on the screen, marked sent', async () => {
    const answer = holdTheSend();
    const sent = useLoungeStore.getState().sendMessage(L1, 'Hello.');
    await settle();
    expect(mine().map((m) => m.status)).toEqual(['sending']);
    answer();
    await expect(sent).resolves.toBe(true);
    expect(mine().map((m) => [m.content, m.status])).toEqual([['Hello.', 'sent']]);
  });

  it('stays when the channel’s echo was heard first and had marked it sent', async () => {
    const answer = holdTheSend();
    const sent = useLoungeStore.getState().sendMessage(L1, 'Hello.');
    await settle();
    useLoungeStore.setState((s) => ({ currentMessages: s.currentMessages.map((m) => (m.user_id === U1 ? { ...m, status: 'sent' as const } : m)) }));
    answer();
    await sent;
    expect(mine().map((m) => [m.content, m.status])).toEqual([['Hello.', 'sent']]);
  });

  it('answered after another room was opened, is sent in the room’s kept words', async () => {
    const answer = holdTheSend();
    const sent = useLoungeStore.getState().sendMessage(L1, 'Hello.');
    await settle();
    await useLoungeStore.getState().fetchMessages(L2);
    expect(useLoungeStore.getState().currentLoungeId).toBe(L2);
    answer();
    await sent;
    expect(mine()).toEqual([]);                   // never drawn into the room on screen

    await useLoungeStore.getState().fetchMessages(L1);
    expect(mine().map((m) => [m.content, m.status])).toEqual([['Hello.', 'sent']]);
  });

  it('refused after another room was opened, is failed in the room’s kept words: offered again', async () => {
    const answer = holdTheSend();
    const sent = useLoungeStore.getState().sendMessage(L1, 'Hello.');
    await settle();
    await useLoungeStore.getState().fetchMessages(L2);
    mockRefused = true;
    answer();
    await expect(sent).resolves.toBe(false);

    await useLoungeStore.getState().fetchMessages(L1);
    expect(mine().map((m) => [m.content, m.status])).toEqual([['Hello.', 'failed']]);
  });
});
