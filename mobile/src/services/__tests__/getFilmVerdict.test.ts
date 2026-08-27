/**
 * getFilmVerdict — the one call that decides whether the house speaks.
 *
 * Every failure mode here ends the same way: a film page that shows a verdict
 * nobody holds, or hides one that exists. Neither raises anything.
 */
import { FilmService } from '@/src/services/FilmService';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

/** The PostgREST chain, ending in maybeSingle(). */
function mockRow(result: { data?: unknown; error?: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null, ...result });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

beforeEach(() => jest.clearAllMocks());

describe('the numeric that arrives as a string', () => {
  /**
   * Postgres `numeric` comes back through PostgREST as a STRING. Read as a
   * number it is NaN, `NaN > 0` is false, and the page silently decides the
   * house has never spoken about a film four hundred people rated. Nothing
   * throws, nothing logs, and the bug looks like missing data.
   */
  it('coerces it rather than trusting it', async () => {
    mockRow({ data: { avg_rating: '4.25', rating_count: 30, log_count: 37 } });
    const v = await FilmService.getFilmVerdict(603);
    expect(v.avg_rating).toBe(4.25);
    expect(v.log_count).toBe(37);
  });

  it('takes a real number just as happily', async () => {
    mockRow({ data: { avg_rating: 3.5, rating_count: 2, log_count: 2 } });
    expect((await FilmService.getFilmVerdict(603)).avg_rating).toBe(3.5);
  });

  it('treats an unparseable average as silence, not as zero reels', async () => {
    mockRow({ data: { avg_rating: 'not a number', rating_count: 1, log_count: 1 } });
    expect((await FilmService.getFilmVerdict(603)).avg_rating).toBeNull();
  });

  it('treats a zero average as silence too', async () => {
    // Nobody can score zero — a 0 here means "no ratings", and drawing it would
    // put an empty reel rail on the page as if that were a verdict.
    mockRow({ data: { avg_rating: 0, rating_count: 0, log_count: 5 } });
    expect((await FilmService.getFilmVerdict(603)).avg_rating).toBeNull();
  });
});

describe('a film nobody has touched', () => {
  it('has no row, and that is not a failure', async () => {
    // The commonest case in an archive of a million titles.
    mockRow({ data: null });
    expect(await FilmService.getFilmVerdict(603)).toEqual({ avg_rating: null, rating_count: 0, log_count: 0 });
  });

  it('counts logs that carry no rating', async () => {
    mockRow({ data: { avg_rating: null, rating_count: 0, log_count: 12 } });
    const v = await FilmService.getFilmVerdict(603);
    expect(v.avg_rating).toBeNull();
    expect(v.log_count).toBe(12);
  });
});

describe('when the network is having a day', () => {
  /**
   * supabase-js RESOLVES its errors rather than throwing them, so a `try` around
   * this call catches nothing. The branch that reads `error` is the only thing
   * between a blip and a fabricated verdict.
   */
  it('returns silence rather than a verdict when the query errors', async () => {
    mockRow({ data: { avg_rating: 5, log_count: 99 }, error: { message: 'network' } });
    expect(await FilmService.getFilmVerdict(603)).toEqual({ avg_rating: null, rating_count: 0, log_count: 0 });
  });

  it('never throws, because the film must still render', async () => {
    mockRow({ data: undefined, error: { message: 'boom' } });
    await expect(FilmService.getFilmVerdict(603)).resolves.toBeDefined();
  });
});

describe('it refuses to ask a question that has no answer', () => {
  it.each([0, -1, NaN, Infinity])('does not query for film id %p', async (id) => {
    mockRow({ data: null });
    const v = await FilmService.getFilmVerdict(id as number);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(v).toEqual({ avg_rating: null, rating_count: 0, log_count: 0 });
  });

  it('asks for exactly the three columns it needs', async () => {
    const { select, eq } = mockRow({ data: null });
    await FilmService.getFilmVerdict(603);
    expect(supabase.from).toHaveBeenCalledWith('films');
    expect(select).toHaveBeenCalledWith('avg_rating, rating_count, log_count');
    expect(eq).toHaveBeenCalledWith('id', 603);
  });
});
