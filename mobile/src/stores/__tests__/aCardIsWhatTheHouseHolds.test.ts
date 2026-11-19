/**
 * aCardIsWhatTheHouseHolds.test.ts — review round 14 (cardShareRefusal: lounge.ts sendMessage and
 * retryMessage, the queue's send_lounge_message)
 * ─────────────────────────────────────────────────────────────────────────────
 * A seated member could write a card into a salon naming another member as its author under any
 * headline: the readers drew a card's words from the message itself. Since round 14 the house writes
 * every card from the piece it names, read as the sharer, and refuses a card of a record or a filing
 * no longer the sharer's to show ('LOG_GONE', 'PIECE_GONE', P0002), as it refused a stack's. The phone
 * said "Failed to send message." over a retry that can never work, and kept the card. Now each is said
 * for what it is, the card leaves the transcript, and the queue's replay lets it go. And the phone's
 * own shares send what the house keeps: the piece each names, and the words the house writes the same.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeRoom } from '../lounge';
import { executeMutation } from '@/src/utils/mutationExecutor';
import {
  FILING_GONE_SAID, RECORD_GONE_SAID, STACK_GONE_SAID, STACK_SEALED_SAID, cardShareRefusal, wordOfCardShareRefusal,
} from '@/src/utils/stackShareRefusal';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const RECORD = '44444444-4444-4444-8444-444444444444';
const FILING = '66666666-6666-4666-8666-666666666666';
const STACK = '77777777-7777-4777-8777-777777777777';
const ROOM = { id: SALON, name: 'The Back Row', creator_id: ME, is_private: false, member_count: 1, created_at: '2026-11-01T00:00:00Z' };
const RECORD_GONE = { code: 'P0002', message: 'LOG_GONE' };
const FILING_GONE = { code: 'P0002', message: 'PIECE_GONE' };

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

const said = () => mockToast.error.mock.calls.map(([words]) => words as string);
const CORRIDOR: LoungeRoom = { ...ROOM, description: '', cover_image: null, mine: true, membership_status: 'approved' } as LoungeRoom;
// As ShareToLoungeModal sends each card.
const recordCard = { film_id: 603, film_title: 'Vertigo', film_poster: '/vertigo.jpg', metadata: { log_id: RECORD, owner_username: 'ana' } };
const filingCard = { film_title: 'The sled was the point.', metadata: { dossier_id: FILING, author_username: 'ana', kind: 'take' } };
const stackCard = { listId: STACK, title: 'Noir', filmCount: 2, curator: 'ana', topPosters: ['/a.jpg'] };

beforeEach(() => {
  mockToast.error.mockClear();
  useLoungeStore.setState({ lounges: [CORRIDOR], currentLoungeId: SALON, currentMessages: [] });
});

it('reads the house\'s final answers to a card, and nothing else as one', () => {
  expect(cardShareRefusal(RECORD_GONE)).toBe('record gone');
  expect(cardShareRefusal(FILING_GONE)).toBe('filing gone');
  expect(cardShareRefusal({ code: '42501', message: 'STACK_SEALED' })).toBe('sealed');
  expect(cardShareRefusal({ code: 'P0002', message: 'STACK_GONE' })).toBe('gone');
  expect(cardShareRefusal({ code: 'P0002', message: 'SALON_GONE' })).toBeNull();
  expect(cardShareRefusal({ code: '42501', message: 'new row violates row-level security policy' })).toBeNull();
  expect(cardShareRefusal({ code: '22023', message: 'MESSAGE_KIND' })).toBeNull();
  expect(cardShareRefusal(null)).toBeNull();
  // The word the queue lets each go with is the house's own.
  expect(['record gone', 'filing gone', 'sealed', 'gone'].map((r) => wordOfCardShareRefusal(r as never)))
    .toEqual(['LOG_GONE', 'PIECE_GONE', 'STACK_SEALED', 'STACK_GONE']);
});

it('a record\'s card refused as no longer in the house is said so, and leaves the transcript: no retry that cannot work', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: RECORD_GONE } });
  await expect(useLoungeStore.getState().sendMessage(SALON, 'look', 'log_share', recordCard)).resolves.toBe(false);
  expect(said()).toEqual([RECORD_GONE_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});

it('a filing\'s card refused as no longer in the house is said so, and leaves the transcript', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: FILING_GONE } });
  await expect(useLoungeStore.getState().sendMessage(SALON, '', 'dossier_share', filingCard)).resolves.toBe(false);
  expect(said()).toEqual([FILING_GONE_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});

it('a stack\'s card is still said as sealed or gone, as round 13 says it', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: { code: '42501', message: 'STACK_SEALED' } } });
  await useLoungeStore.getState().sendMessage(SALON, '', 'list_share', stackCard);
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: { code: 'P0002', message: 'STACK_GONE' } } });
  await useLoungeStore.getState().sendMessage(SALON, 'again', 'list_share', stackCard);
  expect(said()).toEqual([STACK_SEALED_SAID, STACK_GONE_SAID]);
});

it('a record\'s card made offline and refused on its way is let go with the house\'s word, said, and taken off the room', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: RECORD_GONE } });
  const ID = '55555555-5555-4555-8555-555555555555';
  useLoungeStore.setState({ currentMessages: [{ id: ID, lounge_id: SALON, user_id: ME, content: '', type: 'log_share', status: 'sending', metadata: recordCard.metadata } as never] });
  await expect(executeMutation({ id: 'q1', type: 'send_lounge_message', payload: { id: ID, lounge_id: SALON, user_id: ME, content: '', type: 'log_share', film_id: 603, film_title: 'Vertigo', film_poster: '/vertigo.jpg', metadata: recordCard.metadata }, timestamp: 0 } as never, {}))
    .resolves.toEqual({ letGo: 'LOG_GONE' });
  expect(said()).toEqual([RECORD_GONE_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});

it('the phone\'s cards name the piece each shows, with the words the house writes the same', async () => {
  // The house keeps a card as the phone sends it (H-A4 rehearsal): the piece's id, its film, title,
  // byline and count. These are the keys it reads; a share without its piece's id would show nothing.
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [], lounge_messages: [] } });
  await useLoungeStore.getState().sendMessage(SALON, '', 'log_share', recordCard);
  await useLoungeStore.getState().sendMessage(SALON, '', 'dossier_share', filingCard);
  await useLoungeStore.getState().sendMessage(SALON, '', 'list_share', stackCard);
  const rows = mockHouse.asked.filter((a) => a.table === 'lounge_messages' && a.op === 'upsert').map((a) => {
    const row = a.values?.[0];
    expect(row).toBeDefined();
    return { type: row!.type, film_id: row!.film_id, film_title: row!.film_title, film_poster: row!.film_poster, metadata: row!.metadata };
  });
  expect(rows).toEqual([
    { type: 'log_share', film_id: 603, film_title: 'Vertigo', film_poster: '/vertigo.jpg', metadata: { log_id: RECORD, owner_username: 'ana' } },
    { type: 'dossier_share', film_id: undefined, film_title: 'The sled was the point.', film_poster: undefined, metadata: { dossier_id: FILING, author_username: 'ana', kind: 'take' } },
    { type: 'list_share', film_id: undefined, film_title: undefined, film_poster: undefined, metadata: stackCard },
  ]);
  expect(said()).toEqual([]);
});
