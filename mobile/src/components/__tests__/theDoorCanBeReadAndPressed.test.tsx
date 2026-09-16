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
 *     share sheet), because this overlay lives in the root layout
 *
 * The overlay had no render test at all. This is it.
 */
import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

let mockOverlayProps: Record<string, unknown> | null = null;
jest.mock('react-native-screens', () => {
  const ReactLocal = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    FullWindowOverlay: (props: Record<string, unknown> & { children: React.ReactNode }) => {
      mockOverlayProps = props;
      return ReactLocal.createElement(View, { testID: 'full-window-overlay' }, props.children);
    },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

// eslint-disable-next-line import/first
import { ToastOverlay, spokenLabel } from '../ToastOverlay';
// eslint-disable-next-line import/first
import reelToast from '@/src/utils/reelToast';
// eslint-disable-next-line import/first
import { colors } from '@/src/theme/theme';

const SENTENCE = 'The Dispatch is an Auteur feature. Your words are kept.';
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

beforeEach(() => {
  mockOverlayProps = null;
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the door can be read and pressed', () => {
  it('the whole sentence is allowed room — four lines, not two', async () => {
    const r = render(<ToastOverlay />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    expect(r.getByText(SENTENCE).props.numberOfLines).toBe(4);
  });

  it('the button is on its OWN row, so it can never squeeze the sentence again', async () => {
    const r = render(<ToastOverlay />);
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
    const r = render(<ToastOverlay />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ RESUME YOUR STANDING', onPress }); });
    const button = r.getByRole('button', { name: 'Resume your standing' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reaches 44pt, whatever the chip measures', async () => {
    const r = render(<ToastOverlay />);
    await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
    const button = r.getByRole('button', { name: 'Ascend the ranks' });
    expect(button.props.hitSlop).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
  });

  it('is written in brass even on an error — never the unreadable bloodReel', async () => {
    const r = render(<ToastOverlay />);
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

    it('an actionable toast is drawn above modals — and does NOT capture VoiceOver', async () => {
      const r = render(<ToastOverlay />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      expect(r.getByTestId('full-window-overlay')).toBeTruthy();
      // The native default is MODAL, which would shut VoiceOver inside the
      // overlay and make the rest of the app unreachable while it is up.
      expect(mockOverlayProps?.unstable_accessibilityContainerViewIsModal).toBe(false);
    });

    it('and is not announced as well — the overlay takes VoiceOver focus, which reads it', async () => {
      render(<ToastOverlay />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    });

    it('what that focus reads first names the button, so nobody has to find it by chance', async () => {
      // Caught by an older guard when this was first written without it: the
      // manual announcement used to name the action, and dropping it silently
      // dropped that too.
      const r = render(<ToastOverlay />);
      await act(async () => { reelToast.info(SENTENCE, { label: '✦ ASCEND THE RANKS', onPress: jest.fn() }); });
      expect(r.getByLabelText(`${SENTENCE}. Ascend the ranks, available.`)).toBeTruthy();
    });

    it('a PLAIN toast is untouched: no overlay, still announced, still two lines', async () => {
      const r = render(<ToastOverlay />);
      await act(async () => { reelToast.success('Filed'); });
      expect(r.queryByTestId('full-window-overlay')).toBeNull();
      expect(mockOverlayProps).toBeNull();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Filed');
      expect(r.getByText('Filed').props.numberOfLines).toBe(2);
      expect(r.queryByRole('button')).toBeNull();
    });
  });

  it('the glyph is not read aloud', async () => {
    const r = render(<ToastOverlay />);
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
