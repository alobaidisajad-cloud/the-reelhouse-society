/**
 * theToastHasOneHome.test.tsx — many hosts, one toast, drawn on top.
 * ─────────────────────────────────────────────────────────────────────────────
 * The overlay used to own its toast, so four modal routes that mounted their
 * own copy drew every toast twice and spoke it twice — and the root copy drew it
 * behind any sheet on iOS. toastBus now owns the toast and chooses ONE host.
 * These drive real hosts the way the app arranges them: the root, screens with
 * a navigation that gains and loses focus, and sheets opening and closing.
 */
import React from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { render, act, within } from '@testing-library/react-native';

import { ToastHost, toastScreenLayout } from '../ToastHost';
import reelToast from '@/src/utils/reelToast';
import { TOAST_EXIT_MS, TOAST_WAITING_CAP, toastDuration } from '@/src/utils/toastBus';

type Nav = {
  focused: boolean;
  isFocused(): boolean;
  addListener(type: 'focus' | 'blur', cb: () => void): () => void;
  setFocused(f: boolean): void;
};

const makeNav = (focused: boolean): Nav => {
  const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  const nav: Nav = {
    focused,
    isFocused: () => nav.focused,
    addListener: (type, cb) => { listeners[type].add(cb); return () => { listeners[type].delete(cb); }; },
    setFocused: (f) => { nav.focused = f; (f ? listeners.focus : listeners.blur).forEach(cb => cb()); },
  };
  return nav;
};

/** A route as its Stack draws it — through the real screenLayout. */
const Screen = ({ id, nav, children }: { id: string; nav: Nav; children?: React.ReactNode }) => (
  <View testID={id}>
    {toastScreenLayout({ children: <>{children}</>, navigation: nav, options: {}, route: {}, theme: {} } as never)}
  </View>
);

const Sheet = ({ id }: { id: string }) => <View testID={id}><ToastHost /></View>;

const drawn = (r: ReturnType<typeof render>, text: string) => r.queryAllByText(text).length;
const inside = (r: ReturnType<typeof render>, id: string, text: string) =>
  within(r.getByTestId(id)).queryAllByText(text).length;

const iOS = Platform.OS;
beforeAll(() => { Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true }); });
afterAll(() => { Object.defineProperty(Platform, 'OS', { get: () => iOS, configurable: true }); });
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
});
afterEach(() => { jest.useRealTimers(); });

describe('a toast has one home', () => {
  it('drawn once and spoken once, however many hosts are mounted', async () => {
    const r = render(
      <>
        <Screen id="feed" nav={makeNav(true)} />
        <ToastHost layer="root" />
      </>,
    );
    await act(async () => { reelToast.success('Filed'); });
    expect(drawn(r, 'Filed')).toBe(1);
    expect(inside(r, 'feed', 'Filed')).toBe(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });

  it('a sheet on top draws it — not the screen beneath', async () => {
    const r = render(<><Screen id="feed" nav={makeNav(true)} /><Sheet id="report" /><ToastHost layer="root" /></>);
    await act(async () => { reelToast.success('Report filed'); });
    expect(inside(r, 'report', 'Report filed')).toBe(1);
    expect(drawn(r, 'Report filed')).toBe(1);
  });

  it('the most recently opened sheet wins over an older one', async () => {
    const r = render(<><Sheet id="first" /><ToastHost layer="root" /></>);
    await act(async () => { r.rerender(<><Sheet id="first" /><Sheet id="second" /><ToastHost layer="root" /></>); });
    await act(async () => { reelToast.info('Shared'); });
    expect(inside(r, 'second', 'Shared')).toBe(1);
    expect(drawn(r, 'Shared')).toBe(1);
  });

  it('closing the sheet hands the SAME toast down — it neither vanishes nor starts again', async () => {
    const nav = makeNav(true);
    const r = render(<><Screen id="feed" nav={nav} /><Sheet id="report" /></>);
    await act(async () => { reelToast.success('Report filed'); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    await act(async () => { r.rerender(<><Screen id="feed" nav={nav} /></>); });
    expect(inside(r, 'feed', 'Report filed')).toBe(1);
    // On the clock it began with: gone at duration + exit, measured from the raise.
    await act(async () => { jest.advanceTimersByTime(toastDuration({}) - 1000 + TOAST_EXIT_MS); });
    expect(drawn(r, 'Report filed')).toBe(0);
    // And spoken once, not again on the handover.
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });

  it('a screen that is not focused never draws; focus moves the toast with it', async () => {
    const under = makeNav(false);
    const modal = makeNav(true);
    const r = render(<><Screen id="under" nav={under} /><Screen id="modal" nav={modal} /></>);
    await act(async () => { reelToast.info('Saved'); });
    expect(inside(r, 'modal', 'Saved')).toBe(1);
    expect(inside(r, 'under', 'Saved')).toBe(0);
    // The modal is dismissed: it blurs, the screen beneath focuses.
    await act(async () => { modal.setFocused(false); under.setFocused(true); });
    expect(inside(r, 'under', 'Saved')).toBe(1);
    expect(drawn(r, 'Saved')).toBe(1);
  });

  it('the deepest focused screen wins — a nested stack over the route holding it', async () => {
    // The nested screen mounts AFTER the route that holds it — as it does when a
    // nested stack opens — so neither registration order nor mount order can
    // choose it. Only its depth can.
    const outer = makeNav(true);
    const r = render(<Screen id="outer" nav={outer} />);
    await act(async () => {
      r.rerender(<Screen id="outer" nav={outer}><Screen id="inner" nav={makeNav(true)} /></Screen>);
    });
    await act(async () => { reelToast.info('Nested'); });
    expect(drawn(r, 'Nested')).toBe(1);
    // The inner screen's pill sits inside it; the outer one drew nothing of its own.
    expect(inside(r, 'inner', 'Nested')).toBe(1);
  });

  it('toasts wait their turn, and no more than the cap wait', async () => {
    const r = render(<ToastHost layer="root" />);
    await act(async () => {
      reelToast.info('one');
      for (let i = 0; i < TOAST_WAITING_CAP + 2; i++) reelToast.info(`waiting ${i}`);
    });
    expect(drawn(r, 'one')).toBe(1);
    expect(drawn(r, 'waiting 0')).toBe(0);
    const seen: string[] = [];
    for (let i = 0; i < TOAST_WAITING_CAP + 3; i++) {
      await act(async () => { jest.advanceTimersByTime(toastDuration({}) + TOAST_EXIT_MS); });
      const shown = r.queryAllByText(/^waiting \d$/).map(n => String(n.props.children));
      seen.push(...shown);
    }
    // The oldest two were dropped at the cap; the newest four were shown, in order.
    expect(seen).toEqual(['waiting 2', 'waiting 3', 'waiting 4', 'waiting 5']);
  });

  it('with nowhere to draw it, a toast is dropped — not held for later', async () => {
    await act(async () => { reelToast.info('Nobody home'); });
    const r = render(<ToastHost layer="root" />);
    expect(drawn(r, 'Nobody home')).toBe(0);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});
