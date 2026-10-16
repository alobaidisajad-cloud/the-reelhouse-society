/**
 * theStandingIsReadAgainWhenRefused.test.ts — utils/standing.ts: a suspension ends at its own
 * moment; only the server's own two sentences are a refusal for standing; and such a refusal reads
 * the member's standing again from the server — once at a time, never for nobody, never into
 * another member's profile, and saying so when the read fails.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { heardRefusal } from '@/src/lib/refusalEvents';
import { isStandingRefusal, refreshStanding, standingOf } from '../standing';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

let mockRow: Record<string, unknown> | null = { id: ME, is_banned: false, suspended_until: '2026-10-20T00:00:00+00:00' };
const mockHouse = supabaseFake({ answer: { profiles: () => (mockRow ? [mockRow] : []) } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
let mockUser: Record<string, unknown> | null = null;
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: mockUser }), setState: (s: { user: Record<string, unknown> }) => { mockUser = s.user; } },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { warn: jest.Mock } };

beforeEach(() => {
  mockUser = { id: ME, username: 'vesper', is_banned: false, suspended_until: null };
  mockRow = { id: ME, is_banned: false, suspended_until: '2026-10-20T00:00:00+00:00' };
  mockHouse.asked.length = 0;
  logger.warn.mockClear();
});

it('ends a suspension at its own moment: suspended a moment before it, not at it', () => {
  const until = new Date(NOW).toISOString();
  expect(standingOf({ suspended_until: until }, NOW - 1)).toEqual({ kind: 'suspended', until });
  expect(standingOf({ suspended_until: until }, NOW)).toBeNull();
  expect(standingOf({ suspended_until: 'not a date' }, NOW)).toBeNull();
  expect(standingOf(null, NOW)).toBeNull();
  expect(standingOf({ is_banned: false }, NOW)).toBeNull();
});

it('takes the server\'s own two sentences as a refusal for standing, whole and alone, its edges\' spaces aside', () => {
  expect(isStandingRefusal('Your account has been silenced by The Society.')).toBe(true);
  expect(isStandingRefusal('  Your account is suspended until 04 Oct 2026 18:00 UTC.  ')).toBe(true);
  expect(isStandingRefusal('Error: Your account has been silenced by The Society.')).toBe(false);
  expect(isStandingRefusal('Your account has been silenced by The Society. And more')).toBe(false);
  expect(isStandingRefusal('Note: Your account is suspended until 04 Oct 2026 18:00 UTC.')).toBe(false);
  expect(isStandingRefusal('Your account is suspended until 04 Oct 2026 18:00 UTC. Appeal')).toBe(false);
  expect(isStandingRefusal('Your account is suspended until .')).toBe(false);
  expect(isStandingRefusal(42)).toBe(false);
});

it('reads the member\'s standing from the server into the profile the app holds, keeping the rest of it', async () => {
  await refreshStanding();
  expect(mockHouse.asked).toEqual([expect.objectContaining({ table: 'profiles', op: 'select', columns: ['is_banned', 'suspended_until'], filters: [['eq', 'id', ME]], one: 'single' })]);
  expect(mockUser).toEqual({ id: ME, username: 'vesper', is_banned: false, suspended_until: '2026-10-20T00:00:00+00:00' });
});

it('reads once at a time: a second ask while one is out is the same read', async () => {
  const first = refreshStanding();
  const second = refreshStanding();
  expect(second).toBe(first);
  await first;
  expect(mockHouse.asked).toHaveLength(1);
  await refreshStanding();
  expect(mockHouse.asked).toHaveLength(2);
});

it('reads nothing for nobody', async () => {
  mockUser = null;
  await refreshStanding();
  expect(mockHouse.asked).toEqual([]);
});

it('says so when the read fails, and keeps the profile as it was', async () => {
  mockRow = null;
  const before = { ...mockUser };
  await refreshStanding();
  expect(logger.warn).toHaveBeenCalledWith('[standing] could not read the member\'s standing', 'JSON object requested, multiple (or no) rows returned');
  expect(mockUser).toEqual(before);
});

it('takes an answer with no row and no error (an empty body) as a failed read, and keeps the profile as it was', async () => {
  const before = { ...mockUser };
  const empty = supabaseFake({ silent: { profiles: true } });
  const realClient = mockHouse.client;
  Object.assign(mockHouse, { client: empty.client });
  try {
    await expect(refreshStanding()).resolves.toBeUndefined();
  } finally {
    Object.assign(mockHouse, { client: realClient });
  }
  expect(empty.asked).toHaveLength(1);
  expect(logger.warn).toHaveBeenCalledWith('[standing] could not read the member\'s standing', undefined);
  expect(mockUser).toEqual(before);
});

it('writes nothing when the member changed, or left, while the read was out', async () => {
  const read = refreshStanding();
  mockUser = { id: OTHER, username: 'other' };
  await read;
  expect(mockUser).toEqual({ id: OTHER, username: 'other' });
  const read2 = refreshStanding();
  mockUser = null;
  await read2;
  expect(mockUser).toBeNull();
});

it('reads the standing again on the server\'s refusal for it, by itself, and on no other refusal', async () => {
  const settle = () => new Promise((done) => setTimeout(done, 0));
  heardRefusal('Your account has been silenced by The Society.');
  await settle();
  expect(mockHouse.asked).toEqual([expect.objectContaining({ table: 'profiles', op: 'select', filters: [['eq', 'id', ME]] })]);
  mockHouse.asked.length = 0;
  heardRefusal('new row violates row-level security policy for table "logs"');
  await settle();
  expect(mockHouse.asked).toEqual([]);
  heardRefusal('  Your account is suspended until 20 Oct 2026 00:00 UTC.  ');
  await settle();
  expect(mockHouse.asked).toHaveLength(1);
});
