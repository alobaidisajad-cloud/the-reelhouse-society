/**
 * theKeyLeadsWhereItSays.test.tsx — a brass key is a promise about a door.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every feed card carries a LOUNGE key. For a member without the rank it walked
 * them to '/lounge', on the promise that the tab would refuse them and explain.
 * Then the corridor opened to everyone and stopped refusing — so tapping "share
 * this critique" dropped a member into a list of salons with their critique
 * left behind and no word about why, while the screen reader still announced
 * "clearance required".
 *
 * Sharing into a salon is SPEAKING there. The key now opens the Society, told
 * what was reached for. Rendered for real: ActionDeck had no behavioural tests
 * at all (see ActionDeck.test.tsx, which says so), so this is also the first
 * time its rank gate has actually been exercised.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const { create } = jest.requireActual('zustand');
  return { useAuthStore: create(() => ({ user: null })) };
});
jest.mock('@/src/stores/films', () => {
  const state = {
    _endorsedIndex: {}, _watchlistIndex: {},
    toggleEndorse: jest.fn(), addToWatchlist: jest.fn(), removeFromWatchlist: jest.fn(),
  };
  return { useWatchlistStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockOpenSociety = jest.fn();
jest.mock('@/src/utils/openSociety', () => ({
  openSociety: (...a: unknown[]) => mockOpenSociety(...a),
  societyHref: jest.requireActual('@/src/utils/openSociety').societyHref,
}));
jest.mock('@/src/utils/gateTelemetry', () => ({ recordGateEvent: jest.fn() }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { selection: jest.fn(), mutate: jest.fn(), navigate: jest.fn(), destroy: jest.fn() },
}));
let mockShareSheetVisible = false;
jest.mock('@/src/components/ShareToLoungeModal', () => ({
  __esModule: true,
  default: (p: { visible: boolean }) => { mockShareSheetVisible = p.visible; return null; },
}));

// eslint-disable-next-line import/first
import { ActionDeck } from '../ActionDeck';
// eslint-disable-next-line import/first
import { useAuthStore } from '@/src/stores/auth';
// eslint-disable-next-line import/first
import { useClearance } from '@/src/hooks/useClearance';

const card = (
  <ActionDeck itemId="log-1" filmId={603} filmTitle="The Matrix" posterPath={null} ownerUsername="someone-else" />
);
const setUser = (user: Record<string, unknown> | null) =>
  act(() => { (useAuthStore as unknown as { setState: (s: object) => void }).setState({ user }); });

const cinephile = { id: 'u1', username: 'wren', tier: 'free', role: 'cinephile' };
const lapsed = { ...cinephile, entitlement_source: 'revenuecat' };
const archivist = { ...cinephile, tier: 'archivist' };

beforeEach(() => {
  mockPush.mockReset();
  mockOpenSociety.mockReset();
  mockShareSheetVisible = false;
});

describe('the key leads where it says', () => {
  it('a member without the rank is taken to the Society — never dropped in the corridor', async () => {
    await setUser(cinephile);
    const api = render(card);
    await fireEvent.press(api.getByLabelText(/^Share to a lounge\. Clearance required/));

    expect(mockOpenSociety).toHaveBeenCalledWith('/membership?reason=lounge-speaking&rank=archivist');
    // The defect, exactly.
    expect(mockPush).not.toHaveBeenCalledWith('/lounge');
    expect(mockShareSheetVisible).toBe(false);
  });

  it('it says so aloud, in the rope’s own words', async () => {
    await setUser(cinephile);
    expect(render(card).getByLabelText(
      'Share to a lounge. Clearance required. The Archivist opens this. Opens the Society.',
    )).toBeTruthy();
  });

  it('a lapsed member hears that their dues lapsed, not a stranger’s pitch', async () => {
    await setUser(lapsed);
    expect(render(card).getByLabelText(
      'Share to a lounge. Your dues have lapsed. The Archivist opens this again. Opens the Society.',
    )).toBeTruthy();
  });

  it('a signed-out visitor is asked to sign in — The Reel is open to them now', async () => {
    await setUser(null);
    const api = render(card);
    await fireEvent.press(api.getByLabelText('Share to a lounge. Sign in first.'));
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockOpenSociety).not.toHaveBeenCalled();
  });

  it('a member who may speak gets the share sheet, and no rope', async () => {
    await setUser(archivist);
    const api = render(card);
    await fireEvent.press(api.getByLabelText('Share to a lounge'));
    expect(mockShareSheetVisible).toBe(true);
    expect(mockOpenSociety).not.toHaveBeenCalled();
  });
});

describe('the other two places that promised a locked corridor', () => {
  // Read as source: both screens need a TMDB query and a navigator to render,
  // and what is being pinned is which door they name, not how they draw.
  const code = (p: string) => readFileSync(join(__dirname, '..', '..', '..', '..', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  it('the person page ropes the share, and no longer walks anyone to the corridor', () => {
    const page = code('app/person/[id].tsx');
    const share = page.slice(page.indexOf('const handleLoungeShare'), page.indexOf('}, [user, canShare'));
    expect(share).toMatch(/nav\.push\('\/social-modal'/); // tripwire: the real handler
    expect(share).toMatch(/if \(!canShare\) \{\s*openShare\(\);/);
    expect(share).not.toMatch(/'\/lounge'/);
    expect(page).toMatch(/useClearance\('lounge-speaking', `\/person\/\$\{id\}`\)/);
    // And the button says where it leads, instead of "requires a higher rank".
    expect(code('src/components/person/PersonHero.tsx')).toMatch(/accessibilityLabel=\{shareLabel\}/);
  });

  it('the film tray stops calling an open room locked', () => {
    const layout = code('src/components/film/FilmDetailLayout.tsx');
    const act = layout.slice(layout.indexOf("key: 'lounge'"), layout.indexOf('return acts;'));
    expect(act).toMatch(/Icon: TrayIcons\.MessageCircle,/);
    expect(act).not.toMatch(/KeyRound/);
    expect(act).not.toMatch(/Archivists and above/);
    // The same words the corridor header and the room's button already use.
    expect(act).toMatch(/'Listen in\. Archivists take a seat\.'/);
    // One line, and the tray caps a gloss at one line — measured against the
    // longest gloss already in the tray, 36 characters.
    expect('Listen in. Archivists take a seat.'.length).toBeLessThanOrEqual(36);
    // No fork left on rank in what the act DOES.
    const open = layout.slice(layout.indexOf('const openLounge'), layout.indexOf('}, [isAuthenticated, handleOpenLounge]);'));
    expect(open).toMatch(/handleOpenLounge\(\);/);
    expect(open).not.toMatch(/isArchivist/);
  });
});

describe('a rope in every card does not repaint the feed', () => {
  /**
   * useClearance selected the whole user object. That was harmless on six
   * screens and is not in a feed: every card re-rendered whenever anything on
   * the member changed — an avatar, a bio, a follower count. It now selects two
   * primitives, which compare equal unless the rank or the standing moved.
   */
  function Probe({ onRender }: { onRender: () => void }) {
    onRender();
    useClearance('lounge-speaking');
    return null;
  }

  it('an edit that touches neither rank nor standing costs no render', async () => {
    await setUser(cinephile);
    const renders = jest.fn();
    render(<Probe onRender={renders} />);
    const before = renders.mock.calls.length;

    await setUser({ ...cinephile, bio: 'Nitrate or nothing.', avatar_url: 'https://x/y.jpg' });
    expect(renders.mock.calls.length).toBe(before);
  });

  it('but a rank that changes is seen at once', async () => {
    await setUser(cinephile);
    const renders = jest.fn();
    render(<Probe onRender={renders} />);
    const before = renders.mock.calls.length;

    await setUser(archivist);
    expect(renders.mock.calls.length).toBeGreaterThan(before);
  });
});
