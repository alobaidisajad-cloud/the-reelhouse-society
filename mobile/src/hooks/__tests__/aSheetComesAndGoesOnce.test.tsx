/**
 * aSheetComesAndGoesOnce.test.tsx — a sheet rises once, and is gone only when closed.
 *
 * Five sheets carried their own copy of this, each with the same three faults
 * (useSheetPresence says which). Driven here with the fall's own callback held,
 * so a reopening can land inside it the way a quick second tap does.
 */
import { act, renderHook } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { useSheetPresence } from '../useSheetPresence';

let falls: (() => void)[] = [];
const rises = () => (Reanimated.withTiming as jest.Mock).mock.calls.filter((c) => c[0] === 0).length;

beforeEach(() => {
  falls = [];
  (Reanimated.withTiming as jest.Mock).mockClear();
  (Reanimated.withTiming as jest.Mock).mockImplementation((v: unknown, _c?: unknown, done?: (f: boolean) => void) => {
    if (done) falls.push(() => done(true));
    return v;
  });
});
afterEach(() => {
  (Reanimated.withTiming as jest.Mock).mockImplementation((v: unknown) => v);
});

const sheet = async (props: { visible: boolean; onOpen?: () => void; onGone?: () => void }) =>
  renderHook((p: typeof props) => useSheetPresence(p), { initialProps: props });

describe('a sheet', () => {
  it('rises once per opening — the open set `isRendered` and ran itself again', async () => {
    const onOpen = jest.fn();
    const r = await sheet({ visible: false, onOpen });
    await act(async () => { r.rerender({ visible: true, onOpen }); });
    expect(r.result.current.isRendered).toBe(true);
    expect(rises()).toBe(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is gone after its fall, and only then runs what follows', async () => {
    const onGone = jest.fn();
    const r = await sheet({ visible: true, onGone });
    await act(async () => { r.rerender({ visible: false, onGone }); });
    expect(r.result.current.isRendered).toBe(true);
    expect(onGone).not.toHaveBeenCalled();
    await act(async () => { falls.forEach((f) => f()); });
    expect(r.result.current.isRendered).toBe(false);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('stays when it is opened again inside its fall', async () => {
    const onGone = jest.fn();
    const r = await sheet({ visible: true, onGone });
    await act(async () => { r.rerender({ visible: false, onGone }); });
    await act(async () => { r.rerender({ visible: true, onGone }); });
    // The first fall's end arrives after the reopening.
    await act(async () => { falls.forEach((f) => f()); });
    expect(r.result.current.isRendered).toBe(true);
    expect(onGone).not.toHaveBeenCalled();
  });

  it('never replays its rise when the window changes, and falls the new distance', async () => {
    // A rotation while a member fills the report in: the distance must be the
    // new window's, and the sheet must not rise again under their thumb.
    const r = await renderHook((p: { visible: boolean; offscreen: number }) => useSheetPresence(p), {
      initialProps: { visible: true, offscreen: 800 },
    });
    await act(async () => { r.rerender({ visible: true, offscreen: 1366 }); });
    expect(rises()).toBe(1);
    await act(async () => { r.rerender({ visible: false, offscreen: 1366 }); });
    const fall = (Reanimated.withTiming as jest.Mock).mock.calls.find((c) => typeof c[2] === 'function');
    expect(fall?.[0]).toBe(1366);
  });

  it('does not fall when it was never open', async () => {
    const onGone = jest.fn();
    await sheet({ visible: false, onGone });
    expect(falls).toHaveLength(0);
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe('no sheet unmounts itself by hand', () => {
  it('the one place a fall ends a sheet is useSheetPresence', () => {
    const { readdirSync, statSync } = jest.requireActual('fs') as typeof import('fs');
    const { join, relative } = jest.requireActual('path') as typeof import('path');
    const { readCode, MOBILE } = jest.requireActual('@/test-utils/readCode');
    const found: string[] = [];
    let read = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        read += 1;
        if (/runOnJS\(\s*setIsRendered\s*\)/.test(readCode(p))) found.push(relative(MOBILE, p));
      }
    };
    walk(join(MOBILE, 'src'));
    walk(join(MOBILE, 'app'));
    expect(read).toBeGreaterThan(300);
    expect(found).toEqual([]);
  });
});
