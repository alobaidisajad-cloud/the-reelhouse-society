/**
 * aGoneThingIsToldByItsWord.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A write on a record or a stack deleted meanwhile is answered P0002 with a word naming what is
 * gone; any other refusal (the owner's rule, 42501; a missing row of another kind, P0002 with
 * another word) is not that, and is told as itself.
 */
import { isGoneFromTheHouse } from '../goneFromTheHouse';

it('a P0002 naming the record is the record gone', () => {
  expect(isGoneFromTheHouse({ code: 'P0002', message: 'LOG_GONE' }, 'LOG_GONE')).toBe(true);
  expect(isGoneFromTheHouse({ code: 'P0002', message: 'STACK_GONE' }, 'STACK_GONE')).toBe(true);
});

it('a P0002 naming another thing is not the one asked of', () => {
  expect(isGoneFromTheHouse({ code: 'P0002', message: 'STACK_GONE' }, 'LOG_GONE')).toBe(false);
  expect(isGoneFromTheHouse({ code: 'P0002', message: 'No such stack of yours' }, 'STACK_GONE')).toBe(false);
});

it('asked of no word, any P0002 is a thing gone', () => {
  expect(isGoneFromTheHouse({ code: 'P0002', message: 'No such stack of yours' })).toBe(true);
});

it("the owner's rule, a lost connection or nothing at all is never a thing gone", () => {
  expect(isGoneFromTheHouse({ code: '42501', message: 'new row violates row-level security policy' }, 'LOG_GONE')).toBe(false);
  expect(isGoneFromTheHouse({ code: '42501', message: 'LOG_GONE' })).toBe(false);
  expect(isGoneFromTheHouse(new TypeError('Network request failed'))).toBe(false);
  expect(isGoneFromTheHouse(null)).toBe(false);
  expect(isGoneFromTheHouse(undefined, 'LOG_GONE')).toBe(false);
});
