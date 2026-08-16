/**
 * logAtmosphere.test.tsx — the film behind the record, actually mounted.
 *
 * The atmosphere is the one element in this redesign that is pure feeling: it
 * carries no data, answers no tap, and if it silently failed nobody would see
 * an error — the page would just be flat again. That is exactly why it needed
 * mounting. It is also the only piece with a deferred arrival, and a deferred
 * arrival has two ways to go wrong that reading cannot show: never arriving,
 * and arriving after the screen is gone.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import LogAtmosphere from '../LogAtmosphere';
import { colors } from '@/src/theme/theme';

jest.mock('expo-linear-gradient', () => {
  // A host element, so the stops it is given can be read back — the same
  // treatment jest.setup gives expo-image, and for the same reason.
  const React = require('react');
  return { LinearGradient: (props: Record<string, unknown>) => React.createElement('Gradient', props) };
});

type R = ReturnType<typeof render>;
type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };

/** Walk what was actually painted. The render result here is this project's
 *  synchronous shim, which exposes toJSON rather than the instance tree. */
function walk(r: R): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    out.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(r.toJSON());
  return out;
}
const byType = (r: R, t: string) => walk(r).filter(n => n.type === t);
const images = (r: R) => byType(r, 'ExpoImage');
const gradients = (r: R) => byType(r, 'Gradient');

/** Hold the interaction handle open, the way a slow entrance would. */
function starve() {
  const cancel = jest.fn();
  const spy = jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockReturnValue({ then: jest.fn(), done: jest.fn(), cancel } as never);
  return { spy, cancel };
}

beforeEach(() => { jest.useFakeTimers(); (withTiming as jest.Mock).mockClear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('it waits for the door to close', () => {
  it('paints nothing on the first frame', () => {
    starve();
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    expect(images(r)).toHaveLength(0);
    expect(r.toJSON()).toBeNull();
  });

  it('arrives once the entrance has settled', () => {
    let arrive: (() => void) | undefined;
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      arrive = cb as () => void;
      return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as never;
    });
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    expect(images(r)).toHaveLength(0);
    act(() => { arrive!(); });
    expect(images(r)).toHaveLength(1);
  });

  it('arrives anyway if that handle is never released', () => {
    // The one element carrying the atmosphere must not depend on a promise
    // that can be starved. 450ms, and the lamp warms regardless.
    starve();
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    expect(images(r)).toHaveLength(0);
    act(() => { jest.advanceTimersByTime(450); });
    expect(images(r)).toHaveLength(1);
  });

  it('does not fade in a second time when both arrivals fire', () => {
    // There are two of them by design, and only one lamp. Without the guard
    // the second restarts the fade from zero — the film appears, then dips and
    // comes back. Counted at the source: the fade must be started ONCE.
    let arrive: (() => void) | undefined;
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      arrive = cb as () => void;
      return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as never;
    });
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    act(() => { arrive!(); });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(images(r)).toHaveLength(1);
    expect(withTiming as jest.Mock).toHaveBeenCalledTimes(1);
  });
});

describe('it leaves cleanly', () => {
  it('cancels both arrivals when the sheet closes before it lands', () => {
    const { cancel } = starve();
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    r.unmount();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(cancel).toHaveBeenCalled();
    // Nothing set state on a screen that had already gone.
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a film with no poster', () => {
  it('shows nothing rather than an empty frame', () => {
    starve();
    const r = render(<LogAtmosphere posterPath={null} />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(r.toJSON()).toBeNull();
  });

  it('is not a crash when the field is simply absent', () => {
    starve();
    const r = render(<LogAtmosphere posterPath={undefined} />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(r.toJSON()).toBeNull();
  });
});

describe('what it actually paints', () => {
  const arrived = () => {
    starve();
    const r = render(<LogAtmosphere posterPath="/poster.jpg" />);
    act(() => { jest.advanceTimersByTime(450); });
    return r;
  };

  it('reuses the docket’s own image, so there is one download for both', () => {
    // Not the record's w780: a 20% blur throws that sharpness away, and a
    // second size would be a second download, a second decode, a second cache
    // entry — on the page whose rule is zero cost.
    const uri = (images(arrived())[0].props as { source: { uri: string } }).source.uri;
    expect(uri).toContain('/w342/poster.jpg');
    expect(uri).not.toContain('w780');
  });

  it('reaches solid ink before any writing begins', () => {
    // The guarantee the whole effect rests on: text is never set over an
    // image. The last stop is the page's own background, at the very bottom.
    const g = gradients(arrived())[0].props as { colors: string[]; locations: number[] };
    expect(g.colors[g.colors.length - 1]).toBe(colors.ink);
    expect(g.locations[g.locations.length - 1]).toBe(1);
    expect(g.colors).toHaveLength(g.locations.length);
  });

  it('carries a second scrim for the chrome, which sits where the film is least covered', () => {
    // CLOSE, the drag handle and the EDITING badge live in the top 124pt —
    // the part the main gradient leaves fully transparent.
    const scrim = gradients(arrived())[1].props as { colors: string[]; style: { top: number; height: number } };
    expect(scrim.style.top).toBe(0);
    expect(scrim.style.height).toBeGreaterThanOrEqual(100);
    // Darkest at the top, gone by its foot — it must not band into the film.
    expect(scrim.colors[0]).toMatch(/0\.7/);
    expect(scrim.colors[scrim.colors.length - 1]).toMatch(/,\s*0\)$/);
  });

  it('never takes a touch', () => {
    const r = arrived();
    const blockers = walk(r).filter(n => n.props?.pointerEvents === 'none');
    expect(blockers.length).toBeGreaterThan(0);
    // And the image is invisible to a screen reader — it is atmosphere, not
    // information; the docket already names the film.
    expect((images(r)[0].props as { accessible: boolean }).accessible).toBe(false);
  });
});
