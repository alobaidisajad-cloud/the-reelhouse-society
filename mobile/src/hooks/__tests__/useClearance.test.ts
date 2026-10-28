/**
 * useClearance, asked directly: the one answer to every rank gate. Who it opens to (a rank at or
 * above the feature's, never someone signed out), the rank it names, the standing it reads (lapsed
 * or stranger), what it does with a feature the registry lacks, and what a tap on its rope does.
 * Every screen test that meets it stands it in; this is where it is shown to answer right.
 */
import { renderHook } from '@testing-library/react-native';

import { useClearance } from '@/src/hooks/useClearance';
import { recordGateEvent } from '@/src/utils/gateTelemetry';
import { openSociety } from '@/src/utils/openSociety';
import TactileEngine from '@/src/utils/TactileEngine';

let mockUser: Record<string, unknown> | null = null;
const mockReread = jest.fn();
/** How long ago the member's rank was read from the house: just now, unless a case says not. */
let mockRankAge = 0;
jest.mock('@/src/stores/auth', () => ({
  rankAge: () => mockRankAge,
  useAuthStore: Object.assign(
    (select: (s: { user: unknown }) => unknown) => select({ user: mockUser }),
    { getState: () => ({ user: mockUser, rereadProfile: mockReread }) },
  ),
}));
jest.mock('@/src/utils/gateTelemetry', () => ({ recordGateEvent: jest.fn() }));
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { selection: jest.fn() } }));
jest.mock('@/src/utils/openSociety', () => ({ ...jest.requireActual('@/src/utils/openSociety'), openSociety: jest.fn() }));

/** Features of each rank, from gatedFeatures.ts. */
const ARCHIVIST = 'the-lounge';
const AUTEUR = 'essays';

/** A member whose profile is read (its columns are in hand), so their rank is known. */
const member = (tier: string, more: Record<string, unknown> = {}) => ({ id: 'u1', tier, role: 'cinephile', is_social_private: false, ...more });

it('a member whose profile is not yet read is "reading": nothing held, and a tap asks for the profile, never the Society', async () => {
  // As a sign-in sets them: the auth account alone, its rank unread.
  mockUser = { id: 'u1', email: 'm@example.com' };
  const gate = await clearance(AUTEUR);
  expect(gate).toMatchObject({ held: false, standing: 'reading' });
  gate.open();
  expect(mockReread).toHaveBeenCalled();
  expect(openSociety).not.toHaveBeenCalled();
  expect(recordGateEvent).not.toHaveBeenCalled();
  // Read, the same member is answered by their rank.
  mockUser = member('auteur');
  expect(await clearance(AUTEUR)).toMatchObject({ held: true, standing: 'stranger' });
});

beforeEach(() => {
  mockUser = null;
  mockRankAge = 0;
  jest.clearAllMocks();
});

const clearance = async (featureId: string, returnTo?: string) => (await renderHook(() => useClearance(featureId, returnTo))).result.current;

it('opens to a member whose rank reaches the feature\'s, and to no one below it', async () => {
  const heldBy = async (featureId: string) => {
    const out: Record<string, boolean> = {};
    for (const tier of ['cinephile', 'archivist', 'auteur', 'founding']) {
      mockUser = member(tier);
      out[tier] = (await clearance(featureId)).held;
    }
    return out;
  };
  expect(await heldBy(ARCHIVIST)).toEqual({ cinephile: false, archivist: true, auteur: true, founding: true });
  expect(await heldBy(AUTEUR)).toEqual({ cinephile: false, archivist: false, auteur: true, founding: true });
});

it('reads the member\'s highest rank, their role\'s or their store\'s', async () => {
  mockUser = member('cinephile', { role: 'auteur' });
  expect((await clearance(AUTEUR)).held).toBe(true);
  mockUser = member('cinephile', { is_founding: true });
  expect((await clearance(AUTEUR)).held).toBe(true);
});

it('opens nothing to someone signed out, not even the first rank', async () => {
  mockUser = null;
  expect(await clearance(ARCHIVIST)).toMatchObject({ held: false, rank: 'archivist', standing: 'stranger' });
});

it('names the rank that opens the feature', async () => {
  mockUser = member('cinephile');
  expect((await clearance(ARCHIVIST)).rank).toBe('archivist');
  expect((await clearance(AUTEUR)).rank).toBe('auteur');
});

it('calls a member who held a rank and stopped lapsed, and one who never did a stranger', async () => {
  mockUser = member('cinephile', { entitlement_source: 'revenuecat' });
  expect((await clearance(AUTEUR)).standing).toBe('lapsed');
  mockUser = member('cinephile', { entitlement_source: null });
  expect((await clearance(AUTEUR)).standing).toBe('stranger');
});

it('refuses, in development, a feature the registry does not have, naming it', async () => {
  mockUser = member('auteur');
  await expect(renderHook(() => useClearance('no-such-feature'))).rejects.toThrow(
    'useClearance: no feature "no-such-feature" in gatedFeatures.ts. A gate with no registry row is a locked door with no sign on it.',
  );
});

it('outside development, asks a feature the registry lacks for the first rank, never for none', async () => {
  const g = global as unknown as { __DEV__: boolean };
  const dev = g.__DEV__;
  g.__DEV__ = false;
  try {
    mockUser = member('cinephile');
    expect(await clearance('no-such-feature')).toMatchObject({ held: false, rank: 'archivist' });
    mockUser = member('archivist');
    expect((await clearance('no-such-feature')).held).toBe(true);
  } finally {
    g.__DEV__ = dev;
  }
});

it('on a tap: felt, heard with why, and the Society page opened with the way back', async () => {
  mockUser = member('cinephile', { entitlement_source: 'revenuecat' });
  (await clearance(AUTEUR, '/log/new')).open();
  expect(TactileEngine.selection).toHaveBeenCalledTimes(1);
  expect(recordGateEvent).toHaveBeenCalledWith('gate_tapped', { featureId: AUTEUR, rank: 'auteur', standing: 'lapsed' });
  expect(openSociety).toHaveBeenCalledWith('/membership?reason=essays&rank=auteur&returnTo=%2Flog%2Fnew');
});

it('with no way back given, opens the Society page to return where the member was', async () => {
  mockUser = member('cinephile');
  (await clearance(ARCHIVIST)).open();
  expect(openSociety).toHaveBeenCalledWith('/membership?reason=the-lounge&rank=archivist');
});

it('answers a change of feature or member at once, its tap included', async () => {
  mockUser = member('archivist');
  const hook = await renderHook(({ id }: { id: string }) => useClearance(id), { initialProps: { id: ARCHIVIST } });
  expect(hook.result.current).toMatchObject({ held: true, rank: 'archivist' });
  await hook.rerender({ id: AUTEUR });
  expect(hook.result.current).toMatchObject({ held: false, rank: 'auteur' });
  mockUser = member('cinephile', { entitlement_source: 'revenuecat' });
  await hook.rerender({ id: AUTEUR });
  hook.result.current.open();
  expect(recordGateEvent).toHaveBeenLastCalledWith('gate_tapped', { featureId: AUTEUR, rank: 'auteur', standing: 'lapsed' });
});

/** The read's answer, through the deadline it raced, taken in. */
const settled = () => new Promise((done) => setTimeout(done, 0));
describe('a rank bought elsewhere is read again at the rope (P4.17)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('read over a minute ago and now held: the act opens, never the Society page', async () => {
    mockUser = member('cinephile');
    mockRankAge = 61_000;
    mockReread.mockImplementation(async () => { mockUser = member('archivist'); return true; });
    const act = jest.fn();
    (await clearance(ARCHIVIST)).openOr(act);
    await settled();
    expect(mockReread).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenCalledTimes(1);
    expect(openSociety).not.toHaveBeenCalled();
  });

  it('read over a minute ago and still not held: the Society page, once the read answers', async () => {
    mockUser = member('cinephile');
    mockRankAge = 61_000;
    mockReread.mockResolvedValue(true);
    const act = jest.fn();
    (await clearance(ARCHIVIST)).openOr(act);
    expect(openSociety).not.toHaveBeenCalled();
    await settled();
    expect(openSociety).toHaveBeenCalledWith('/membership?reason=the-lounge&rank=archivist');
    expect(act).not.toHaveBeenCalled();
  });

  it('a read that does not answer holds the page back a second and a half, no longer', async () => {
    jest.useFakeTimers();
    mockUser = member('cinephile');
    mockRankAge = Infinity;
    mockReread.mockReturnValue(new Promise(() => {}));
    (await clearance(ARCHIVIST)).open();
    await jest.advanceTimersByTimeAsync(1_499);
    expect(openSociety).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(openSociety).toHaveBeenCalledTimes(1);
  });

  it('read within the minute: the page opens at once, and nothing is asked', async () => {
    mockUser = member('cinephile');
    mockRankAge = 59_000;
    (await clearance(ARCHIVIST)).open();
    expect(openSociety).toHaveBeenCalledTimes(1);
    expect(mockReread).not.toHaveBeenCalled();
  });

  it('a second tap while the rank is read asks nothing more, and opens one page', async () => {
    mockUser = member('cinephile');
    mockRankAge = Infinity;
    let answer!: (v: boolean) => void;
    mockReread.mockReturnValue(new Promise<boolean>((done) => { answer = done; }));
    const rope = await clearance(ARCHIVIST);
    rope.open();
    rope.open();
    expect(mockReread).toHaveBeenCalledTimes(1);
    answer(true);
    await settled();
    expect(openSociety).toHaveBeenCalledTimes(1);
  });
});
