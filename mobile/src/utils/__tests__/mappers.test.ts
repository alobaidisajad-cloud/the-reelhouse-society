/**
 * mappers.test.ts — Shared Mapper Function Tests
 * ────────────────────────────────────────────────
 * Tests the pure mapping functions that transform
 * Supabase row shapes into domain model types.
 */
import { mapListRow, ListRow } from '../mappers';

describe('mapListRow', () => {
  const row: ListRow = {
    id: 'list-1',
    title: 'Noir Essentials',
    description: null,
    is_ranked: true,
    is_private: false,
    created_at: '2026-01-01T00:00:00Z',
    user_id: 'u1',
    list_items: [
      { id: 'li-2', film_id: 550, film_title: 'Fight Club', poster_path: '/fc.jpg', rank_position: 0 },
      { id: 'li-1', film_id: 807, film_title: 'Se7en', poster_path: null, rank_position: 1 },
    ],
  };

  it('maps every field to its domain name', () => {
    expect(mapListRow(row)).toEqual({
      id: 'list-1',
      title: 'Noir Essentials',
      description: undefined,
      isRanked: true,
      isPrivate: false,
      createdAt: '2026-01-01T00:00:00Z',
      userId: 'u1',
      films: [
        { id: 550, title: 'Fight Club', poster: '/fc.jpg' },
        { id: 807, title: 'Se7en', poster: null },
      ],
    });
  });

  it('preserves the order the server sent — it does not re-sort', () => {
    // The mapper trusts .order('rank_position') upstream. If it ever started
    // sorting locally, a server-side ordering change would go unnoticed.
    const reversed: ListRow = { ...row, list_items: [...row.list_items].reverse() };
    expect(mapListRow(reversed).films.map(f => f.id)).toEqual([807, 550]);
  });

  it('survives a list with no items at all', () => {
    expect(mapListRow({ ...row, list_items: [] }).films).toEqual([]);
  });

  it('treats a null description as absent, not as the string "null"', () => {
    expect(mapListRow(row).description).toBeUndefined();
    expect(mapListRow({ ...row, description: 'A study' }).description).toBe('A study');
  });
});
