/**
 * mappers.test.ts — Shared Mapper Function Tests
 * ────────────────────────────────────────────────
 * Tests the pure mapping functions that transform
 * Supabase row shapes into domain model types.
 */
import { mapDossierRow, mapMessageRow, mapListRow, DossierRow, LoungeMessageRow, ListRow } from '../mappers';

describe('mapDossierRow', () => {
  const baseRow: DossierRow = {
    id: 'dossier-1',
    title: 'Film Noir Analysis',
    excerpt: 'A deep dive into noir',
    full_content: '<p>Full article content here</p>',
    author_username: 'cinephile_master',
    user_id: 'user-123',
    views: 42,
    certify_count: 7,
    created_at: '2026-01-15T10:30:00Z',
  };

  it('maps all fields correctly', () => {
    const result = mapDossierRow(baseRow);
    expect(result.id).toBe('dossier-1');
    expect(result.title).toBe('Film Noir Analysis');
    expect(result.excerpt).toBe('A deep dive into noir');
    expect(result.fullContent).toBe('<p>Full article content here</p>');
    expect(result.author).toBe('CINEPHILE_MASTER');
    expect(result.authorUsername).toBe('cinephile_master');
    expect(result.authorId).toBe('user-123');
    expect(result.views).toBe(42);
    expect(result.certifyCount).toBe(7);
    expect(result.raw_created_at).toBe('2026-01-15T10:30:00Z');
  });

  it('uppercases the author field', () => {
    const result = mapDossierRow(baseRow);
    expect(result.author).toBe('CINEPHILE_MASTER');
  });

  it('handles null excerpt with empty string fallback', () => {
    const result = mapDossierRow({ ...baseRow, excerpt: null });
    expect(result.excerpt).toBe('');
  });

  it('handles null full_content with empty string fallback', () => {
    const result = mapDossierRow({ ...baseRow, full_content: null });
    expect(result.fullContent).toBe('');
  });

  it('handles null author_username with ANONYMOUS', () => {
    const result = mapDossierRow({ ...baseRow, author_username: null });
    expect(result.author).toBe('ANONYMOUS');
    expect(result.authorUsername).toBe('');
  });

  it('handles null views with 0 fallback', () => {
    const result = mapDossierRow({ ...baseRow, views: null });
    expect(result.views).toBe(0);
  });

  it('handles null certify_count with 0 fallback', () => {
    const result = mapDossierRow({ ...baseRow, certify_count: null });
    expect(result.certifyCount).toBe(0);
  });

  it('formats date correctly in uppercase', () => {
    const result = mapDossierRow(baseRow);
    expect(result.date).toMatch(/JAN/);
    expect(result.date).toMatch(/2026/);
  });
});

describe('mapMessageRow', () => {
  const baseRow: LoungeMessageRow = {
    id: 'msg-1',
    lounge_id: 'lounge-1',
    user_id: 'user-456',
    content: 'Great film!',
    type: 'text',
    reply_to_id: null,
    reply_to_username: null,
    reply_to_content: null,
    film_id: null,
    film_title: null,
    film_poster: null,
    created_at: '2026-02-20T15:00:00Z',
    profiles: { username: 'film_buff', avatar_url: 'https://example.com/avatar.jpg' },
  };

  it('maps all fields correctly', () => {
    const result = mapMessageRow(baseRow);
    expect(result.id).toBe('msg-1');
    expect(result.lounge_id).toBe('lounge-1');
    expect(result.user_id).toBe('user-456');
    expect(result.username).toBe('film_buff');
    expect(result.avatar_url).toBe('https://example.com/avatar.jpg');
    expect(result.content).toBe('Great film!');
    expect(result.type).toBe('text');
    expect(result.created_at).toBe('2026-02-20T15:00:00Z');
  });

  it('handles profiles as array (Supabase polymorphic join)', () => {
    const rowWithArray: LoungeMessageRow = {
      ...baseRow,
      profiles: [{ username: 'array_user', avatar_url: 'https://example.com/arr.jpg' }],
    };
    const result = mapMessageRow(rowWithArray);
    expect(result.username).toBe('array_user');
    expect(result.avatar_url).toBe('https://example.com/arr.jpg');
  });

  it('handles null profiles with "unknown" fallback', () => {
    const result = mapMessageRow({ ...baseRow, profiles: null });
    expect(result.username).toBe('unknown');
    expect(result.avatar_url).toBeUndefined();
  });

  it('handles empty array profiles with "unknown" fallback', () => {
    const result = mapMessageRow({ ...baseRow, profiles: [] });
    expect(result.username).toBe('unknown');
  });

  it('maps film_share type correctly', () => {
    const filmShareRow: LoungeMessageRow = {
      ...baseRow,
      type: 'film_share',
      film_id: 123,
      film_title: 'Blade Runner 2049',
      film_poster: '/poster.jpg',
    };
    const result = mapMessageRow(filmShareRow);
    expect(result.type).toBe('film_share');
    expect(result.film_id).toBe(123);
    expect(result.film_title).toBe('Blade Runner 2049');
    expect(result.film_poster).toBe('/poster.jpg');
  });

  it('maps reply fields correctly', () => {
    const replyRow: LoungeMessageRow = {
      ...baseRow,
      reply_to_id: 'msg-0',
      reply_to_username: 'original_poster',
      reply_to_content: 'Original message text',
    };
    const result = mapMessageRow(replyRow);
    expect(result.reply_to_id).toBe('msg-0');
    expect(result.reply_to_username).toBe('original_poster');
    expect(result.reply_to_content).toBe('Original message text');
  });
});

/**
 * mapListRow — the rank_position rename.
 *
 * ListItemRow declared a `position` field that no table has; the ordering
 * column is rank_position everywhere else in the app, including the one
 * select that feeds this mapper. The rename was proven by the compiler
 * alone and had no test at all. This pins the row shape and the mapping.
 */
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
