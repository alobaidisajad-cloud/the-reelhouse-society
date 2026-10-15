/**
 * navMetrics: each helper's value as stated, and the bar's measure is cheap.
 *
 * A tab reads the bar's measured height on every render, so a measure must
 * redraw a tab only when the height it reads changes: never when the bar
 * lays out again at the same height, and not when the measure agrees with the
 * height the bar is built to.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import {
  MODAL_TOP_GAP, OVERLAY_GAP, PUSHED_HEADER_GAP, TAB_CONTENT_GAP,
  modalTop, navBarHeight, overlayTop, pushedHeaderTop, reportTopBarHeight, resetTopBarHeight,
  useTabContentTop,
} from '../navMetrics';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

describe('each helper, at the Dynamic Island’s 59pt and on a device that reports no inset', () => {
  it('a pushed header starts 10pt below the status bar, which never sits above 20', () => {
    expect([pushedHeaderTop(59), pushedHeaderTop(0)]).toEqual([69, 30]);
    expect(PUSHED_HEADER_GAP).toBe(10);
  });

  it('a modal starts 10pt into an iOS sheet, and 10pt below Android’s status bar', () => {
    expect([modalTop(59, 'ios'), modalTop(24, 'ios')]).toEqual([MODAL_TOP_GAP, MODAL_TOP_GAP]);
    expect([modalTop(24, 'android'), modalTop(0, 'android')]).toEqual([34, 30]);
  });

  it('an overlay starts 10pt below the status bar, or 10pt into an iOS sheet', () => {
    expect([overlayTop(59), overlayTop(59, true)]).toEqual([69, OVERLAY_GAP]);
  });
});

describe('the bar’s measure', () => {
  let renders = 0;
  let seen = 0;
  const Tab = () => { renders += 1; seen = useTabContentTop(); return null; };

  beforeEach(() => { resetTopBarHeight(); renders = 0; });

  it('is right on the first frame, before the bar has laid out', () => {
    render(<Tab />);
    expect(seen).toBe(navBarHeight(59) + TAB_CONTENT_GAP);
  });

  it('redraws a tab once for a new height, and never for the same one again', async () => {
    render(<Tab />);
    // As built: nothing the tab reads has changed.
    await act(async () => { reportTopBarHeight(59, navBarHeight(59)); });
    expect(renders).toBe(1);
    await act(async () => { reportTopBarHeight(59, 120.5); });
    expect([renders, seen]).toEqual([2, 120.5 + TAB_CONTENT_GAP]);
    await act(async () => { reportTopBarHeight(59, 120.5); });
    expect(renders).toBe(2);
  });

  it('measured at another inset, is not this inset’s: the built height stands until it lays out', async () => {
    render(<Tab />);
    await act(async () => { reportTopBarHeight(47, 200); });
    expect(seen).toBe(navBarHeight(59) + TAB_CONTENT_GAP);
  });
});
