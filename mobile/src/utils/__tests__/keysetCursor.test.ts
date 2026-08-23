/**
 * keysetCursor.test.ts — the paging that fails silently.
 *
 * A wrong keyset does not throw. It returns rows, and some of them are rows the
 * previous page already showed, or rows nobody ever sees. There is no error to
 * notice, so the arithmetic has to be pinned here rather than found in use.
 */
import { parseCursor, buildCursor, pgLiteral, keysetFilter, sortAxis } from '../keysetCursor';

describe('a cursor survives the round trip', () => {
  it('splits on the LAST separator, so a title may contain one', () => {
    // `Face/Off`, `8½ | Otto e mezzo`, `Kill Bill | Vol. 1` — splitting on the
    // FIRST `|` truncates the title and pages from a row that does not exist,
    // which lands the member mid-alphabet with no error anywhere.
    expect(parseCursor('Kill Bill | Vol. 1|4821')).toEqual({ primary: 'Kill Bill | Vol. 1', id: '4821' });
    expect(parseCursor('Alien|17')).toEqual({ primary: 'Alien', id: '17' });
  });

  it('round-trips whatever it built', () => {
    for (const title of ['Alien', 'Kill Bill | Vol. 1', '2001: A Space Odyssey', '', 'M']) {
      expect(parseCursor(buildCursor(title, 42))).toEqual({ primary: title, id: '42' });
    }
  });

  it('refuses a cursor it cannot use rather than paging from nowhere', () => {
    // Each of these must fall back to the FIRST page. Returning a half-parsed
    // cursor would filter on an empty id and quietly return nothing at all.
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('no-separator')).toBeNull();
    expect(parseCursor('title|')).toBeNull();
  });

  it('keeps an empty primary, which is a real value', () => {
    // A row with no title is not a broken cursor — `''` sorts first, and the
    // page after it is a page that exists.
    expect(parseCursor('|99')).toEqual({ primary: '', id: '99' });
  });
});

describe('a value cannot escape the filter it sits in', () => {
  it('doubles an embedded quote, as PostgREST expects', () => {
    // `2001: A Space Odyssey "Director's Cut"` is not hypothetical, and an
    // unescaped `"` ends the value early — the rest is then parsed as filter
    // syntax, which is how a title becomes a query.
    expect(pgLiteral('A "Cut"')).toBe('"A ""Cut"""');
  });

  it('leaves a bare integer bare', () => {
    expect(pgLiteral('4821')).toBe('4821');
  });

  it('quotes anything that is not purely digits', () => {
    expect(pgLiteral('4821a')).toBe('"4821a"');
    expect(pgLiteral('a3f9-uuid')).toBe('"a3f9-uuid"');
    expect(pgLiteral('')).toBe('""');
    // A comma or a paren inside an unquoted value would split the `.or()`.
    expect(pgLiteral('Alien, Aliens')).toBe('"Alien, Aliens"');
    expect(pgLiteral('Léon (1994)')).toBe('"Léon (1994)"');
  });
});

describe('the predicate asks for what comes strictly after', () => {
  const cur = { primary: 'Alien', id: '17' };

  it('ascends with > and descends with <', () => {
    expect(keysetFilter('film_title', cur, 'asc'))
      .toBe('film_title.gt."Alien",and(film_title.eq."Alien",id.gt.17)');
    expect(keysetFilter('film_title', cur, 'desc'))
      .toBe('film_title.lt."Alien",and(film_title.eq."Alien",id.lt.17)');
  });

  it('always carries the id tie-breaker', () => {
    // Two films CAN share a title and two rows CAN share a timestamp. Without
    // the second clause their order is undefined between queries, so a row
    // appears on both pages or on neither.
    for (const dir of ['asc', 'desc'] as const) {
      expect(keysetFilter('created_at', cur, dir)).toContain('id.');
      expect(keysetFilter('created_at', cur, dir)).toContain('and(');
    }
  });

  it('is null for no cursor, so the caller takes the first page', () => {
    expect(keysetFilter('film_title', null, 'asc')).toBeNull();
  });

  it('never leaves a raw quote in the filter it emits', () => {
    const f = keysetFilter('film_title', { primary: 'A "Cut"', id: '17' }, 'asc')!;
    // Every quote in the output is either a delimiter or one of a doubled pair.
    expect(f).toBe('film_title.gt."A ""Cut""",and(film_title.eq."A ""Cut""",id.gt.17)');
  });
});

describe('one axis decides the order, the filter and the next cursor', () => {
  it('maps each sort to its column and direction', () => {
    expect(sortAxis('default', 'film_title')).toEqual({ column: 'created_at', direction: 'desc' });
    expect(sortAxis('az', 'film_title')).toEqual({ column: 'film_title', direction: 'asc' });
    expect(sortAxis('za', 'film_title')).toEqual({ column: 'film_title', direction: 'desc' });
  });

  it('takes the title column it is given, because the tables disagree', () => {
    // `lists` names it `title`; `watchlists` and `physical_archive` name it
    // `film_title`. Hard-coding either one silently orders by nothing on the
    // other two — PostgREST 400s on an unknown column, but only at run time.
    expect(sortAxis('az', 'title').column).toBe('title');
    expect(sortAxis('az', 'film_title').column).toBe('film_title');
  });

  it('falls back to newest-first for anything it does not know', () => {
    // An old persisted filter, a deep link, a typo in a caller.
    for (const bad of [undefined, null, '', 'oldest', 'RANDOM']) {
      expect(sortAxis(bad, 'film_title')).toEqual({ column: 'created_at', direction: 'desc' });
    }
  });

  it('never returns an axis a query cannot order by', () => {
    for (const s of ['default', 'az', 'za', 'nonsense'] as const) {
      const a = sortAxis(s, 'film_title');
      expect(a.column).toBeTruthy();
      expect(['asc', 'desc']).toContain(a.direction);
    }
  });
});

describe('paging a whole shelf never repeats or skips a row', () => {
  /**
   * The property the whole file exists for, checked against a real dataset
   * rather than by reading the predicate.
   *
   * Simulates the server: order the rows on the axis, apply the keyset
   * predicate, take a page, hand back a cursor, repeat. If the predicate and
   * the cursor disagree about which column they mean, this loses rows.
   */
  const rows = [
    { id: '1', film_title: 'Alien', created_at: '2026-03-01' },
    { id: '2', film_title: 'Alien', created_at: '2026-03-02' },   // duplicate title
    { id: '3', film_title: 'Blade Runner', created_at: '2026-03-02' }, // duplicate date
    { id: '4', film_title: 'Chinatown', created_at: '2026-03-02' },
    { id: '5', film_title: 'Dune', created_at: '2026-03-05' },
    { id: '6', film_title: 'Alien', created_at: '2026-03-06' },   // triplicate title
    { id: '7', film_title: 'Eraserhead', created_at: '2026-03-07' },
  ];

  function page(sort: 'default' | 'az' | 'za', size: number) {
    const axis = sortAxis(sort, 'film_title');
    const asc = axis.direction === 'asc';
    const key = (r: typeof rows[0]) => [String((r as any)[axis.column]), r.id] as const;
    const cmp = (a: typeof rows[0], b: typeof rows[0]) => {
      const [ap, ai] = key(a); const [bp, bi] = key(b);
      const d = ap < bp ? -1 : ap > bp ? 1 : (Number(ai) - Number(bi));
      return asc ? d : -d;
    };
    const ordered = [...rows].sort(cmp);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const parsed = parseCursor(cursor);
      const after = parsed
        ? ordered.filter((r) => {
            const [p, i] = key(r);
            return asc
              ? p > parsed.primary || (p === parsed.primary && Number(i) > Number(parsed.id))
              : p < parsed.primary || (p === parsed.primary && Number(i) < Number(parsed.id));
          })
        : ordered;
      const batch = after.slice(0, size);
      if (batch.length === 0) break;
      seen.push(...batch.map((r) => r.id));
      const last = batch[batch.length - 1];
      cursor = after.length > size ? buildCursor((last as any)[axis.column], last.id) : null;
      if (!cursor) break;
    }
    return seen;
  }

  it.each([
    ['default' as const, 1], ['default' as const, 2], ['default' as const, 3],
    ['az' as const, 1], ['az' as const, 2], ['az' as const, 3],
    ['za' as const, 1], ['za' as const, 2], ['za' as const, 3],
  ])('%s at %i per page returns every row exactly once', (sort, size) => {
    const seen = page(sort, size);
    expect(seen.length).toBe(rows.length);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('orders by the axis, not by insertion', () => {
    expect(page('az', 3).slice(0, 3)).toEqual(['1', '2', '6']);   // three Aliens, by id
    expect(page('default', 3)[0]).toBe('7');                       // newest first
  });
});
