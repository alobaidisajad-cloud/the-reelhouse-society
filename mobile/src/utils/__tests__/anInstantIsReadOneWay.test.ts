/**
 * anInstantIsReadOneWay.test.ts — every form of instant the house writes is read as
 * the instant it names (src/utils/instant.ts). It runs on Hermes too
 * (scripts/hermes-suites.cjs), where a form read differently would show.
 */
import * as fc from 'fast-check';
import { instantOf } from '../instant';

const TEN_UTC = Date.UTC(2026, 10, 6, 10, 0, 0);

describe('instantOf', () => {
  it('reads the house\'s own form: six places after the second, the offset in full', () => {
    expect(instantOf('2026-11-06T10:00:00.123456+00:00')).toBe(TEN_UTC + 123);
  });

  it('cuts the places a Date cannot hold, and never rounds them up', () => {
    expect(instantOf('2026-11-06T10:00:00.123999Z')).toBe(TEN_UTC + 123);
    expect(instantOf('2026-11-06T10:00:00.1Z')).toBe(TEN_UTC + 100);
    expect(instantOf('2026-11-06T10:00:00.12Z')).toBe(TEN_UTC + 120);
  });

  it('reads an offset of hours alone, of four figures, or with its colon, and a space for the T', () => {
    expect(instantOf('2026-11-06 10:00:00.123+00')).toBe(TEN_UTC + 123);
    expect(instantOf('2026-11-06T15:30:00+0530')).toBe(TEN_UTC);
    expect(instantOf('2026-11-06T15:30:00+05:30')).toBe(TEN_UTC);
    expect(instantOf('2026-11-06T05:00:00-05')).toBe(TEN_UTC);
    expect(instantOf('2026-11-06t10:00:00z')).toBe(TEN_UTC);
  });

  it('reads an answer\'s HTTP Date header, the form toUTCString writes', () => {
    expect(instantOf('Fri, 06 Nov 2026 10:00:00 GMT')).toBe(TEN_UTC);
  });

  it('reads a calendar date as its midnight in UTC, and a time with no offset as the phone\'s own', () => {
    expect(instantOf('2026-11-06')).toBe(Date.UTC(2026, 10, 6));
    expect(instantOf('2026-11-06T10:00:00')).toBe(new Date(2026, 10, 6, 10, 0, 0).getTime());
    expect(instantOf('2026-11-06T10:00')).toBe(new Date(2026, 10, 6, 10, 0).getTime());
  });

  it('reads past the spaces around it', () => {
    expect(instantOf('  2026-11-06T10:00:00Z\n')).toBe(TEN_UTC);
  });

  it('names no instant for nothing, or for words', () => {
    for (const text of [null, undefined, '', '   ', 'soon', '2026-13-45T99:00:00Z', 'not a date at all']) {
      expect(`${JSON.stringify(text)} → ${instantOf(text)}`).toBe(`${JSON.stringify(text)} → NaN`);
    }
  });

  it('reads back every instant as toISOString and toUTCString write it', () => {
    fc.assert(fc.property(fc.integer({ min: Date.UTC(1900, 0, 1), max: Date.UTC(2200, 0, 1) }), (ms) => {
      const at = new Date(ms);
      return instantOf(at.toISOString()) === ms && instantOf(at.toUTCString()) === ms - (((ms % 1000) + 1000) % 1000);
    }));
  });

  it('reads the house\'s form at every instant, whatever its places and offset', () => {
    const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');
    fc.assert(fc.property(
      fc.integer({ min: Date.UTC(1970, 0, 1), max: Date.UTC(2100, 0, 1) }),
      fc.integer({ min: 0, max: 999 }),
      fc.integer({ min: -12, max: 14 }),
      (seconds, micros, hours) => {
        const at = new Date(Math.floor(seconds / 1000) * 1000 + hours * 3_600_000);
        const wall = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
        const text = `${wall}.${pad(micros, 6)}${hours < 0 ? '-' : '+'}${pad(hours)}:00`;
        return instantOf(text) === Math.floor(seconds / 1000) * 1000 + Math.floor(micros / 1000);
      },
    ));
  });
});
