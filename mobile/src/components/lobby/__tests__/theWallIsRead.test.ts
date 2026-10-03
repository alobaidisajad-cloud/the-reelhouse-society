/**
 * theWallIsRead.test.ts — what the Lobby is sent, it reads carefully.
 * ─────────────────────────────────────────────────────────────────────────────
 *   THE WALL IS ONE CALL (get_lobby) and a failure is a failure: it throws, so
 *   the page can say so — never an empty wall for a member with no signal.
 *   A MALFORMED PIECE IS LEFT OFF, never drawn half: a log with no words, a
 *   member with no name (a door to nobody), a film with no id (a door nowhere).
 *   THE ONE-SHEET'S ART is the best-rated with no words on it, else a wordless
 *   still, else the film's own printed poster — said to be titled, so the house
 *   lays no words over it.
 */
import { directorOf, parseWall, pickArt, readFeature, readProgramme, readWall } from '../wallRead';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { groupNotifications } from '@/src/utils/groupNotifications';
import type { AppNotification } from '@/src/stores/notificationStore';

jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { trending: jest.fn(), detail: jest.fn(), keyArt: jest.fn() } }));

const author = (over: Record<string, unknown> = {}) => ({
  id: 'a1', username: 'morpho', avatar_url: null, role: 'cinephile', tier: 'auteur', is_founding: false, ...over,
});
const WALL = {
  edition: '2026-09-30',
  log: { id: 'l1', words: 'movies can be so sick sometimes', rating: 4, film: { id: 655, title: 'Paris, Texas', poster_path: '/p.jpg' }, author: author() },
  stack: { id: 's1', title: 'Cinema 2025', description: 'A year.', films: 11, posters: [{ film_id: 1, title: 'Weapons', poster_path: '/w.jpg' }], author: author() },
  filings: [
    { id: 'f1', kind: 'dossier', title: 'A Love Letter', text: 'There is a moment', words: 482, author: author({ username: 'sajjadobaidi' }) },
  ],
};

describe('the wall', () => {
  it('reads every piece the house sends, whole', () => {
    const w = parseWall(WALL);
    expect(w.edition).toBe('2026-09-30');
    expect(w.log).toMatchObject({ id: 'l1', film: { id: 655, title: 'Paris, Texas' }, author: { username: 'morpho' } });
    expect(w.stack).toMatchObject({ id: 's1', films: 11, posters: [{ film_id: 1 }] });
    expect(w.filings).toHaveLength(1);
  });

  it('leaves off a piece it cannot draw whole — a door to nobody is not drawn', () => {
    expect(parseWall({ ...WALL, log: { ...WALL.log, words: '   ' } }).log).toBeNull();
    expect(parseWall({ ...WALL, log: { ...WALL.log, author: author({ username: null }) } }).log).toBeNull();
    expect(parseWall({ ...WALL, log: { ...WALL.log, film: { title: 'No id' } } }).log).toBeNull();
    expect(parseWall({ ...WALL, stack: { ...WALL.stack, films: 'eleven' } }).stack).toBeNull();
    expect(parseWall({ ...WALL, filings: [{ id: 'f', kind: 'take' }, WALL.filings[0]] }).filings.map((f) => f.id)).toEqual(['f1']);
  });

  it('never more than three filings, and nothing at all from an answer that is not a wall', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...WALL.filings[0], id: `f${i}` }));
    expect(parseWall({ ...WALL, filings: many }).filings).toHaveLength(3);
    for (const junk of [null, 'wall', 42, []]) expect(parseWall(junk)).toEqual({ edition: null, log: null, stack: null, filings: [] });
  });

  it('carries no counts, whatever the house sends', () => {
    const w = parseWall({ ...WALL, log: { ...WALL.log, certify_count: 9 }, score: 3 });
    expect(JSON.stringify(w)).not.toMatch(/certif|score|critique/i);
  });

  it('a failed read throws — the page says so, never "nothing hangs"', async () => {
    jest.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never);
    await expect(readWall()).rejects.toMatchObject({ message: 'offline' });
    jest.mocked(supabase.rpc).mockResolvedValueOnce({ data: WALL, error: null } as never);
    await expect(readWall()).resolves.toMatchObject({ log: { id: 'l1' } });
    expect(supabase.rpc).toHaveBeenCalledWith('get_lobby');
  });
});

describe('the one-sheet', () => {
  it('its art: the best-rated with no words on it', () => {
    expect(pickArt({
      posters: [
        { file_path: '/titled.jpg', iso_639_1: 'en', vote_average: 9 },
        { file_path: '/plain.jpg', iso_639_1: null, vote_average: 2 },
        { file_path: '/finer.jpg', iso_639_1: null, vote_average: 5 },
      ],
      backdrops: [{ file_path: '/still.jpg', iso_639_1: null, vote_average: 8 }],
    }, '/poster.jpg')).toEqual({ path: '/finer.jpg', titled: false });
  });

  it('else a wordless still; else the film’s own poster, titled; else none', () => {
    expect(pickArt({ posters: [], backdrops: [{ file_path: '/still.jpg', iso_639_1: null }] }, '/poster.jpg')).toEqual({ path: '/still.jpg', titled: false });
    expect(pickArt({ posters: [{ file_path: '/en.jpg', iso_639_1: 'en' }], backdrops: [] }, '/poster.jpg')).toEqual({ path: '/poster.jpg', titled: true });
    expect(pickArt(null, null)).toEqual({ path: null, titled: false });
  });

  it('its director, as the credits name them; none when they name none', () => {
    expect(directorOf({ id: 1, title: 'x', credits: { crew: [{ job: 'Director', name: 'Joel Coen' }, { job: 'Director', name: 'Ethan Coen' }, { job: 'Editor', name: 'R' }] } } as never)).toBe('Joel Coen & Ethan Coen');
    expect(directorOf({ id: 1, title: 'x', credits: { crew: [] } } as never)).toBeNull();
    expect(directorOf(null)).toBeNull();
  });

  it('stands on what the programme knows when the catalogue cannot add to it', async () => {
    jest.mocked(tmdb.detail).mockRejectedValueOnce(new Error('unreachable'));
    jest.mocked(tmdb.keyArt).mockRejectedValueOnce(new Error('unreachable'));
    const sheet = await readFeature({ id: 7, title: 'Resident Evil', release_date: '2026-09-16', poster_path: '/re.jpg' });
    // ...and says it stands on less: a partial sheet is asked for again (useFeature)
    expect(sheet).toEqual({ id: 7, title: 'Resident Evil', year: '2026', runtime: null, director: null, art: { path: '/re.jpg', titled: true }, partial: true });
  });

  it('a catalogue that answered "not there" answered: that sheet is whole, and kept', async () => {
    jest.mocked(tmdb.detail).mockResolvedValueOnce(null as never);
    jest.mocked(tmdb.keyArt).mockResolvedValueOnce(null as never);
    expect((await readFeature({ id: 7, title: 'Resident Evil', poster_path: '/re.jpg' })).partial).toBe(false);
    jest.mocked(tmdb.detail).mockResolvedValueOnce(null as never);
    jest.mocked(tmdb.keyArt).mockRejectedValueOnce(new Error('unreachable'));
    expect((await readFeature({ id: 7, title: 'Resident Evil', poster_path: '/re.jpg' })).partial).toBe(true);
  });

  it('the programme: this week’s film, and four more on the bill', async () => {
    jest.mocked(tmdb.trending).mockResolvedValueOnce({ results: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })) } as never);
    const p = await readProgramme();
    expect(p.feature?.id).toBe(1);
    expect(p.bill.map((f) => f.id)).toEqual([2, 3, 4, 5]);
  });
});

describe('the notice of honour', () => {
  it('is never folded into the certifications of the same piece', () => {
    const n = (id: string, group_key: string, type: string): AppNotification => ({
      id, user_id: 'u', type, message: 'm', read: false, created_at: '2026-09-30T00:00:00Z', group_key,
    } as AppNotification);
    const shown = groupNotifications([
      n('1', 'lobby:log:11111111-1111-4111-8111-111111111111', 'featured'),
      n('2', 'endorse:log:11111111-1111-4111-8111-111111111111', 'endorse'),
      n('3', 'endorse:log:11111111-1111-4111-8111-111111111111', 'endorse'),
      n('4', 'endorse:log:11111111-1111-4111-8111-111111111111', 'endorse'),
    ], new Date('2026-09-30T01:00:00Z').getTime());
    // the three certifications are folded together (a group needs three); the honour stands alone, as itself
    expect(shown.filter((d) => d.kind === 'group').map((d) => d.kind === 'group' && d.ids.sort())).toEqual([['2', '3', '4']]);
    expect(shown.filter((d) => d.kind === 'individual').map((d) => d.kind === 'individual' && d.notification.id)).toEqual(['1']);
  });
});
