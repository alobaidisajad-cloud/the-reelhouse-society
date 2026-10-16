/**
 * Presence keeps a view React has dropped until its exit has played, then removes it; nothing
 * is withheld from React (exitingIsNeverUsed.guard.test.ts says why).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { Presence, PresenceView, PRESET_MS, restingStyle, type Motion, type Exit } from '../Presence';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

const timing = Reanimated.withTiming as jest.Mock;
const delay = Reanimated.withDelay as jest.Mock;
const reduced = Reanimated.useReducedMotion as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  timing.mockClear();
  delay.mockClear();
});
afterEach(() => {
  reduced.mockImplementation(() => false);
  jest.useRealTimers();
});

const FADE: Motion<Exit> = { kind: 'FadeOut', duration: 140 };
/** A leaving view is hidden from the screen reader, so the queries look past that. */
const ALL = { includeHiddenElements: true } as const;

function Shown({ on, exit = FADE, other }: { on: boolean; exit?: Motion<Exit>; other?: boolean }) {
  return (
    <Presence>
      {on && (
        <PresenceView key="a" name="a" testID="a" exit={exit} pointerEvents="box-none">
          <Text>held</Text>
        </PresenceView>
      )}
      {other && <PresenceView key="b" name="b" testID="b" exit={exit} />}
    </Presence>
  );
}

/** Gives the view the frame the layout gave it, as a phone would. */
const laidOut = (r: ReturnType<typeof render>, id: string, layout = { x: 0, y: 40, width: 300, height: 50 }) =>
  React.act(() => { r.getByTestId(id, ALL).props.onLayout({ nativeEvent: { layout } }); });

const styleOf = (r: ReturnType<typeof render>, id: string) => StyleSheet.flatten(r.getByTestId(id, ALL).props.style);

/** The call that ends the exit: the one handed a callback. */
const ending = () => timing.mock.calls.filter((c) => typeof c[2] === 'function');

describe('a view leaving', () => {
  it('stays while its exit plays, untouchable, and is removed when its time is up', () => {
    const r = render(<Shown on />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} />);
    expect(r.getByTestId('a', ALL)).toBeTruthy();
    expect(r.getByTestId('a', ALL).props.pointerEvents).toBe('none');
    expect(r.getByText('held', ALL)).toBeTruthy();
    React.act(() => { jest.advanceTimersByTime(140 + ARRIVAL_GRACE_MS - 1); });
    expect(r.getByTestId('a', ALL)).toBeTruthy();
    React.act(() => { jest.advanceTimersByTime(1); });
    expect(r.queryByTestId('a', ALL)).toBeNull();
  });

  it('is held through a delayed exit too, when that exit never says it ended', () => {
    const r = render(<Shown on exit={{ kind: 'FadeOut', duration: 140, delay: 500 }} />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} exit={{ kind: 'FadeOut', duration: 140, delay: 500 }} />);
    React.act(() => { jest.advanceTimersByTime(500 + 140 + ARRIVAL_GRACE_MS - 1); });
    expect(r.getByTestId('a', ALL)).toBeTruthy();
    React.act(() => { jest.advanceTimersByTime(1); });
    expect(r.queryByTestId('a', ALL)).toBeNull();
  });

  it('is removed when its exit says it has ended, by state, and not when one was cut short', () => {
    const r = render(<Shown on />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} />);
    const [[to, config, ended]] = ending();
    expect([to, config]).toEqual([0, { duration: 140, reduceMotion: 'system' }]);
    React.act(() => { ended(false); });
    expect(r.getByTestId('a', ALL)).toBeTruthy();
    React.act(() => { ended(true); });
    expect(r.queryByTestId('a', ALL)).toBeNull();
  });

  it('is removed at once under reduced motion, and plays nothing', () => {
    reduced.mockImplementation(() => true);
    const r = render(<Shown on />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} />);
    expect(r.queryByTestId('a', ALL)).toBeNull();
    expect(ending()).toEqual([]);
  });

  it('is removed at once with no exit to play', () => {
    const Bare = ({ on }: { on: boolean }) => (
      <Presence>{on && <PresenceView key="a" name="a" testID="a" />}</Presence>
    );
    const r = render(<Bare on />);
    laidOut(r, 'a');
    expect(r.getByTestId('a', ALL)).toBeTruthy(); // there, until it is not
    r.rerender(<Bare on={false} />);
    expect(r.queryByTestId('a', ALL)).toBeNull();
  });

  it('steps out of the layout at the frame it last had, so what follows closes up at once', () => {
    const r = render(<Shown on />);
    laidOut(r, 'a', { x: 8, y: 40, width: 300, height: 50 });
    expect(styleOf(r, 'a').position).toBeUndefined();
    r.rerender(<Shown on={false} />);
    expect(styleOf(r, 'a')).toEqual(expect.objectContaining({
      position: 'absolute', left: 8, top: 40, width: 300, height: 50, margin: 0,
    }));
  });

  it('comes back whole if it is shown again before it has gone', () => {
    const r = render(<Shown on />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} />);
    r.rerender(<Shown on />);
    React.act(() => { jest.advanceTimersByTime(1000); });
    expect(r.getByTestId('a', ALL).props.pointerEvents).toBe('box-none');
    expect(styleOf(r, 'a').position).toBeUndefined();
  });

  it('keeps its place, after what arrived where it stood', () => {
    const r = render(<Shown on />);
    laidOut(r, 'a');
    r.rerender(<Shown on={false} other />);
    const drawn = r.toJSON() as unknown as { children: { props: { testID: string } }[] };
    const ids = drawn.children.map((n) => n.props.testID);
    expect(ids).toEqual(['b', 'a']);
  });
});

describe('the motion is the preset\'s', () => {
  const leaves = (exit: Motion<Exit>, layout = { x: 0, y: 0, width: 375, height: 120 }) => {
    const r = render(<Shown on exit={exit} />);
    laidOut(r, 'a', layout);
    timing.mockClear();
    r.rerender(<Shown on={false} exit={exit} />);
    return timing.mock.calls.map((c) => [c[0], c[1]]);
  };

  it('SlideOutDown travels the screen\'s height from where it stood, on the curve it was given', () => {
    const curve = (t: number) => t;
    // The jest frame is 375 × 812.
    expect(leaves({ kind: 'SlideOutDown', duration: 140, easing: curve })).toEqual([
      [812, { duration: 140, easing: curve, reduceMotion: 'system' }],
    ]);
    expect(leaves({ kind: 'SlideOutDown' }, { x: 0, y: -30, width: 375, height: 120 })[0][0]).toBe(842);
  });

  it('SlideOutRight travels the screen\'s width, in the preset\'s own time', () => {
    expect(leaves({ kind: 'SlideOutRight' }, { x: 16, y: 0, width: 343, height: 120 })).toEqual([
      [375, { duration: PRESET_MS, reduceMotion: 'system' }],
    ]);
  });

  it('FadeOutUp and FadeOutDown fade and travel the preset\'s 25 points', () => {
    expect(leaves({ kind: 'FadeOutUp', duration: 300 }).map((c) => c[0])).toEqual([0, -25]);
    expect(leaves({ kind: 'FadeOutDown', duration: 140 }).map((c) => c[0])).toEqual([0, 25]);
  });

  it('an entrance runs once on mount, after its delay, and hands withTiming no easing it was not given', () => {
    render(
      <Presence>
        <PresenceView key="a" name="a" enter={{ kind: 'FadeInUp', duration: 400, delay: 100 }} />
      </Presence>,
    );
    expect(timing.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [1, { duration: 400, reduceMotion: 'system' }],
      [0, { duration: 400, reduceMotion: 'system' }],
    ]);
    expect(delay.mock.calls.map((c) => c[0])).toEqual([100, 100]);
  });

  /**
   * The film tray (Sealed E2E run 38790116312): a value at rest while its animated style
   * never reached the view just mounted. Arrived, a view rests on plain styles; leaving,
   * it takes its animated style back for the exit.
   */
  it('rests on plain styles once arrived, and leaves on its animated ones', () => {
    const plain = restingStyle(true, true);
    const styles = (r: ReturnType<typeof render>) => (r.getByTestId('a', ALL).props.style as unknown[]).flat();
    const Arriving = ({ on }: { on: boolean }) => (
      <Presence>
        {on && <PresenceView key="a" name="a" testID="a" enter={{ kind: 'FadeInUp', duration: 400 }} exit={FADE} />}
      </Presence>
    );
    const r = render(<Arriving on />);
    expect(styles(r)).not.toContain(plain);
    React.act(() => { jest.advanceTimersByTime(400 + ARRIVAL_GRACE_MS); });
    expect(styles(r)).toContain(plain);
    r.rerender(<Arriving on={false} />);
    expect(styles(r)).not.toContain(plain);
  });

  it('an entrance under reduced motion starts where it ends', () => {
    reduced.mockImplementation(() => true);
    const r = render(
      <Presence><PresenceView key="a" name="a" testID="a" enter={{ kind: 'FadeInDown' }} /></Presence>,
    );
    expect(timing).not.toHaveBeenCalled();
    expect(styleOf(r, 'a')).toEqual(expect.objectContaining({ opacity: 1 }));
  });
});

describe('a leaving child holds what it contains', () => {
  function Nested({ on, inner }: { on: boolean; inner: number }) {
    return (
      <Presence>
        {on && (
          <PresenceView key="room" name="room" testID="room">
            <Presence>
              <PresenceView key={inner} name="inner" testID={`inner-${inner}`} exit={{ kind: 'FadeOut', duration: 180 }} />
            </Presence>
          </PresenceView>
        )}
      </Presence>
    );
  }

  it('waits for the exits inside it, which stay where they stood', () => {
    const r = render(<Nested on inner={0} />);
    laidOut(r, 'room');
    laidOut(r, 'inner-0');
    r.rerender(<Nested on={false} inner={0} />);
    expect(r.getByTestId('room', ALL)).toBeTruthy();
    expect(styleOf(r, 'inner-0').position).toBeUndefined();
    React.act(() => { jest.advanceTimersByTime(180 + ARRIVAL_GRACE_MS); });
    expect(r.queryByTestId('room', ALL)).toBeNull();
  });

  it('a child replaced inside it leaves over the one that took its place', () => {
    const r = render(<Nested on inner={0} />);
    laidOut(r, 'inner-0');
    r.rerender(<Nested on inner={1} />);
    expect(r.getByTestId('inner-1', ALL)).toBeTruthy();
    expect(styleOf(r, 'inner-0').position).toBe('absolute');
    React.act(() => { jest.advanceTimersByTime(180 + ARRIVAL_GRACE_MS); });
    expect(r.queryByTestId('inner-0', ALL)).toBeNull();
    expect(r.getByTestId('inner-1', ALL)).toBeTruthy();
  });
});
