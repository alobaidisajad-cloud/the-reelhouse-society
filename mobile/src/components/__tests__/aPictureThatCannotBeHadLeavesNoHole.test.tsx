/**
 * A picture that cannot be had leaves no hole (P4.10).
 *
 * 84 of the app's 87 fetched pictures had no way to say they could not be had: a poster TMDB took
 * down, an avatar deleted, the image host unreachable left an empty box, or on iOS the sepia blur
 * that stood for "still coming", for good. Through RemoteImage, a picture with no address and one
 * that failed draw the same fallback in their box; one that failed for want of a connection is
 * tried once more when the phone is back online; one the host does not have is not asked again.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { RemoteImage, PosterMark } from '../Picture';

const LOST = <Text>NO PICTURE</Text>;
type Img = { type: string; props: { source?: { uri?: string }; cachePolicy?: string; onError?: (e: { error: string }) => void }; children?: unknown[] };
/** The pictures drawn now (expo-image's stand-in is a host element, `ExpoImage`). */
const pictureOf = (r: ReturnType<typeof render>): Img[] => {
  const out: Img[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    const n = j as Img;
    if (n.type === 'ExpoImage') out.push(n);
    (n.children ?? []).forEach(go);
  };
  go(r.toJSON());
  return out;
};
const fail = (r: ReturnType<typeof render>, why = 'The network connection was lost') =>
  act(() => { pictureOf(r).at(0)?.props.onError?.({ error: why }); });

afterEach(() => { onlineManager.setOnline(true); });

it('with no address, its box draws the fallback', async () => {
  const r = await render(<RemoteImage uri={null} fallback={LOST} style={{ width: 10, height: 15 }} />);
  expect(r.getByText('NO PICTURE')).toBeTruthy();
  expect(pictureOf(r)).toHaveLength(0);
});

it('one that could not be had draws the same fallback, and is kept in memory and on disk while it lasts', async () => {
  const r = await render(<RemoteImage uri="https://image.tmdb.org/t/p/w185/gone.jpg" fallback={LOST} />);
  expect(pictureOf(r).at(0)?.props.cachePolicy).toBe('memory-disk');
  await fail(r, 'Download marked as failed because of invalid response status code 404');
  expect(r.getByText('NO PICTURE')).toBeTruthy();
  expect(pictureOf(r)).toHaveLength(0);
});

it('failed for want of a connection: tried once more when the phone is back online, and no more', async () => {
  onlineManager.setOnline(false);
  const r = await render(<RemoteImage uri="https://image.tmdb.org/t/p/w185/a.jpg" fallback={LOST} />);
  await fail(r);
  expect(r.getByText('NO PICTURE')).toBeTruthy();

  await act(async () => { onlineManager.setOnline(true); });
  expect(pictureOf(r)).toHaveLength(1);

  // Failed again: said, and kept.
  await fail(r);
  await act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
  expect(r.getByText('NO PICTURE')).toBeTruthy();
  expect(pictureOf(r)).toHaveLength(0);
});

it('one the host does not have is not asked for again when the connection comes back', async () => {
  onlineManager.setOnline(false);
  const r = await render(<RemoteImage uri="https://image.tmdb.org/t/p/w185/b.jpg" fallback={LOST} />);
  await fail(r, 'HttpException: Not Found, status code: 404');
  await act(async () => { onlineManager.setOnline(true); });
  expect(pictureOf(r)).toHaveLength(0);
});

it('a new address in the same place (a recycled row) is tried afresh', async () => {
  const r = await render(<RemoteImage uri="https://x/1.jpg" fallback={LOST} />);
  await fail(r, '404');
  await act(async () => { r.rerender(<RemoteImage uri="https://x/2.jpg" fallback={LOST} />); });
  expect(pictureOf(r)).toHaveLength(1);
  expect(pictureOf(r).at(0)?.props.source).toEqual({ uri: 'https://x/2.jpg' });
});

it('a card that waits on its pictures is told of a failure too', async () => {
  const told = jest.fn();
  const r = await render(<RemoteImage uri="https://x/3.jpg" fallback={LOST} onError={told} />);
  await fail(r, '404');
  expect(told).toHaveBeenCalledTimes(1);
});

it('the house mark is drawn in the box it is given, unspoken', async () => {
  const r = await render(<PosterMark style={{ width: 36, height: 54 }} />);
  const mark = r.getByText('✦', { includeHiddenElements: true });
  expect(mark.props.accessibilityElementsHidden).toBe(true);
});
