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
import { render } from '@testing-library/react-native';
import { editProfileSchema, MAX_LINKS } from '@/src/hooks/useEditProfile';
import { LinksEditor } from '../LinksEditor';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/components/ControlledInput', () => ({
  ControlledInput: (props: Record<string, unknown>) => {
    const React = require('react');
    const { TextInput } = require('react-native');
    return React.createElement(TextInput, props);
  },
}));

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
  it('stops offering ADD LINK at the cap', () => {
    expect(render(<LinksEditor links={links(MAX_LINKS - 1)} handleAddLink={jest.fn()} handleRemoveLink={jest.fn()} errors={{}} />).getByLabelText('Add link')).toBeTruthy();
    expect(render(<LinksEditor links={links(MAX_LINKS)} handleAddLink={jest.fn()} handleRemoveLink={jest.fn()} errors={{}} />).queryByLabelText('Add link')).toBeNull();
  });
  it('shows a title\'s error beside the title', () => {
    const r = render(<LinksEditor links={links(1)} handleAddLink={jest.fn()} handleRemoveLink={jest.fn()} errors={{ links: [{ title: { message: 'Give the link a title.' } }] }} />);
    expect(r.getByText('Give the link a title.')).toBeTruthy();
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
