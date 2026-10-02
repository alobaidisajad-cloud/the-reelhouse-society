/**
 * aMemberWhoLeftIsNamedOneWay.test.tsx — a member who has left, and one whose
 * name could not be read, are named the same way everywhere, and never with a
 * handle the house made up.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deleting an account keeps the words and writes "[deleted]" where the name was.
 * The Dispatch said "A MEMBER, DEPARTED"; a critique on a log or a stack said
 * "@[deleted]" with "[" in its disc; the Lounge said "[deleted]", with "[" too,
 * and "Unknown" over a quote. A Lounge author whose profile did not load was
 * named "unknown", and a reply to them saved "unknown" into the database.
 */
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';
import { CritiqueRow, type Critique } from '@/src/components/critique/CritiqueRow';
import { authorName, quotedName, DEPARTED_HANDLE, DEPARTED_NAME, UNNAMED } from '../departed';
import { spokenDispatch } from '@/app/lounge/[id]';

const MOBILE = join(__dirname, '..', '..', '..');

describe('the names', () => {
  it('a departed author is named as departed, by a lost id or by the database’s mark', () => {
    expect(authorName(null, DEPARTED_HANDLE)).toBe(DEPARTED_NAME);
    expect(authorName(null, 'marguerite')).toBe(DEPARTED_NAME);
    expect(authorName('u1', DEPARTED_HANDLE)).toBe(DEPARTED_NAME);
  });

  it('a name that could not be read is "a member", never a made-up handle', () => {
    expect(authorName('u1', '')).toBe(UNNAMED);
    expect(authorName('u1', null)).toBe(UNNAMED);
    expect(quotedName('')).toBe(UNNAMED);
    expect(quotedName(DEPARTED_HANDLE)).toBe(DEPARTED_NAME);
    expect(authorName('u1', 'marguerite')).toBe('marguerite');
  });
});

describe('a critique whose author has left', () => {
  const departed: Critique = {
    id: 'c1', user_id: null, username: DEPARTED_HANDLE, avatar_url: null,
    body: 'Cold is not unfeeling.', created_at: '2026-09-30T12:00:00Z',
  };
  const r = () => render(<CritiqueRow c={departed} currentUserId="u9" onPressUser={jest.fn()} onWithdraw={jest.fn()} />);

  it('names them as every card does, with no letter of the mark in the disc', () => {
    const t = r();
    expect(t.getByText(DEPARTED_NAME)).toBeTruthy();
    expect(t.queryByText(/\[deleted\]/)).toBeNull();
    expect(t.queryByText('[')).toBeNull();
    expect(t.getByText('Cold is not unfeeling.')).toBeTruthy();
  });

  it('and offers no door to a page that is not there', () => {
    const t = r();
    expect(t.queryAllByRole('link')).toHaveLength(0);
    expect(t.getByLabelText(`Critique by ${DEPARTED_NAME}`)).toBeTruthy();
  });
});

describe('the Lounge', () => {
  it('reads a reply to a departed member as departed', () => {
    const msg = { id: 'm1', reply_to_content: 'Late Spring.', reply_to_username: DEPARTED_HANDLE, content: 'Agreed.', type: 'text' };
    expect(spokenDispatch(msg as never)).toBe(`In reply to ${DEPARTED_NAME}: Late Spring. Agreed.`);
  });

  it('makes up no handle: the store has no "unknown" left', () => {
    const store = readFileSync(join(MOBILE, 'src', 'stores', 'lounge.ts'), 'utf8');
    expect(store).not.toMatch(/'unknown'/);
    expect(readFileSync(join(MOBILE, 'app', 'lounge', '[id].tsx'), 'utf8')).not.toMatch(/'Unknown'/);
  });
});

it('the database’s mark is written in one place only', () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((e) => {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== '__tests__' && e !== 'node_modules') walk(p); } else if (/\.tsx?$/.test(e)) files.push(p);
  });
  walk(join(MOBILE, 'src'));
  walk(join(MOBILE, 'app'));
  expect(files.length).toBeGreaterThan(300);
  const copies = files.filter((f) => !f.endsWith('departed.ts') && /['"`]\[deleted\]['"`]|A MEMBER, DEPARTED/.test(readFileSync(f, 'utf8')));
  expect(copies).toEqual([]);
});

