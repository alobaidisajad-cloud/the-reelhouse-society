/**
 * One picture per address, shared — and let go.
 *
 * The room's bloom and the copy a photograph's veil carries must arrive in the
 * same commit, or the hem shows a line while one has come and the other has
 * not: so they share one load. And a decoded backdrop is megabytes, so the
 * last one to stop drawing it must drop it.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { Skia } from '@shopify/react-native-skia';
import { heldCount, useSharedImage } from '../useSharedImage';

const seen: (object | null)[] = [];
function Probe({ uri }: { uri: string | null }) {
  seen.push(useSharedImage(uri));
  return null;
}

describe('useSharedImage', () => {
  const fromURI = jest.fn();
  beforeEach(() => {
    seen.length = 0;
    fromURI.mockReset();
    (Skia as unknown as { Data: { fromURI: jest.Mock } }).Data.fromURI = fromURI;
    (Skia as unknown as { Image: { MakeImageFromEncoded: (d: unknown) => unknown } }).Image.MakeImageFromEncoded = (d) => ({ decoded: d });
  });

  it('loads an address once for every drawing of it, and hands each the same picture', async () => {
    fromURI.mockResolvedValue('bytes');
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<><Probe uri="https://img/a.jpg" /><Probe uri="https://img/a.jpg" /></>);
    });
    expect(fromURI).toHaveBeenCalledTimes(1);
    const last = seen.slice(-2);
    expect(last[0]).not.toBeNull();
    expect(last[0]).toBe(last[1]);
    expect(heldCount()).toBe(1);
    await act(async () => { r.unmount(); });
    expect(heldCount()).toBe(0);
  });

  it('holds nothing for no address, and survives a picture that will not load', async () => {
    fromURI.mockRejectedValue(new Error('404'));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<><Probe uri={null} /><Probe uri="https://img/missing.jpg" /></>); });
    expect(seen.every((x) => x === null)).toBe(true);
    await act(async () => { r.unmount(); });
    expect(heldCount()).toBe(0);
  });
});
