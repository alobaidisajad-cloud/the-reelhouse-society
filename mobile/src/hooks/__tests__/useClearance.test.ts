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
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (select: (s: { user: unknown }) => unknown) => select({ user: mockUser }),
}));
jest.mock('@/src/utils/gateTelemetry', () => ({ recordGateEvent: jest.fn() }));
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { selection: jest.fn() } }));
jest.mock('@/src/utils/openSociety', () => ({ ...jest.requireActual('@/src/utils/openSociety'), openSociety: jest.fn() }));

/** Features of each rank, from gatedFeatures.ts. */
const ARCHIVIST = 'the-lounge';
const AUTEUR = 'essays';

const member = (tier: string, more: Record<string, unknown> = {}) => ({ id: 'u1', tier, role: 'cinephile', ...more });

beforeEach(() => {
  mockUser = null;
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
