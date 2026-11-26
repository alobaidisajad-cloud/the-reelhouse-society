/**
 * anExportComesBackWhole.test.ts — the house's own export, brought back into an empty member.
 *
 * The import read each stack's film as `f.id ?? f.film_id`, but the export's films are
 * list_items rows, whose `id` is the row's own uuid. A uuid went into the integer film_id, every
 * film of every stack was refused, and the member saw the database's errors over empty stacks.
 * No test went round the whole way: the one stack test imported no films, and its mock took
 * any column of any type. Here the archive is the export's own (readHouseArchive, read from a
 * member's rows), written to text and read back as the file is, imported into another member on
 * a house that refuses what production refuses (supabaseFake: a uuid in an integer column
 * throws), and every row must come back: the same films, the same notes, in the same order.
 */
import { filmOf, importArchiveJSON } from '../archiveImport';
import { readHouseArchive } from '@/src/features/settings/houseArchive';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { PENDING_SQL, readColumns, SNAPSHOT_SQL } from '@/test-utils/schema';
import { dateOf } from '@/src/utils/instant';
import { byKey } from '@/src/utils/order';

jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: mockTo, tier: 'archivist', role: 'cinephile' } }) } }));
jest.mock('@/src/stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: { set: jest.fn(), delete: jest.fn(), getString: jest.fn() },
}));

type Row = Record<string, unknown>;
const uuid = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
const FROM = '11111111-1111-4111-8111-111111111111';
const mockTo = '22222222-2222-4222-8222-222222222222';

/** A log as production holds it: every column, the note kept apart (the column stays blank). */
const log = (n: number, over: Row): Row => ({
  id: uuid(100 + n), user_id: FROM, film_id: 0, film_title: '', rating: 0, review: '', watched_date: '2025-03-14',
  format: 'digital', created_at: '2025-03-14T20:15:00.123456+00:00', poster_path: null, year: null, status: 'watched',
  is_spoiler: false, watched_with: null, private_notes: null, abandoned_reason: null, physical_media: null,
  is_autopsied: false, autopsy: null, alt_poster: null, editorial_header: null, drop_cap: false, pull_quote: null,
  updated_at: '2025-03-14T20:15:00.123456+00:00', video_url: null, viewing_history: [], view_count: 1,
  viewing_id: uuid(200 + n), withheld_at: null, ...over,
});
const LOGS = [
  // Seen twice: the earlier viewing kept in the history, a note on each.
  log(1, {
    film_id: 426, film_title: 'Vertigo', year: '1958', rating: 4.5, review: 'The tower, again.', poster_path: '/vertigo.jpg',
    watched_date: '2025-06-01', view_count: 2, created_at: '2023-05-01T21:00:00+00:00', updated_at: '2025-06-01T22:10:00.5+00:00',
    viewing_history: [{ viewingId: uuid(301), date: '2023-05-01', rating: 4, review: 'The hair.', watchedWith: 'Ada' }],
  }),
  log(2, {
    film_id: 631, film_title: 'Sunrise', year: '1927', rating: 5, review: 'A song of two humans.', physical_media: 'Blu-ray',
    format: 'physical', is_spoiler: true, watched_with: 'Ada', editorial_header: '/sunrise-still.jpg', drop_cap: true,
    pull_quote: 'Two humans.', alt_poster: '/sunrise-alt.jpg',
  }),
  // An older log, written before the form kept an empty review as empty words.
  log(3, { film_id: 19, film_title: 'Metropolis', year: '1927', status: 'abandoned', abandoned_reason: 'The print was poor.', review: null }),
];
const NOTES: Row[] = [
  { log_id: uuid(101), viewing_id: uuid(201), user_id: FROM, notes: 'Second time: the tower.', updated_at: '2025-06-01T22:11:00+00:00' },
  { log_id: uuid(101), viewing_id: uuid(301), user_id: FROM, notes: 'First time: the hair.', updated_at: '2023-05-01T21:05:00+00:00' },
];
const WATCHLIST: Row[] = [653, 961, 10098].map((film, i) => ({
  id: uuid(400 + i), user_id: FROM, film_id: film, film_title: ['Nosferatu', 'The General', 'The Kid'][i],
  created_at: `2024-0${i + 1}-02T10:00:00+00:00`, updated_at: `2024-0${i + 1}-02T10:00:00+00:00`, poster_path: `/w${film}.jpg`, year: 1920 + i,
}));
const VAULT: Row[] = [
  { id: uuid(501), user_id: FROM, film_id: 631, film_title: 'Sunrise', poster_path: '/sunrise.jpg', year: 1927, formats: ['Blu-ray', '4K'], notes: 'The Masters of Cinema set.', condition: 'mint', created_at: '2024-12-25T09:00:00+00:00' },
  { id: uuid(502), user_id: FROM, film_id: 19, film_title: 'Metropolis', poster_path: null, year: 1927, formats: ['DVD'], notes: '', condition: 'good', created_at: '2022-02-02T09:00:00+00:00' },
];
const LISTS: Row[] = [
  { id: uuid(601), user_id: FROM, title: 'Silents, ranked', description: 'Before the talkies.', is_ranked: true, created_at: '2024-03-01T12:00:00+00:00', updated_at: '2024-03-02T12:00:00+00:00', is_private: false, withheld_at: null },
  { id: uuid(602), user_id: FROM, title: 'Kept to myself', description: null, is_ranked: false, created_at: '2024-04-01T12:00:00+00:00', updated_at: '2024-04-01T12:00:00+00:00', is_private: true, withheld_at: null },
];
/** Stacks' films, held out of their rank order (and out of the order they were added), as a table holds rows. */
const ITEMS: Row[] = [
  [601, 653, 'Nosferatu', 2, '2024-03-01T12:03:00+00:00'],
  [601, 631, 'Sunrise', 0, '2024-03-01T12:05:00+00:00'],
  [601, 19, 'Metropolis', 4, '2024-03-01T12:01:00+00:00'],
  [601, 961, 'The General', 1, '2024-03-01T12:04:00+00:00'],
  [601, 426, 'Vertigo', 3, '2024-03-01T12:02:00+00:00'],
  [602, 10098, 'The Kid', 1, '2024-04-01T12:01:00+00:00'],
  [602, 653, 'Nosferatu', 0, '2024-04-01T12:02:00+00:00'],
].map(([list, film, title, rank, at], i) => ({
  id: uuid(700 + i), list_id: uuid(list as number), film_id: film, film_title: title, rank_position: rank,
  created_at: at, updated_at: at, poster_path: `/p${String(film)}.jpg`,
}));

/** Every table the export reads, and what the member holds in it. */
const HELD: Record<string, Row[]> = {
  logs: LOGS, log_private_notes: NOTES, watchlists: WATCHLIST, physical_archive: VAULT, lists: LISTS, list_items: ITEMS,
};

let mockHouse = supabaseFake();
beforeEach(() => { mockHouse = supabaseFake({ rows: HELD }); });

/** Each table's columns, as the fake holds the house: production, and what a car not yet applied adds. */
const COLUMNS = readColumns(`${SNAPSHOT_SQL()}\n${PENDING_SQL()}`);
const columnsOf = (table: string) => [...(COLUMNS.get(table)?.keys() ?? [])];
const isStamp = (table: string, column: string) => /^timestamp/.test(COLUMNS.get(table)?.get(column)?.type ?? '');

const KEY = 'the row\'s own key: the import makes each anew';
const MEMBER = 'the member\'s own: whoever brings the file back';
const HOUSE = 'the house\'s withholding, never the member\'s to carry';
/**
 * Each column the export carries that is not asked to come back as it was, and why that is right.
 * Every other column of every table the export reads must come back (a new column too).
 */
const JUDGED: Record<string, Record<string, string>> = {
  logs: { id: KEY, user_id: MEMBER, viewing_id: 'made anew with the log, as each earlier viewing\'s; its note follows it (seen as which viewing)', withheld_at: HOUSE },
  log_private_notes: { user_id: MEMBER, updated_at: 'when the note is filed again' },
  watchlists: { id: KEY, user_id: MEMBER },
  physical_archive: { id: KEY, user_id: MEMBER },
  lists: { id: KEY, user_id: MEMBER, updated_at: 'when the stack is filed again', withheld_at: HOUSE },
  list_items: { id: KEY, updated_at: 'when the film is filed again' },
};

/**
 * The database's trg_divert_private_notes, which the fake does not run: a log written with a note
 * files it on the log's current viewing (log_private_notes), and the column is left blank.
 */
const divertNotes = () => {
  for (const l of mockHouse.rows('logs')) {
    const note = typeof l.private_notes === 'string' ? l.private_notes.trim() : '';
    if (note) mockHouse.rows('log_private_notes').push({ log_id: l.id, viewing_id: l.viewing_id, user_id: l.user_id, notes: note });
    l.private_notes = null;
  }
};

/**
 * A member's archive as they would see it: every column of every table, but those judged, each
 * row's identities read as what they name (a note's log as its film, its viewing as which viewing
 * of the log, a stack's film's stack as its title, its rank as its place), every instant as one.
 */
function seenBy(member: string): Record<string, string[]> {
  const own = (table: string) => mockHouse.rows(table).filter((r) => r.user_id === member);
  const logs = own('logs');
  const lists = own('lists');
  const items = mockHouse.rows('list_items').filter((i) => lists.some((l) => l.id === i.list_id));
  const logOf = (id: unknown) => logs.find((l) => l.id === id);
  const SEEN: Record<string, (v: unknown, row: Row) => unknown> = {
    'logs.viewing_history': (v) => (v as Row[]).map(({ viewingId: _anew, ...viewing }) => viewing),
    'log_private_notes.log_id': (v) => logOf(v)?.film_id,
    'log_private_notes.viewing_id': (v, row) => {
      const l = logOf(row.log_id);
      return v === l?.viewing_id ? 'current' : `earlier ${((l?.viewing_history ?? []) as Row[]).findIndex((e) => e.viewingId === v)}`;
    },
    'list_items.list_id': (v) => lists.find((l) => l.id === v)?.title,
    'list_items.rank_position': (_v, row) => items.filter((i) => i.list_id === row.list_id)
      .sort((a, b) => Number(a.rank_position) - Number(b.rank_position)).indexOf(row),
  };
  const rowsOf: Record<string, Row[]> = { logs, log_private_notes: own('log_private_notes'), watchlists: own('watchlists'), physical_archive: own('physical_archive'), lists, list_items: items };
  return Object.fromEntries(Object.keys(HELD).map((table) => [table, (rowsOf[table] ?? []).map((row) => JSON.stringify(Object.fromEntries(
    columnsOf(table).filter((c) => !(c in (JUDGED[table] ?? {}))).map((c) => {
      const seen = SEEN[`${table}.${c}`];
      const v = row[c] ?? null;
      return [c, seen ? seen(v, row) : isStamp(table, c) && typeof v === 'string' ? dateOf(v).toISOString() : v];
    }),
  ))).sort(byKey)]));
}

/** A member's stack of this title: its films, in their order. */
const stackOf = (member: string, title: string) => {
  const stack = mockHouse.rows('lists').find((l) => l.user_id === member && l.title === title);
  return mockHouse.rows('list_items').filter((i) => i.list_id === stack?.id)
    .sort((a, b) => Number(a.rank_position) - Number(b.rank_position)).map((i) => i.film_id);
};

describe('the house export, brought back into an empty member', () => {
  it('every row comes back: the same films, the same notes, every stack in the same order', async () => {
    const before = seenBy(FROM);
    // As the member's file holds it: written out to text, and read back.
    const file = JSON.parse(JSON.stringify(await readHouseArchive(FROM)));
    expect(Object.values(seenBy(mockTo)).flat()).toEqual([]);

    const result = await importArchiveJSON(file, mockTo);
    divertNotes();

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    const after = seenBy(mockTo);
    expect(after).toEqual(before);
    expect([stackOf(mockTo, 'Kept to myself'), stackOf(mockTo, 'Silents, ranked')]).toEqual([[653, 10098], [631, 961, 653, 426, 19]]);
    for (const table of Object.keys(HELD)) expect(after[table]).toHaveLength(HELD[table]?.length ?? -1);
    // Nothing of the first member's was moved or added to.
    expect(mockHouse.rows('list_items').filter((i) => [uuid(601), uuid(602)].includes(String(i.list_id)))).toHaveLength(ITEMS.length);
  });

  it('is asked of every table the export reads, every column of each held, and judges only columns there are', async () => {
    const asked = mockHouse.asked.length;
    await readHouseArchive(FROM);
    const read = mockHouse.asked.slice(asked).flatMap((a) => [a.table, ...(a.embeds ?? []).map((e) => e.table)]);
    expect([...new Set(read)].sort(byKey)).toEqual(Object.keys(HELD).sort(byKey));
    // A column the house adds is held here, so the round trip asks it back, or is judged with its reason.
    for (const [table, rows] of Object.entries(HELD)) {
      for (const row of rows) expect([table, Object.keys(row).sort(byKey)]).toEqual([table, columnsOf(table).sort(byKey)]);
      for (const column of Object.keys(JUDGED[table] ?? {})) expect([table, columnsOf(table)]).toEqual([table, expect.arrayContaining([column])]);
    }
  });

  it('a film named by a row\'s own key is refused plainly, never written; the stack\'s other films keep their order', async () => {
    const file = JSON.parse(JSON.stringify(await readHouseArchive(FROM)));
    const stack = file.lists.find((l: Row) => l.title === 'Silents, ranked');
    // A film whose film_id is lost: all it carries is its row's uuid.
    const lost = stack.films.find((f: Row) => f.film_id === 961);
    delete lost.film_id;

    const result = await importArchiveJSON(file, mockTo);

    expect(result.errors).toEqual(['Stack "Silents, ranked": "The General" bears no film number the house can file, so it was left out.']);
    expect(stackOf(mockTo, 'Silents, ranked')).toEqual([631, 653, 426, 19]);
  });

  it('the first export (1.0, the stores written out) named a stack\'s film and a watchlist entry by `id`, and they come back', async () => {
    const result = await importArchiveJSON({
      meta: { version: '1.0' },
      watchlist: [{ id: 653, title: 'Nosferatu', poster_path: '/n.jpg', year: 1922 }],
      lists: [{ id: 'stack-1', title: 'Silents', isRanked: true, films: [{ id: 426, title: 'Vertigo', poster: '/v.jpg' }, { id: 19, title: 'Metropolis' }] }],
    } as never, mockTo);
    expect(result.errors).toEqual([]);
    expect(mockHouse.rows('watchlists').filter((w) => w.user_id === mockTo).map((w) => w.film_id)).toEqual([653]);
    expect(stackOf(mockTo, 'Silents')).toEqual([426, 19]);
  });

  it('a film number is a whole number above nought that film_id holds; anything else is refused, and none is missing', () => {
    expect(filmOf({ film_id: 426, id: uuid(1) }, ['film_id', 'id'])).toEqual({ film: 426 });
    expect(filmOf({ film_id: '426' }, ['film_id'])).toEqual({ film: 426 });
    expect(filmOf({ id: uuid(1) }, ['film_id', 'id'])).toEqual({ refused: true });
    for (const bad of [0, -3, 4.5, 2 ** 31, 'Vertigo', true]) expect(filmOf({ film_id: bad }, ['film_id'])).toEqual({ refused: true });
    expect(filmOf({ id: 426 }, ['film_id', 'filmId'])).toEqual({ missing: true });
    expect(filmOf({ film_id: null, filmId: '' }, ['film_id', 'filmId'])).toEqual({ missing: true });
  });
});
