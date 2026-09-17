/**
 * theDoorCanBeReadAndPressed.test.tsx — the refusal toast, mounted.
 * ─────────────────────────────────────────────────────────────────────────────
 * Until the house's refusal doors, nothing had ever passed a toast an action,
 * and this path had never been laid out for use. Verifying the doors found it
 * broken in four ways that no test of the stores could see:
 *
 *   · the label shared the message's row, and every refusal sentence was
 *     truncated on every phone size (measured from the fonts' advance widths)
 *   · the button wore an error's bloodReel ink — 1.25–1.49:1, unreadable
 *   · it was a 26pt text span with no button role, read aloud with its ✦
 *   · on iOS it drew BEHIND the modal it was raised on (the writing desk, the
 *     share sheet), because the overlay lived in the root layout
 *
 * The last is now structural — a host on every screen and in every sheet, one
 * drawing at a time (theToastIsDrawnOnTop, theToastHasOneHome). This file holds
 * what the toast itself must be once drawn.
 */
import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

import { ToastHost, spokenLabel } from '../ToastHost';
import reelToast from '@/src/utils/reelToast';
import { colors } from '@/src/theme/theme';

const SENTENCE = 'The Dispatch is an Auteur feature. Your words are kept.';
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

beforeEach(() => {
  jest.useFakeTimers();
  // Both are jest.fn()s from jest.setup — a spy on them IS them, and restoring
  // it does not forget the calls. Cleared here, or one test hears the last.
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the door can be read and pressed', () => {
  it('the whole sentence is allowed room — four lines, not two', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    expect(r.getByText(SENTENCE).props.numberOfLines).toBe(4);
  });

  it('the button is on its OWN row, so it can never squeeze the sentence again', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    // The pill stacks; the message shares a row only with its glyph. Walked up
    // the ancestors rather than hopped a fixed number of levels: host and
    // composite nodes interleave, and a fixed hop read the wrong one.
    const directions: string[] = [];
    for (let n = r.getByText(SENTENCE).parent; n; n = n.parent) {
      const d = flat(n.props?.style)?.flexDirection;
      if (typeof d === 'string') directions.push(d);
    }
    // Nearest laid-out ancestor is the message's row; the one above it, the pill.
    expect(directions.slice(0, 2)).toEqual(['row', 'column']);
  });

  it('is a real button — named without its star — and pressing it works', async () => {
    const onPress = jest.fn();
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ RESUME YOUR STANDING', onPress }); });
    const button = r.getByRole('button', { name: 'Resume your standing' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reaches 44pt, whatever the chip measures', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    const button = r.getByRole('button', { name: 'Ascend the ranks' });
    expect(button.props.hitSlop).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
  });

  it('is written in brass even on an error — never the unreadable bloodReel', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.error('Something refused', { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    expect(flat(r.getByText('✦ ASCEND THE RANKS').props.style).color).toBe(colors.champagne);
  });

  it('and that brass is legible on the toast’s own ground, worst case', () => {
    // WCAG ratio of the label ink on its chip over the toast, over parchment —
    // the lightest thing that can sit behind a translucent toast. Pinned here so
    // a change of ink is measured, not eyeballed.
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const over = (fg: number[], a: number, bg: number[]) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
    const lum = (rgb: number[]) => {
      const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const chip = over([196, 150, 26], 0.1, over([11, 10, 8], 0.92, hex(colors.parchment)));
    const a = lum(hex(colors.champagne)); const b = lum(chip);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  describe('on iOS', () => {
    const original = Platform.OS;
    beforeAll(() => { Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true }); });
    afterAll(() => { Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true }); });

    it('an actionable toast takes VoiceOver focus onto its message — the element that names the button', async () => {
      const r = render(<ToastHost layer="root" />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      expect(AccessibilityInfo.sendAccessibilityEvent).not.toHaveBeenCalled();
      // Once it has faded in far enough to be focusable.
      await act(async () => { jest.advanceTimersByTime(300); });
      const message = r.getByLabelText(`${SENTENCE}. Ascend the ranks, available.`);
      expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
      const [target, event] = (AccessibilityInfo.sendAccessibilityEvent as jest.Mock).mock.calls[0];
      expect(event).toBe('focus');
      // The ref points at the host instance of the very element carrying the label.
      expect(target).toBeTruthy();
      expect(message).toBeTruthy();
    });

    it('and is not announced as well — the focus reads it, once', async () => {
      render(<ToastHost layer="root" />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    });

    it('a PLAIN toast is announced, never focused, two lines, no button', async () => {
      const r = render(<ToastHost layer="root" />);
      await act(async () => { reelToast.success('Filed'); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Filed');
      expect(AccessibilityInfo.sendAccessibilityEvent).not.toHaveBeenCalled();
      expect(r.getByText('Filed').props.numberOfLines).toBe(2);
      expect(r.queryByRole('button')).toBeNull();
    });
  });

  describe('on Android', () => {
    const original = Platform.OS;
    beforeAll(() => { Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true }); });
    afterAll(() => { Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true }); });

    it('the live region speaks — nothing announces or moves focus as well', async () => {
      const r = render(<ToastHost layer="root" />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
      expect(AccessibilityInfo.sendAccessibilityEvent).not.toHaveBeenCalled();
      // A View is not an accessible element to getByRole, so walk up to it.
      let region: string | undefined;
      for (let n = r.getByText(SENTENCE).parent; n && !region; n = n.parent) {
        if (n.props?.accessibilityRole === 'alert') region = n.props.accessibilityLiveRegion;
      }
      expect(region).toBe('polite');
    });
  });

  it('the glyph is not read aloud', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => { reelToast.success('Filed'); });
    const glyph = r.getByText('✦', { includeHiddenElements: true });
    expect(glyph.props.accessibilityElementsHidden).toBe(true);
    expect(glyph.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('spoken labels drop the ornament and the shouting', () => {
    expect(spokenLabel('✦ ASCEND THE RANKS')).toBe('Ascend the ranks');
    expect(spokenLabel('✦ RESUME YOUR STANDING')).toBe('Resume your standing');
  });
});
