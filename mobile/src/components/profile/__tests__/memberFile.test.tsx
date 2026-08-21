/**
 * memberFile.test.tsx — the member file, rebuilt.
 *
 * The profile was three equal poster tiles, a 3-wide grid of icon cards, and a
 * hero of eleven centred blocks stacked under a flat 120pt pad. It is now a
 * composition: a mounted portrait with the particulars beside it, an altarpiece,
 * a numbered ledger, and two columns of holdings.
 *
 * Three kinds of fact are checked here, and the split is deliberate:
 *
 *   • ARITHMETIC is driven. Panel widths, the em-dash tally, which mount is the
 *     centre — these have no rendered symptom until they are wrong on a device
 *     nobody is holding, so they are exercised directly across the whole input
 *     range rather than eyeballed at one width.
 *
 *   • BEHAVIOUR is rendered. Clearing the centre of the altarpiece used to
 *     promote a wing into it without being asked; that is only provable by
 *     doing it.
 *
 *   • ABSENCE is read from source, with comments stripped — every removal here
 *     is documented in prose that names the thing removed, and prose must not
 *     satisfy the guard that explains it.
 */
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

// One import, at the top. `jest.mock` factories are hoisted above every import
// by babel-plugin-jest-hoist, so the component picks up the mocks below even
// though they are written further down the file — which the metrics import
// already demonstrated before this was merged into it.
import { ProfileTriptych, triptychMetrics, TRIPTYCH_AISLE, TRIPTYCH_GAP } from '../ProfileTriptych';
import { readMounts, pickBackdropFilm, CENTRE_MOUNT, MOUNT_COUNT } from '../favourites';
import { tally } from '../profileComputed';
import { ProfileBackdrop, backdropIsOn } from '../ProfileBackdrop';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
/** Comments name what they removed; they must not satisfy an absence check. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const SCREEN = read('app/user/[username].tsx');
const CODE_SCREEN = code(SCREEN);
const STYLES = read('src/components/profile/profileStyles.ts');
const TRIPTYCH = read('src/components/profile/ProfileTriptych.tsx');

// ════════════════════════════════════════════════════════════════════════════
// THE ALTARPIECE — geometry
// ════════════════════════════════════════════════════════════════════════════
describe('the altarpiece fits the phone it is hung on', () => {
  // Every width the app can plausibly be laid out at, plus the absurd ones.
  const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 414, 428, 430, 440, 768, 1024, 200, 100, 0];

  it.each(WIDTHS)('at %ipt the row never exceeds the space it was measured from', (w) => {
    const m = triptychMetrics(w);
    // THE defect this design could have had: three fixed panels (85/140/85)
    // sum to 320 and overflow a 320pt screen's 280pt of usable width.
    expect(m.rowW).toBeLessThanOrEqual(m.avail);
    // And it must not be so much smaller that the altarpiece floats in space.
    expect(m.rowW).toBeGreaterThanOrEqual(m.avail - 2);
  });

  it.each(WIDTHS)('at %ipt every panel has a real, positive size', (w) => {
    const m = triptychMetrics(w);
    for (const v of [m.centreW, m.centreH, m.wingW, m.wingH]) {
      expect(v).toBeGreaterThan(0);
      expect(Number.isFinite(v)).toBe(true);
      // A fractional pixel on a border is a visible seam.
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it.each(WIDTHS)('at %ipt the centre is the largest panel — that is the whole idea', (w) => {
    const m = triptychMetrics(w);
    expect(m.centreW).toBeGreaterThan(m.wingW);
    expect(m.centreH).toBeGreaterThan(m.wingH);
    // Not a token difference: an altarpiece reads as one because the centre
    // dominates. Anything under ~1.4x reads as an unevenly-spaced row.
    expect(m.centreW / m.wingW).toBeGreaterThan(1.4);
  });

  it.each(WIDTHS)('at %ipt every panel keeps the 2:3 one-sheet ratio', (w) => {
    const m = triptychMetrics(w);
    // Rounded to whole pixels, so allow the rounding but nothing more.
    expect(Math.abs(m.centreH / m.centreW - 1.5)).toBeLessThan(0.02);
    expect(Math.abs(m.wingH / m.wingW - 1.5)).toBeLessThan(0.02);
  });

  it('clamps rather than producing a negative panel on an absurd width', () => {
    // `avail` floors at 260, so a 0pt or 100pt window still lays out.
    expect(triptychMetrics(0).avail).toBe(260);
    expect(triptychMetrics(100).avail).toBe(260);
    expect(triptychMetrics(375).avail).toBe(375 - TRIPTYCH_AISLE * 2);
  });

  it('the geometry is derived, not typed in', () => {
    // If someone re-introduces literal panel widths, the sweep above passes at
    // whatever width they chose and fails everywhere else — so pin the source.
    const body = code(TRIPTYCH).slice(
      code(TRIPTYCH).indexOf('export function triptychMetrics'),
      code(TRIPTYCH).indexOf('HANGING_ORDER'),
    );
    expect(body).toMatch(/windowWidth/);
    expect(body).not.toMatch(/\b(85|140|128|210)\b/);
  });

  it('the mounts hang left-wing, centre, right-wing', () => {
    // The stored order is [centre, wing, wing]; the HUNG order is not the
    // stored order, and getting that backwards puts the big panel on the left.
    expect(code(TRIPTYCH)).toMatch(/HANGING_ORDER\s*=\s*\[1,\s*CENTRE_MOUNT,\s*2\]/);
    expect(CENTRE_MOUNT).toBe(0);
    expect(MOUNT_COUNT).toBe(3);
  });

  it('the gap the layout uses is the gap the touch guard was told about', () => {
    // stackedRowHitSlop.test.ts allows the panels half of TRIPTYCH_GAP. If the
    // spacing is loosened here and that rule is not, the panels quietly regain
    // the right to steal each other's taps.
    expect(TRIPTYCH_GAP).toBe(5);
    const guard = read('src/components/__tests__/stackedRowHitSlop.test.ts');
    expect(guard).toMatch(/ProfileTriptych\.tsx'[^\n]*gap: \{ x: 5 \}/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EVERY CONTROL SAYS ITS OWN NAME
// ════════════════════════════════════════════════════════════════════════════
describe('nothing on the member file is anonymous to a screen reader', () => {
  const A11Y_FILES = [
    'app/user/[username].tsx',
    'src/components/profile/ProfileTriptych.tsx',
    'src/components/profile/ProfileHelpers.tsx',
    'src/features/profile/EditProfileScreen.tsx',
  ];

  /**
   * Blanks comments WITHOUT collapsing lines. Replacing a block comment with
   * '' shifts every line number after it — the first run of this sweep
   * reported all five of its findings at the wrong places because of exactly
   * that.
   */
  const blank = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

  /** Brace-tracked: a lazy match to `>` ends the tag early on `() =>`. */
  function scanTags(src: string, name: string) {
    const out: { attrs: string; line: number }[] = [];
    const open = `<${name}`;
    let i = 0;
    while ((i = src.indexOf(open, i)) !== -1) {
      const after = src[i + open.length];
      if (after && /[A-Za-z0-9_]/.test(after)) { i += open.length; continue; }
      let depth = 0, j = i + open.length, inStr: string | null = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (inStr) { if (c === inStr && src.charCodeAt(j - 1) !== 92) inStr = null; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) break;
      }
      out.push({ attrs: src.slice(i + open.length, j), line: src.slice(0, i).split('\n').length });
      i = j;
    }
    return out;
  }

  it('every pressable, switch and field carries an accessibilityLabel', () => {
    // An icon-only control has no text child to borrow a name from, so it
    // announces NOTHING. That is how the profile's back button — the one
    // control that leaves the page — was silent to VoiceOver until this swept
    // it up.
    const unnamed: string[] = [];
    let total = 0;
    for (const f of A11Y_FILES) {
      const src = blank(read(f));
      for (const tag of ['PressableScale', 'Pressable', 'Switch', 'TextInput']) {
        for (const t of scanTags(src, tag)) {
          total++;
          if (!/accessibilityLabel\s*=/.test(t.attrs)) unnamed.push(`${f}:${t.line} <${tag}`);
        }
      }
    }
    // A scan that finds nothing would pass while proving nothing.
    expect(total).toBeGreaterThan(20);
    expect(unnamed).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE MOUNTS — a hole is a hole
// ════════════════════════════════════════════════════════════════════════════
describe('a cleared mount stays cleared', () => {
  it('reads the three mounts positionally, holes preserved', () => {
    const A = { id: 1, title: 'A', poster_path: '/a.jpg' };
    const B = { id: 2, title: 'B', poster_path: '/b.jpg' };
    // THE bug: the old reader filtered nulls and THEN indexed, so this stored
    // shape displayed as [A, B, null] — you cleared your centre and your second
    // favourite was promoted into the largest panel on the page without asking.
    const mounts = readMounts([null, A, B]);
    expect(mounts[CENTRE_MOUNT]).toBeNull();
    expect(mounts[1]).toMatchObject({ title: 'A' });
    expect(mounts[2]).toMatchObject({ title: 'B' });
  });

  it('always returns exactly three, however short or long the stored array', () => {
    expect(readMounts([]).length).toBe(MOUNT_COUNT);
    expect(readMounts(null).length).toBe(MOUNT_COUNT);
    expect(readMounts('nonsense').length).toBe(MOUNT_COUNT);
    expect(readMounts([1, 2, 3, 4, 5, 6]).length).toBe(MOUNT_COUNT);
  });

  it('keeps a legacy bare-string favourite as a titled film, not a broken image', () => {
    const [m] = readMounts(['Vertigo']);
    expect(m).toMatchObject({ title: 'Vertigo', poster_path: '' });
    // An empty title string is residue, not a film.
    expect(readMounts(['   '])[0]).toBeNull();
  });

  it('drops residue that is neither titled nor postered', () => {
    expect(readMounts([{}])[0]).toBeNull();
    expect(readMounts([{ id: 7 }])[0]).toBeNull();
    expect(readMounts([undefined, 0, false])[0]).toBeNull();
  });

  it('only accepts a four-digit year — never a partial date or a number', () => {
    // A label reading `2019.0`, `NaN` or `2019-05-30` under a poster is worse
    // than no label at all.
    expect(readMounts([{ title: 'A', poster_path: '/a', year: '2019' }])[0]!.year).toBe('2019');
    expect(readMounts([{ title: 'A', poster_path: '/a', year: '2019-05' }])[0]!.year).toBeUndefined();
    expect(readMounts([{ title: 'A', poster_path: '/a', year: 2019 as never }])[0]!.year).toBeUndefined();
    expect(readMounts([{ title: 'A', poster_path: '/a' }])[0]!.year).toBeUndefined();
  });
});

describe('the page is dressed from the centre of the altarpiece', () => {
  const A = { id: 1, title: 'A', poster_path: '/a.jpg' };
  const B = { id: 2, title: 'B', poster_path: '/b.jpg' };

  it('prefers the centre panel', () => {
    expect(pickBackdropFilm([A, B, null])!.title).toBe('A');
    // The centre wins even when a wing is "closer" in hanging order — the scan
    // must run in STORED order (centre, wing, wing), not in the order the
    // panels appear on screen (wing, centre, wing). Iterating HANGING_ORDER
    // here would silently dress the page from the left wing.
    expect(pickBackdropFilm([A, B, B])!.title).toBe('A');
    expect(code(read('src/components/profile/favourites.ts'))).not.toMatch(/HANGING_ORDER/);
  });

  it('falls to the first filled wing rather than stripping the backdrop', () => {
    // An Auteur with an empty centre should not lose their backdrop entirely.
    expect(pickBackdropFilm([null, B, null])!.title).toBe('B');
  });

  it('skips a favourite that has no artwork to dress anything with', () => {
    expect(pickBackdropFilm([{ id: 3, title: 'No art', poster_path: '' }, B, null])!.title).toBe('B');
  });

  it('returns nothing when there is nothing', () => {
    expect(pickBackdropFilm([])).toBeNull();
    expect(pickBackdropFilm(null)).toBeNull();
    expect(pickBackdropFilm([null, null, null])).toBeNull();
  });

  it('the triptych and the backdrop read through the SAME rule', () => {
    // They used to read the same array two different ways — the backdrop
    // compacted, the triptych indexed — so they could disagree about which film
    // was "first". One import each, from one module.
    expect(TRIPTYCH).toMatch(/from '\.\/favourites'/);
    expect(read('src/components/profile/ProfileBackdrop.tsx')).toMatch(/pickBackdropFilm.*from '\.\/favourites'/s);
    // And the backdrop no longer rolls its own filter.
    expect(code(read('src/components/profile/ProfileBackdrop.tsx'))).not.toMatch(/safeFavorites/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE FIGURES
// ════════════════════════════════════════════════════════════════════════════
describe('a count nobody has filed reads as a dash, not a zero', () => {
  it('writes an em dash for empty, and for the pre-fetch seed', () => {
    // On the cache-first path a member's own counts are deliberately seeded to
    // 0 before the round trip lands. The old markup stated, in 22pt display
    // type, that someone with 2,481 films had watched none of them.
    expect(tally(0)).toBe('—');
    expect(tally(-3)).toBe('—');
    expect(tally(NaN)).toBe('—');
    expect(tally(Infinity)).toBe('—');
  });

  it('groups thousands without going anywhere near Intl', () => {
    expect(tally(1)).toBe('1');
    expect(tally(34)).toBe('34');
    expect(tally(999)).toBe('999');
    expect(tally(1000)).toBe('1,000');
    expect(tally(1204)).toBe('1,204');
    expect(tally(18206)).toBe('18,206');
    expect(tally(2481)).toBe('2,481');
    expect(tally(1234567)).toBe('1,234,567');
  });

  it('never renders a fraction', () => {
    expect(tally(12.7)).toBe('12');
  });

  it('the whole page stays off Intl for dates too', () => {
    // `toLocaleDateString(…, { month, year })` routes through Intl. Where Intl
    // is absent the OPTIONS ARE IGNORED SILENTLY and the line renders as
    // `3/14/2026` — a failure that looks like a design choice, which is exactly
    // how it survived on this page until now.
    expect(CODE_SCREEN).not.toMatch(/toLocaleDateString/);
    expect(CODE_SCREEN).not.toMatch(/toLocaleString/);
    expect(CODE_SCREEN).toMatch(/formatDateMonthYear/);
  });
});

describe('the Auteur backdrop is a choice, and absent means on', () => {
  it('stays on for everyone who has never touched the switch', () => {
    // Nobody may lose the backdrop they already have on the day this ships.
    expect(backdropIsOn(undefined)).toBe(true);
    expect(backdropIsOn(null)).toBe(true);
    expect(backdropIsOn({})).toBe(true);
    expect(backdropIsOn({ backdrop: true })).toBe(true);
  });

  it('only an explicit false takes it down', () => {
    expect(backdropIsOn({ backdrop: false })).toBe(false);
    // Not a truthiness test: a stray string must not read as "off".
    expect(backdropIsOn({ backdrop: 'false' })).toBe(true);
    expect(backdropIsOn({ backdrop: 0 })).toBe(true);
  });

  it('the switch is offered only to the rank that has the feature', () => {
    const edit = read('src/features/profile/EditProfileScreen.tsx');
    expect(edit).toMatch(/isAuteurPlusTier\(user\)\s*&&/);
    // And it is the app's ONE switch, not a second copy that drifts from the
    // one carrying the iOS track-colour fix.
    expect(edit).toMatch(/from '@\/src\/components\/Toggle'/);
  });

  it('and the backdrop honours it', () => {
    expect(code(read('src/components/profile/ProfileBackdrop.tsx'))).toMatch(/backdropIsOn\(user\?\.preferences\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// WHAT THE REBUILD REMOVED
// ════════════════════════════════════════════════════════════════════════════
describe('the hero is a composition, not a stack of eleven centred rows', () => {
  it('no longer opens on a flat 120pt of nothing', () => {
    // 120 cleared the back button on a pushed profile and left ~50pt of dead
    // space above your own portrait on the tab, where there is no back button.
    expect(code(STYLES)).not.toMatch(/paddingTop:\s*120/);
    expect(CODE_SCREEN).toMatch(/heroTop/);
    // Derived from the same expression the back button itself uses.
    expect(CODE_SCREEN).toMatch(/usernameOverride\s*\n?\s*\?\s*insets\.top/);
  });

  it('says the member’s rank ONCE', () => {
    // It used to appear twice at the top of the page: a badge slung under the
    // avatar and a pill beside the name. The stamp on the corner of the print
    // is the one place it lives now.
    expect(CODE_SCREEN).not.toMatch(/levelBadge/);
    expect(CODE_SCREEN).not.toMatch(/auteurBadge|archivistBadge/);
    expect(CODE_SCREEN).toMatch(/tierStamp/);
    expect(CODE_SCREEN).toMatch(/getDisplayTier/);
  });

  it('never writes "ARCHIVIST · FOUNDING" — founding is a flag, not a rank', () => {
    // getDisplayTier applies the Highest Watermark Rule, so a founding member
    // reads AUTEUR whatever their nominal tier says; the founding LINE is
    // separate and appears on its own.
    expect(CODE_SCREEN).toMatch(/isFounding\s*&&/);
    expect(CODE_SCREEN).toMatch(/FOUNDING MEMBER/);
    expect(CODE_SCREEN).not.toMatch(/\{stampLabel\}[^\n]*FOUNDING/);
  });

  it('carries the serial and the join date on ONE line', () => {
    expect(CODE_SCREEN).toMatch(/serialLine/);
    expect(CODE_SCREEN).not.toMatch(/MEMBER SINCE/);
    expect(code(STYLES)).not.toMatch(/\bmemberSince:/);
  });

  it('sizes the name and the bio in fixed steps, not by auto-shrinking', () => {
    // adjustsFontSizeToFit measures at layout and picks any fraction it likes,
    // so two members side by side get two different sizes for no visible
    // reason. Three fixed steps mean a name always renders the same.
    expect(CODE_SCREEN).toMatch(/nameSize\s*=\s*heroName\.length/);
    expect(CODE_SCREEN).toMatch(/bioSize\s*=\s*bioText\.length/);
    const heroBlock = CODE_SCREEN.slice(CODE_SCREEN.indexOf('s.heroName'), CODE_SCREEN.indexOf('s.socialLinksRow'));
    expect(heroBlock).not.toMatch(/adjustsFontSizeToFit/);
  });
});

describe('the body says the same six things in half the height', () => {
  it('the holdings are two columns of ledger rows, not a grid of icon cards', () => {
    expect(CODE_SCREEN).not.toMatch(/collectionGrid|collectionCard\b|collectionIconCircle/);
    expect(CODE_SCREEN).toMatch(/s\.holdWrap/);
    expect(CODE_SCREEN).toMatch(/s\.holdLeader/);
    // Still six rooms, still every door reachable — the tab ids are the
    // contract with the rest of the screen.
    for (const id of ['archive', 'ledger', 'watchlist', 'lists', 'physical', 'projector']) {
      expect(read('src/components/profile/profileComputed.ts')).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('every holding is still a real, testable door', () => {
    // The testIDs the rest of the suite navigates by must survive the reshape.
    expect(CODE_SCREEN).toMatch(/testID=\{`collection-card-\$\{item\.id\}`\}/);
  });

  it('LATELY is a numbered ledger and no longer hides posterless films', () => {
    expect(CODE_SCREEN).toMatch(/s\.latelyRow/);
    expect(CODE_SCREEN).toMatch(/latelyIndex/);
    // The old row required a poster, so the three films shown could silently
    // not be the three most recently watched.
    expect(code(read('src/components/profile/profileComputed.ts')))
      .not.toMatch(/poster\.length\s*>\s*5/);
    // A rewatch says more than a date.
    expect(CODE_SCREEN).toMatch(/rewatched/);
  });

  it('"at the door" is not duplicated onto the profile any more', () => {
    // It lives in Notices, which owns the same panel and refreshes the count.
    expect(CODE_SCREEN).not.toMatch(/FollowRequestsPanel/);
    expect(CODE_SCREEN).not.toMatch(/pendingRequestCount/);
    expect(read('app/(modals)/notifications-modal.tsx')).toMatch(/FollowRequestsPanel/);
    expect(read('app/(modals)/notifications-modal.tsx')).toMatch(/refreshFollowRequestCount/);
  });

  it('the way into the society page is open at EVERY rank', () => {
    // It is the door, not an upsell: at the top rank it goes quiet, it does
    // not disappear.
    expect(CODE_SCREEN).toMatch(/THE SOCIETY RANKS/);
    expect(CODE_SCREEN).toMatch(/navToMembership/);
    expect(CODE_SCREEN).toMatch(/isAuteurPlus \? 'VIEW & MANAGE'/);

    // Not wrapped in a rank check — that was the mistake made on Settings,
    // where the door out of the page vanished for the members who had already
    // arrived. A 300-character look-behind was not enough to prove that: a
    // mutation pass wrapped the plate in a rank gate and the check never
    // noticed. Scan the WHOLE self-only section instead — from the desk divider
    // to the end of the block — for any rank condition at all.
    // Both anchors must be CODE. `CODE_SCREEN` has comments stripped — anchoring
    // the end of the range on the `{/* The foot of the file */}` comment found
    // nothing, silently made the range empty, and left this test passing on a
    // slice of nothing until a mutation pass exposed it.
    const from = CODE_SCREEN.indexOf('label="THE DESK"');
    const to = CODE_SCREEN.indexOf('s.footRow');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const desk = CODE_SCREEN.slice(from, to);
    expect(desk).toMatch(/s\.ranksPlate/);
    // A rank may choose how the door LOOKS and what it SAYS —
    // `isAuteurPlus && s.ranksBtnQuiet` in a style array, `isAuteurPlus ? … : …`
    // in the label — but it may not gate the markup. So forbid the rank only
    // where it is followed by an element or a group: `&& <` or `&& (`.
    expect(desk).not.toMatch(/!?isAuteurPlus\s*&&\s*[(<]/);
    expect(desk).not.toMatch(/!?isArchivistPlus\s*&&\s*[(<]/);
    expect(desk).not.toMatch(/lockedRooms\s*&&\s*[(<]/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DRIVEN — the altarpiece, actually rendered
// ════════════════════════════════════════════════════════════════════════════
const mockRpc = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdateUser = jest.fn();
let mockStorePrefs: Record<string, unknown>;

jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...(a as [])) } }));
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', preferences: mockStorePrefs }, updateUser: mockUpdateUser };
    return sel ? sel(state) : state;
  };
  (useAuthStore as unknown as { getState: () => unknown }).getState =
    () => ({ user: { id: 'u1', preferences: mockStorePrefs }, updateUser: mockUpdateUser });
  return { useAuthStore };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));


const FILMS = [
  { id: 11, title: 'Stalker', poster_path: '/s.jpg' },
  { id: 22, title: 'Persona', poster_path: '/p.jpg' },
  { id: 33, title: 'In the Mood for Love', poster_path: '/i.jpg' },
];

function mount(favorites: unknown, own = true) {
  mockStorePrefs = { favorites };
  return render(
    <ProfileTriptych user={{ id: 'u1', preferences: { favorites } as never }} isOwnProfile={own} userRole="cinephile" />
  );
}

describe('the backdrop guards itself, not just where it is called from', () => {
  // The screen only MOUNTS ProfileBackdrop inside its Auteur branch, so the
  // component's own tier check can never be exercised through the page — a
  // mutation pass deleted that check and every screen test still passed. It is
  // defence in depth for the day someone renders this somewhere else, and it
  // deserves a test that can actually see it.
  const FAV = { favorites: [{ id: 1, title: 'Stalker', poster_path: '/s.jpg' }] };

  it('refuses to render for a rank below Auteur, whoever calls it', () => {
    for (const tier of [undefined, 'free', 'cinephile', 'archivist']) {
      const r = render(<ProfileBackdrop user={{ tier, preferences: FAV } as never} logs={[]} />);
      expect(r.toJSON()).toBeNull();
    }
  });

  it('renders for an Auteur, and for a founding member of any nominal tier', () => {
    for (const user of [{ tier: 'auteur' }, { tier: 'cinephile', is_founding: true }]) {
      const r = render(<ProfileBackdrop user={{ ...user, preferences: FAV } as never} logs={[]} />);
      expect(r.toJSON()).not.toBeNull();
    }
  });

  it('honours the switch even when called directly', () => {
    const off = render(<ProfileBackdrop
      user={{ tier: 'auteur', preferences: { ...FAV, backdrop: false } } as never} logs={[]} />);
    expect(off.toJSON()).toBeNull();
  });

  it('renders nothing at all rather than an empty frame when there is no art', () => {
    const r = render(<ProfileBackdrop
      user={{ tier: 'auteur', preferences: { favorites: [] } } as never} logs={[]} />);
    expect(r.toJSON()).toBeNull();
  });
});

describe('the altarpiece, driven', () => {
  beforeEach(() => { mockRpc.mockClear(); mockUpdateUser.mockClear(); });

  it('names each mount so a screen reader can tell them apart', async () => {
    const r = mount(FILMS);
    // Three identically-labelled "favourite film" buttons would be unusable.
    expect(r.getByLabelText(/Stalker, the centre/)).toBeTruthy();
    expect(r.getByLabelText(/Persona, the left wing/)).toBeTruthy();
    expect(r.getByLabelText(/In the Mood for Love, the right wing/)).toBeTruthy();
  });

  it('shows a visitor nothing at all when every mount is empty', () => {
    const r = mount([null, null, null], false);
    expect(r.toJSON()).toBeNull();
  });

  it('invites the owner where it states a fact to a visitor', async () => {
    // Same pixels, two voices — and both empty wings speak, not just the first.
    expect(mount([FILMS[0], null, null], true).getAllByText(/CHOOSE A\s*WING/)).toHaveLength(2);
    expect(mount([FILMS[0], null, null], false).getAllByText(/A MOUNT/)).toHaveLength(2);
    // The centre asks for the centre, not for a wing.
    expect(mount([null, FILMS[1], FILMS[2]], true).getByText(/CHOOSE THE\s*CENTRE/)).toBeTruthy();
  });

  it('REMOVING THE CENTRE LEAVES IT EMPTY — it does not promote a wing', async () => {
    // The defect this whole positional rewrite exists for. Open the centre's
    // plate, remove it, and check what was actually sent to the server.
    const r = mount(FILMS);
    await act(async () => { fireEvent.press(r.getByLabelText(/Stalker, the centre/)); });
    await act(async () => { fireEvent.press(r.getByLabelText('Remove from the altarpiece')); });

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const sent = (mockRpc.mock.calls[0] as unknown as [string, { p_preferences: { favorites: unknown[] } }])[1];
    expect(sent.p_preferences.favorites[CENTRE_MOUNT]).toBeNull();
    expect(sent.p_preferences.favorites[1]).toMatchObject({ title: 'Persona' });
    expect(sent.p_preferences.favorites[2]).toMatchObject({ title: 'In the Mood for Love' });
  });

  it('a wing reaches the centre only when the member asks', async () => {
    const r = mount(FILMS);
    await act(async () => { fireEvent.press(r.getByLabelText(/Persona, the left wing/)); });
    await act(async () => { fireEvent.press(r.getByLabelText('Move to the centre')); });

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const sent = (mockRpc.mock.calls[0] as unknown as [string, { p_preferences: { favorites: unknown[] } }])[1];
    // A SWAP, not an insert: nothing else moves and nothing is lost.
    expect(sent.p_preferences.favorites[CENTRE_MOUNT]).toMatchObject({ title: 'Persona' });
    expect(sent.p_preferences.favorites[1]).toMatchObject({ title: 'Stalker' });
    expect(sent.p_preferences.favorites[2]).toMatchObject({ title: 'In the Mood for Love' });
  });

  it('the centre panel offers no "move to the centre"', async () => {
    const r = mount(FILMS);
    await act(async () => { fireEvent.press(r.getByLabelText(/Stalker, the centre/)); });
    expect(r.queryByLabelText('Move to the centre')).toBeNull();
    expect(r.getByLabelText('Replace this film')).toBeTruthy();
  });

  it('an empty mount goes straight to the search — there is nothing to manage', async () => {
    const r = mount([null, null, null], true);
    await act(async () => { fireEvent.press(r.getByLabelText(/Add a film to the centre/)); });
    expect(r.getByLabelText(/Search films for the centre/)).toBeTruthy();
    expect(r.queryByLabelText('Remove from the altarpiece')).toBeNull();
  });

  it('managing and searching share ONE modal, so they cannot race on iOS', () => {
    // Dismissing one RN Modal to present another in the same tick is the
    // modal-over-modal race that has bitten this app before: the second sheet
    // simply never appears. Swapping the content of one mounted Modal cannot.
    const modals = code(TRIPTYCH).match(/<Modal\b/g) ?? [];
    expect(modals.length).toBe(1);
    expect(code(TRIPTYCH)).toMatch(/mode: 'plate' \| 'search'/);
  });

  it.each(['cinephile', 'archivist', 'auteur'])(
    'at %s rank the panel FILLS its wrapper instead of being sized against it',
    (role) => {
      // TierGlow draws a 1pt breathing border for Archivist and above, so its
      // content box is 2pt smaller than the size it was handed. Giving the
      // panel an explicit width as well made it overflow its own frame by a
      // point on each side — visible on every Archivist and Auteur profile,
      // and on no Cinephile one, which is exactly how it would have shipped.
      mockStorePrefs = { favorites: FILMS };
      const r = render(
        <ProfileTriptych user={{ id: 'u1', preferences: { favorites: FILMS } as never }} isOwnProfile={false} userRole={role} />
      );
      const flat = StyleSheet.flatten(r.getByLabelText(/Stalker, the centre/).props.style);
      expect(flat.width).toBeUndefined();
      expect(flat.height).toBeUndefined();
      expect(flat.flex).toBe(1);
      expect(flat.alignSelf).toBe('stretch');
    },
  );

  it('a favourite with no artwork renders its title, not a broken frame', () => {
    const r = mount([{ id: -1, title: 'An Old Favourite', poster_path: '' }, null, null], false);
    expect(r.getByText('An Old Favourite')).toBeTruthy();
  });
});
