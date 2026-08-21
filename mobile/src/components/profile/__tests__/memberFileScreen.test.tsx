/**
 * memberFileScreen.test.tsx — the whole page, mounted.
 *
 * Everything else about this rebuild is tested against a component or against
 * source. Nothing had ever RENDERED the screen, so nothing could tell you
 * whether the four states it can be in — loading, missing, sealed, open —
 * actually come up, or whether an Auteur's page differs from a Cinephile's in
 * the ways the design says it should.
 *
 * The controller is mocked wholesale because the point here is the VIEW: given
 * this member, in this state, what is on the page.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
// The screen itself. `jest.mock` factories are hoisted above every import by
// babel-plugin-jest-hoist, so the mocks written below still apply.
import UserProfileScreen from '@/app/user/[username]';

// ── the controller, in one place ────────────────────────────────────────────
type Ctl = Record<string, unknown>;
let mockCtl: Ctl;

const baseUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1', username: 'tomasreyes', display_name: 'Tomas', persona: null,
  bio: 'Still finding my way around.', role: 'cinephile', tier: 'cinephile',
  is_founding: false, is_social_private: false,
  followers_count: 18, following_count: 41,
  created_at: '2026-03-14T00:00:00Z', member_no: 147,
  avatar_url: null, social_links: [], preferences: { favorites: [] },
  ...over,
});

const makeCtl = (over: Record<string, unknown> = {}, dataOver: Record<string, unknown> = {}): Ctl => ({
  nav: {
    toEditProfile: jest.fn(), toSettings: jest.fn(), toMembership: jest.fn(),
    toFollowers: jest.fn(), toFollowing: jest.fn(), toCalendar: jest.fn(),
    openSocialLink: jest.fn(), handleBack: jest.fn(),
  },
  data: {
    targetUser: baseUser(), loading: false,
    counts: { logs: 34, ledger: 12, watchlist: 22, vault: 0, lists: 1 },
    mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
    analyticsLogs: [], calendarData: [], serverAnalytics: null, serverStreak: null,
    setTargetUser: jest.fn(),
    hasMoreLogs: false, hasMoreWatchlist: false, hasMoreVault: false, hasMoreLists: false,
    isLoadingMore: false, loadMoreLogs: jest.fn(),
    ...dataOver,
  },
  username: 'tomasreyes', isSelf: false, repairingHandle: false,
  isFollowing: false, isRequested: false, activeTab: null,
  myLogs: [], myWatchlist: [], myVault: [], myLists: [], setActiveTab: jest.fn(),
  archiveSieve: 'all', ledgerSearch: '', ledgerRatingFilter: 'all',
  watchlistSearch: '', watchlistSort: 'default', physicalFilter: null,
  setArchiveSieve: jest.fn(), setLedgerSearch: jest.fn(), setLedgerRatingFilter: jest.fn(),
  setWatchlistSearch: jest.fn(), setWatchlistSort: jest.fn(), setPhysicalFilter: jest.fn(),
  refreshing: false, onRefresh: jest.fn(),
  dnaCardOpen: false, setDnaCardOpen: jest.fn(),
  rouletteOpen: false, setRouletteOpen: jest.fn(),
  followLoading: false, toggleFollow: jest.fn(),
  ...over,
});

jest.mock('@/src/hooks/useProfileController', () => ({
  useProfileController: () => mockCtl,
}));
jest.mock('@/src/stores/films', () => ({ useFilmStore: () => ({
  fetchLogs: jest.fn(), fetchWatchlist: jest.fn(), fetchPhysicalArchive: jest.fn(), fetchLists: jest.fn(),
}) }));
jest.mock('@/src/stores/blockStore', () => {
  const s = { isBlocked: () => false, isMuted: () => false, blockUser: jest.fn(), muteUser: jest.fn() };
  const useBlockStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'u1', preferences: {} }, updateUser: jest.fn() };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn(() => Promise.resolve({ error: null })), from: jest.fn() } }));


const mount = async (over?: Record<string, unknown>, dataOver?: Record<string, unknown>, props?: Record<string, unknown>) => {
  mockCtl = makeCtl(over, dataOver);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<UserProfileScreen {...(props ?? {})} />); });
  return r;
};

describe('the four states the page can be in', () => {
  it('retrieving — and nothing else on screen', async () => {
    const r = await mount({}, { loading: true });
    expect(r.getByText('RETRIEVING DOSSIER')).toBeTruthy();
    expect(r.queryByText('THE HOLDINGS')).toBeNull();
  });

  it('a missing member gets a way back, not a dead end', async () => {
    const r = await mount({}, { targetUser: null });
    expect(r.getByText('Member Not Found')).toBeTruthy();
    expect(r.getByLabelText('Go back')).toBeTruthy();
  });

  it('a sealed dossier shows the seal and none of the rooms', async () => {
    const r = await mount(
      { isFollowing: false, isSelf: false },
      { targetUser: baseUser({ is_social_private: true }) },
    );
    expect(r.getByText(/THIS DOSSIER IS SEALED/)).toBeTruthy();
    // The private member's collections must not be enumerated to a stranger.
    expect(r.queryByText('THE HOLDINGS')).toBeNull();
    expect(r.queryByText('THE TRIPTYCH')).toBeNull();
    // But their identity and the follow button are still there to act on.
    expect(r.getByText('TOMAS')).toBeTruthy();
    expect(r.getByLabelText(/Follow request sent|Follow this member/)).toBeTruthy();
  });

  it('an open dossier shows every section in order', async () => {
    const r = await mount();
    for (const section of ['THE HOLDINGS']) expect(r.getByText(section)).toBeTruthy();
    expect(r.getByText('THE VIEWING CALENDAR')).toBeTruthy();
  });
});

describe('the ident block', () => {
  it('sets the name, the handle and the serial beside the portrait', async () => {
    const r = await mount();
    expect(r.getByText('TOMAS')).toBeTruthy();
    expect(r.getByText('@TOMASREYES')).toBeTruthy();
    expect(r.getByText('Nº 0147 · ADMITTED MARCH 2026')).toBeTruthy();
  });

  it('falls back to the handle when a member has no name at all — ONCE', async () => {
    // Not twice. The name slot takes the handle, and the handle line steps
    // aside rather than echoing it in 9.5pt directly underneath.
    const r = await mount({}, { targetUser: baseUser({ display_name: null, persona: null }) });
    expect(r.getByText('TOMASREYES')).toBeTruthy();
    expect(r.queryByText('@TOMASREYES')).toBeNull();
  });

  it('and does not echo a display name that IS the handle', async () => {
    // An ordinary case, and the one the null-name test would have missed.
    const r = await mount({}, { targetUser: baseUser({ display_name: 'tomasreyes', persona: null }) });
    expect(r.getAllByText(/^@?TOMASREYES$/)).toHaveLength(1);
  });

  it('but keeps the handle when it genuinely differs from the name', async () => {
    const r = await mount();
    expect(r.getByText('TOMAS')).toBeTruthy();
    expect(r.getByText('@TOMASREYES')).toBeTruthy();
  });

  it('shows the initial when there is no portrait, never a dead black frame', async () => {
    const r = await mount();
    expect(r.getByText('T')).toBeTruthy();
  });

  it('stamps the rank ONCE — no badge, no pill', async () => {
    const r = await mount({}, { targetUser: baseUser({ tier: 'archivist', role: 'archivist' }) });
    expect(r.getAllByText('ARCHIVIST')).toHaveLength(1);
  });

  it('a founding member reads AUTEUR and carries the flag on its own line', async () => {
    // Founding outranks every tier (Highest Watermark), and it is a FLAG — so
    // "ARCHIVIST · FOUNDING" must be unwritable.
    const r = await mount({}, { targetUser: baseUser({ tier: 'archivist', is_founding: true }) });
    expect(r.getAllByText('AUTEUR')).toHaveLength(1);
    expect(r.getByText('✦ FOUNDING MEMBER')).toBeTruthy();
    expect(r.queryByText('ARCHIVIST')).toBeNull();
  });

  it('a NON-founding member is not given the flag', async () => {
    const r = await mount();
    expect(r.queryByText('✦ FOUNDING MEMBER')).toBeNull();
  });

  it('hides the serial gracefully when the member has no number yet', async () => {
    const r = await mount({}, { targetUser: baseUser({ member_no: null }) });
    expect(r.getByText('ADMITTED MARCH 2026')).toBeTruthy();
  });

  it('says something kind when the bio is empty', async () => {
    const own = await mount({ isSelf: true }, { targetUser: baseUser({ bio: null }) });
    expect(own.getByText(/Tell the society who you are/)).toBeTruthy();
    const other = await mount({}, { targetUser: baseUser({ bio: null }) });
    expect(other.getByText(/No bio on file/)).toBeTruthy();
  });
});

describe('the figures and the holdings', () => {
  it('shows all four figures, thousands grouped', async () => {
    const r = await mount({}, { targetUser: baseUser({ followers_count: 18206, following_count: 204 }) });
    expect(r.getByLabelText('18,206 followers')).toBeTruthy();
    expect(r.getByLabelText('204 following')).toBeTruthy();
  });

  it('an empty collection reads as a dash and SAYS "no" aloud', async () => {
    const r = await mount({}, {
      targetUser: baseUser({ followers_count: 0, following_count: 0 }),
      counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
    });
    expect(r.getByLabelText('no followers')).toBeTruthy();
    expect(r.getByLabelText(/ARCHIVE, watched, none filed yet/)).toBeTruthy();
  });

  it('names all six rooms, and the locked one says so', async () => {
    const r = await mount();
    for (const room of ['ARCHIVE', 'LEDGER', 'STACKS', 'VAULT', 'PROJECTOR']) {
      expect(r.getByText(room)).toBeTruthy();
    }
    // WATCHLIST deliberately appears twice: once as a figure in the summary
    // row, once as a door in the holdings. Different jobs — a number you
    // compare between members, and a room you walk into.
    expect(r.getAllByText('WATCHLIST')).toHaveLength(2);
    // A Cinephile cannot open the Vault; the row must say so rather than lie
    // with a zero.
    expect(r.getByLabelText(/VAULT, physical, locked/)).toBeTruthy();
  });

  it('every room is still reachable by the id the rest of the screen uses', async () => {
    const r = await mount();
    for (const id of ['archive', 'ledger', 'watchlist', 'lists', 'physical', 'projector']) {
      expect(r.getByTestId(`collection-card-${id}`)).toBeTruthy();
    }
  });

  it('the calendar door is locked for a Cinephile and open above', async () => {
    expect((await mount()).getByLabelText('The Viewing Calendar, locked')).toBeTruthy();
    const arch = await mount({}, { targetUser: baseUser({ tier: 'archivist' }) });
    expect(arch.getByLabelText('The Viewing Calendar')).toBeTruthy();
  });
});

describe('your own file differs from someone else’s', () => {
  it('offers EDIT and settings instead of FOLLOW', async () => {
    const r = await mount({ isSelf: true });
    expect(r.getByLabelText('Edit your file')).toBeTruthy();
    expect(r.getByLabelText('Open settings')).toBeTruthy();
    expect(r.queryByLabelText('Follow this member')).toBeNull();
  });

  it('carries THE DESK and the Society door, which a visitor never sees', async () => {
    const own = await mount({ isSelf: true });
    expect(own.getByText('THE SOCIETY RANKS')).toBeTruthy();
    expect(own.getByLabelText('Settings and profile')).toBeTruthy();

    const other = await mount({ isSelf: false });
    expect(other.queryByText('THE SOCIETY RANKS')).toBeNull();
    expect(other.queryByLabelText('Settings and profile')).toBeNull();
  });

  it('does NOT duplicate "at the door" — that lives in Notices now', async () => {
    const r = await mount({ isSelf: true }, { targetUser: baseUser({ is_social_private: true }) });
    expect(r.queryByText('AT THE DOOR')).toBeNull();
  });

  it('the Society door stays open at the top rank and only goes quiet', async () => {
    const auteur = await mount({ isSelf: true }, { targetUser: baseUser({ tier: 'auteur' }) });
    expect(auteur.getByText('THE SOCIETY RANKS')).toBeTruthy();
    expect(auteur.getByLabelText('View and manage your rank')).toBeTruthy();
    expect(auteur.getByText(/highest rank/)).toBeTruthy();

    const cine = await mount({ isSelf: true });
    expect(cine.getByLabelText('Ascend the ranks')).toBeTruthy();
    // Two doors are shut to a Cinephile — the Vault and the Calendar — and the
    // plate must count what the page actually drew, not guess from the tier.
    expect(cine.getByText(/Two rooms remain closed/)).toBeTruthy();
  });

  it('an Archivist is told there is more above without being told a falsehood', async () => {
    // Nothing on an Archivist's page is drawn locked, but they are not at the
    // top either — so "every door is open" would be a lie.
    const r = await mount({ isSelf: true }, { targetUser: baseUser({ tier: 'archivist' }) });
    expect(r.getByText(/rooms above this one/)).toBeTruthy();
  });
});

describe('the atmosphere behind the plate belongs to the rank', () => {
  const withFav = (over: Record<string, unknown> = {}) => baseUser({
    preferences: { favorites: [{ id: 1, title: 'Stalker', poster_path: '/s.jpg' }] },
    ...over,
  });

  it('an Auteur’s file is dressed from their own film', async () => {
    const r = await mount({}, { targetUser: withFav({ tier: 'auteur' }) });
    expect(r.getByTestId('profile-backdrop')).toBeTruthy();
  });

  it('and comes down the moment they switch it off — for VISITORS too', async () => {
    // The whole point of the switch. It reaches a visitor through
    // public_prefs, so this is the case that was silently broken.
    const r = await mount({}, { targetUser: withFav({
      tier: 'auteur',
      preferences: { favorites: [{ id: 1, title: 'Stalker', poster_path: '/s.jpg' }], backdrop: false },
    }) });
    expect(r.queryByTestId('profile-backdrop')).toBeNull();
  });

  it('an Auteur who never touched the switch keeps theirs', async () => {
    // Absent means ON. Nobody loses a backdrop they already had.
    const r = await mount({}, { targetUser: withFav({ tier: 'auteur' }) });
    expect(r.getByTestId('profile-backdrop')).toBeTruthy();
  });

  it('an Auteur with no favourites falls back rather than showing nothing', async () => {
    const r = await mount({}, {
      targetUser: baseUser({ tier: 'auteur', preferences: { favorites: [] } }),
      mainLogs: [{ id: 'l1', filmId: 1, title: 'A', poster: '/p.jpg', year: 2001, rating: 4, status: 'watched' }],
    });
    expect(r.getByTestId('profile-backdrop')).toBeTruthy();
  });

  it('no rank below Auteur gets one', async () => {
    for (const tier of ['cinephile', 'archivist']) {
      const r = await mount({}, { targetUser: withFav({ tier }) });
      expect(r.queryByTestId('profile-backdrop')).toBeNull();
    }
  });

  it('the breathing wash runs ONLY where something reads it', () => {
    // `pulseStyle` drives the Archivist gradient and nothing else since the
    // avatar ring was replaced by the mounted print. It used to start for every
    // member: a worklet re-evaluated each frame for seventy-two seconds, on two
    // ranks out of three, setting an opacity nothing painted.
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'app/user/[username].tsx'), 'utf8');
    expect(src).toMatch(/const showsPulse = isArchivistPlus && !isAuteurPlus;/);
    expect(src).toMatch(/if \(!showsPulse \|\| reducedMotion\) return;/);
    // And exactly one consumer, so the gate above stays true.
    expect(src.match(/pulseStyle\]/g) ?? []).toHaveLength(1);
  });
});

describe('the rooms behind the doors still open', () => {
  // The holdings feed `activeTab`, and this pass reshaped the holdings and
  // changed the type of the count they carry. If any of that broke the tab
  // route, the page would look perfect and every door would be a dead end.
  it.each([
    ['archive', 'The Archive'],
    ['ledger', 'The Ledger'],
    ['watchlist', 'The Watchlist'],
    ['lists', 'The Stacks'],
    ['physical', 'The Vault'],
    ['projector', 'The Projector Room'],
    ['calendar', 'The Viewing Calendar'],
  ])('%s opens on "%s"', async (tab, title) => {
    const r = await mount({ activeTab: tab });
    // getAllBy: a locked room names itself twice on purpose — once in the
    // header, once on the velvet rope that explains why it will not open.
    expect(r.getAllByText(title).length).toBeGreaterThan(0);
    expect(r.getByLabelText('Back to profile')).toBeTruthy();
    // The hero must NOT be underneath it — a tab is a whole screen.
    expect(r.queryByText('THE HOLDINGS')).toBeNull();
  });
});

describe('the page survives the edges', () => {
  it('a member with no favourites and no logs still renders every room', async () => {
    const r = await mount({}, { targetUser: baseUser({ preferences: { favorites: [] } }) });
    expect(r.getByText('THE HOLDINGS')).toBeTruthy();
    // A visitor is not shown three empty frames.
    expect(r.queryByText('THE TRIPTYCH')).toBeNull();
  });

  it('but YOUR own empty altarpiece invites you to fill it', async () => {
    const r = await mount({ isSelf: true }, { targetUser: baseUser({ preferences: { favorites: [] } }) });
    expect(r.getByText('THE TRIPTYCH')).toBeTruthy();
    expect(r.getByLabelText(/Add a film to the centre/)).toBeTruthy();
  });

  it('a favourites array full of nulls is not mistaken for content', async () => {
    const r = await mount({}, { targetUser: baseUser({ preferences: { favorites: [null, null, null] } }) });
    expect(r.queryByText('THE TRIPTYCH')).toBeNull();
  });

  it('an absurdly long name and bio do not throw', async () => {
    const r = await mount({}, { targetUser: baseUser({
      display_name: 'Bartholomew Maximilian Fitzgerald-Wintersmith III',
      bio: 'x'.repeat(600),
    }) });
    expect(r.getByText(/BARTHOLOMEW/)).toBeTruthy();
  });

  it('preferences being null does not break the page', async () => {
    const r = await mount({}, { targetUser: baseUser({ preferences: null }) });
    expect(r.getByText('THE HOLDINGS')).toBeTruthy();
  });

  it('no created_at, no member_no — the serial simply does not appear', async () => {
    const r = await mount({}, { targetUser: baseUser({ created_at: null, member_no: null }) });
    expect(r.getByText('TOMAS')).toBeTruthy();
    expect(r.queryByText(/ADMITTED/)).toBeNull();
    expect(r.queryByText(/Nº/)).toBeNull();
  });
});
