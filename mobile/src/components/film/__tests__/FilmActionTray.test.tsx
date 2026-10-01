/**
 * The tray: the acts it offers, and the three things an in-screen overlay has
 * to earn that a <Modal> would have given it free.
 */
import React from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { render, fireEvent } from '@testing-library/react-native';
import { FilmActionTray, TrayIcons, FALL_MS, RISE_RESCUE_MS, type TrayAct } from '../FilmActionTray';
import { trayMaxHeight } from '../filmStubMetrics';
import { e2eTrace } from '@/src/utils/e2eTrace';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: false }));

const act = (over: Partial<TrayAct> = {}): TrayAct => ({
  key: 'log', Icon: TrayIcons.Plus, label: 'LOG THIS FILM',
  gloss: 'Set it down in your Ledger.', onPress: jest.fn(), ...over,
});

const base = {
  visible: true,
  onDismiss: jest.fn(),
  film: { title: 'The Odyssey', poster_path: '/p.jpg' },
  subtitle: '2026  ·  2H 53M',
  acts: [act()],
  windowHeight: 844,
  dockHeight: 97,
};

describe('what the tray shows', () => {
  it('renders nothing at all while closed', () => {
    const t = render(<FilmActionTray {...base} visible={false} />);
    expect(t.queryByTestId('film-action-tray')).toBeNull();
  });

  it("carries the film's own title, so the sheet is never generic", () => {
    const t = render(<FilmActionTray {...base} />);
    expect(t.getByText('The Odyssey')).toBeTruthy();
    expect(t.getByText('2026  ·  2H 53M')).toBeTruthy();
  });

  it('gives a long title two lines rather than truncating the film away', () => {
    const t = render(<FilmActionTray {...base} film={{ title: 'The Lord of the Rings: The Fellowship of the Ring' }} />);
    expect(t.getByText(/Fellowship/).props.numberOfLines).toBe(2);
  });

  it('shows every act it is given, and only those', () => {
    const t = render(<FilmActionTray {...base} acts={[
      act(), act({ key: 'w', label: 'ADD TO THE WATCHLIST', gloss: 'Keep it.' }),
    ]} />);
    expect(t.getByText('LOG THIS FILM')).toBeTruthy();
    expect(t.getByText('ADD TO THE WATCHLIST')).toBeTruthy();
    expect(t.queryByText('PLAY THE TRAILER')).toBeNull();
  });

  it('caps a row so its height survives any language, and the gloss keeps its words', () => {
    const t = render(<FilmActionTray {...base} />);
    expect(t.getByText('LOG THIS FILM').props.numberOfLines).toBe(1);
    // The gloss shrinks first, then takes a second line — never a third, never an ellipsis at 320pt.
    const gloss = t.getByText('Set it down in your Ledger.').props;
    expect(gloss.numberOfLines).toBe(2);
    expect(gloss.adjustsFontSizeToFit).toBe(true);
  });

  it('marks only the acts that travel', () => {
    // `↗` promises "this leaves the page". Four of six acts do not.
    const staying = render(<FilmActionTray {...base} acts={[act()]} />);
    const leaving = render(<FilmActionTray {...base} acts={[act({ travels: true })]} />);
    const svgs = (t: ReturnType<typeof render>) =>
      (JSON.stringify(t.toJSON()).match(/RNSVGSvgView/g) || []).length;
    expect(svgs(leaving)).toBeGreaterThan(svgs(staying));
  });

  it('reads state as a chip rather than making you re-read the label', () => {
    const t = render(<FilmActionTray {...base} acts={[act({ chip: 'SAVED' })]} />);
    expect(t.getByText('SAVED')).toBeTruthy();
  });

  /**
   * The watchlist is the only act that resolves WITHOUT the tray closing, so it
   * is the only one whose feedback has to happen in place. This bounce already
   * existed in the app and was very nearly lost with the console it lived on:
   * the animated style was still being computed and simply had nothing left
   * rendering it. Nothing failed, and the toggle just quietly stopped moving.
   */
  it('applies an act\'s animated style to its glyph', () => {
    const t = render(<FilmActionTray {...base} acts={[
      act({ iconStyle: { transform: [{ scale: 1.3 }] } }),
    ]} />);
    expect(JSON.stringify(t.toJSON())).toContain('"scale":1.3');
  });
});

describe('the three things an overlay has to earn', () => {
  /**
   * A <Modal> would hide the page beneath from a screen reader. A View has to
   * say so — and the closing control must live INSIDE that region, which is the
   * exact defect found when the Concierge was audited: the only way out was
   * invisible to VoiceOver.
   */
  it('is a modal region to the screen reader, with its own way out inside it', () => {
    const t = render(<FilmActionTray {...base} />);
    expect(t.getByTestId('film-action-tray').props.accessibilityViewIsModal).toBe(true);
    const scrim = t.getByTestId('film-tray-scrim');
    expect(scrim.props.accessibilityLabel).toMatch(/close/i);
  });

  it('closes on the scrim', async () => {
    const onDismiss = jest.fn();
    const t = render(<FilmActionTray {...base} onDismiss={onDismiss} />);
    await fireEvent.press(t.getByTestId('film-tray-scrim'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes on Android's hardware back instead of leaving the film", () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    const onDismiss = jest.fn();
    render(<FilmActionTray {...base} onDismiss={onDismiss} />);
    const [event, handler] = spy.mock.calls[spy.mock.calls.length - 1];
    expect(event).toBe('hardwareBackPress');
    // Returning true is what stops the press falling through to the router.
    expect(handler()).toBe(true);
    expect(onDismiss).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not swallow back presses while it is closed', () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    const before = spy.mock.calls.length;
    render(<FilmActionTray {...base} visible={false} />);
    expect(spy.mock.calls.length).toBe(before);
    spy.mockRestore();
  });
});

describe('an open tray is always seen, and a closed one always goes', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const risen = (t: ReturnType<typeof render>) => {
    const scrim = StyleSheet.flatten(t.getByTestId('film-tray-scrim').parent!.props.style);
    return scrim.opacity;
  };

  /**
   * In the sealed E2E, offline, an opened tray stayed transparent: open to the
   * page (the stub said it closes it) and invisible to the member. A rise that
   * has not landed by RISE_RESCUE_MS is set risen.
   */
  it('is set risen when its rise never lands', () => {
    (withTiming as jest.Mock).mockImplementationOnce(() => 0); // a rise that never moves
    const t = render(<FilmActionTray {...base} />);
    expect(risen(t)).toBe(0);
    React.act(() => { jest.advanceTimersByTime(RISE_RESCUE_MS); });
    t.rerender(<FilmActionTray {...base} acts={[...base.acts]} />); // memo: a new list redraws it
    expect(risen(t)).toBe(1);
    expect(e2eTrace).toHaveBeenCalledWith('tray.rise.rescued', { at: 0 });
  });

  it('is drawn through its fall, then gone, and holds nothing while it falls', () => {
    const t = render(<FilmActionTray {...base} />);
    t.rerender(<FilmActionTray {...base} visible={false} />);
    const layer = t.getByTestId('film-action-tray');
    expect(layer.props.pointerEvents).toBe('none');
    expect(layer.props.accessibilityViewIsModal).toBe(false);
    React.act(() => { jest.advanceTimersByTime(FALL_MS); });
    expect(t.queryByTestId('film-action-tray')).toBeNull();
  });
});

describe('the trap that fires the wrong act', () => {
  /**
   * PressableScale back-fills any omitted hitSlop side with 15pt, and adjacent
   * controls OVERLAP with the LATER one winning. Six stacked rows each bleeding
   * 15pt into their neighbours means a press near a boundary logs a film when
   * the member meant to share it — and it looks like a mis-tap, not a bug.
   */
  it('gives every row horizontal reach only', () => {
    const t = render(<FilmActionTray {...base} acts={[
      act(), act({ key: 'b', label: 'B' }), act({ key: 'c', label: 'C' }),
    ]} />);
    const rows = JSON.stringify(t.toJSON()).match(/"hitSlop":\{[^}]*\}/g) || [];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const slop of rows) {
      expect(slop).toContain('"top":0');
      expect(slop).toContain('"bottom":0');
    }
  });
});

describe('the tray fits the screen it is on', () => {
  it('is capped against the LIVE window, not a constant', () => {
    const small = render(<FilmActionTray {...base} windowHeight={667} />);
    const large = render(<FilmActionTray {...base} windowHeight={844} />);
    expect(JSON.stringify(small.toJSON())).toContain(`"maxHeight":${trayMaxHeight(667)}`);
    expect(JSON.stringify(large.toJSON())).toContain(`"maxHeight":${trayMaxHeight(844)}`);
  });

  it('reserves the dock, so the last act never hides under the stub', () => {
    const t = render(<FilmActionTray {...base} dockHeight={97} />);
    expect(JSON.stringify(t.toJSON())).toContain('"paddingBottom":103');
  });

  // (Never a date through Intl: the app-wide lint rule.)
});
