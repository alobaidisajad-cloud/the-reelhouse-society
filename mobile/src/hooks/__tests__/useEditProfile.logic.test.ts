/**
 * useEditProfile.logic.test.ts — Pure Logic Tests
 * ────────────────────────────────────────────────────────
 * Tests parseLinks (legacy Record + modern Array normalization),
 * sanitizeLinks (blank-entry filtering before persisting), computeHasNewAvatar
 * (the isDirty avatar branch), and buildProfileUpdates (the DB update payload
 * assembled by handleSave) — all extracted as pure functions from useEditProfile.
 */
import { parseLinks, sanitizeLinks, computeHasNewAvatar, buildProfileUpdates, ProfileUpdateInput } from '../useEditProfile';

describe('parseLinks', () => {
  it('returns an empty array for null/undefined', () => {
    expect(parseLinks(null)).toEqual([]);
    expect(parseLinks(undefined)).toEqual([]);
  });

  it('normalizes a modern Array structure, defaulting missing fields', () => {
    expect(parseLinks([{ title: 'Twitter', url: 'x.com/me' }, { title: '', url: '' }])).toEqual([
      { title: 'Twitter', url: 'x.com/me' },
      { title: '', url: '' },
    ]);
  });

  it('normalizes a legacy Record structure, capitalizing the key as the title', () => {
    expect(parseLinks({ twitter: 'x.com/me', letterboxd: 'lb.com/me' })).toEqual([
      { title: 'Twitter', url: 'x.com/me' },
      { title: 'Letterboxd', url: 'lb.com/me' },
    ]);
  });

  it('returns an empty array for unsupported types', () => {
    expect(parseLinks('a string')).toEqual([]);
    expect(parseLinks(42)).toEqual([]);
  });
});

describe('sanitizeLinks', () => {
  it('drops entries with a blank title or blank url', () => {
    expect(sanitizeLinks([
      { title: 'Twitter', url: '' },
      { title: '', url: 'x.com/me' },
      { title: '  ', url: '  ' },
    ])).toEqual([]);
  });

  it('trims surviving entries', () => {
    expect(sanitizeLinks([{ title: '  Twitter  ', url: '  x.com/me  ' }])).toEqual([
      { title: 'Twitter', url: 'x.com/me' },
    ]);
  });

  it('keeps valid entries unchanged aside from trimming', () => {
    const links = [{ title: 'A', url: '1' }, { title: 'B', url: '2' }];
    expect(sanitizeLinks(links)).toEqual(links);
  });
});

describe('computeHasNewAvatar', () => {
  it('is false when nothing changed', () => {
    expect(computeHasNewAvatar(null, 'https://old.jpg', 'https://old.jpg')).toBe(false);
  });

  it('is true when a new image was picked (base64 present)', () => {
    expect(computeHasNewAvatar('data:image/png;base64,abc', 'https://old.jpg', 'https://old.jpg')).toBe(true);
  });

  it('is true when the existing avatar was explicitly removed', () => {
    expect(computeHasNewAvatar(null, null, 'https://old.jpg')).toBe(true);
  });

  it('is false when there was never an avatar to remove', () => {
    expect(computeHasNewAvatar(null, null, null)).toBe(false);
    expect(computeHasNewAvatar(null, null, undefined)).toBe(false);
  });
});

describe('buildProfileUpdates', () => {
  function baseInput(overrides: Partial<ProfileUpdateInput> = {}): ProfileUpdateInput {
    return {
      sanitizedUsername: 'cinephile1',
      displayName: 'Cine Phile',
      bio: 'I love film.',
      links: [{ title: 'Twitter', url: 'x.com/me' }],
      finalAvatarUrl: undefined,
      ...overrides,
    };
  }

  it('maps the basic fields directly', () => {
    const updates = buildProfileUpdates(baseInput());
    expect(updates.username).toBe('cinephile1');
    expect(updates.display_name).toBe('Cine Phile');
    expect(updates.bio).toBe('I love film.');
  });

  it('sanitizes links into social_links', () => {
    const updates = buildProfileUpdates(baseInput({ links: [{ title: '', url: 'dead.com' }, { title: 'Live', url: 'live.com' }] }));
    expect(updates.social_links).toEqual([{ title: 'Live', url: 'live.com' }]);
  });

  it('omits avatar_url entirely when finalAvatarUrl is undefined (avatar untouched)', () => {
    const updates = buildProfileUpdates(baseInput({ finalAvatarUrl: undefined }));
    expect('avatar_url' in updates).toBe(false);
  });

  it('includes avatar_url as null when the avatar was removed', () => {
    const updates = buildProfileUpdates(baseInput({ finalAvatarUrl: null }));
    expect(updates.avatar_url).toBeNull();
  });

  it('includes avatar_url as the new URL when a new avatar was uploaded', () => {
    const updates = buildProfileUpdates(baseInput({ finalAvatarUrl: 'https://new.jpg' }));
    expect(updates.avatar_url).toBe('https://new.jpg');
  });
});
