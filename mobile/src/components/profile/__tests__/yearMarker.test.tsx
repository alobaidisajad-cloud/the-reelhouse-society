/**
 * yearMarker.test.tsx — a year is a boundary, not a label.
 *
 * Every rail used to carry one: JANUARY 2026, DECEMBER 2025, NOVEMBER 2025,
 * OCTOBER 2025 — the same four digits read eleven more times, set in the
 * loudest face on the row, while the month that actually tells one rail from
 * the next was the quietest thing on it.
 *
 * These pin both halves of the correction: the year prints only where it turns
 * over, and the MONTH is now the heading.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { yearMarker, r } from '../roomStyles';
import { RoomRail } from '../RoomParts';
import { type as t } from '@/src/theme/theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));

describe('a year prints only where it changes', () => {
  it('keeps the first one, so a list never opens without a year', () => {
    const mark = yearMarker();
    expect(mark('2026')).toBe('2026');
  });

  it('drops the repeats', () => {
    const mark = yearMarker();
    const seen = ['2026', '2026', '2026'].map(mark);
    expect(seen).toEqual(['2026', '', '']);
  });

  it('prints again at the turn of the year', () => {
    const mark = yearMarker();
    const months = ['2026', '2026', '2025', '2025', '2025', '2024'];
    expect(months.map(mark)).toEqual(['2026', '', '2025', '', '', '2024']);
  });

  it('prints again if a list returns to a year it already left', () => {
    // Not the normal order, but a sort could produce it, and a silent blank
    // would then attach a month to the wrong year.
    const mark = yearMarker();
    expect(['2026', '2025', '2026'].map(mark)).toEqual(['2026', '2025', '2026']);
  });

  it('treats an empty year as nothing to mark', () => {
    const mark = yearMarker();
    expect(mark('')).toBe('');
    // …and does not let the blank become the "last" year, which would then
    // swallow the first real one.
    expect(mark('2026')).toBe('2026');
  });

  it('gives each room its own tracker', () => {
    // The Archive and the Ledger build their lists in the same render pass. A
    // shared variable would let one room's last year silence the other's first.
    const archive = yearMarker();
    const ledger = yearMarker();
    expect(archive('2026')).toBe('2026');
    expect(ledger('2026')).toBe('2026');
  });
});

describe('the month is the heading now, not the year', () => {
  it('sets the month in the display face at the rail size', () => {
    expect(r.railLabel.fontSize).toBe(t.rail);
    // The face carries the promotion as much as the size does.
    expect(String(r.railLabel.fontFamily)).toMatch(/^Rye/);
  });

  it('demotes the year to a quiet tag', () => {
    expect(r.railYear.fontSize).toBe(t.label);
    expect(r.railYear.fontSize).toBeLessThan(Number(r.railLabel.fontSize));
    expect(String(r.railYear.fontFamily)).toMatch(/^SpecialElite/);
  });

  it('does not letter-space a display serif', () => {
    // Spacing Rye is what pushed the rail to within 19pt of the screen edge on
    // a 320pt phone at maximum text size. See railFits.test.ts.
    //
    // Read through a cast because StyleSheet.create infers the literal shape,
    // so `r.railLabel.letterSpacing` is a COMPILE error while the rule is
    // correct — tsc is already guarding this, and this keeps the guard visible
    // (and still failing) if someone adds the property back.
    expect((r.railLabel as Record<string, unknown>).letterSpacing).toBeUndefined();
  });

  it('renders a rail with no year at all', () => {
    // What eleven rails out of twelve now look like.
    const { getByText, queryByText } = render(<RoomRail label="NOVEMBER" count="22 FILMS" />);
    expect(getByText('NOVEMBER')).toBeTruthy();
    expect(getByText('22 FILMS')).toBeTruthy();
    expect(queryByText(/^\d{4}$/)).toBeNull();
  });

  it('renders the boundary rail with its year', () => {
    const { getByText } = render(<RoomRail lead="2025" label="DECEMBER" count="28 FILMS" />);
    expect(getByText('2025')).toBeTruthy();
    expect(getByText('DECEMBER')).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE ROOMS ACTUALLY USE IT
// ════════════════════════════════════════════════════════════════════════════
/**
 * Caught by mutation: every test above passed while BOTH rooms went back to
 * `lead: year` and printed 2025 on all three of its rails. The rule was proved
 * and the wiring was not — the same shape of gap that let two rooms keep their
 * own search box.
 *
 * So these mount the rooms and count the years on screen.
 */
const film = (i: number) => ({
  id: `l${i}`, filmId: 400 + i, title: 'Stalker', poster: '/p.jpg', poster_path: '/p.jpg',
  year: 1979, rating: 4, status: 'watched', formats: [], notes: '', condition: 'good',
  createdAt: '2026-01-01T00:00:00Z', review: 'Held its nerve to the last frame.',
});
const SIX = Array.from({ length: 6 }, (_, i) => film(i)) as never[];

/** Three months, two of them sharing a year. */
const THREE_MONTHS = (items: never[]) => ({
  'JANUARY 2026': items.slice(0, 2),
  'DECEMBER 2025': items.slice(2, 4),
  'NOVEMBER 2025': items.slice(4),
});

describe('both rooms print a year once per year, not once per month', () => {
  it('the Archive', () => {
    const T = require('../ProfileArchiveTab').default;
    const { queryAllByText } = render(
      <T logs={SIX} archiveFiltered={SIX} archiveSieve="all" setArchiveSieve={jest.fn()}
        renderPosterCard={() => null} groupByMonth={THREE_MONTHS}
        isSelf ready totalFilms={6} />,
    );
    expect(queryAllByText('2026')).toHaveLength(1);
    // The one that matters: 2025 spans TWO rails and must appear once.
    expect(queryAllByText('2025')).toHaveLength(1);
    // All three months still name themselves.
    for (const m of ['JANUARY', 'DECEMBER', 'NOVEMBER']) {
      expect(queryAllByText(m)).toHaveLength(1);
    }
  });

  it('the Ledger', () => {
    const T = require('../ProfileLedgerTab').default;
    const { queryAllByText } = render(
      <T logs={SIX} ledgerFiltered={SIX} ledgerSearch="" setLedgerSearch={jest.fn()}
        ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()} halfLifeMap={{}}
        groupByMonth={THREE_MONTHS} isSelf ready />,
    );
    expect(queryAllByText('2026')).toHaveLength(1);
    expect(queryAllByText('2025')).toHaveLength(1);
    for (const m of ['JANUARY', 'DECEMBER', 'NOVEMBER']) {
      expect(queryAllByText(m)).toHaveLength(1);
    }
  });
});
