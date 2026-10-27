/**
 * A Reel card keeps its time (P4.7).
 *
 * A card's "MOMENTS AGO" was worked out once, kept by a useMemo on the log's created_at, and a
 * return to the app that read back the same rows drew nothing again: a day later the card still
 * said MOMENTS AGO. It reads the shared clock now, which reads the time again on return.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { FeedItemSchema } from '@/src/schemas/feed.schema';

it('a card drawn MOMENTS AGO says a day, back in the app a day later with the same rows', async () => {
  const heard: ((next: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    heard.push(listener as (next: string) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
  const filed = Date.now();
  const item = FeedItemSchema.parse({
    id: 'l1', user_id: 'u2', username: 'tomasreyes', film_title: 'Tokyo Story', film_id: 18148,
    rating: 4, review: 'The quietest film about everything.', status: 'watched',
    created_at: new Date(filed).toISOString(),
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<ActivityCard item={item} index={0} />); });
  expect(r.getByText('MOMENTS AGO')).toBeTruthy();

  jest.spyOn(Date, 'now').mockReturnValue(filed + 26 * 3_600_000);
  await act(async () => { heard.forEach((l) => l('active')); });
  expect(r.getByText('1 DAY AGO')).toBeTruthy();
  expect(r.queryByText('MOMENTS AGO')).toBeNull();
  jest.restoreAllMocks();
});
