/**
 * A RATING CAN BE GIVEN WITHOUT SIGHT.
 *
 * The reels a member rates a film with were ten unnamed half-reel buttons:
 * VoiceOver read "button" ten times and never a score, so a member who could
 * not see could not rate. Now the row is ONE adjustable control, as a screen
 * reader expects a rating to be: named, its value spoken, moved half a reel at
 * a time by swiping up or down. (The layout audit's NAMELESS check found it.)
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ReelRating } from '../Decorative';

const swipe = (el: unknown, actionName: 'increment' | 'decrement') =>
  fireEvent(el as never, 'accessibilityAction', { nativeEvent: { actionName } });

describe('the rating, to a screen reader', () => {
  it('is one control, named, that says its value', () => {
    const r = render(<ReelRating rating={3.5} onChange={() => {}} />);
    const rating = r.getByRole('adjustable', { name: 'Your rating' });
    expect(rating.props.accessibilityValue).toEqual({ text: '3.5 of 5' });
  });

  it('says so when nothing has been given', () => {
    const r = render(<ReelRating rating={0} onChange={() => {}} />);
    expect(r.getByRole('adjustable').props.accessibilityValue).toEqual({ text: 'not rated' });
  });

  it('moves half a reel up, and half a reel down', async () => {
    const onChange = jest.fn();
    const r = render(<ReelRating rating={3} onChange={onChange} />);
    await swipe(r.getByRole('adjustable'), 'increment');
    await swipe(r.getByRole('adjustable'), 'decrement');
    expect(onChange.mock.calls).toEqual([[3.5], [2.5]]);
  });

  it('stops at the ends rather than wrapping or repeating', async () => {
    const onChange = jest.fn();
    const full = render(<ReelRating rating={5} onChange={onChange} />);
    await swipe(full.getByRole('adjustable'), 'increment');
    const none = render(<ReelRating rating={0} onChange={onChange} />);
    await swipe(none.getByRole('adjustable'), 'decrement');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a rating that is only SHOWN is not a control at all', () => {
    const r = render(<ReelRating rating={4} />);
    expect(r.queryByRole('adjustable')).toBeNull();
    expect(r.toJSON()).not.toBeNull();
  });
});
