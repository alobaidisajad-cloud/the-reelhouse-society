/**
 * aMessageCanBeHeardAndActedOn.test.ts — a lounge message, to a screen reader.
 *
 * A message is one element (its long press and the card inside it are out of a
 * screen reader's reach), so it says what it answers, its words and what it
 * shares, and offers the acts a finger has: show the actions, open what was
 * shared, open a link.
 */
import { dispatchActions, firstLink, shareOf, spokenDispatch } from '@/app/lounge/[id]';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn() } }));

const msg = (over: Record<string, unknown>) => ({
  id: 'm', user_id: 'u', username: 'ada', content: '', type: 'text', created_at: '2026-09-29T10:00:00Z', ...over,
}) as never;

describe('a lounge message, heard', () => {
  it('says its words', () => {
    expect(spokenDispatch(msg({ content: 'See it on film.' }))).toBe('See it on film.');
  });

  it('says what it answers, first', () => {
    expect(spokenDispatch(msg({ content: 'Agreed.', reply_to_username: 'bo', reply_to_content: 'Ozu is the best.' })))
      .toBe('In reply to bo: Ozu is the best. Agreed.');
  });

  it('ends each part as one sentence, never two stops', () => {
    expect(spokenDispatch(msg({ content: 'Tonight', reply_to_username: 'bo', reply_to_content: 'When?' })))
      .toBe('In reply to bo: When? Tonight.');
  });

  it('says what it shares, by kind and title', () => {
    expect(spokenDispatch(msg({ type: 'film_share', film_id: 238, film_title: 'The Godfather' })))
      .toBe('Shared film: The Godfather.');
    // A take shared down the dossier path says TAKE, not the long form.
    // Said as what it IS: "not ESSAY" was also true of no label at all.
    expect(shareOf(msg({ type: 'dossier_share', film_title: 'On Ozu', metadata: { kind: 'take' } }))?.typeLabel)
      .toBe('TAKE');
  });
});

describe('a lounge message, acted on', () => {
  const names = (m: never) => dispatchActions(m).map((a) => a.name);

  it('always offers its actions (reply, react, report) by name', () => {
    const acts = dispatchActions(msg({ content: 'Hello' }));
    expect(acts).toContainEqual({ name: 'longpress', label: 'Show actions' });
    expect(names(msg({ content: 'Hello' }))).toEqual(['activate', 'longpress']);
  });

  it('offers to open what it shares', () => {
    expect(dispatchActions(msg({ type: 'film_share', film_id: 238, film_title: 'The Godfather' })))
      .toContainEqual({ name: 'open', label: 'Open the film' });
  });

  it('offers to open a link it holds, without its closing punctuation', () => {
    expect(names(msg({ content: 'Read this: https://reelhouse.app/x.' }))).toContain('link');
    expect(firstLink('Read this: https://reelhouse.app/x.')).toBe('https://reelhouse.app/x');
    expect(firstLink('No link here')).toBeNull();
  });
});
