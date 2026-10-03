/**
 * A screen that crashes is replaced by the house's net, which reports it, lets
 * the member try again, and gives them the way out its words promise: back, or
 * to the Lobby when there is no back.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { RouteErrorBoundary } from '../RouteErrorBoundary';

const mockCanGoBack = jest.fn(() => true);
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => mockCanGoBack(),
    back: (...a: unknown[]) => mockBack(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
  },
}));
const mockCapture = jest.fn();
jest.mock('@/src/lib/sentry', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));

const fail = new Error('a render that threw');

beforeEach(() => { mockCanGoBack.mockReturnValue(true); mockBack.mockClear(); mockReplace.mockClear(); mockCapture.mockClear(); });

describe('the net under a screen that crashed', () => {
  it('reports the crash once, and lets the member try again', () => {
    const retry = jest.fn();
    const { getByText, getByLabelText } = render(<RouteErrorBoundary error={fail} retry={retry as never} />);
    expect(getByText('This reel jammed.')).toBeTruthy();
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][0]).toBe(fail);
    fireEvent.press(getByLabelText('Try loading this screen again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('goes back when there is a screen to go back to', () => {
    const { getByLabelText } = render(<RouteErrorBoundary error={fail} retry={jest.fn() as never} />);
    fireEvent.press(getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns to the Lobby when there is none (a screen opened by a link)', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText, getByText } = render(<RouteErrorBoundary error={fail} retry={jest.fn() as never} />);
    expect(getByText('RETURN TO THE LOBBY')).toBeTruthy();
    fireEvent.press(getByLabelText('Return to the Lobby'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not read its emblem aloud: Buster, moved, is drawn and kept silent', () => {
    const { getByTestId, queryByTestId } = render(<RouteErrorBoundary error={fail} retry={jest.fn() as never} />);
    // Not found among what a screen reader is given...
    expect(queryByTestId('buster-still-moved')).toBeNull();
    // ...though it is drawn.
    const emblem = getByTestId('buster-still-moved', { includeHiddenElements: true });
    expect(emblem.props.accessibilityElementsHidden).toBe(true);
    expect(emblem.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
