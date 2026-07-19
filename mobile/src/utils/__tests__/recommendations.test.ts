import { buildRecommendationPool, filterUnseenFilms, type RecFilm } from '../recommendations';

const mk = (id: number, poster: string | null = `/p${id}.jpg`): RecFilm => ({ id, title: `Film ${id}`, poster_path: poster });

describe('buildRecommendationPool', () => {
  it('leads with recommendations, then backfills with similar', () => {
    const recs = [mk(1), mk(2)];
    const sim = [mk(3), mk(4)];
    const pool = buildRecommendationPool(recs, sim, 99);
    expect(pool.map((f) => f.id)).toEqual([1, 2, 3, 4]);
  });

  it('dedupes across both sources (recommendations win position)', () => {
    const recs = [mk(1), mk(2)];
    const sim = [mk(2), mk(3)];
    const pool = buildRecommendationPool(recs, sim, 99);
    expect(pool.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('never includes the film itself', () => {
    const recs = [mk(50), mk(1)];
    const pool = buildRecommendationPool(recs, [], 50);
    expect(pool.map((f) => f.id)).toEqual([1]);
  });

  it('drops poster-less entries', () => {
    const recs = [mk(1, null), mk(2)];
    const pool = buildRecommendationPool(recs, [], 99);
    expect(pool.map((f) => f.id)).toEqual([2]);
  });

  it('handles missing/non-array sources safely', () => {
    expect(buildRecommendationPool(undefined, null, 1)).toEqual([]);
    expect(buildRecommendationPool({ results: [] }, 'garbage', 1)).toEqual([]);
  });

  it('falls back to similar when recommendations are empty (obscure films)', () => {
    const pool = buildRecommendationPool([], [mk(7), mk(8)], 99);
    expect(pool.map((f) => f.id)).toEqual([7, 8]);
  });

  it('caps the raw pool at 20', () => {
    const recs = Array.from({ length: 30 }, (_, i) => mk(i + 1));
    expect(buildRecommendationPool(recs, [], 999)).toHaveLength(20);
  });
});

describe('filterUnseenFilms', () => {
  it('removes films already logged', () => {
    const pool = [mk(1), mk(2), mk(3)];
    const out = filterUnseenFilms(pool, { 2: { id: '2' } });
    expect(out.map((f) => f.id)).toEqual([1, 3]);
  });

  it('returns everything when nothing is logged', () => {
    const pool = [mk(1), mk(2)];
    expect(filterUnseenFilms(pool, {}).map((f) => f.id)).toEqual([1, 2]);
    expect(filterUnseenFilms(pool, undefined).map((f) => f.id)).toEqual([1, 2]);
  });

  it('never pads — returns only the unseen remainder', () => {
    const pool = [mk(1), mk(2), mk(3)];
    const out = filterUnseenFilms(pool, { 1: {}, 2: {}, 3: {} });
    expect(out).toEqual([]);
  });

  it('caps the display at 12', () => {
    const pool = Array.from({ length: 20 }, (_, i) => mk(i + 1));
    expect(filterUnseenFilms(pool, {})).toHaveLength(12);
  });

  it('handles empty/undefined pool', () => {
    expect(filterUnseenFilms(undefined, {})).toEqual([]);
    expect(filterUnseenFilms([], { 1: {} })).toEqual([]);
  });
});
