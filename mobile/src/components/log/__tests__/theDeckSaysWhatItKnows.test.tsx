/**
 * theDeckSaysWhatItKnows.test.tsx — a log's action deck (src/components/log/LogActionDeck.tsx)
 * draws a member's mark it does not know as unknown, never as "off".
 *   - their certification of the log not yet answered: the heart uninked, said to be reading;
 *   - their watchlist not yet held whole: the bookmark uninked, and still pressable (a film
 *     already saved is said as saved, so a press is always right);
 *   - known, both are drawn plainly.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LogActionDeck from '@/src/components/log/LogActionDeck';
import { UNINKED } from '@/src/theme/unready';

const deck = (over: Partial<React.ComponentProps<typeof LogActionDeck>> = {}) => render(
  <LogActionDeck log={{ film_id: 603, film_title: 'The Matrix', poster_path: null }}
    isOwner={false} endorsed={false} certifyCount={4} critiqueCount={2} filmSaved={false} autopsyOpen={false}
    onToggleEndorse={jest.fn()} onToggleAutopsy={jest.fn()} onCritiquePress={jest.fn()} onSavePress={jest.fn()}
    onEditPress={jest.fn()} onLoungePress={jest.fn()} {...over} />,
);
const uninked = (r: ReturnType<typeof render>) => (JSON.stringify(r.toJSON()).match(new RegExp(UNINKED, 'g')) ?? []).length;

it('a mark not yet read is uninked and said so; the bookmark stays pressable', async () => {
  const onSavePress = jest.fn();
  const r = deck({ certifyKnown: false, saveKnown: false, onSavePress });
  expect(r.getByLabelText('Certify this critique. Reading your mark')).toBeTruthy();
  // Two outlines: the heart's and the bookmark's.
  expect(uninked(r)).toBe(2);
  await fireEvent.press(r.getByLabelText('Save film to your watchlist'));
  expect(onSavePress).toHaveBeenCalled();
});

it('known, both are drawn plainly', () => {
  const r = deck({ certifyKnown: true, saveKnown: true, endorsed: true, filmSaved: true });
  expect(uninked(r)).toBe(0);
  expect(r.getByText('CERTIFIED')).toBeTruthy();
  expect(r.getByText('SAVED')).toBeTruthy();
});
