/**
 * A GENERATOR, not a test. Renders each room and converts the resolved React
 * Native tree into HTML with the same computed styles, so the mockup is derived
 * from the components rather than drawn from memory.
 *
 * Run: npx jest zz-mockup.gen --silent
 * Writes: scratchpad/mockups/<room>.html fragment + a manifest.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from './zz-render.lib';
import { POSTERS, POSTER_PATHS, POSTER_TITLES, LOCAL_ART, FACE_PATHS } from './zz-art.gen';

const ART = { posters: POSTERS, local: LOCAL_ART };


jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));

/**
 * ── THE PHONE IS 390pt WIDE ──────────────────────────────────────────────────
 * React Native's test renderer reports a 750pt-wide screen by default, so every
 * room that sizes its grid from `useWindowDimensions` laid out for a TABLET:
 * 231px poster cells in a 717px row. Dropped into a 390px frame, the third
 * column ran off the edge — which looked exactly like the clipping bug this
 * pass fixed, and was really the mockup lying about the device.
 *
 * The components were right the whole time: at 390pt `posterColumns` returns a
 * 111px cell and a 357px row inside 358px of space.
 */
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

/**
 * FlashList measures off-screen: in the test renderer it emits scaffolding at
 * `top: 1000000px` with zero heights, which is correct for virtualisation and
 * meaningless as a picture. This lays the same children out plainly so the
 * geometry in the mockup is the geometry the phone draws.
 */
// Written without TypeScript annotations on purpose: jest hoists this factory
// above the imports and its plugin reads the raw identifiers, so a `Record<…>`
// in here reads as an out-of-scope variable reference and the suite refuses to
// run.
jest.mock('@shopify/flash-list', () => {
  const mockRN = require('react-native');
  const mockReact = require('react');
  const Mocked = mockReact.forwardRef(function MockFlashList(props: any, ref: any) {
    const data = props.data || [];
    const numColumns = props.numColumns || 1;
    const asEl = (C: any) => (!C ? null : mockReact.isValidElement(C) ? C : mockReact.createElement(C));
    const items = data.map((item: any, index: number) =>
      mockReact.createElement(
        mockRN.View,
        { key: props.keyExtractor ? props.keyExtractor(item, index) : String(index) },
        props.renderItem ? props.renderItem({ item, index }) : null,
      ),
    );
    let body = items;
    if (numColumns > 1) {
      body = [];
      for (let i = 0; i < items.length; i += numColumns) {
        body.push(
          mockReact.createElement(
            mockRN.View,
            { key: 'r' + i, style: { flexDirection: 'row' } },
            items.slice(i, i + numColumns),
          ),
        );
      }
    }
    return mockReact.createElement(
      mockRN.View,
      { ref, style: props.contentContainerStyle },
      asEl(props.ListHeaderComponent),
      data.length === 0 ? asEl(props.ListEmptyComponent) : body,
      asEl(props.ListFooterComponent),
    );
  });
  return { FlashList: Mocked, FlashListProps: {} };
});

const OUT = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad/mockups';

// ── fixtures ────────────────────────────────────────────────────────────────
const TITLES = POSTER_TITLES;

const film = (i: number, o: Record<string, unknown> = {}) => ({
  id: `l${i}`, filmId: 400 + i, title: TITLES[i % TITLES.length],
  poster: POSTER_PATHS[i % POSTER_PATHS.length],
  poster_path: POSTER_PATHS[i % POSTER_PATHS.length], year: 1960 + ((i * 7) % 45), rating: (i % 5) + 1,
  status: 'watched', formats: [['bluray', 'dvd', '4k', 'vhs'][i % 4]], notes: '',
  condition: 'good', createdAt: '2026-01-01T00:00:00Z',
  review: 'A slow burn that earns every minute of its length, and then asks for one more.',
  ...o,
});
const SHELF = Array.from({ length: 9 }, (_, i) => film(i)) as never[];

const MONTHS = (items: unknown[]) => ({ 'JANUARY 2026': items.slice(0, 5), 'DECEMBER 2025': items.slice(5) });

/** A stack card draws a strip of up to three posters behind its title. */
const STACK_POSTERS = POSTER_PATHS.slice(0, 3).map((p) => ({ poster: p }));

const ROOMS: [string, string, () => React.ReactElement][] = [
  ['plate', 'The Room Plate', () => {
    const { RoomPlate } = require('../RoomParts');
    // The header every room sits under, rendered once by the screen.
    return <RoomPlate name="THE ARCHIVE" member="kane" count="1,247 films"
      tier="auteur" onBack={jest.fn()} />;
  }],
  ['archive', 'The Archive', () => {
    const T = require('../ProfileArchiveTab').default;
    const { ProfilePosterCard } = require('../ProfilePosterCard');
    return <T logs={SHELF} archiveFiltered={SHELF} archiveSieve="all" setArchiveSieve={jest.fn()}
      renderPosterCard={(log: never, w: number) => <ProfilePosterCard item={log} width={w} showRating />}
      groupByMonth={MONTHS} monthCounts={[{ month: '2026-01', count: 41 }, { month: '2025-12', count: 28 }]}
      isSelf ready totalFilms={1247} archiveSearch="" setArchiveSearch={jest.fn()} />;
  }],
  ['ledger', 'The Ledger', () => {
    const T = require('../ProfileLedgerTab').default;
    return <T logs={SHELF} ledgerFiltered={SHELF} ledgerSearch="" setLedgerSearch={jest.fn()}
      ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()} halfLifeMap={{}}
      groupByMonth={MONTHS} isSelf ready />;
  }],
  ['watchlist', 'The Watchlist', () => {
    const T = require('../ProfileWatchlistTab').default;
    const { ProfilePosterCard } = require('../ProfilePosterCard');
    return <T watchlist={SHELF} watchlistFiltered={SHELF} isSelf watchlistSearch=""
      setWatchlistSearch={jest.fn()} watchlistSort="default" setWatchlistSort={jest.fn()}
      watchlistDecade={null} setWatchlistDecade={jest.fn()}
      decades={[{ decade: 2020, count: 31 }, { decade: 2010, count: 44 }, { decade: 1990, count: 12 }]}
      setRouletteOpen={jest.fn()}
      renderPosterCard={(f: never, w: number) => <ProfilePosterCard item={f} width={w} />} ready />;
  }],
  ['vault', 'The Vault', () => {
    const T = require('../ProfilePhysicalTab').default;
    return <T isSelf vault={SHELF} physicalFiltered={SHELF} physicalFilter={null}
      setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
      physicalFormatCounts={[]} ready totalVault={214}
      vaultFormats={[{ format: 'bluray', count: 96 }, { format: 'dvd', count: 71 }, { format: '4k', count: 32 }, { format: 'vhs', count: 15 }]}
      physicalSearch="" setPhysicalSearch={jest.fn()} />;
  }],
  ['stacks', 'The Stacks', () => {
    const T = require('../ProfileListsTab').default;
    const lists = [
      { id: '1', title: 'Neon and Rain', description: 'Cities that only exist after midnight.', isRanked: true, isPrivate: false, createdAt: '2026-01-01', filmCount: 24, films: STACK_POSTERS },
      { id: '2', title: 'The Long Take', description: 'One shot, no mercy.', isRanked: false, isPrivate: false, createdAt: '2026-01-01', filmCount: 11, films: STACK_POSTERS },
      { id: '3', title: 'Grief, Handled Well', description: '', isRanked: false, isPrivate: true, createdAt: '2026-01-01', filmCount: 8, films: STACK_POSTERS },
      { id: '4', title: 'Kurosawa, In Order', description: 'Chronological. No exceptions.', isRanked: true, isPrivate: false, createdAt: '2026-01-01', filmCount: 30, films: STACK_POSTERS },
    ];
    return <T lists={lists as never} totalLists={4} isSelf ready listsSearch="" setListsSearch={jest.fn()}
      listsSort="default" setListsSort={jest.fn()} />;
  }],
  ['projector', 'The Projector Room', () => {
    const { ProjectorRoom } = require('../ProjectorRoom');
    const { TasteDNA } = require('../TasteDNA');
    const { CinematicInsights } = require('../CinematicInsights');
    const taste = {
      films_total: 1247, films_known: 1247,
      genres: [{ name: 'Drama', count: 612 }, { name: 'Thriller', count: 288 },
        { name: 'Comedy', count: 201 }, { name: 'Horror', count: 164 },
        { name: 'Romance', count: 143 }, { name: 'Science Fiction', count: 121 }],
      actors: [
        { id: 1, name: 'Toshiro Mifune', profile_path: FACE_PATHS[0], count: 31 },
        { id: 2, name: 'Setsuko Hara', profile_path: FACE_PATHS[1], count: 22 },
        { id: 3, name: 'Maggie Cheung', profile_path: FACE_PATHS[2], count: 18 },
      ],
      directors: [
        { id: 9, name: 'Akira Kurosawa', profile_path: FACE_PATHS[3], count: 26 },
        { id: 10, name: 'Wong Kar-wai', profile_path: FACE_PATHS[4], count: 14 },
      ],
      countries: [{ code: 'JP', count: 300 }], total_runtime: 128400,
    };
    return (
      <>
        <ProjectorRoom stats={{ count: 1247, level: 'THE ORACLE', color: '#B8891A', progress: 100 }}
          user={{ username: 'kane' }} streak={9}
          record={{ longest_streak: 31, current_streak: 9, avg_rating: 3.8,
            monthly_activity: [{ month: '2025-11', count: 22 }, { month: '2025-12', count: 28 }, { month: '2026-01', count: 41 }] }} />
        <div style={{ height: 32 } as never} />
        <TasteDNA taste={taste} username="kane" memberNo="0042" />
        <div style={{ height: 32 } as never} />
        <CinematicInsights taste={taste} />
      </>
    );
  }],
];

const RUN = !!process.env.MOCKUPS;
const gate = RUN ? describe : describe.skip;
gate('mockup generator', () => {
  it('writes an HTML fragment per room', () => {
    mkdirSync(OUT, { recursive: true });
    const manifest: { id: string; label: string; bytes: number }[] = [];
    for (const [id, label, build] of ROOMS) {
      const html = toHtml(render(build()).toJSON(), ART);
      writeFileSync(join(OUT, `${id}.html`), html, 'utf8');
      manifest.push({ id, label, bytes: html.length });
    }
    writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    // eslint-disable-next-line no-console
    console.log('WROTE:', manifest.map((m) => `${m.id}(${m.bytes}b)`).join(' '));
    expect(manifest.length).toBe(7);
  });
});
