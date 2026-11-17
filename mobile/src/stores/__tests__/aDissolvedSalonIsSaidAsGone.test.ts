/**
 * aDissolvedSalonIsSaidAsGone.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member sits in a salon while its host dissolves it. SEND failed as "Failed to send message."
 * over a "tap to retry" that could never work, and TAKE A SEAT said "Check your connection and
 * try again." The house refuses a word with row security alone (42501), the same for a salon that
 * is gone, a seat the host took or muted, or a seat left from another phone; and its doors said
 * 'Lounge not found' as they say every other refusal.
 *
 * Now a refused word asks the house why and says it: the salon gone, the seat gone, a mute. The
 * doors raise SALON_GONE (P0002), said as gone too. A gone salon leaves the corridor.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { BANNED_FROM_SALON, SALON_GONE_SAID, useLoungeStore, type LoungeMessage, type LoungeRoom } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const HOST = '66666666-6666-4666-8666-666666666666';
const ROOM = { id: SALON, name: 'The Back Row', creator_id: HOST, is_private: false, member_count: 2, created_at: '2026-11-01T00:00:00Z' };
const SEAT = (status: string) => ({ id: '88888888-8888-4888-8888-888888888888', lounge_id: SALON, user_id: ME, status });
/** Row security's refusal of a word, as PostgREST hands it back. */
const REFUSED = { code: '42501', message: 'new row violates row-level security policy for table "lounge_messages"' };

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

/** The house as it stands: the salon (or none), the member's seat (or none), and every word refused. */
const house = (room: Record<string, unknown> | null, seat: Record<string, unknown> | null) => supabaseFake({
  rows: { lounges: room ? [room] : [], lounge_members: seat ? [seat] : [] },
  fail: { lounge_messages: REFUSED },
});
const said = () => mockToast.error.mock.calls.map(([words]) => words as string);
const CORRIDOR: LoungeRoom = { ...ROOM, description: '', cover_image: null, mine: true, membership_status: 'approved' } as LoungeRoom;
let n = 0;

beforeEach(() => {
  mockToast.error.mockClear();
  useLoungeStore.setState({ lounges: [CORRIDOR], currentLoungeId: SALON, currentMessages: [] });
  n += 1;
});

describe('a word refused', () => {
  it('in a salon its host dissolved is said as gone, and the salon leaves the corridor', async () => {
    mockHouse = house(null, null);
    await expect(useLoungeStore.getState().sendMessage(SALON, `words ${n}`)).resolves.toBe(false);
    expect(said()).toEqual([SALON_GONE_SAID]);
    expect(SALON_GONE_SAID).toBe('This salon is no longer open.');
    expect(useLoungeStore.getState().lounges).toEqual([]);
  });

  it('after the host took the seat, says the seat is gone', async () => {
    mockHouse = house(ROOM, null);
    await useLoungeStore.getState().sendMessage(SALON, `words ${n}`);
    expect(said()).toEqual(['You no longer have a seat in this salon.']);
    expect(useLoungeStore.getState().lounges.map((l) => l.id)).toEqual([SALON]);
  });

  it('after the host muted or banned the member, says that', async () => {
    mockHouse = house(ROOM, SEAT('muted'));
    await useLoungeStore.getState().sendMessage(SALON, `words ${n}`);
    mockHouse = house(ROOM, SEAT('banned'));
    await useLoungeStore.getState().sendMessage(SALON, `other words ${n}`);
    expect(said()).toEqual(['You have been muted in this salon.', BANNED_FROM_SALON]);
  });

  it('with the salon standing and the seat held, is the failure it was', async () => {
    mockHouse = house(ROOM, SEAT('approved'));
    await useLoungeStore.getState().sendMessage(SALON, `words ${n}`);
    expect(said()).toEqual(['Failed to send message.']);
  });

  it('when the house cannot say why, is the failure it was', async () => {
    mockHouse = supabaseFake({ fail: { lounge_messages: REFUSED, lounges: { code: '08006', message: 'connection failure' }, lounge_members: { code: '08006', message: 'connection failure' } } });
    await useLoungeStore.getState().sendMessage(SALON, `words ${n}`);
    expect(said()).toEqual(['Failed to send message.']);
  });

  it('tried again in a salon dissolved meanwhile, is said as gone, never "try again"', async () => {
    const failed = { id: '99999999-9999-4999-8999-999999999999', lounge_id: SALON, user_id: ME, username: 'me', content: 'Still here?', type: 'text', created_at: '2026-11-17T10:00:00Z', status: 'failed' } as LoungeMessage;
    useLoungeStore.setState({ currentMessages: [failed] });
    mockHouse = house(null, null);
    await expect(useLoungeStore.getState().retryMessage(failed.id)).resolves.toBe(false);
    expect(said()).toEqual([SALON_GONE_SAID]);
  });
});

describe('a door of a salon dissolved meanwhile', () => {
  const gone = (code: string, message: string) => supabaseFake({
    rpc: {
      join_public_lounge: { error: { code, message } },
      request_lounge_membership: { error: { code, message } },
    },
  });

  it('a seat is said as gone, never "check your connection", and the salon leaves the corridor', async () => {
    mockHouse = gone('P0002', 'SALON_GONE');
    await expect(useLoungeStore.getState().joinPublicLounge(SALON)).resolves.toBe(false);
    expect(said()).toEqual([SALON_GONE_SAID]);
    expect(useLoungeStore.getState().lounges).toEqual([]);
  });

  it('a request is said as gone', async () => {
    mockHouse = gone('P0002', 'SALON_GONE');
    await expect(useLoungeStore.getState().requestMembership(SALON)).resolves.toBe('error');
    expect(said()).toEqual([SALON_GONE_SAID]);
  });

  it('the house before round 11, saying "Lounge not found", is heard the same', async () => {
    mockHouse = gone('P0001', 'Lounge not found');
    await useLoungeStore.getState().joinPublicLounge(SALON);
    await useLoungeStore.getState().requestMembership(SALON);
    expect(said()).toEqual([SALON_GONE_SAID, SALON_GONE_SAID]);
  });
});
