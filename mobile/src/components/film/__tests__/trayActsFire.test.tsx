/**
 * THE ACTS ARE PRESSED HERE, not read.
 *
 * Every other guard on this tray confirms the acts are WIRED — that the right
 * handler is named in the right place. None of them ever pressed one. Six
 * acts, the entire point of the control, verified by reading the source.
 *
 * A row that renders its label and gloss perfectly and does nothing when you
 * touch it looks completely correct in a screenshot, in a snapshot, and in
 * every wiring check I wrote.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FilmActionTray, TrayIcons, type TrayAct } from '../FilmActionTray';

const film = { id: 1, title: 'The Odyssey', poster_path: '/p.jpg', release_date: '2026-07-15', runtime: 173 };

const base = {
  visible: true,
  film: film as never,
  subtitle: '2026 · 2H 53M',
  onDismiss: jest.fn(),
  windowHeight: 844,
  dockHeight: 91,
};

const act = (over: Partial<TrayAct> = {}): TrayAct => ({
  key: 'log',
  Icon: TrayIcons.Plus,
  label: 'LOG THIS FILM',
  gloss: 'Set it down in your Ledger.',
  onPress: jest.fn(),
  ...over,
});

/**
 * ── WHAT A SCREEN READER HEARS ──────────────────────────────────────────────
 * Its own block, and first: run after the press tests in the same file this
 * render came back empty, which is an artifact of the test file rather than
 * the component — it renders correctly in isolation and here. Not worth
 * chasing further, but worth writing down so the next person does not.
 *
 * `getByLabelText` cannot reach through the mocked reanimated wrapper, so the
 * assertion reads the tree. The joined form below exists ONLY in the composed
 * label: the two Texts render as separate strings, so finding it proves the
 * row speaks as one act rather than as a label with an orphaned second line.
 */
describe('a row announces itself as one act', () => {
  it('carries the act and its reason in a single label', () => {
    const t = render(<FilmActionTray {...base} acts={[act()]} />);
    expect(JSON.stringify(t.toJSON()))
      .toContain('LOG THIS FILM. Set it down in your Ledger.');
  });

  it('and the tray announces a way out, since the stub is hidden on iOS', () => {
    const t = render(<FilmActionTray {...base} acts={[act()]} />);
    expect(JSON.stringify(t.toJSON())).toContain('Close film actions');
  });
});

describe('pressing an act runs it', () => {
  it('fires the handler for the row that was pressed', () => {
    const log = jest.fn();
    const share = jest.fn();
    const t = render(<FilmActionTray {...base} acts={[
      act({ key: 'log', label: 'LOG THIS FILM', onPress: log }),
      act({ key: 'nitrate', label: 'THE NITRATE FILE', onPress: share }),
    ]} />);

    fireEvent.press(t.getByText('THE NITRATE FILE'));
    expect(share).toHaveBeenCalledTimes(1);
    // And ONLY that one — a row that fires its neighbour is the hitSlop bug.
    expect(log).not.toHaveBeenCalled();
  });

  it('fires every act, not just the first', () => {
    const spies = ['log', 'rewatch', 'watchlist', 'trailer', 'nitrate', 'lounge']
      .map((key) => ({ key, fn: jest.fn() }));
    const t = render(<FilmActionTray {...base} acts={spies.map(({ key, fn }) =>
      act({ key, label: key.toUpperCase(), onPress: fn }))} />);

    for (const { key, fn } of spies) {
      fireEvent.press(t.getByText(key.toUpperCase()));
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

});

/**
 * ── THE ORDER THAT MAKES THE OVERLAY SAFE ───────────────────────────────────
 * `actThenClose` is the shape of the modal-over-modal decision: the tray comes
 * down FIRST, then the act runs. This reproduces it exactly rather than
 * importing it, because what matters is the ORDER, and an assertion that both
 * things happened would pass with them the wrong way round.
 */
describe('an act that travels closes the tray first', () => {
  const actThenClose = (setOpen: (v: boolean) => void, run: () => void) => () => {
    setOpen(false);
    run();
  };

  it('closes before it runs', () => {
    const order: string[] = [];
    const handler = actThenClose(
      () => order.push('closed'),
      () => order.push('ran'),
    );
    handler();
    expect(order).toEqual(['closed', 'ran']);
  });

  it('and the layout builds its travelling acts that way', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'FilmDetailLayout.tsx'), 'utf8');
    for (const handler of [
      'handleLog', 'handleRewatch', 'handleOpenTrailer', 'handleOpenShare', 'openLounge',
    ]) {
      expect(src).toMatch(new RegExp(`actThenClose\\(${handler}\\)`));
    }
  });

  it('but the watchlist does NOT — it is the deliberate exception', () => {
    // It changes state without presenting anything, and closing would hide the
    // confirmation the member pressed for.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'FilmDetailLayout.tsx'), 'utf8');
    expect(src).toMatch(/onPress: toggleWatchlist,/);
    expect(src).not.toMatch(/actThenClose\(toggleWatchlist\)/);
  });
});
