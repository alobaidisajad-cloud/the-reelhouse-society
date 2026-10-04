/**
 * theWallKeepsTheDay.test.tsx — the Lobby's clock moves, and a new day's wall is asked for.
 * ─────────────────────────────────────────────────────────────────────────────
 * The masthead took `new Date()` only when the wall redrew, and the wall redrew
 * only when a read changed: a member who left the app at 9pm and came back in
 * the morning found yesterday's date, "tonight's programme is underway", and
 * yesterday's edition — until they pulled. Now the wall keeps a clock: read
 * again on the hour and when the app comes back, and a wall behind the day
 * (the house chooses each UTC day's edition) is asked for again.
 */
import React, { act } from 'react';
import { AppState } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';

import { Text } from '@/src/components/text';
import { supabase } from '@/src/lib/supabase';
import { datelineOf, useWallClock, whisperFor } from '../Masthead';
import { LobbyWall } from '../LobbyWall';
import { editionDayOf, featureKey, PROGRAMME_KEY, WALL_KEY, type Wall } from '../wallRead';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'kane', role: 'cinephile', tier: null } };
  return { useAuthStore: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel(state) : state), { getState: () => state }) };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }) }));
jest.mock('@/src/utils/openSociety', () => ({ openSociety: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { trending: jest.fn(), detail: jest.fn(), keyArt: jest.fn(), poster: (p: string | null) => (p ? `https://x${p}` : null) },
}));

/** The app's return to the front, as AppState tells it: every 'change' listener the screen added. */
let comeBack: ((state: string) => void)[] = [];
const removed = jest.fn();
beforeEach(() => {
  comeBack = [];
  removed.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, fn: (s: string) => void) => {
    if (type === 'change') comeBack.push(fn);
    return { remove: removed };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Probe({ onRead }: { onRead: (t: Date) => void }) {
  const now = useWallClock(onRead);
  return <Text>{`${whisperFor(now.getHours())} | ${datelineOf(now)}`}</Text>;
}
const shown = (r: ReturnType<typeof render>) => String(r.container.queryAll((n) => n.type === 'Text')[0]?.children.join(''));

describe('the clock', () => {
  it('reads again at the top of the hour: the hour’s line changes with it', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 3, 16, 59, 30) });
    const onRead = jest.fn();
    const r = render(<Probe onRead={onRead} />);
    expect(shown(r)).toContain('the matinée is in session');
    act(() => { jest.advanceTimersByTime(31_000); });
    expect(shown(r)).toContain("tonight's programme is underway");
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead.mock.calls[0][0].getHours()).toBe(17);
  });

  it('reads again when the app comes back: a new day prints its own date and hour', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 3, 21, 0, 0) });
    const onRead = jest.fn();
    const r = render(<Probe onRead={onRead} />);
    expect(shown(r)).toContain('SATURDAY, OCTOBER 3');
    jest.setSystemTime(new Date(2026, 9, 4, 8, 15, 0));
    act(() => { comeBack.forEach((fn) => fn('active')); });
    expect(shown(r)).toContain('the morning screening begins');
    expect(shown(r)).toContain('SUNDAY, OCTOBER 4');
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing running when the Lobby goes', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 3, 12, 0, 0) });
    const onRead = jest.fn();
    const r = render(<Probe onRead={onRead} />);
    act(() => { jest.advanceTimersByTime(60 * 60 * 1000 + 1000); });
    expect(onRead).toHaveBeenCalledTimes(1);   // its hour came, and it read
    r.unmount();
    expect(removed).toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(3 * 60 * 60 * 1000); });
    expect(onRead).toHaveBeenCalledTimes(1);   // and after it went, no hour reads again
  });
});

describe('the wall', () => {
  const wallOf = (edition: string): Wall => ({ edition, log: null, stack: null, filings: [] });
  async function hang(edition: string) {
    const client = testQueryClient();
    jest.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: wallOf(editionDayOf(new Date())), error: null } as never);
    client.setQueryData(WALL_KEY, wallOf(edition));
    const feature = { id: 1, title: 'A Film', poster_path: null };
    client.setQueryData(PROGRAMME_KEY, { feature, bill: [] });
    client.setQueryData(featureKey(1), { id: 1, title: 'A Film', year: null, runtime: null, director: null, art: { path: null, titled: false }, partial: false });
    const r = render(<QueryClientProvider client={client}><LobbyWall /></QueryClientProvider>);
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    return { r, client };
  }
  const asked = () => jest.mocked(supabase.rpc).mock.calls.filter(([n]) => n === 'get_lobby').length;

  it('behind the day when the app comes back: the day’s edition is asked for, and hangs', async () => {
    const { client } = await hang('2026-01-01');
    expect(asked()).toBe(0);
    expect(comeBack.length).toBeGreaterThan(0);
    await act(async () => { comeBack.forEach((fn) => fn('active')); await new Promise((res) => setTimeout(res, 0)); });
    expect(asked()).toBe(1);
    expect(client.getQueryData<Wall>(WALL_KEY)?.edition).toBe(editionDayOf(new Date()));
  });

  it('the day’s own edition is not asked for again: a return never redraws a current wall', async () => {
    await hang(editionDayOf(new Date()));
    expect(comeBack.length).toBeGreaterThan(0);
    await act(async () => { comeBack.forEach((fn) => fn('active')); await new Promise((res) => setTimeout(res, 0)); });
    expect(asked()).toBe(0);
  });
});
