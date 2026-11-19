/**
 * aSalonsDayHasACeiling.test.ts — review round 14 (lounge.ts sendMessage, housePace.salonPaceSaid)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house now holds each member to a thousand salon messages in its UTC day
 * (lounge_messages_daily_ceiling), refusing the next with RH429 'day' and the seconds to its
 * midnight: a script filled the disk with them, in a salon of its own where no host could stop it.
 * No member talking meets it; one who did was told "Failed to send message." over a retry that could
 * not work until midnight. Now the wait is said, and the message stays in the room, failed, its
 * words kept, for the member to send again once the day turns.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeRoom } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const ROOM = { id: SALON, name: 'The Back Row', creator_id: ME, is_private: false, member_count: 1, created_at: '2026-11-01T00:00:00Z' };
const DAY = { code: 'RH429', message: 'RATE_LIMITED', details: 'day', hint: '32400' };

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

const ROOM_HELD: LoungeRoom = { ...ROOM, description: '', cover_image: null, mine: true, membership_status: 'approved' } as LoungeRoom;

beforeEach(() => {
  mockToast.error.mockClear();
  useLoungeStore.setState({ lounges: [ROOM_HELD], currentLoungeId: SALON, currentMessages: [] });
});

it('a word past the day\'s thousand says how long until the house takes more, and stays in the room, failed, with its words', async () => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] }, fail: { lounge_messages: DAY } });
  await expect(useLoungeStore.getState().sendMessage(SALON, 'One more thought on Late Spring.')).resolves.toBe(false);
  expect(mockToast.error.mock.calls).toEqual([['You have sent the day\'s salon messages. The house takes more in 9 hours.']]);
  const kept = useLoungeStore.getState().currentMessages;
  expect(kept.map((m) => [m.content, m.status])).toEqual([['One more thought on Late Spring.', 'failed']]);
});
