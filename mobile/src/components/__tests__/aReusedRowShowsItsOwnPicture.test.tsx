/**
 * A reused row shows its own picture, never the last row's (review round 13).
 *
 * A list reuses its rows as they scroll (FlashList). RemoteImage kept one native picture for any
 * address and named it nothing, so expo-image went on drawing the last row's poster, or the last
 * member's face, under the new row's title until the new picture had come: on a slow network a
 * person's filmography, the log's search, the notices and a film's rails showed another film's
 * poster above a title. A picture is now named by its address (expo-image's recyclingKey) in the
 * one place every picture is drawn, so a reused row clears to its placeholder at once.
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { RemoteImage } from '../Picture';

const LOST = <Text>NO PICTURE</Text>;
type Img = { type: string; props: { recyclingKey?: string; source?: { uri?: string } }; children?: unknown[] };
const pictureOf = (r: ReturnType<typeof render>): Img => {
  const out: Img[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    const n = j as Img;
    if (n.type === 'ExpoImage') out.push(n);
    (n.children ?? []).forEach(go);
  };
  go(r.toJSON());
  expect(out).toHaveLength(1);
  const first = out[0];
  expect(first).toBeDefined();
  return first!;
};

const A = 'https://image.tmdb.org/t/p/w185/sunrise.jpg';
const B = 'https://image.tmdb.org/t/p/w185/greed.jpg';

it('a picture is named by its address, so a row given another one clears before it draws', async () => {
  const r = await render(<RemoteImage uri={A} fallback={LOST} style={{ width: 10, height: 15 }} />);
  expect(pictureOf(r).props.recyclingKey).toBe(A);
  // The same row, reused for the next film down the list.
  await r.rerender(<RemoteImage uri={B} fallback={LOST} style={{ width: 10, height: 15 }} />);
  expect(pictureOf(r).props.recyclingKey).toBe(B);
  expect(pictureOf(r).props.source?.uri).toBe(B);
});

it('a row that names its picture its own way keeps its name', async () => {
  const r = await render(<RemoteImage uri={A} recyclingKey="poster-603" fallback={LOST} />);
  expect(pictureOf(r).props.recyclingKey).toBe('poster-603');
});
