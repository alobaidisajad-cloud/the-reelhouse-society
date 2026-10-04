/**
 * useLater.test.tsx — what a component means to do a moment from now happens
 * once, the latest asked for, and never after the component has gone.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { useLater } from '../useLater';

/** The hook as a component holds it, render after render. */
const held: ReturnType<typeof useLater>[] = [];
function Holder() {
  held.push(useLater());
  return null;
}
const mount = () => render(<Holder />);
const latest = () => held[held.length - 1];
/** Time passes, inside React's own synchronous act. */
const pass = (ms: number) => React.act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  held.length = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('a thing done later', () => {
  it('is done once, when its time comes', () => {
    mount();
    const run = jest.fn();
    latest().later(run, 300);
    pass(299);
    expect(run).not.toHaveBeenCalled();
    pass(1);
    expect(run).toHaveBeenCalledTimes(1);
    pass(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asked for again, does the latest only', () => {
    mount();
    const first = jest.fn();
    const second = jest.fn();
    latest().later(first, 300);
    latest().later(second, 300);
    pass(300);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is not done once the component has gone, and leaves no timer behind', () => {
    const r = mount();
    const set = jest.spyOn(globalThis, 'setTimeout');
    const run = jest.fn();
    latest().later(run, 250);
    const ours = set.mock.results[set.mock.results.length - 1].value;
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    r.unmount();
    // (Unmounting starts React's own timers, so it is this one that is looked for.)
    expect(clear).toHaveBeenCalledWith(ours);
    pass(250);
    expect(run).not.toHaveBeenCalled();
  });

  it('is not done once cancelled', () => {
    mount();
    const before = jest.getTimerCount();
    const run = jest.fn();
    latest().later(run, 500);
    latest().cancel();
    expect(jest.getTimerCount()).toBe(before);
    pass(500);
    expect(run).not.toHaveBeenCalled();
  });

  it('hands the same two functions to every render, so they can sit in a dependency list', () => {
    const r = render(<Holder />);
    r.rerender(<Holder />);
    expect(held.length).toBeGreaterThan(1);
    expect(held[held.length - 1].later).toBe(held[0].later);
    expect(held[held.length - 1].cancel).toBe(held[0].cancel);
    expect(held[held.length - 1]).toBe(held[0]);
  });
});
