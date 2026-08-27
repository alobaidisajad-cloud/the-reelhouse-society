/**
 * The tray: the acts it offers, and the three things an in-screen overlay has
 * to earn that a <Modal> would have given it free.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { FilmActionTray, TrayIcons, type TrayAct } from '../FilmActionTray';
import { trayMaxHeight } from '../filmStubMetrics';

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

  it('caps both lines of a row so its height survives any language', () => {
    const t = render(<FilmActionTray {...base} />);
    expect(t.getByText('LOG THIS FILM').props.numberOfLines).toBe(1);
    expect(t.getByText('Set it down in your Ledger.').props.numberOfLines).toBe(1);
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

  it('never formats a date itself', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'FilmActionTray.tsx'), 'utf8');
    expect(src).not.toMatch(/toLocaleDateString|Intl\./);
  });
});
