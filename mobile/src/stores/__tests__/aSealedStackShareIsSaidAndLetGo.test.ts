/**
 * aSealedStackShareIsSaidAndLetGo.test.ts — review round 13 (stackShareRefusal: lounge.ts sendMessage
 * and retryMessage, the queue's send_lounge_message)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house refuses a stack's card in a salon when the stack is sealed (42501 'STACK_SEALED') or no
 * longer in the house (P0002 'STACK_GONE'): the curator sealed it on the website meanwhile, an older
 * build shared it sealed, or a share made offline reached the house after. The phone said "Failed to
 * send message." over a "tap to retry" that can never work, and kept the card, which names the
 * stack, in the sender's transcript. Now each is said for what it is, the card leaves the transcript,
 * and the queue's replay lets it go, never offered again.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeRoom } from '../lounge';
import { executeMutation } from '@/src/utils/mutationExecutor';
import { STACK_GONE_SAID, STACK_SEALED_SAID, stackShareRefusal } from '@/src/utils/stackShareRefusal';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const STACK = '44444444-4444-4444-8444-444444444444';
const ROOM = { id: SALON, name: 'The Back Row', creator_id: ME, is_private: false, member_count: 1, created_at: '2026-11-01T00:00:00Z' };
const SEALED = { code: '42501', message: 'STACK_SEALED' };
const GONE = { code: 'P0002', message: 'STACK_GONE' };

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

const said = () => mockToast.error.mock.calls.map(([words]) => words as string);
const CORRIDOR: LoungeRoom = { ...ROOM, description: '', cover_image: null, mine: true, membership_status: 'approved' } as LoungeRoom;
const card = { listId: STACK, title: 'Noir', filmCount: 2, curator: 'me', topPosters: [] };

beforeEach(() => {
  mockToast.error.mockClear();
  useLoungeStore.setState({ lounges: [CORRIDOR], currentLoungeId: SALON, currentMessages: [] });
});

it('reads the house\'s two final answers to a stack\'s card, and nothing else as one', () => {
  expect(stackShareRefusal(SEALED)).toBe('sealed');
  expect(stackShareRefusal(GONE)).toBe('gone');
  expect(stackShareRefusal({ code: '42501', message: 'new row violates row-level security policy' })).toBeNull();
  expect(stackShareRefusal({ code: 'P0002', message: 'LOG_GONE' })).toBeNull();
  expect(stackShareRefusal(null)).toBeNull();
});

it('a sealed stack\'s card is said as sealed, and leaves the transcript: no retry that cannot work', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: SEALED } });
  await expect(useLoungeStore.getState().sendMessage(SALON, '', 'list_share', card)).resolves.toBe(false);
  expect(said()).toEqual([STACK_SEALED_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});

it('a stack no longer in the house is said as gone, and leaves the transcript', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: GONE } });
  await useLoungeStore.getState().sendMessage(SALON, 'look', 'list_share', card);
  expect(said()).toEqual([STACK_GONE_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});

it('a share made offline and refused on its way is let go, said, and taken off the room', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: SEALED } });
  const ID = '55555555-5555-4555-8555-555555555555';
  useLoungeStore.setState({ currentMessages: [{ id: ID, lounge_id: SALON, user_id: ME, content: '', type: 'list_share', status: 'sending', metadata: card } as never] });
  await expect(executeMutation({ id: 'q1', type: 'send_lounge_message', payload: { id: ID, lounge_id: SALON, user_id: ME, content: '', type: 'list_share', metadata: card }, timestamp: 0 } as never, {}))
    .resolves.toEqual({ letGo: 'STACK_SEALED' });
  expect(said()).toEqual([STACK_SEALED_SAID]);
  expect(useLoungeStore.getState().currentMessages).toEqual([]);
});
