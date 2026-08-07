import { DossierRowSchema } from '@/src/schemas/dossier.schema';

describe('the feed row parses WITHOUT the essay body', () => {
  it('an absent full_content defaults instead of dropping the row', () => {
    // This is what get_dispatch_feed returns: no full_content key at all.
    // If the schema rejected it, parseDossierRows would drop EVERY dossier and
    // the Dispatch feed would render empty.
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'An Essay',
      excerpt: 'the opening line',
      author_username: 'morpho',
      user_id: '22222222-2222-2222-2222-222222222222',
      views: 12,
      certify_count: 3,
      created_at: '2026-08-07T00:00:00.000Z',
    };
    const parsed = DossierRowSchema.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.full_content).toBeNull();
  });

  it('and still parses when the body IS present (the reader path)', () => {
    const parsed = DossierRowSchema.safeParse({
      id: 'a', title: 'T', excerpt: 'e', full_content: 'the whole essay',
      author_username: 'm', user_id: 'u', views: 0, certify_count: 0,
      created_at: '2026-08-07T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.full_content).toBe('the whole essay');
  });
});
