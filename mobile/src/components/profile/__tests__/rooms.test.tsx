/**
 * rooms.test.tsx — the six rooms behind the member file.
 *
 * The rooms were six different apps: five empty states, two chip shapes, two
 * page insets, and poster frames in brass while the altarpiece upstairs framed
 * films in bone. This suite holds the vocabulary they now share, and pins the
 * arithmetic that was quietly wrong on every phone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { posterColumns, roomTier, chipSlop, CHIP_SLOP_Y, ROOM_INSET, GRID_GAP_4, GRID_GAP_3, EMBER_REST, EMBER_BEATS } from '../roomStyles';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
/** Comments name what they replaced; prose must not satisfy its own guard. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ════════════════════════════════════════════════════════════════════════════
// THE GRID — the row that overflowed on every phone
// ════════════════════════════════════════════════════════════════════════════
describe('a poster row fits the page it is drawn on', () => {
  // Every width the app can plausibly be laid out at, plus the absurd ones.
  const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 414, 428, 430, 440, 768, 1024, 200, 100, 0];

  it.each(WIDTHS)('at %ipt a four-column row never exceeds its container', (w) => {
    const m = posterColumns(w, 4);
    // THE defect: cells were sized reserving 18pt of gaps and laid out with 24
    // (`gap: 8` × 3). At 375 that is a 349pt row inside 343pt — and a
    // fixed-width child does not shrink, so the fourth poster was clipped.
    expect(m.rowW).toBeLessThanOrEqual(m.avail);
  });

  it.each(WIDTHS)('at %ipt a three-column row never exceeds its container', (w) => {
    const m = posterColumns(w, 3);
    expect(m.rowW).toBeLessThanOrEqual(m.avail);
  });

  it.each(WIDTHS)('at %ipt the row fills the space rather than floating in it', (w) => {
    // Flooring the cell can only ever leave a remainder smaller than the column
    // count. Anything larger means the arithmetic drifted.
    expect(posterColumns(w, 4).avail - posterColumns(w, 4).rowW).toBeLessThan(4);
    expect(posterColumns(w, 3).avail - posterColumns(w, 3).rowW).toBeLessThan(3);
  });

  it.each(WIDTHS)('at %ipt every cell is a whole, positive number of points', (w) => {
    for (const cols of [3, 4] as const) {
      const { width } = posterColumns(w, cols);
      expect(width).toBeGreaterThan(0);
      expect(Number.isInteger(width)).toBe(true);
    }
  });

  it('uses the gap it was told about, not a second one', () => {
    // The whole defect in one assertion: the width must be derived FROM the gap
    // the row is actually drawn with.
    expect(posterColumns(375, 4).gap).toBe(GRID_GAP_4);
    expect(posterColumns(375, 3).gap).toBe(GRID_GAP_3);
    expect(posterColumns(375, 4).avail).toBe(375 - ROOM_INSET * 2);
  });

  it('clamps rather than producing a negative cell on an absurd width', () => {
    expect(posterColumns(0, 4).avail).toBe(200);
    expect(posterColumns(100, 3).avail).toBe(200);
  });

  it('no room computes a poster width of its own any more', () => {
    // One source of truth. A room that does its own arithmetic is a room that
    // can drift back out of step with its own gap.
    for (const f of ['app/user/[username].tsx']) {
      expect(code(read(f))).not.toMatch(/windowWidth - 32 - 1[68]/);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE TIER THREAD
// ════════════════════════════════════════════════════════════════════════════
describe('the rooms carry the member’s rank, exactly as the profile does', () => {
  it('uses the profile’s own three values, not approximations', () => {
    // If these drift, a member's rooms and their profile disagree about what
    // rank they are — the one place coherence is checkable by eye.
    const screen = read('app/user/[username].tsx');
    expect(screen).toMatch(/rgba\(180,45,45,0\.45\)/);
    expect(screen).toMatch(/rgba\(196,150,26,0\.5\)/);
    expect(screen).toMatch(/rgba\(184,137,26,0\.3\)/);

    expect(roomTier('auteur').edge).toBe('rgba(180,45,45,0.45)');
    expect(roomTier('archivist').edge).toBe('rgba(196,150,26,0.5)');
    expect(roomTier('cinephile').edge).toBe('rgba(184,137,26,0.3)');
  });

  it('treats a founding member as an Auteur, as every other surface does', () => {
    // The Highest Watermark Rule. Founding outranks the nominal tier.
    expect(roomTier('founding').ink).toBe(roomTier('auteur').ink);
  });

  it('falls back to house brass for an unknown or missing rank', () => {
    expect(roomTier(undefined).edge).toBe(roomTier('cinephile').edge);
    expect(roomTier(null).edge).toBe(roomTier('cinephile').edge);
    expect(roomTier('nonsense').edge).toBe(roomTier('cinephile').edge);
  });

  it('stops at light and edges — brass stays the colour of action', () => {
    // Chips, buttons and search must never take the tier: a member has to know
    // what is pressable at a glance, and that has to mean the same thing on
    // everyone's profile.
    const styles = code(read('src/components/profile/roomStyles.ts'));
    const chip = styles.slice(styles.indexOf('chip: {'), styles.indexOf('rail: {'));
    expect(chip).not.toMatch(/tier/i);
    const search = styles.slice(styles.indexOf('search: {'), styles.indexOf('state: {'));
    expect(search).not.toMatch(/tier/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A CHIP MAY NEVER REACH PAST HALF ITS GAP
// ════════════════════════════════════════════════════════════════════════════
describe('a chip may never reach past half its gap', () => {
  // Six rooms, four different gaps, every chip claiming 10pt on all four sides.
  // The watchlist's sort row was the worst: three chips 4pt apart each reaching
  // 10, an overlap of 16 — and both platforms give an overlapping touch to the
  // LATER sibling, so tapping the right-hand end of RECENT sorted A–Z instead.
  it.each([0, 2, 4, 6, 8, 10, 12, 16, 20])('at a gap of %ipt, two chips meet and never cross', (gap) => {
    const s = chipSlop(gap);
    expect(s.left + s.right).toBeLessThanOrEqual(gap);
    expect(s.left).toBe(s.right);
    expect(s.left).toBeGreaterThanOrEqual(0);
  });

  it('never produces a negative reach, whatever it is handed', () => {
    // A container with a negative margin is not a thing anyone should write,
    // but a negative hitSlop SHRINKS the target rather than erroring.
    expect(chipSlop(-8).left).toBe(0);
    expect(chipSlop(1).left).toBe(0);
  });

  it('spends the rest on height, where a scroller has no neighbour', () => {
    // A chip is ~27pt tall. Without this it never reaches the 44pt floor, and
    // vertical reach is free: nothing sits above or below it in a horizontal
    // scroller. 27 + 10 + 10 = 47.
    expect(chipSlop(8).top).toBe(CHIP_SLOP_Y);
    expect(27 + chipSlop(8).top + chipSlop(8).bottom).toBeGreaterThanOrEqual(44);
  });

  it('is what the chip actually uses — derived, never typed out', () => {
    const parts = code(read('src/components/profile/RoomParts.tsx'));
    expect(parts).toMatch(/hitSlop=\{chipSlop\(gap\)\}/);
    // The old form, spelled out per room, is what drifted from four containers.
    expect(parts).not.toMatch(/hitSlop=\{\{\s*top:\s*10[^}]*left:\s*\d/);
  });

  it('every chip is handed the gap of the row it is actually in', () => {
    // The derivation is only as true as the number passed to it. Each room's
    // chips sit in `r.chipRow`, whose gap is the one they must be told about —
    // so a respacing of that row cannot leave the targets behind.
    const styles = code(read('src/components/profile/roomStyles.ts'));
    const rowGap = Number(/chipRow:\s*\{[^}]*gap:\s*(\d+)/.exec(styles)?.[1]);
    expect(rowGap).toBeGreaterThan(0);        // a failed parse must not pass

    const ROOMS_WITH_CHIPS = [
      'src/components/profile/ProfileArchiveTab.tsx',
      'src/components/profile/ProfileLedgerTab.tsx',
      'src/components/profile/ProfileWatchlistTab.tsx',
      'src/components/profile/ProfilePhysicalTab.tsx',
    ];
    const wrong: string[] = [];
    let seen = 0;
    for (const f of ROOMS_WITH_CHIPS) {
      const src = code(read(f));
      for (const m of src.matchAll(/gap=\{(\d+)\}/g)) {
        seen++;
        if (Number(m[1]) !== rowGap) wrong.push(`${f}: gap={${m[1]}} but chipRow is ${rowGap}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(4);   // every room with chips, at least
    expect(wrong).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NOTHING PULSES FOREVER
// ════════════════════════════════════════════════════════════════════════════
describe('an animation ends, and ends telling the truth', () => {
  const ANIMATED_ROOMS = [
    'src/components/profile/ProfileArchiveTab.tsx',
    'src/components/profile/ProfileLedgerTab.tsx',
    'src/components/profile/ProfileWatchlistTab.tsx',
    'src/components/profile/ProfileListsTab.tsx',
    'src/components/profile/ProfilePhysicalTab.tsx',
  ];

  it('no room repeats an animation forever', () => {
    // The Vault looped on `-1` and that was fixed a batch ago — where it was
    // FILED. The Ledger's and the Watchlist's search embers were the same
    // defect two files away and survived, because a fix applied to the
    // instance in front of you is not a fix applied to the class.
    const offenders: string[] = [];
    for (const f of ANIMATED_ROOMS) {
      const src = code(read(f));
      for (const m of src.matchAll(/withRepeat\([\s\S]{0,200}?\)/g)) {
        if (/,\s*-1\s*,/.test(m[0])) offenders.push(`${f}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the ember settles LIT, because an odd count reverses an odd number of times', () => {
    // The trap in the fix itself. `withRepeat(…, n, reverse)` alternates
    // direction each pass, so an EVEN count lands back where it started — the
    // ember would have gone dark while the search was still on, which is worse
    // than pulsing forever because it states something false.
    expect(EMBER_BEATS % 2).toBe(1);
    expect(EMBER_BEATS).toBeGreaterThan(1);
  });

  it('both embers read their rest value from one place', () => {
    // The icon turns red when the value is ABOVE rest. Written as a literal
    // 0.5 beside a constant that also happened to be 0.5, the two could drift
    // and the icon would sit permanently red — or never light at all.
    for (const f of ['src/components/profile/ProfileLedgerTab.tsx', 'src/components/profile/ProfileWatchlistTab.tsx']) {
      const src = code(read(f));
      expect(src).toMatch(/searchEmberOpacity\.value > EMBER_REST/);
      expect(src).not.toMatch(/searchEmberOpacity\.value > 0\.\d/);
    }
    expect(EMBER_REST).toBeGreaterThan(0);
    expect(EMBER_REST).toBeLessThan(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ONE VOCABULARY
// ════════════════════════════════════════════════════════════════════════════
describe('the six rooms are furnished from one place', () => {
  const ROOMS = [
    'src/components/profile/ProfileArchiveTab.tsx',
    'src/components/profile/ProfileLedgerTab.tsx',
    'src/components/profile/ProfileWatchlistTab.tsx',
    'src/components/profile/ProfileListsTab.tsx',
    'src/components/profile/ProfilePhysicalTab.tsx',
  ];

  it('every list room draws its furniture from roomStyles', () => {
    for (const f of ROOMS) {
      expect(read(f)).toMatch(/from '\.\/roomStyles'|from '@\/src\/components\/profile\/roomStyles'/);
    }
  });

  it('no room keeps a private copy of the shared furniture', () => {
    // Before this, `emptyTitle` was 20pt in three rooms and 15 in two;
    // `emptyDesc` was italic-12-bone in three and plain-10-fog in two; the
    // Vault's chips were pills while everyone else's were square.
    const DUPLICATED = ['emptyTitle:', 'emptyDesc:', 'emptyTitleSelf:', 'filterChip:', 'filterChipActive:', 'ctaBtn:', 'ctaBtnSelf:'];
    const offenders: string[] = [];
    for (const f of ROOMS) {
      const src = code(read(f));
      for (const key of DUPLICATED) if (src.includes(key)) offenders.push(`${f} :: ${key}`);
    }
    expect(offenders).toEqual([]);
  });

  it('every room closes, and none of them hard-codes its own bottom padding', () => {
    for (const f of ROOMS) {
      expect(read(f)).toMatch(/RoomFoot/);
      // `paddingBottom: 100` was a guess in all five — too much on a pushed
      // route, too little under a tab bar.
      expect(code(read(f))).not.toMatch(/paddingBottom:\s*100/);
    }
  });

  it('a room never describes its contents before its data has arrived', () => {
    // The lie this pass exists to remove: a member with 286 discs opening their
    // Vault and being told "nothing on the shelves yet".
    for (const f of ROOMS) {
      expect(read(f)).toMatch(/RoomRetrieving/);
    }
  });
});
