/**
 * The load house (e2e/load/seed.sql) spreads its rows over its members. A LATERAL subquery that
 * names nothing outside it is run once, not once per row, so a member drawn at random inside one
 * is drawn once: every row it lays goes to that one member. Each draw is made in a subquery's own
 * list instead, where it is made per row.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SEED = readFileSync(join(__dirname, '..', 'load', 'seed.sql'), 'utf8').replace(/--[^\n]*/g, '');

/** Each LATERAL's own body, to its closing parenthesis. */
const laterals = (sql: string) => [...sql.matchAll(/LATERAL\s*/g)].map((m) => {
  const from = (m.index ?? 0) + m[0].length;
  let depth = 0;
  for (let i = from; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')' && --depth === 0) return sql.slice(from, i + 1);
  }
  return sql.slice(from);
});

describe('the load seed', () => {
  it('draws no member at random inside a LATERAL, where the draw is made once for every row', () => {
    const found = laterals(SEED);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((body) => /random\s*\(/i.test(body))).toEqual([]);
  });

  it('finds the fault it guards against', () => {
    expect(laterals('FROM generate_series(1, 9) k, LATERAL (SELECT 1 + floor(random() * 9)::int AS t) x').filter((b) => /random\s*\(/i.test(b)))
      .toHaveLength(1);
  });
});
