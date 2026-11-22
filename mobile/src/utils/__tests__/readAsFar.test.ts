/**
 * readAsFar.test.ts — a list read again as far as the member had read it.
 */
import { moreMayFollow, readAsFar, readOnAsFar } from '../readAsFar';

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

describe('readOnAsFar: a house that hands back the cursor past each read', () => {
  /** The house: rows past the cursor (an index), at most `size`, with the cursor past them while more follow. */
  const cursorHouse = () => jest.fn(async (cursor: string | undefined, size: number) => {
    const i = cursor === undefined ? 0 : Number(cursor);
    const items = rows.slice(i, i + size);
    return { items, nextCursor: i + size < rows.length ? String(i + size) : null };
  });

  it('one read of a page when no more than a page was held', async () => {
    const read = cursorHouse();
    const got = await readOnAsFar(read, 50);
    expect(got.items).toHaveLength(50);
    expect(got.nextCursor).toBe('50');
    expect(read.mock.calls).toEqual([[undefined, 50]]);
  });

  it('reads as far as was held, each read no larger than the most one read asks, and hands on the cursor past it', async () => {
    const read = cursorHouse();
    const got = await readOnAsFar(read, 70, 30);
    expect(got.items.map((r) => r.id)).toEqual(rows.slice(0, 70).map((r) => r.id));
    expect(got.nextCursor).toBe('70');
    expect(read.mock.calls).toEqual([[undefined, 30], ['30', 30], ['60', 10]]);
  });

  it('stops where the house says none follow, and at a read that brought nothing', async () => {
    const got = await readOnAsFar(cursorHouse(), 500, 40);
    expect(got.items).toHaveLength(95);
    expect(got.nextCursor).toBeNull();
    const stuck = jest.fn(async (_c: string | undefined, _size: number) => ({ items: [] as Row[], nextCursor: 'again' }));
    expect((await readOnAsFar(stuck, 100)).items).toHaveLength(0);
    expect(stuck).toHaveBeenCalledTimes(1);
  });
});
