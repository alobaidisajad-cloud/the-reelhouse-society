/**
 * readAsFar.test.ts — a list read again as far as the member had read it.
 */
import { moreMayFollow, readAsFar } from '../readAsFar';

type Row = { id: string; at: number };
const rows: Row[] = Array.from({ length: 95 }, (_, i) => ({ id: `r-${i + 1}`, at: 1000 - i }));
/** The house: rows after a cursor's row, at most `size`; `from` reads from the cursor's own row too. */
const house = (from = false) => jest.fn(async (after: number | undefined, size: number) => {
  const i = after === undefined ? 0 : rows.findIndex((r: Row) => r.at === after) + (from ? 0 : 1);
  return rows.slice(i, i + size);
});

it('reads page after page until as many rows as were held, and no further', async () => {
  const read = house();
  const got = await readAsFar(read, (r: Row) => r.at, 45, 20);
  expect(got.map((r) => r.id)).toEqual(rows.slice(0, 60).map((r) => r.id));
  expect(read).toHaveBeenCalledTimes(3);
  expect(moreMayFollow(got, 20)).toBe(true);
});

it('stops at the house’s short page: the end of the list', async () => {
  const got = await readAsFar(house(), (r: Row) => r.at, 500, 20);
  expect(got).toHaveLength(95);
  expect(moreMayFollow(got, 20)).toBe(false);
});

it('one page when no more than a page was held', async () => {
  const read = house();
  expect(await readAsFar(read, (r: Row) => r.at, 20, 20)).toHaveLength(20);
  expect(read).toHaveBeenCalledTimes(1);
});

it('holds each row once where pages meet on their boundary row, and ends when a page brings nothing new', async () => {
  const got = await readAsFar(house(true), (r: Row) => r.at, 45, 20, (r) => r.id);
  expect(got.map((r) => r.id)).toEqual(rows.slice(0, got.length).map((r) => r.id));
  expect(got.length).toBeGreaterThanOrEqual(45);
  const stuck = jest.fn(async (_after: number | undefined, _size: number) => rows.slice(0, 20));
  expect(await readAsFar(stuck, (r: Row) => r.at, 100, 20, (r) => r.id)).toHaveLength(20);
  expect(stuck).toHaveBeenCalledTimes(2);
});
