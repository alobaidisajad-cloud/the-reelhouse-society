/**
 * roomContrast.test.tsx — the rooms stay readable in a dark room.
 *
 * This palette is warm and low-key by design, and it spends its readability
 * budget on OPACITY: `fog` is 6.68:1 on ink at full strength, 4.59 at 0.80,
 * 3.04 at 0.60, and invisible outdoors at 0.30. Those numbers live in a comment
 * in theme.ts, which means nothing enforces them — a designer lowering one
 * opacity by 0.15 to "soften" a line can push it under the floor, and it will
 * look fine on the bright desk monitor where the change was made.
 *
 * So this renders all six rooms and composites every piece of text against the
 * surface it is ACTUALLY painted on — inherited opacity included, which is the
 * part a static scan of the stylesheet cannot see.
 *
 * WCAG AA: 4.5:1 for body text, 3:1 for large (>=18pt, or >=14pt bold).
 */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));

/** colors.ink — the page under everything. */
const INK = [10, 9, 6];

/**
 * Purely decorative glyphs, exempt under WCAG 1.4.3 and deliberately faint.
 * Listed by the CHARACTER rather than by style name, so restyling an ornament
 * cannot accidentally exempt a sentence.
 */
const ORNAMENTS = new Set(['✦', '✧', '·', '—']);

function parse(c: unknown): [number, number, number, number] | null {
  if (typeof c !== 'string' || !c) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
  if (rgba) {
    const p = rgba[1].split(',').map((x) => parseFloat(x.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}

const over = (src: [number, number, number, number], dst: number[]) =>
  [0, 1, 2].map((i) => src[i] * src[3] + dst[i] * (1 - src[3]));

const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (fg: number[], bg: number[]) => {
  const a = luminance(fg) + 0.05;
  const b = luminance(bg) + 0.05;
  return a > b ? a / b : b / a;
};

const flat = (s: unknown): Record<string, unknown> => {
  if (!s) return {};
  if (Array.isArray(s)) return s.reduce<Record<string, unknown>>((acc, x) => ({ ...acc, ...flat(x) }), {});
  return s as Record<string, unknown>;
};

interface Finding { text: string; color: string; size: number; ratio: number; need: number; }

function audit(node: unknown, bg: number[], opacity: number, out: Finding[]) {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] };
  const st = flat(n.props?.style);

  let surface = bg;
  const bgc = parse(st.backgroundColor);
  if (bgc) surface = over(bgc, bg);

  let op = opacity;
  if (typeof st.opacity === 'number') op *= st.opacity;

  if (n.type === 'Text') {
    const col = parse(st.color);
    if (col) {
      const size = typeof st.fontSize === 'number' ? st.fontSize : 14;
      const bold = st.fontWeight === 'bold' || Number(st.fontWeight) >= 700;
      const text = (n.children || []).filter((c) => typeof c === 'string').join('').trim();
      if (!ORNAMENTS.has(text)) {
        out.push({
          text: text.slice(0, 40) || '(dynamic)',
          color: String(st.color),
          size,
          ratio: ratio(over([col[0], col[1], col[2], col[3] * op], surface), surface),
          need: size >= 18 || (size >= 14 && bold) ? 3 : 4.5,
        });
      }
    }
  }
  for (const c of n.children || []) audit(c, surface, op, out);
}

const film = (o: Record<string, unknown> = {}) => ({
  id: 'l1', filmId: 42, title: 'Stalker', poster: '/s.jpg', poster_path: '/s.jpg',
  year: 1979, rating: 4, status: 'watched', formats: ['bluray'], notes: '',
  condition: 'good', createdAt: '2026-01-01T00:00:00Z', ...o,
});
const SHELF = Array.from({ length: 6 }, (_, i) => film({ id: `l${i}`, filmId: 40 + i })) as never[];

const ROOMS: [string, () => React.ReactElement][] = [
  ['Archive', () => {
    const T = require('../ProfileArchiveTab').default;
    /**
     * A real month grouping AND real server month counts, so the month rail
     * renders WITH its count. A mutation pass proved why: softening
     * `railCount` to 0.30 opacity — under three to one, the shade this
     * palette's own comment calls invisible outdoors — survived, because no
     * fixture ever rendered a rail that had a count on it. The guard was sound;
     * nothing had walked past that line.
     */
    return <T logs={SHELF} archiveFiltered={SHELF} archiveSieve="all" setArchiveSieve={jest.fn()}
      renderPosterCard={() => null}
      groupByMonth={(items: unknown[]) => ({ 'JANUARY 2026': items })}
      monthCounts={[{ month: '2026-01', count: 6 }]}
      isSelf ready totalFilms={6} />;
  }],
  ['Ledger', () => {
    const T = require('../ProfileLedgerTab').default;
    // A REAL grouping. `() => ({})` renders no rows at all, so the contrast
    // assertion passed having examined the header and nothing else — which the
    // "has text to check" guard caught. A fixture that renders an empty room is
    // the quietest way to make a suite report success about nothing.
    return <T logs={SHELF} ledgerFiltered={SHELF} ledgerSearch="" setLedgerSearch={jest.fn()}
      ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()} halfLifeMap={{}}
      groupByMonth={(items: unknown[]) => ({ 'JANUARY 2026': items })} isSelf ready />;
  }],
  ['Watchlist', () => {
    const T = require('../ProfileWatchlistTab').default;
    return <T watchlist={SHELF} watchlistFiltered={SHELF} isSelf watchlistSearch=""
      setWatchlistSearch={jest.fn()} watchlistSort="default" setWatchlistSort={jest.fn()}
      watchlistDecade={null} setWatchlistDecade={jest.fn()} decades={[]}
      setRouletteOpen={jest.fn()} renderPosterCard={() => null} ready />;
  }],
  ['Vault', () => {
    const T = require('../ProfilePhysicalTab').default;
    return <T isSelf vault={SHELF} physicalFiltered={SHELF} physicalFilter={null}
      setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
      physicalFormatCounts={[]} ready totalVault={6} />;
  }],
  ['Stacks', () => {
    const T = require('../ProfileListsTab').default;
    return <T lists={[{ id: '1', title: 'Noir Essentials', description: 'The wet street canon.',
      isRanked: true, isPrivate: false, createdAt: '2026-01-01', filmCount: 12, films: [] }] as never}
      totalLists={1} isSelf ready />;
  }],
  ['Projector', () => {
    const { ProjectorRoom } = require('../ProjectorRoom');
    return <ProjectorRoom stats={{ count: 1247, level: 'THE ORACLE', color: '#B8891A', progress: 100 }}
      user={{ username: 'kane' }} streak={4}
      record={{ longest_streak: 31, current_streak: 4, avg_rating: 3.5,
        monthly_activity: [{ month: '2026-01', count: 9 }] }} />;
  }],
];

describe.each(ROOMS)('%s stays readable', (name, build) => {
  const findings: Finding[] = [];
  audit(render(build()).toJSON(), INK, 1, findings);

  it('has text to check at all', () => {
    // Without this, a room that silently rendered nothing would "pass".
    expect(findings.length).toBeGreaterThan(2);
  });

  it('draws no text below WCAG AA on the surface behind it', () => {
    const below = findings
      .filter((f) => f.ratio < f.need)
      .map((f) => `${f.ratio.toFixed(2)}:1 needs ${f.need} — ${f.color} @${f.size}pt "${f.text}"`);
    expect(below).toEqual([]);
  });
});
