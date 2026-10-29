/**
 * aLinkSaysWhyBeforeItVanishes.test.tsx — a profile's links, as they are saved.
 *
 * The server keeps only links that open, and the save dropped the rest in
 * silence: an address with a space in it, or an address with no title, was
 * simply gone after SAVE. Past ten links the save refused with no message at
 * all. Link titles skipped the cleaning every other piece of public profile
 * text gets. And the form held a stored handle to today's rules, so a handle
 * from older rules could have kept a member from saving even their bio.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { FormProvider, useForm } from 'react-hook-form';
import { editProfileSchema, MAX_LINKS } from '@/src/hooks/useEditProfile';
import { LinksEditor } from '../LinksEditor';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { supabase } from '@/src/lib/supabase';

const base = { username: 'tomas', displayName: '', bio: '' };
const issues = (links: { title: string; url: string }[], over: Record<string, unknown> = {}) => {
  const r = editProfileSchema.safeParse({ ...base, ...over, links });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('a link is wholly there, or says what it lacks', () => {
  it('an address with no title asks for one', () => {
    expect(issues([{ title: '', url: 'https://one.example' }])).toEqual(['links.0.title: Give the link a title.']);
  });
  it('a title with no address asks for it', () => {
    expect(issues([{ title: 'Blog', url: '  ' }])).toEqual(['links.0.url: Add the link’s address.']);
  });
  it('an address that cannot be opened says so', () => {
    expect(issues([{ title: 'Blog', url: 'my site' }])).toEqual(['links.0.url: Not a web address that can be opened.']);
  });
  it('a sound link, and an empty pair, pass', () => {
    expect(issues([{ title: 'Blog', url: 'two.example' }, { title: '', url: '' }])).toEqual([]);
  });
  it('past the cap, the save says so', () => {
    const many = Array.from({ length: MAX_LINKS + 1 }, (_, i) => ({ title: `L${i}`, url: `https://${i}.example` }));
    expect(issues(many)).toEqual([`links: At most ${MAX_LINKS} links.`]);
  });
  it('a stored handle is not held to today\'s rules by the form (the save checks a CHANGED one)', () => {
    expect(issues([], { username: 'ab' })).toEqual([]);
  });
});

describe('the editor', () => {
  const links = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, title: `L${i}`, url: `https://${i}.example` }));
  /** The editor in the form it lives in: its fields are bound to it, and carry its errors. */
  function InForm({ n, refused }: { n: number; refused?: string }) {
    const form = useForm({ defaultValues: { links: links(n) } });
    React.useEffect(() => {
      if (refused) form.setError('links.0.title', { message: refused });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <FormProvider {...form}><LinksEditor links={links(n)} handleAddLink={jest.fn()} handleRemoveLink={jest.fn()} /></FormProvider>;
  }
  it('stops offering ADD LINK at the cap', () => {
    expect(render(<InForm n={MAX_LINKS - 1} />).getByLabelText('Add link')).toBeTruthy();
    expect(render(<InForm n={MAX_LINKS} />).queryByLabelText('Add link')).toBeNull();
  });
  it('shows a title\'s error under the title, and the title says it', async () => {
    const r = render(<InForm n={1} refused="Give the link a title." />);
    await act(async () => { await Promise.resolve(); });
    expect(r.getByText('Give the link a title.')).toBeTruthy();
    expect(r.getByLabelText('Link title').props.accessibilityHint).toBe('Give the link a title.');
    expect(r.getByLabelText('Link URL').props.accessibilityHint).toBeUndefined();
  });
});

describe('a link\'s title is cleaned like every other piece of public profile text', () => {
  it('a right-to-left override is stripped before it is written', async () => {
    (supabase.auth.getSession as jest.Mock) = jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }));
    const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }));
    (supabase.from as unknown) = jest.fn(() => ({ update }));
    await ProfileService.updateProfile('u1', { social_links: [{ title: 'Blog\u202Egnp.exe', url: ' https://two.example ' }] } as never);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ social_links: [{ title: 'Bloggnp.exe', url: 'https://two.example' }] }));
  });
});
