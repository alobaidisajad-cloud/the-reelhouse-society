/**
 * What arrives on screen always arrives: a stalled rise is set arrived, and the
 * mount-time `entering` animations that stalled in the E2E only ever grow fewer.
 */
import React from 'react';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import Animated, { ReduceMotion, withTiming } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useArrival, useIgnition, ARRIVAL_GRACE_MS, ARRIVED, IGNITED } from '../useArrival';
import { Arrive } from '@/src/components/Arrive';
import { e2eTrace } from '@/src/utils/e2eTrace';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: false }));
// The hook itself, in every run: a drawing run (MOCKUPS) draws each entrance arrived through a
// stand-in (jest.setup.ts), and this file, run there, tested the stand-in and failed three times.
jest.unmock('@/src/hooks/useArrival');

function Held({ redraw }: { redraw?: number }) {
  const arrival = useArrival({ duration: 300, name: 'held' }).style;
  return <Animated.View testID="held" style={arrival} data-redraw={redraw} />;
}
const opacityOf = (r: ReturnType<typeof render>) => {
  const style = r.getByTestId('held').props.style;
  return (Array.isArray(style) ? Object.assign({}, ...style) : style).opacity;
};

describe('an arrival', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('that never moves is set arrived, and the E2E report is told', () => {
    (withTiming as jest.Mock).mockImplementationOnce(() => 0); // a rise that never starts
    const r = render(<Held redraw={0} />);
    expect(opacityOf(r)).toBe(0);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    r.rerender(<Held redraw={1} />);
    expect(opacityOf(r)).toBe(1);
    expect(e2eTrace).toHaveBeenCalledWith('arrival.rescued', { name: 'held', at: 0 });
  });

  it('with no easing hands Reanimated none, so its own default stands', () => {
    (withTiming as jest.Mock).mockClear();
    render(<Held redraw={0} />);
    const config = (withTiming as jest.Mock).mock.calls[0][1];
    expect(config).toEqual(expect.objectContaining({ duration: 300 }));
    expect(Object.keys(config)).not.toContain('easing');
  });

  /**
   * The film tray (Sealed E2E run 38790116312): its value risen, its animated style
   * never reaching the view just mounted. Arrived, the view is drawn with a plain style.
   */
  it('is drawn with a plain style once arrived, not its animated one', () => {
    const r = render(<Held redraw={0} />);
    expect(r.getByTestId('held').props.style).not.toBe(ARRIVED);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    expect(r.getByTestId('held').props.style).toBe(ARRIVED);
  });

  /**
   * The sign-in sheets of ios-launch 43586955860: their form, seal and button rescued at 0 and still
   * transparent a minute on, Reanimated laying the 0 it last wrote over every commit after. A
   * rescued arrival is a new view, and what it holds arrives at once.
   */
  it('that never moves is drawn anew, and what it holds arrives at once', () => {
    // No rise starts: the UI thread is still. The inner one would be rescued later than the outer.
    const real = (withTiming as jest.Mock).getMockImplementation();
    (withTiming as jest.Mock).mockImplementation(() => 0);
    const mounts = { n: 0 };
    function Counted() {
      React.useEffect(() => { mounts.n += 1; }, []);
      return null;
    }
    // The view itself, by its ref: drawn anew, it is a new one (a ref is given each view once).
    const views: unknown[] = [];
    const seen = (v: unknown) => { if (v) views.push(v); };
    (e2eTrace as jest.Mock).mockClear();
    const r = render(
      <Arrive name="outer" duration={300} testID="outer" {...({ ref: seen } as object)}>
        <Counted />
        <Arrive name="inner" duration={900} testID="inner" />
      </Arrive>,
    );
    expect(mounts.n).toBe(1);
    expect(views).toHaveLength(1);
    expect(StyleSheet.flatten(r.getByTestId('inner').props.style)).not.toEqual(expect.objectContaining(ARRIVED));
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    (withTiming as jest.Mock).mockImplementation(real);
    expect(views).toHaveLength(2);
    expect(views[1]).not.toBe(views[0]);
    expect(mounts.n).toBe(2);
    React.act(() => { jest.advanceTimersByTime(900 + ARRIVAL_GRACE_MS); });
    // Drawn anew, the inner one is arrived from its first frame, and never rescued itself.
    expect(StyleSheet.flatten(r.getByTestId('inner').props.style)).toEqual(expect.objectContaining(ARRIVED));
    expect((e2eTrace as jest.Mock).mock.calls.map((c) => c[1].name)).toEqual(['outer']);
  });

  it('that lands keeps its view', () => {
    const mounts = { n: 0 };
    function Counted() {
      React.useEffect(() => { mounts.n += 1; }, []);
      return null;
    }
    render(<Arrive name="lands" duration={300}><Counted /></Arrive>);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    expect(mounts.n).toBe(1);
  });

  it('that lands is left alone', () => {
    (e2eTrace as jest.Mock).mockClear();
    const r = render(<Held redraw={0} />);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    r.rerender(<Held redraw={1} />);
    expect(opacityOf(r)).toBe(1);
    expect(e2eTrace).not.toHaveBeenCalled();
  });
});

describe('an ignition', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const mounts = { n: 0 };
  function Counted() {
    React.useEffect(() => { mounts.n += 1; }, []);
    return null;
  }
  function Lit() {
    const { style, key } = useIgnition('door', { duration: 300, from: 0.9, name: 'lit' });
    return <Animated.View key={key} testID="lit" style={style}><Counted /></Animated.View>;
  }

  it('that never lights is drawn anew, resting on its plain style', () => {
    mounts.n = 0;
    (withTiming as jest.Mock).mockImplementationOnce(() => 0);
    const r = render(<Lit />);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    expect(mounts.n).toBe(2);
    expect(r.getByTestId('lit').props.style).toBe(IGNITED);
  });

  /** The Initiation's stamp, for a member who asked for less motion: never one frame unseen, then a pop. */
  it('asked for no motion at all, rests on its plain style from its first frame', () => {
    function Still() {
      const { style } = useIgnition('stamp', { duration: 320, delay: 0, from: 1.06, reduceMotion: ReduceMotion.Always, name: 'still' });
      return <Animated.View testID="still" style={style} />;
    }
    const r = render(<Still />);
    expect(r.getByTestId('still').props.style).toBe(IGNITED);
  });

  it('that lights keeps its view', () => {
    mounts.n = 0;
    render(<Lit />);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    expect(mounts.n).toBe(1);
  });
});

describe('a view that rests on a plain style once rescued', () => {
  /**
   * Reanimated lays the props it last wrote over every React commit until the view unmounts, so
   * each rescue that leaves a view on a plain style draws that view anew (drawnAnew), and each
   * ignition's views are drawn under its key.
   */
  it('is drawn anew, wherever a rescue or a plain resting style is', () => {
    const code = universe('appCode', { ext: ['.ts', '.tsx'] })
      .filter((p) => !/[\\/]hooks[\\/]useArrival\.ts$/.test(p))
      .map((p) => ({ p: p.split(/[\\/]/).slice(-2).join('/'), src: readCode(p) }));
    const rescuing = code.filter(({ src }) => /\.rescued'|\? RISEN_|restingStyle\(/.test(src));
    expect(rescuing.map(({ p }) => p).sort()).toEqual(['film/FilmActionTray.tsx', 'layout/ConciergeButton.tsx', 'layout/tabIconMotion.ts', 'motion/Presence.tsx']);
    // Its key in the view, or handed back as `key` for its callers to draw under (below).
    expect(rescuing.filter(({ src }) => !/key=\{[^}\n]*drawnAnew\(rescues\)|key: drawnAnew\(rescues\)/.test(src)).map(({ p }) => p)).toEqual([]);
    // Each call of a hook that hands a key back draws a view under it, before the next call.
    for (const hook of ['useIgnition', 'useTabIconMotion']) {
      const calls = code.flatMap(({ p, src }) => [...src.matchAll(new RegExp(`\\{[^}]*?\\bkey(?:: (\\w+))?\\s*\\} = ${hook}\\(`, 'g'))]
        .map((m) => ({ p, src, at: (m.index ?? 0) + m[0].length, name: m[1] ?? 'key' })));
      const all = code.reduce((n, { src }) => n + (src.match(new RegExp(`= ${hook}\\(`, 'g'))?.length ?? 0), 0);
      expect([hook, calls.length]).toEqual([hook, all]);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const unkeyed = calls.filter(({ src, at, name }) => {
        const next = src.indexOf(`= ${hook}(`, at);
        return !new RegExp(`key=\\{[^\\n]*\\b${name}\\b`).test(src.slice(at, next < 0 ? undefined : next + 200));
      });
      expect(unkeyed.map(({ p }) => p)).toEqual([]);
    }
  });
});

describe('mount-time entering animations', () => {
  /**
   * Each could strand what it holds at opacity 0 (the film's tray; the Tribunal's header, Sealed
   * E2E 39714110216). All 91 moved to Arrive (2026-10-22): none is left, and none may come back.
   */
  it('are none: every arrival is Arrive, certain to arrive', () => {
    const left = universe('appCode', { ext: ['.tsx'] }).flatMap((p) => readCode(p).split(/\r?\n/)
      .map((line, i) => (/\bentering=\{/.test(line) ? `${p.split(/[\\/]/).slice(-2).join('/')}:${i + 1}` : null))
      .filter((x): x is string => x !== null));
    expect(left).toEqual([]);
  });
});
