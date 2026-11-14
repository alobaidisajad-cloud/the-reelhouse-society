/**
 * A tab's choosing always lands where it rests: the chosen tab lit and wearing its dot, the one
 * left dim and without. A choosing that stalled (the iOS simulator's frames stopping, ios-launch
 * 43586955860) is set there on plain styles and drawn anew, since Reanimated lays the props it last
 * wrote over every React commit until a view unmounts.
 */
import React from 'react';
import Animated, { withTiming } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { e2eTrace } from '@/src/utils/e2eTrace';
import {
  DOT_CHOSEN, DOT_PASSED, ICON_CHOSEN, ICON_PASSED, TAB_CHOOSING_MS, useTabIconMotion,
} from '../tabIconMotion';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: false }));

const mounts = { n: 0 };
function Counted() {
  React.useEffect(() => { mounts.n += 1; }, []);
  return null;
}
function Tab({ focused }: { focused: boolean }) {
  const { iconStyle, dotStyle, key } = useTabIconMotion(focused);
  return (
    <>
      <Animated.View key={`icon-${key}`} testID="icon" style={iconStyle}><Counted /></Animated.View>
      <Animated.View key={`dot-${key}`} testID="dot" style={dotStyle} />
    </>
  );
}

describe('a tab', () => {
  beforeEach(() => { jest.useFakeTimers(); mounts.n = 0; (e2eTrace as jest.Mock).mockClear(); });
  afterEach(() => jest.useRealTimers());

  it('is drawn where it rests from its first frame, chosen or not', () => {
    const chosen = render(<Tab focused />);
    expect(chosen.getByTestId('icon').props.style).toBe(ICON_CHOSEN);
    expect(chosen.getByTestId('dot').props.style).toBe(DOT_CHOSEN);
    const passed = render(<Tab focused={false} />);
    expect(passed.getByTestId('icon').props.style).toBe(ICON_PASSED);
    expect(passed.getByTestId('dot').props.style).toBe(DOT_PASSED);
  });

  it('chosen, moves, then rests lit with its dot, the same view', () => {
    const r = render(<Tab focused={false} />);
    r.rerender(<Tab focused />);
    expect(r.getByTestId('icon').props.style).not.toBe(ICON_CHOSEN);
    React.act(() => { jest.advanceTimersByTime(TAB_CHOOSING_MS); });
    expect(r.getByTestId('icon').props.style).toBe(ICON_CHOSEN);
    expect(r.getByTestId('dot').props.style).toBe(DOT_CHOSEN);
    expect(mounts.n).toBe(1);
    expect(e2eTrace).not.toHaveBeenCalled();
  });

  it('chosen while the frames stand still, is set lit with its dot, and drawn anew', () => {
    const real = (withTiming as jest.Mock).getMockImplementation();
    const r = render(<Tab focused={false} />);
    (withTiming as jest.Mock).mockImplementation(() => 0); // no choosing moves
    r.rerender(<Tab focused />);
    React.act(() => { jest.advanceTimersByTime(TAB_CHOOSING_MS); });
    (withTiming as jest.Mock).mockImplementation(real);
    expect(r.getByTestId('icon').props.style).toBe(ICON_CHOSEN);
    expect(r.getByTestId('dot').props.style).toBe(DOT_CHOSEN);
    expect(mounts.n).toBe(2);
    expect(e2eTrace).toHaveBeenCalledWith('tab.choosing.rescued', expect.objectContaining({ focused: true }));
  });
});
