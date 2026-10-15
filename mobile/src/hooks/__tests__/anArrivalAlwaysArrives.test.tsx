/**
 * What arrives on screen always arrives: a stalled rise is set arrived, and the
 * mount-time `entering` animations that stalled in the E2E only ever grow fewer.
 */
import React from 'react';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import Animated, { withTiming } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { useArrival, ARRIVAL_GRACE_MS, ARRIVED } from '../useArrival';
import { e2eTrace } from '@/src/utils/e2eTrace';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: false }));

function Held({ redraw }: { redraw?: number }) {
  const arrival = useArrival({ duration: 300, name: 'held' });
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

  it('that lands is left alone', () => {
    (e2eTrace as jest.Mock).mockClear();
    const r = render(<Held redraw={0} />);
    React.act(() => { jest.advanceTimersByTime(300 + ARRIVAL_GRACE_MS); });
    r.rerender(<Held redraw={1} />);
    expect(opacityOf(r)).toBe(1);
    expect(e2eTrace).not.toHaveBeenCalled();
  });
});

describe('mount-time entering animations', () => {
  /** Each can strand what it holds at opacity 0; they move to useArrival feature by feature. */
  // Exact: one converted is MOST lowered here, so the slack cannot let another back in.
  const MOST = 91;
  it(`are exactly ${MOST}, and only fewer from here`, () => {
    let count = 0;
    for (const p of universe('appCode', { ext: ['.tsx'] })) count += (readCode(p).match(/\bentering=\{/g) ?? []).length;
    expect(count).toBe(MOST);
  });
});
