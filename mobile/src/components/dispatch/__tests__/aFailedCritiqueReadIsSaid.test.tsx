/**
 * aFailedCritiqueReadIsSaid.test.tsx — the critiques' footer, after a page that could not be read.
 *
 * A first page that failed was drawn as no critiques under "N MORE · 30 AT A TIME", whose press
 * asked nothing (no page had said there were more), and nothing said the read had failed (review
 * round 1, 2026-11-14). The footer says it, and asks again.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CritiqueFooter } from '@/src/components/dispatch/paper/PaperCritiques';

describe('the critiques\' footer', () => {
  it('says the critiques could not be read, and its TRY AGAIN asks for them again', async () => {
    const onRetry = jest.fn();
    const onMore = jest.fn();
    const r = render(<CritiqueFooter shown={0} total={12} failed onRetry={onRetry} onMore={onMore} />);
    expect(r.getByText('THE CRITIQUES COULD NOT BE READ')).toBeTruthy();
    expect(r.queryByText(/MORE · /)).toBeNull();
    await fireEvent.press(r.getByLabelText('Try again: read the critiques'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onMore).not.toHaveBeenCalled();
  });

  it('says the next critiques could not be read, below those already read', async () => {
    const onRetry = jest.fn();
    const r = render(<CritiqueFooter shown={30} total={80} failed onRetry={onRetry} onMore={jest.fn()} />);
    expect(r.getByText('THE NEXT CRITIQUES COULD NOT BE READ')).toBeTruthy();
    await fireEvent.press(r.getByLabelText('Try again: read the next critiques'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers the next page as before when nothing failed', () => {
    const r = render(<CritiqueFooter shown={30} total={80} onRetry={jest.fn()} onMore={jest.fn()} />);
    expect(r.getByText('50 MORE · 30 AT A TIME')).toBeTruthy();
  });
});
