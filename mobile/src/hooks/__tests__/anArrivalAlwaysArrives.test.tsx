/**
 * What arrives on screen always arrives: a stalled rise is set arrived, and the
 * mount-time `entering` animations that stalled in the E2E only ever grow fewer.
 */
import React from 'react';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';
import Animated, { withTiming } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { useArrival, ARRIVAL_GRACE_MS } from '../useArrival';
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
  const MOST = 120;
  it(`are never more than ${MOST}, and only fewer from here`, () => {
    let count = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); continue; }
        if (/\.tsx$/.test(name)) count += (readCode(p).match(/\bentering=\{/g) ?? []).length;
      }
    };
    walk(join(MOBILE, 'src'));
    walk(join(MOBILE, 'app'));
    expect(count).toBeLessThanOrEqual(MOST);
  });
});
