/**
 * A person's read keeps what their page draws, not the catalogue's whole answer (nightly 2026-11-24).
 *
 * The route walk's cache held Hayao Miyazaki's every credit whole, and one write of the cache held
 * the JS thread 118 ms on the right-to-left phone and 236 ms on the tablet, past the 100 ms a write
 * may hold it. Measured here on the repo's own recorded answer (person 608), each credit kept as the
 * page draws it: the fields the page reads, and nothing it does not.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { creditAsDrawn, personAsDrawn } from '@/src/hooks/personAsDrawn';

const DIR = join(__dirname, '..', '..', '..', 'e2e', 'supabase', 'functions', 'tmdb-proxy', 'fixtures');
/** One recorded answer's body, by its file's name. */
const body = (file: string) => (JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { body: Record<string, any> }).body;
const size = (v: unknown) => JSON.stringify(v).length;

describe("a person's read keeps what their page draws", () => {
  const credits = body('person_608_movie_credits.b4ca27e4.json');
  const person = body('person_608.4b9b6dbe.json');
  const whole = [...credits.cast, ...credits.crew] as Record<string, unknown>[];

  it('reads the recorded answer: over two hundred credits', () => {
    expect(whole.length).toBeGreaterThan(200);
  });

  it('keeps of each credit only what the page reads, each as the answer gave it', () => {
    for (const c of whole) {
      const kept = creditAsDrawn(c) as unknown as Record<string, unknown>;
      for (const k of Object.keys(kept)) expect([k, kept[k]]).toEqual([k, c[k]]);
      for (const gone of ['overview', 'original_title', 'genre_ids', 'credit_id', 'adult', 'video', 'vote_average', 'job']) expect(gone in kept).toBe(false);
    }
  });

  it('keeps the merged jobs and whether they acted, which the page reads too', () => {
    expect(creditAsDrawn({ id: 1, poster_path: null, overview: 'x', jobs: ['Director', 'Writer'], acted: false }))
      .toEqual({ id: 1, poster_path: null, jobs: ['Director', 'Writer'], acted: false });
  });

  it('keeps the credits in under a third of the whole answer, and under 64 KB', () => {
    const kept = whole.map(creditAsDrawn);
    expect(size(kept)).toBeLessThan(size(whole) / 3);
    expect(size(kept)).toBeLessThan(64 * 1024);
  });

  it('keeps the person as their page draws them', () => {
    expect(Object.keys(personAsDrawn(person)).sort())
      .toEqual(['biography', 'birthday', 'deathday', 'known_for_department', 'name', 'place_of_birth', 'profile_path']);
    expect(personAsDrawn(person).name).toBe(person.name);
  });
});
