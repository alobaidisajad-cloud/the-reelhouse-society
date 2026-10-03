/**
 * cursorPagination.test.ts — property tests against the REAL cursor parser.
 *
 * The previous version described cursor behaviour with fast-check but never
 * imported anything: it round-tripped strings it built itself, so it proved
 * only that JSON.parse undoes JSON.stringify. FeedService.parseCursor is the
 * function the feed actually pages with, and it is exported.
 *
 * That parser is a trust boundary — a cursor arrives as an opaque string from
 * a previous page and is interpolated into query filters — so the properties
 * that matter are about what it REFUSES, not what it round-trips.
 */
import * as fc from 'fast-check';
import { parseCursor } from '@/src/services/FeedService';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const ISO = '2026-07-30T12:00:00.000Z';
const UUID = '3f7c1a2b-9d4e-4f60-b1c8-0a5e7d2f9b31';

describe('parseCursor — a well-formed cursor round-trips', () => {
  it('splits a date|id pair', () => {
    expect(parseCursor(`${ISO}|${UUID}`)).toEqual({ cursorDate: ISO, cursorId: UUID });
  });

  it('an absent cursor means "start from the beginning", not an error', () => {
    expect(parseCursor(undefined)).toEqual({ cursorDate: null, cursorId: null });
    expect(parseCursor('')).toEqual({ cursorDate: null, cursorId: null });
  });
});

describe('parseCursor — REFUSES anything malformed', () => {
  it('rejects a non-ISO date', () => {
    expect(parseCursor(`2026-07-30|${UUID}`).cursorDate).toBeNull();
    expect(parseCursor(`yesterday|${UUID}`).cursorDate).toBeNull();
  });

  it('rejects a non-UUID id', () => {
    expect(parseCursor(`${ISO}|123`).cursorId).toBeNull();
    expect(parseCursor(`${ISO}|' OR 1=1 --`).cursorId).toBeNull();
  });

  it('rejects each half independently — one bad part does not poison the other', () => {
    expect(parseCursor(`${ISO}|garbage`)).toEqual({ cursorDate: ISO, cursorId: null });
    expect(parseCursor(`garbage|${UUID}`)).toEqual({ cursorDate: null, cursorId: UUID });
  });

  it('tolerates a missing separator or extra segments', () => {
    expect(parseCursor(ISO)).toEqual({ cursorDate: ISO, cursorId: null });
    expect(parseCursor(`${ISO}|${UUID}|extra`)).toEqual({ cursorDate: ISO, cursorId: UUID });
  });

  it('PROPERTY: no arbitrary string can ever produce a non-null value that is not exactly what was supplied', () => {
    // The parser must be a filter, never a transformer. Anything it hands back
    // is interpolated into query filters, so it must be a verbatim substring of
    // the input — never something it constructed or coerced.
    //
    // A random string is almost never a valid timestamp or id, so the inputs
    // are built from valid parts in every spelling the parser accepts (space or
    // T, any fraction, every zone form, either case) mixed with noise — and the
    // runs that accepted something are counted, so this cannot pass on nulls.
    const two = (max: number) => fc.integer({ min: 0, max }).map((n) => String(n).padStart(2, '0'));
    const stamp = fc.tuple(
      fc.integer({ min: 1900, max: 2100 }), two(12), two(28), fc.constantFrom('T', ' '), two(23), two(59), two(59),
      fc.constantFrom('', '.1', '.123', '.123456'),
      fc.constantFrom('', 'Z', '+00:00', '-05:30', '+0530', '+05'),
    ).map(([y, mo, d, sep, h, mi, s, frac, zone]) => `${y}-${mo}-${d}${sep}${h}:${mi}:${s}${frac}${zone}`);
    const id = fc.tuple(fc.uuid(), fc.boolean()).map(([u, upper]) => (upper ? u.toUpperCase() : u));
    const cursor = fc.tuple(fc.oneof(stamp, fc.string()), fc.oneof(id, fc.string()), fc.option(fc.string()))
      .map(([date, key, extra]) => (extra === null ? `${date}|${key}` : `${date}|${key}|${extra}`));

    let datesAccepted = 0;
    let idsAccepted = 0;
    fc.assert(
      fc.property(fc.oneof(cursor, fc.string()), (raw) => {
        const { cursorDate, cursorId } = parseCursor(raw);
        if (cursorDate !== null) { datesAccepted += 1; expect(cursorDate).toBe(raw.split('|')[0]); }
        if (cursorId !== null) { idsAccepted += 1; expect(cursorId).toBe(raw.split('|')[1]); }
      }),
      { numRuns: 500 },
    );
    // About a quarter of the runs hand back each part; a property that only ever
    // saw nulls has checked nothing.
    expect(datesAccepted).toBeGreaterThan(50);
    expect(idsAccepted).toBeGreaterThan(50);
  });

  it('PROPERTY: never throws, whatever it is handed', () => {
    // A crash here would break paging entirely rather than degrading to page 1.
    fc.assert(
      fc.property(fc.string(), (raw) => { expect(() => parseCursor(raw)).not.toThrow(); }),
      { numRuns: 500 },
    );
  });

  it('PROPERTY: an injection-shaped id is never accepted', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/[';"()\-\s]/),
        (evil) => { expect(parseCursor(`${ISO}|${evil}`).cursorId).toBeNull(); },
      ),
      { numRuns: 300 },
    );
  });
});
