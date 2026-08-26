/**
 * A GENERATOR, not a test. Mounts the WHOLE member file and converts the
 * resolved React Native tree to HTML, so the mockup is the screen rather than a
 * drawing of it. Mock setup follows memberFileScreen.test.tsx, which already
 * knew how to stand this page up.
 *
 * Run: npx jest zz-memberfile.gen
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import UserProfileScreen from '@/app/user/[username]';

const OUT = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad/mockups';

// The phone is 390pt. The renderer says 750 by default, which sizes every grid
// for a tablet — see the note in zz-mockup.gen.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

type Ctl = Record<string, unknown>;
let mockCtl: Ctl;

jest.mock('@/src/hooks/useProfileController', () => ({ useProfileController: () => mockCtl }));
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
  const s = { user: { id: 'me', preferences: {} }, updateUser: jest.fn() };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ username: 'kane' }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn(() => Promise.resolve({ error: null })), from: jest.fn() } }));

// ── the html conversion (same rules as the rooms generator) ─────────────────
const PX = new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'top', 'bottom', 'left', 'right', 'margin', 'marginTop', 'marginBottom', 'marginLeft',
  'marginRight', 'marginHorizontal', 'marginVertical', 'padding', 'paddingTop',
  'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal', 'paddingVertical',
  'borderWidth', 'borderRadius', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderRightWidth', 'fontSize', 'lineHeight', 'letterSpacing', 'gap', 'rowGap', 'columnGap']);
const DIRECT = new Set(['color', 'backgroundColor', 'opacity', 'borderColor', 'borderTopColor',
  'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'textAlign', 'fontWeight',
  'fontStyle', 'position', 'zIndex', 'overflow', 'flex', 'flexDirection', 'alignItems',
  'justifyContent', 'flexWrap', 'alignSelf', 'textTransform', 'flexGrow', 'flexShrink', 'aspectRatio']);
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const FONT_MAP: Record<string, string> = {
  Rye_400Regular: "'Rye', serif",
  SpecialElite_400Regular: "'Special Elite', monospace",
  CourierPrime_400Regular: "'Courier Prime', monospace",
  CourierPrime_700Bold: "'Courier Prime', monospace",
  CourierPrime_400Regular_Italic: "'Courier Prime', monospace",
  Spectral_400Regular: "'Spectral', serif",
  Spectral_500Medium: "'Spectral', serif",
  Spectral_400Regular_Italic: "'Spectral', serif",
};
const flat = (s: unknown): Record<string, unknown> => {
  if (!s) return {};
  if (Array.isArray(s)) return s.reduce<Record<string, unknown>>((a, x) => ({ ...a, ...flat(x) }), {});
  return s as Record<string, unknown>;
};
function css(st: Record<string, unknown>, isText: boolean): string {
  const out: string[] = [];
  if (!isText) { out.push('display:flex', `flex-direction:${(st.flexDirection as string) || 'column'}`); }
  for (const [k, v] of Object.entries(st)) {
    if (v === undefined || v === null) continue;
    if (k === 'fontFamily') {
      out.push(`font-family:${FONT_MAP[String(v)] || 'monospace'}`);
      if (String(v).includes('Italic')) out.push('font-style:italic');
      if (String(v).includes('700Bold')) out.push('font-weight:700');
      continue;
    }
    if (k === 'marginHorizontal') { out.push(`margin-left:${v}px`, `margin-right:${v}px`); continue; }
    if (k === 'marginVertical') { out.push(`margin-top:${v}px`, `margin-bottom:${v}px`); continue; }
    if (k === 'paddingHorizontal') { out.push(`padding-left:${v}px`, `padding-right:${v}px`); continue; }
    if (k === 'paddingVertical') { out.push(`padding-top:${v}px`, `padding-bottom:${v}px`); continue; }
    if (k === 'flexDirection') continue;
    if (k === 'flex' && v === 1) { out.push('flex:1 1 0%', 'min-width:0'); continue; }
    if (['shadowColor', 'shadowOffset', 'shadowRadius', 'elevation'].includes(k)) continue;
    if (k === 'transform') {
      const t = (v as Record<string, string | number>[]).map((o) =>
        Object.entries(o).map(([tk, tv]) =>
          `${tk}(${tv}${typeof tv === 'number' ? (tk.startsWith('rotate') ? 'deg' : 'px') : ''})`).join(' ')).join(' ');
      out.push(`transform:${t}`);
      continue;
    }
    if (PX.has(k)) { out.push(`${kebab(k)}:${typeof v === 'number' ? v + 'px' : v}`); continue; }
    if (DIRECT.has(k)) { out.push(`${kebab(k)}:${v}`); continue; }
  }
  return out.join(';');
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
interface N { type?: string; props?: Record<string, unknown>; children?: unknown[] }
function toHtml(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return esc(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toHtml).join('');
  const n = node as N;
  const st = flat(n.props?.style);
  const kids = (n.children || []).map(toHtml).join('');
  const t = String(n.type || '');
  if (/^(Image|ExpoImage)$/i.test(t)) return `<div class="poster" style="${css(st, false)}"></div>`;
  if (t === 'Text') return `<span style="${css(st, true)}">${kids}</span>`;
  if (/^Svg$/i.test(t)) {
    const w = n.props?.width; const h = n.props?.height;
    const num = (x: unknown) => (typeof x === 'number' ? `${x}px` : String(x ?? '100%'));
    return `<div class="svgart" style="width:${num(w)};height:${num(h)}"></div>`;
  }
  if (/^(Circle|Path|Rect|G|Line|Defs|Ellipse|Stop|LinearGradient|RadialGradient|SvgRadialGradient|Polygon|Text)$/i.test(t)) return '';
  if (t === 'ActivityIndicator') return '<div class="spinner"></div>';
  return `<div style="${css(st, false)}">${kids}</div>`;
}

// ── a member worth looking at ───────────────────────────────────────────────
const FAVOURITES = [
  { id: 389, title: '12 Angry Men', poster_path: '/a.jpg', release_date: '1957-04-10' },
  { id: 240, title: 'The Godfather Part II', poster_path: '/b.jpg', release_date: '1974-12-20' },
  { id: 429, title: 'The Good, the Bad and the Ugly', poster_path: '/c.jpg', release_date: '1966-12-23' },
];
const TITLES = ['Stalker', 'In the Mood for Love', 'Tokyo Story', 'Come and See', 'Persona'];
const recent = (i: number) => ({
  id: `l${i}`, filmId: 500 + i, title: TITLES[i % TITLES.length], poster: '/p.jpg',
  poster_path: '/p.jpg', year: 1962 + i * 6, rating: 5 - (i % 3), status: i === 1 ? 'rewatched' : 'watched',
  watchedDate: `2026-01-${20 - i}`, createdAt: `2026-01-${20 - i}T20:00:00Z`,
  review: 'Held its nerve to the last frame.', formats: [], notes: '', condition: 'good',
});
const LOGS = Array.from({ length: 6 }, (_, i) => recent(i));

const USER = {
  id: 'u1', username: 'kane', display_name: 'Kane', persona: 'The Archivist',
  bio: 'Nitrate, mostly. I keep the reels in order so nobody else has to.',
  role: 'auteur', tier: 'auteur', is_founding: true, is_social_private: false,
  followers_count: 312, following_count: 88,
  created_at: '2024-11-02T00:00:00Z', member_no: 42,
  avatar_url: null,
  social_links: [{ platform: 'letterboxd', url: 'https://letterboxd.com/kane' }],
  preferences: { favorites: FAVOURITES },
};

const CTL: Ctl = {
  nav: {
    toEditProfile: jest.fn(), toSettings: jest.fn(), toMembership: jest.fn(),
    toFollowers: jest.fn(), toFollowing: jest.fn(), toCalendar: jest.fn(),
    openSocialLink: jest.fn(), handleBack: jest.fn(),
  },
  data: {
    targetUser: USER, loading: false,
    counts: { logs: 1247, ledger: 318, watchlist: 96, vault: 214, lists: 12 },
    mainLogs: LOGS, archiveLogs: LOGS, ledgerLogs: LOGS, watchlist: [], vault: [], lists: [],
    analyticsLogs: LOGS, calendarData: [], serverStreak: 9,
    serverAnalytics: { total_films: 1247, current_streak: 9, longest_streak: 31, avg_rating: 3.8 },
    analyticsShape: { longest_streak: 31, current_streak: 9, avg_rating: 3.8, monthly_activity: [] },
    taste: null,
    setTargetUser: jest.fn(),
    hasMoreLogs: false, hasMoreWatchlist: false, hasMoreVault: false, hasMoreLists: false,
    isLoadingMore: false, loadMoreLogs: jest.fn(), loadTabData: jest.fn(),
  },
  username: 'kane', isSelf: false, repairingHandle: false,
  isFollowing: true, isRequested: false, activeTab: null,
  myLogs: [], myWatchlist: [], myVault: [], myLists: [], setActiveTab: jest.fn(),
  archiveSieve: 'all', ledgerSearch: '', ledgerRatingFilter: 'all',
  watchlistSearch: '', watchlistSort: 'default', physicalFilter: null,
  archiveSearch: '', listsSearch: '', physicalSearch: '', watchlistDecade: null,
  setArchiveSieve: jest.fn(), setLedgerSearch: jest.fn(), setLedgerRatingFilter: jest.fn(),
  setWatchlistSearch: jest.fn(), setWatchlistSort: jest.fn(), setPhysicalFilter: jest.fn(),
  setArchiveSearch: jest.fn(), setListsSearch: jest.fn(), setPhysicalSearch: jest.fn(),
  setWatchlistDecade: jest.fn(), setListsSort: jest.fn(), setPhysicalSort: jest.fn(),
  listsSort: 'default', physicalSort: 'default',
  refreshing: false, onRefresh: jest.fn(),
  dnaCardOpen: false, setDnaCardOpen: jest.fn(),
  rouletteOpen: false, setRouletteOpen: jest.fn(),
  followLoading: false, toggleFollow: jest.fn(),
};

/** The states a member file is really seen in. */
const VARIANTS: [string, Ctl][] = [
  // Someone else's open dossier — the common case, and the richest.
  ['memberfile', CTL],

  // Your own file. The same page, but it offers you the controls a visitor
  // never sees, and drops the follow button.
  ['memberfile-self', {
    ...CTL, isSelf: true, isFollowing: false,
    data: { ...(CTL.data as Record<string, unknown>), targetUser: { ...USER, id: 'me' } },
  }],

  // A sealed dossier. The identity and the way to ask are still there; the
  // holdings are not enumerated to a stranger.
  ['memberfile-sealed', {
    ...CTL, isSelf: false, isFollowing: false,
    data: {
      ...(CTL.data as Record<string, unknown>),
      targetUser: { ...USER, is_social_private: true },
    },
  }],
];

const RUN = !!process.env.MOCKUPS;
const gate = RUN ? describe : describe.skip;
gate('member file generator', () => {
  it.each(VARIANTS)('writes %s', async (name, ctl) => {
    mkdirSync(OUT, { recursive: true });
    mockCtl = ctl;
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<UserProfileScreen />); });
    const html = toHtml(r.toJSON());
    writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
