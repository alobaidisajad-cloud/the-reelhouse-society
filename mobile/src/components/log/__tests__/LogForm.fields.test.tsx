/**
 * LogForm field-wiring regression test (guards COMP-LOG-1).
 *
 * Before the fix, LogForm routed every field update through useLogFlow's
 * `dispatch` compatibility shim, which only handled 6 premium fields — so
 * typing a review (and setting rating/status/date) was a silent no-op and a
 * user could not log a watched film. This test renders the real LogForm with a
 * real useLogFlow and asserts that user input actually updates the field.
 *
 * Heavy/leaf children unrelated to field wiring are stubbed so the test is
 * stable in the Jest env (lucide icons / Skia-backed visuals don't render to a
 * host component there). LogForm's own field JSX (TextInputs, status/detail
 * toggles) is exercised directly.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import LogForm from '../LogForm';
import { useLogFlow } from '@/src/hooks/useLogFlow';

// ── Stub heavy/leaf children (not under test) ──────────────────────────────
// The global expo-image mock exports `Image` as an object; make it a real
// component here so LogForm's poster <Image> renders.
jest.mock('expo-image', () => {
  const React = require('react');
  return {
    Image: (props: any) => React.createElement('ExpoImage', props),
    prefetch: jest.fn().mockResolvedValue(true),
  };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/log/EditorialDesk', () => () => null);
jest.mock('@/src/components/log/AuteurToolkit', () => () => null);
jest.mock('@/src/components/NitrateCalendar', () => () => null);
jest.mock('@/src/components/Decorative', () => ({
  ReelRating: (props: any) => {
    const React = require('react');
    const { Pressable } = require('react-native');
    // Expose a tappable control that sets rating=4 (whole star) via onChange.
    return React.createElement(Pressable, { testID: 'reel-rating', onPress: () => props.onChange?.(4) });
  },
  SectionDivider: () => null,
}));

function Harness() {
  const flow = useLogFlow();
  return <LogForm flow={flow} user={null} />;
}

describe('LogForm core-field wiring (COMP-LOG-1 regression)', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      filmId: '603',
      filmTitle: 'The Matrix',
      filmPoster: '/poster.jpg',
      filmYear: '1999',
    });
  });

  it('typing into the review field updates it (was a no-op via the dispatch shim)', async () => {
    const view = render(<Harness />);

    const input = view.getByTestId('review-input');
    expect(input.props.value).toBe('');

    await fireEvent.changeText(input, 'A masterpiece of cinema.');

    // The committed value must reflect the input — proves onChangeText →
    // setReview → re-render fires (the broken path left this at '').
    await waitFor(() =>
      expect(view.getByTestId('review-input').props.value).toBe('A masterpiece of cinema.'),
    );
  });

  it('the rating control updates the rating (enables submit for a watched log)', async () => {
    const view = render(<Harness />);

    // No rating + no review ⇒ submit is blocked (validateLogSubmission).
    await fireEvent.press(view.getByTestId('reel-rating'));

    // The "/5" rating label appears once rating > 0 — proves setRating fired.
    await waitFor(() => expect(view.queryByText('/5')).toBeTruthy());
  });
});
