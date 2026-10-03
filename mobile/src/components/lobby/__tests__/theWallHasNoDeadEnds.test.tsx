/**
 * theWallHasNoDeadEnds.test.tsx — the Lobby wall, drawn and pressed.
 * ─────────────────────────────────────────────────────────────────────────────
 *   EVERY DOOR LEADS SOMEWHERE THAT EXISTS. Each control on the wall is pressed,
 *   and where it went is looked up among the app's own route files: a path no
 *   file answers is a dead end, however right it looks in the code.
 *   EVERY DOOR HAS A NAME a screen reader can say, and says what it does.
 *   EVERY STATE HAS ITS OWN SHAPE: still shapes while the wall is hung, the
 *   house's notice when a wall never seen cannot be reached, one quiet line
 *   over a kept wall whose refresh failed, the case saying so when the
 *   programme is away, vacant bills that open the door to be the first.
 *   EVERY LINE FITS ITS ROOM. Each house line the wall ACTUALLY draws (the
 *   ledger in parts.tsx) fits the room it was given at its own size, on every
 *   phone and at every text size — where it could not, the layout had to give
 *   way, and did not.
 *   NO COUNTS. The Lobby names the honoured; each page counts them.
 */
import React, { act } from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { LobbyWall } from '../LobbyWall';
import { lineLedger } from '../parts';
import { lineWidth, TYPE, WALL } from '../measure';
import { KEEP_OFF, SIGNOFF } from '../words';
import { featureKey, PROGRAMME_KEY, WALL_KEY, type Wall } from '../wallRead';
import { honourDay, honourLine } from '../LobbyHonour';
import { datelineOf, whisperFor } from '../Masthead';

// ── the phone ───────────────────────────────────────────────────────────────
let mockWindow = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

// ── who is looking ──────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'me', username: 'kane', role: 'user', tier: null };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

// ── where it went ───────────────────────────────────────────────────────────
const mockWent: string[] = [];
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (p: string) => { mockWent.push(p); }, replace: jest.fn(), back: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: (p: string) => { mockWent.push(p); } }),
}));
jest.mock('@/src/utils/openSociety', () => ({ openSociety: (p: string) => { mockWent.push(`society:${p}`); } }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

// ── what it asked ───────────────────────────────────────────────────────────
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    trending: jest.fn(), detail: jest.fn(), keyArt: jest.fn(),
    poster: (p: string | null, size: string) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null),
  },
}));

// ── the route files: a path is a door only if one of them answers it ────────
const APP = join(__dirname, '..', '..', '..', '..', 'app');
const ROUTES: string[][] = (function walk(dir: string): string[][] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
    if (!name.endsWith('.tsx') || name.startsWith('_') || name.startsWith('+')) return [];
    return [relative(APP, full).replace(/\.tsx$/, '').split(/[\\/]/)
      .filter((seg) => !/^\(.*\)$/.test(seg) && seg !== 'index')];
  });
})(APP);
function answered(path: string): boolean {
  const segs = path.replace(/^society:/, '').split('?')[0].split('/').filter(Boolean);
  return ROUTES.some((r) => r.length === segs.length && r.every((seg, i) => seg === segs[i] || (/^\[.+\]$/.test(seg) && segs[i].length > 0)));
}

// ── the house's answers ─────────────────────────────────────────────────────
const author = (username: string, over: Record<string, unknown> = {}) => ({
  id: `a-${username}`, username, avatar_url: null, role: 'user', tier: null, is_founding: false, ...over,
});
const LOG_ID = '11111111-1111-4111-8111-111111111111';
const STACK_ID = '22222222-2222-4222-8222-222222222222';
const FILING = (n: number, over: Record<string, unknown> = {}) => ({
  id: `3333333${n}-3333-4333-8333-333333333333`, kind: ['dossier', 'take', 'seeking'][n - 1], title: ['A Love Letter', 'Against the Remake', null][n - 1],
  text: 'There is a moment in the second act where the camera stops pretending it is not watching.', words: 4800,
  author: author(['sajjadobaidi', 'marguerite', 'halloway'][n - 1], n === 1 ? { role: 'auteur' } : {}), ...over,
});
const FULL: Wall = {
  edition: '2026-09-30',
  log: { id: LOG_ID, words: 'movies can be so sick sometimes', rating: 4, film: { id: 655, title: 'Paris, Texas', poster_path: '/p.jpg' }, author: author('morpho', { role: 'archivist' }) },
  stack: {
    id: STACK_ID, title: 'A Year in the Dark', description: 'A year.', films: 11, author: author('vesper', { role: 'auteur' }),
    posters: [{ film_id: 1, title: 'Weapons', poster_path: '/w.jpg' }, { film_id: 2, title: 'Sinners', poster_path: null }],
  },
  filings: [FILING(1), FILING(2), FILING(3)],
};
const EMPTY: Wall = { edition: '2026-09-30', log: null, stack: null, filings: [] };
// the longest the house can send: names and titles at the edges of what fits
const LONG: Wall = {
  edition: '2026-09-30',
  log: {
    ...FULL.log!, words: 'An argument about grief staged as a road movie; it goes nowhere on purpose and arrives anyway, which is the whole trick of it, and it works.',
    film: { id: 935, title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', poster_path: null },
    author: author('a_member_with_the_longest_handle', { role: 'auteur' }),
  },
  stack: { ...FULL.stack!, title: 'Every Film I Watched Alone In An Empty Cinema On A Tuesday Afternoon', films: 999, author: author('another_very_long_member_name') },
  filings: [FILING(1, { kind: 'ballot' }), FILING(2, { kind: 'wire' }), FILING(3, { kind: 'dossier', words: 12500 })],
};
const PROGRAMME = {
  feature: { id: 1101383, title: 'The End of Oak Street', poster_path: '/oak.jpg', release_date: '2026-08-14' },
  bill: [1, 2, 3, 4].map((i) => ({ id: 500 + i, title: `Bill film ${i}`, poster_path: `/b${i}.jpg` })),
};
const SHEET = { id: 1101383, title: 'The End of Oak Street', year: '2026', runtime: 112, director: 'David Robert Mitchell', art: { path: '/art.jpg', titled: false } };

// ── drawing it ──────────────────────────────────────────────────────────────
/** The wall last drawn (the house's render is synchronous and fills no global screen). */
let screen!: ReturnType<typeof render>;
interface Seed { wall?: Wall | 'pending' | 'fails'; staleWall?: boolean; programme?: 'dark' | 'empty' | 'pending'; sheet?: typeof SHEET | null }
async function drawWall(seed: Seed = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wall = seed.wall ?? FULL;
  jest.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name !== 'get_lobby') return Promise.resolve({ data: null, error: null });
    if (wall === 'pending') return new Promise(() => {});
    if (wall === 'fails' || seed.staleWall) return Promise.resolve({ data: null, error: { message: 'offline' } });
    return Promise.resolve({ data: wall, error: null });
  }) as never);
  if (typeof wall === 'object') client.setQueryData(WALL_KEY, wall, seed.staleWall ? { updatedAt: 1 } : undefined);
  jest.mocked(tmdb.trending).mockImplementation((() =>
    seed.programme === 'pending' ? new Promise(() => {})
      : seed.programme === 'dark' ? Promise.reject(new Error('unreachable'))
      : Promise.resolve({ results: seed.programme === 'empty' ? [] : [PROGRAMME.feature, ...PROGRAMME.bill] })) as never);
  if (!seed.programme) {
    client.setQueryData(PROGRAMME_KEY, PROGRAMME);
    if (seed.sheet !== null) client.setQueryData(featureKey(PROGRAMME.feature.id), seed.sheet ?? SHEET);
  }
  jest.mocked(tmdb.detail).mockResolvedValue(null as never);
  jest.mocked(tmdb.keyArt).mockResolvedValue(null as never);
  screen = render(<QueryClientProvider client={client}><LobbyWall /></QueryClientProvider>);
  // until every read that can answer has (a read left pending on purpose never will)
  for (let i = 0; i < 20 && client.isFetching() > (wall === 'pending' ? 1 : 0) + (seed.programme === 'pending' ? 1 : 0); i++) {
    await act(async () => { await new Promise((res) => setTimeout(res, 5)); });
  }
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return client;
}

/** A control: what a screen reader calls a link or a button. */
const isDoor = (n: TestInstance) => n.props.accessibilityRole === 'link' || n.props.accessibilityRole === 'button';
const doorsOf = (root: TestInstance) => root.queryAll((n) => n !== root && isDoor(n));
const allDoors = () => doorsOf(screen.container);

/** Every control on the wall, pressed one by one: where each went. */
async function pressEveryDoor(): Promise<{ label: string; went: string | null }[]> {
  const pressed: { label: string; went: string | null }[] = [];
  for (const door of allDoors()) {
    const before = mockWent.length;
    await fireEvent.press(door);
    pressed.push({ label: String(door.props.accessibilityLabel ?? ''), went: mockWent.length > before ? mockWent[mockWent.length - 1] : null });
  }
  return pressed;
}

/** Printed on the wall — spoken or not (a line a parent's label already says is hidden from a screen reader, not from the eye). */
const printed = (text: string) => screen.queryAllByText(text, { includeHiddenElements: true }).length > 0;

const allText = () => screen.container.queryAll((n) => n.type === 'Text')
  .map((n) => n.children.filter((c): c is string => typeof c === 'string').join(''))
  .join('\n');

beforeEach(() => {
  mockWent.length = 0;
  mockUser = { id: 'me', username: 'kane', role: 'user', tier: null };
  mockWindow = { width: 393, height: 852, scale: 3, fontScale: 1 };
  jest.mocked(supabase.rpc).mockReset();
});

describe('every door leads somewhere that exists', () => {
  it('on a full wall: each control opens its own page, and every page is a route file', async () => {
    await drawWall();
    const doors = await pressEveryDoor();
    const went = doors.map((d) => d.went);
    expect(went).toEqual(expect.arrayContaining([
      `/film/${PROGRAMME.feature.id}`, '/film/501', '/film/502', '/darkroom',
      `/log/${LOG_ID}`, '/film/655', '/user/morpho',
      `/stacks/${STACK_ID}`, '/user/vesper',
      '/dispatch', `/dispatch/${FILING(1).id}`, `/dispatch/${FILING(2).id}`, `/dispatch/${FILING(3).id}`,
      '/user/sajjadobaidi', '/user/marguerite', '/user/halloway',
      'society:/membership?rank=archivist', 'society:/membership?rank=auteur',
    ]));
    // not one control that goes nowhere
    expect(doors.filter((d) => d.went === null)).toEqual([]);
    // and not one that goes to a page the app does not have
    expect(went.filter((p) => !answered(p as string))).toEqual([]);
  });

  it('the route check itself can say no', () => {
    expect(answered('/film/603')).toBe(true);
    expect(answered('/dispatch/compose')).toBe(true);
    expect(answered('/membership?rank=auteur')).toBe(true);
    expect(answered('/films/603')).toBe(false);
    expect(answered('/stack/1')).toBe(false);
    expect(answered('/film')).toBe(false);
  });

  it('a house with nothing yet to feature: each vacant bill opens the door to be the first', async () => {
    await drawWall({ wall: EMPTY });
    const went = (await pressEveryDoor()).map((d) => d.went);
    expect(went).toEqual(expect.arrayContaining(['/log-modal', '/list-modal', '/dispatch/compose']));
    expect(went.filter((p) => p === null || !answered(p))).toEqual([]);
    expect(printed('THREE COLUMNS VACANT')).toBe(true);
    expect(printed('Nothing has been filed yet.')).toBe(true);
  });

  it('one filing: the rest of the columns stand vacant, and say the page has room', async () => {
    await drawWall({ wall: { ...FULL, filings: [FILING(1)] } });
    expect(printed('TWO COLUMNS VACANT')).toBe(true);
    expect(printed('The page has room.')).toBe(true);
    expect(printed('THREE COLUMNS VACANT')).toBe(false);
    expect((await pressEveryDoor()).map((d) => d.went)).toContain('/dispatch/compose');
  });

  it('an Archivist is offered only the rank above them; an Auteur is thanked, and their ticket is their own file', async () => {
    mockUser = { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist' };
    await drawWall();
    let went = (await pressEveryDoor()).map((d) => d.went);
    expect(went).toContain('society:/membership?rank=auteur');
    expect(went).not.toContain('society:/membership?rank=archivist');
    expect(printed('You keep the record.')).toBe(true);
    expect(printed('The house has seen your taste.')).toBe(false);
    screen.unmount();

    mockWent.length = 0;
    mockUser = { id: 'me', username: 'kane', role: 'auteur', tier: 'auteur' };
    await drawWall();
    went = (await pressEveryDoor()).map((d) => d.went);
    expect(went.filter((p) => p?.startsWith('society:'))).toEqual([]);
    expect(went).toContain('/profile');
    expect(printed('Thanks You')).toBe(true);
    expect(printed('ENLIST AS')).toBe(false);
  });
});

describe('every door has a name', () => {
  it('each control says what it is and where it goes', async () => {
    mockUser = { id: 'me', username: 'kane', role: 'admin', tier: null };
    await drawWall();
    const doors = allDoors();
    expect(doors.length).toBeGreaterThan(20);
    for (const door of doors) {
      expect([door.props.accessibilityLabel, typeof door.props.accessibilityLabel === 'string' && door.props.accessibilityLabel.length > 3]).toEqual([door.props.accessibilityLabel, true]);
      expect(['link', 'button']).toContain(door.props.accessibilityRole);
    }
  });

  it('no control holds another: a door is one element to a screen reader, and one inside it could never be reached', async () => {
    mockUser = { id: 'me', username: 'kane', role: 'admin', tier: null };
    await drawWall();
    const doors = allDoors();
    expect(doors.length).toBeGreaterThan(20);
    for (const door of doors) {
      expect([door.props.accessibilityLabel, doorsOf(door).map((d) => d.props.accessibilityLabel)]).toEqual([door.props.accessibilityLabel, []]);
    }
  });
});

describe('keep off the Lobby', () => {
  it('is drawn for an admin only — on the log, the stack and every filing', async () => {
    await drawWall();
    expect(screen.queryAllByLabelText(/off the Lobby/)).toHaveLength(0);
    screen.unmount();
    mockUser = { id: 'me', username: 'kane', role: 'admin', tier: null };
    await drawWall();
    expect(screen.getAllByLabelText(/off the Lobby/).map((n) => n.props.accessibilityLabel)).toEqual([
      'Keep this log off the Lobby', 'Keep this stack off the Lobby',
      'Keep this filing off the Lobby', 'Keep this filing off the Lobby', 'Keep this filing off the Lobby',
    ]);
  });

  it('asks first, then asks the house, then reads the wall again', async () => {
    mockUser = { id: 'me', username: 'kane', role: 'admin', tier: null };
    const client = await drawWall();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(screen.getByLabelText('Keep this log off the Lobby'));
    expect(supabase.rpc).not.toHaveBeenCalledWith('set_lobby_withheld', expect.anything());
    const buttons = alert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => Promise<void> }[];
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await act(async () => { await buttons[1].onPress?.(); });
    expect(supabase.rpc).toHaveBeenCalledWith('set_lobby_withheld', { p_kind: 'log', p_target: LOG_ID, p_keep_off: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: WALL_KEY });
    alert.mockRestore();
  });
});

describe('every state has its own shape', () => {
  it('while the wall is being hung: still shapes, never a vacant bill', async () => {
    await drawWall({ wall: 'pending' });
    expect(screen.getByLabelText('The Lobby is being hung')).toBeTruthy();
    expect(screen.queryByText('No log yet.')).toBeNull();
  });

  it('a wall never seen that cannot be reached: the house says so, and asks again', async () => {
    await drawWall({ wall: 'fails' });
    expect(screen.queryByLabelText('The Lobby is being hung')).toBeNull();
    expect(screen.queryByText('No log yet.')).toBeNull();
    const retry = screen.getAllByLabelText(/try again/i);
    expect(retry.length).toBeGreaterThan(0);
  });

  it('a kept wall whose refresh failed: the wall stays, and one line says so', async () => {
    await drawWall({ staleWall: true });
    expect(screen.getByText('Could not refresh —')).toBeTruthy();
    expect(screen.getByText('movies can be so sick sometimes')).toBeTruthy();
  });

  it('a fresh wall says nothing about refreshing', async () => {
    await drawWall();
    expect(screen.queryByText('Could not refresh —')).toBeNull();
  });

  it('the programme unreachable, or with no film at all: the case says so — never a shape that waits for ever', async () => {
    await drawWall({ programme: 'dark' });
    expect(screen.getByLabelText('Transmission interrupted')).toBeTruthy();
    screen.unmount();
    await drawWall({ programme: 'empty' });
    expect(screen.getByLabelText('Transmission interrupted')).toBeTruthy();
    screen.unmount();
    await drawWall({ programme: 'pending' });
    expect(screen.queryByLabelText('Transmission interrupted')).toBeNull();
    expect(screen.getByLabelText('The programme is arriving')).toBeTruthy();
  });

  it('a titled poster: the house lays no name over it (the film prints its own)', async () => {
    await drawWall({ sheet: { ...SHEET, art: { path: '/own.jpg', titled: true } } });
    expect(screen.queryByText('The End of Oak Street')).toBeNull();
    expect(screen.getByLabelText(/^Now showing: The End of Oak Street/)).toBeTruthy();
  });
});

describe('the print', () => {
  /**
   * react-native-svg keeps only a stop's stopOpacity: the alpha of its colour is
   * dropped (extractGradient: `(color & 0x00ffffff) | (alpha << 24)`), so a ray
   * set in rgba(…, 0.10) is printed SOLID, over the words. Every stop the wall
   * draws must say its strength in stopOpacity, with a colour that is whole.
   */
  /** Every element React holds for the wall — a Stop draws nothing of its own, so it is found here, not among what is drawn. */
  const elements = () => {
    type Fiber = { memoizedProps: Record<string, unknown> | null; child: Fiber | null; sibling: Fiber | null; return: Fiber | null };
    let root = screen.container.queryAll(() => true)[0].unstable_fiber as unknown as Fiber;
    while (root.return) root = root.return;
    const out: Record<string, unknown>[] = [];
    const walk = (f: Fiber | null) => { for (; f; f = f.sibling) { if (f.memoizedProps) out.push(f.memoizedProps); walk(f.child); } };
    walk(root);
    return out;
  };

  it('every gradient stop is a whole colour, its strength in stopOpacity', async () => {
    await drawWall();
    const stops = elements().filter((p) => p.stopColor !== undefined);
    expect(stops.length).toBeGreaterThanOrEqual(6);
    const translucent = stops.map((p) => String(p.stopColor))
      .filter((c) => /^rgba|^hsla/i.test(c) || /^#[0-9a-f]{8}$/i.test(c) || /^#[0-9a-f]{4}$/i.test(c));
    expect(translucent).toEqual([]);
  });

  it('no two drawings share a paint: every gradient and pattern id on the wall is its own', async () => {
    await drawWall();
    const ids = screen.container.queryAll((n) => /^RNSVG(RadialGradient|LinearGradient|Pattern)$/.test(n.type))
      .map((n) => String(n.props.name));
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('no counts', () => {
  it('the wall names the honoured and counts nothing: the only figures it prints are facts of the pieces', async () => {
    await drawWall();
    const text = allText();
    expect(text).toContain('ON PARIS, TEXAS');
    // today's number and date · the film's year and length · the stack's films · the essay's read · the filings' places
    const facts = new Set([...(datelineOf(new Date()).match(/[0-9]+/g) ?? []), '2026', '112', '11', '24', '1', '2', '3']);
    expect((text.match(/[0-9]+/g) ?? []).filter((n) => !facts.has(n))).toEqual([]);
    expect(text).not.toMatch(/[0-9]\s*(certif|critique|endorse|view|like|follower|comment|vote)/i);
  });

  it('the figure check can say no', async () => {
    await drawWall({ wall: { ...FULL, stack: { ...FULL.stack!, films: 37 } } });
    expect(allText().match(/[0-9]+/g)).toContain('37');
  });
});

describe('every line fits its room', () => {
  const PHONES = [320, 360, 375, 393, 412, 430, 744];
  const HEIGHTS: Record<number, number> = { 320: 568, 360: 780, 375: 667, 393: 852, 412: 915, 430: 932, 744: 1133 };
  const VIEWERS = [{ role: 'user' }, { role: 'archivist', tier: 'archivist' }, { role: 'auteur', tier: 'auteur' }, { role: 'admin' }];
  const STATES: Seed[] = [{}, { wall: LONG }, { wall: EMPTY }, { wall: { ...FULL, filings: [FILING(1)] } }, { staleWall: true }, { programme: 'dark' }];

  it.each(PHONES)('at %ipt wide, at its own text size and at the largest', async (width) => {
    const misfits: string[] = [];
    let drawn = 0;
    for (const fontScale of [1, 1.35, 2]) {
      for (const viewer of VIEWERS) {
        for (const seed of STATES) {
          mockWindow = { width, height: HEIGHTS[width], scale: 3, fontScale };
          mockUser = { id: 'me', username: 'kane', tier: null, ...viewer };
          lineLedger.lines = [];
          await drawWall(seed);
          for (const { type, text, room } of lineLedger.lines) {
            drawn++;
            const t = TYPE[type];
            const at1 = lineWidth(text, t.face, t.size, 1, t.spacing);
            if (!(room > 0) || at1 > room + 0.5) misfits.push(`${type} "${text}" is ${at1.toFixed(1)} in ${room.toFixed(1)} (×${fontScale}, ${viewer.role})`);
          }
          screen.unmount();
        }
      }
    }
    lineLedger.lines = null;
    expect(drawn).toBeGreaterThan(500);
    expect([...new Set(misfits)]).toEqual([]);
  }, 60_000);

  it('the lines it once could not see are in it, told the rooms they truly stand in', async () => {
    // The sign-off was a plain Text, so never in the ledger; an admin's switch told
    // it had 200pt, where a credit strip on a 375pt phone has 142.5 — and was cut.
    mockWindow = { width: 375, height: 667, scale: 3, fontScale: 1 };
    mockUser = { id: 'me', username: 'kane', role: 'admin', tier: null };
    lineLedger.lines = [];
    try {
      await drawWall();
      const lines = lineLedger.lines;
      const wallW = 375 - WALL.gutter * 2;
      expect(lines.filter((l) => l.text === SIGNOFF).map((l) => l.room)).toEqual([wallW]);
      // the log and the stack stand side by side here: each strip is a half bill, less its insets
      const strip = (wallW - WALL.gap) / 2 - WALL.halfPad * 2 - WALL.creditInset;
      const switches = lines.filter((l) => l.text === KEEP_OFF).map((l) => l.room);
      expect(switches).toHaveLength(5);
      expect(switches.slice(0, 2)).toEqual([strip, strip]);
      for (const room of switches) expect(lineWidth(KEEP_OFF, TYPE.cta.face, TYPE.cta.size, 1, TYPE.cta.spacing)).toBeLessThanOrEqual(room + 0.5);
    } finally {
      lineLedger.lines = null;
      screen.unmount();
    }
  });

  it('the ledger is closed in the app: it records nothing unless a test opens it', () => {
    expect(lineLedger.lines).toBeNull();
  });
});

describe('the masthead and the honour', () => {
  it('the hour’s line changes at five, noon, five and ten', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22].map(whisperFor)).toEqual([
      'the midnight reel is spinning', 'the morning screening begins', 'the morning screening begins', 'the matinée is in session',
      'the matinée is in session', "tonight's programme is underway", "tonight's programme is underway", 'the midnight reel is spinning',
    ]);
  });

  it('the dateline is the Dispatch’s running head, from the phone’s own day', () => {
    expect(datelineOf(new Date(2026, 8, 30, 23, 30))).toMatch(/^No\. \d+ · WEDNESDAY, SEPTEMBER 30$/);
  });

  it('the honour names the day, with the year only when it is not this one; a day it cannot read, it does not name', () => {
    const now = new Date(2026, 8, 30);
    expect(honourDay('2026-09-30', now)).toBe('30 SEPTEMBER');
    expect(honourDay('2025-01-02', now)).toBe('2 JANUARY 2025');
    expect(honourLine('2026-09-30', now)).toBe('✦ FEATURED IN THE LOBBY · 30 SEPTEMBER');
    for (const bad of ['', '2026-13-01', '2026-00-10', '2026-09-32', '30/09/2026', '2026-9-30']) expect(honourDay(bad, now)).toBeNull();
    expect(honourLine('nonsense', now)).toBeNull();
  });
});
