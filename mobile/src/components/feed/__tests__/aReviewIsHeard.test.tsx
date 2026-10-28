/**
 * aReviewIsHeard.test.tsx — the writing a card shows is the writing a screen reader hears.
 *
 * A labelled control silences its children on iOS. The feed's review was a door named
 * "Read full review", and the film page's critique one named "Open the full log by kane":
 * a screen-reader member heard those words on every card and never a word of the writing.
 * The spoiler veil sat inside the door, a control inside a control, which a screen reader
 * cannot reach at all. Now the door is named by its writing, and the veil stands before it.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ReviewContent } from '../ReviewContent';
import { FilmReviews } from '@/src/components/film/FilmReviews';
import { spokenExcerpt } from '@/src/utils/text';
import { nav } from '@/src/utils/typedRouter';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

const WRITING = 'A film about waiting, and the waiting is the film. Nothing in it hurries.';

describe('the feed card', () => {
  const item = { id: 'l1', rating: 4, pull_quote: 'We will always have Paris', review: WRITING, drop_cap: false, role: 'member', is_spoiler: false };

  it('is named by its pull quote and its writing, in the order drawn', () => {
    const r = render(<ReviewContent item={item as never} isPremium={false} isAuteur={false} onPress={() => {}} />);
    expect(r.getByRole('button').props.accessibilityLabel).toBe(`We will always have Paris. ${WRITING}`);
  });

  it('veiled, the veil is its own control, reached and lifted, and then the writing is heard', async () => {
    const r = render(<ReviewContent item={{ ...item, is_spoiler: true } as never} isPremium={false} isAuteur={false} onPress={() => {}} />);
    // One control on the card, and it is the veil: the writing is neither shown nor said.
    expect(r.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['This review contains spoilers. Tap to reveal.']);
    await fireEvent.press(r.getByRole('button'));
    expect(r.getByRole('button').props.accessibilityLabel).toBe(`We will always have Paris. ${WRITING}`);
  });
});

describe('the film page critique', () => {
  const review = {
    id: 'c1', rating: 4, review: WRITING, status: 'watched', created_at: '2026-10-01T00:00:00Z',
    user_id: 'u1', username: 'kane', role: 'member', pull_quote: null, drop_cap: false, is_spoiler: false,
  };

  it('is named by its writing, then its own door, OPEN LOG', async () => {
    const r = render(<FilmReviews filmId={1} filmTitle="Paris, Texas" reviews={[review]} />);
    const door = r.getByLabelText(`${WRITING} Open log, by kane.`);
    await fireEvent.press(door);
    expect(nav.push).toHaveBeenCalled();
  });

  it('veiled, the veil is reached first, and the door after it is lifted', async () => {
    const r = render(<FilmReviews filmId={1} filmTitle="Paris, Texas" reviews={[{ ...review, is_spoiler: true }]} />);
    expect(r.queryByLabelText(`${WRITING} Open log, by kane.`)).toBeNull();
    await fireEvent.press(r.getByLabelText('This review contains spoilers. Tap to reveal.'));
    expect(r.getByLabelText(`${WRITING} Open log, by kane.`)).toBeTruthy();
  });
});

describe('spokenExcerpt', () => {
  it('ends each part as a sentence, once', () => {
    expect(spokenExcerpt('Rain', 'It never stops.')).toBe('Rain. It never stops.');
    expect(spokenExcerpt(null, 'It never stops')).toBe('It never stops.');
    expect(spokenExcerpt('  ', 'Quiet!')).toBe('Quiet!');
  });

  it('says as much as a card shows, cut at a word', () => {
    const long = 'word '.repeat(200).trim();
    const said = spokenExcerpt(null, long);
    expect(said.length).toBeLessThanOrEqual(352);
    expect(said).toMatch(/word[.…]+$/);
  });
});
