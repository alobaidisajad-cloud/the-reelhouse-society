/**
 * SpoilerVeil.test.tsx — COMP-SPOILER-1 reader-side spoiler gate.
 * Verifies the veil hides content until tapped, honors bypass, and resets
 * its revealed state when revealKey changes (the FlashList recycling guard).
 */
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SpoilerVeil from '../SpoilerVeil';

const CONTENT = 'the killer was the butler';

describe('SpoilerVeil', () => {
  it('renders children directly when not flagged as a spoiler', () => {
    const { queryByText } = render(
      <SpoilerVeil isSpoiler={false}><Text>{CONTENT}</Text></SpoilerVeil>,
    );
    expect(queryByText(CONTENT)).toBeTruthy();
    expect(queryByText('CONTAINS SPOILERS')).toBeNull();
  });

  it('hides children behind the veil when flagged', () => {
    const { queryByText } = render(
      <SpoilerVeil isSpoiler><Text>{CONTENT}</Text></SpoilerVeil>,
    );
    expect(queryByText(CONTENT)).toBeNull();
    expect(queryByText('CONTAINS SPOILERS')).toBeTruthy();
  });

  it('reveals children on tap', async () => {
    const { getByLabelText, queryByText } = render(
      <SpoilerVeil isSpoiler><Text>{CONTENT}</Text></SpoilerVeil>,
    );
    fireEvent.press(getByLabelText(/contains spoilers/i));
    await waitFor(() => expect(queryByText(CONTENT)).toBeTruthy());
    expect(queryByText('CONTAINS SPOILERS')).toBeNull();
  });

  it('bypasses the veil entirely (e.g. the author)', () => {
    const { queryByText } = render(
      <SpoilerVeil isSpoiler bypass><Text>{CONTENT}</Text></SpoilerVeil>,
    );
    expect(queryByText(CONTENT)).toBeTruthy();
    expect(queryByText('CONTAINS SPOILERS')).toBeNull();
  });

  it('re-veils when revealKey changes (recycled-row guard)', async () => {
    const { getByLabelText, queryByText, rerender } = render(
      <SpoilerVeil isSpoiler revealKey="log-1"><Text>{CONTENT}</Text></SpoilerVeil>,
    );
    fireEvent.press(getByLabelText(/contains spoilers/i));
    await waitFor(() => expect(queryByText(CONTENT)).toBeTruthy());

    // The component instance is recycled for a different log → must re-veil.
    rerender(
      <SpoilerVeil isSpoiler revealKey="log-2"><Text>a different spoiler</Text></SpoilerVeil>,
    );
    expect(queryByText('a different spoiler')).toBeNull();
    expect(queryByText('CONTAINS SPOILERS')).toBeTruthy();
  });
});
