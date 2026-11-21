/**
 * A busy read stays the size of its answer, not of the house (the kinds pass, kind 13: a cost never
 * measured; built for millions).
 * ─────────────────────────────────────────────────────────────────────────────
 * The load lab timed each busy read at 100,000 members against a budget. A read that walks rows in
 * proportion to the house passes that and dies at a million: round 14's house feed went from 2.8 ms
 * to 14 s on statistics alone. e2e/load/plan-shape.cjs judges each read's plan by what it reads of the
 * tables that grow with the house (probe.mjs fails the run on a fault, and on a read whose rows grew
 * between two sizes). Here its judge is fed planted plans, shaped as EXPLAIN's JSON and auto_explain's
 * are, so each rule is seen to say no.
 */
const { FLOOR, BOUND, grows, readOf, rowsAtSizes, scansOf, shapeFaults } = require('../load/plan-shape.cjs');

type Node = Record<string, unknown> & { Plans?: Node[] };
const scan = (type: string, relation: string, rows: number, extra: Partial<Record<string, number | string>> = {}): Node =>
  ({ 'Node Type': type, 'Relation Name': relation, 'Actual Rows': rows, 'Actual Loops': 1, ...extra });
const plan = (...plans: Node[]) => ({ Plan: { 'Node Type': 'Limit', 'Actual Rows': 30, 'Actual Loops': 1, Plans: plans } });

describe('the shape of a read', () => {
  it('counts the rows a scan read: kept, filtered away and rechecked away, times its loops', () => {
    const s = scansOf(plan(scan('Index Scan', 'logs', 2, { 'Rows Removed by Filter': 3, 'Actual Loops': 10 }), scan('Bitmap Heap Scan', 'lists', 4, { 'Rows Removed by Index Recheck': 6 })).Plan);
    expect(s.map((x: { relation: string; read: number }) => [x.relation, x.read])).toEqual([['logs', 50], ['lists', 10]]);
  });

  it('counts only the tables that grow with the house: the catalogue and the house\'s own rows are not', () => {
    expect(grows('logs')).toBe(true);
    expect(grows('films')).toBe(false);
    expect(readOf([plan(scan('Seq Scan', 'films', 30000), scan('Index Scan', 'logs', 40))]).grown).toBe(40);
  });

  it('says no to a growing table read whole, however few rows it keeps', () => {
    expect(shapeFaults([plan(scan('Seq Scan', 'dispatch_posts', 0, { 'Rows Removed by Filter': 4000 }))]))
      .toEqual(['reads dispatch_posts whole (a sequential scan of 4000 rows): it grows with the house']);
    expect(shapeFaults([plan(scan('Seq Scan', 'dispatch_posts', FLOOR))])).toEqual([]);
  });

  it('says no to a read past its bound, the default or its probe\'s own, over every statement a function ran', () => {
    const many = [plan(scan('Index Scan', 'notifications', BOUND)), { Plan: scan('Index Only Scan', 'interactions', 1) }];
    expect(shapeFaults(many)).toEqual([`reads ${BOUND + 1} rows of tables that grow with the house, past its bound of ${BOUND}`]);
    expect(shapeFaults(many, 30000)).toEqual([]);
  });

  it('says no to a read whose rows grew with the house between two sizes, and yes to one that stayed', () => {
    const small = { 'the feed': 1200, 'the count': 30000, 'a page': 40 };
    const large = { 'the feed': 1210, 'the count': 61000, 'a page': 40 };
    expect(rowsAtSizes(small, large)).toEqual(['the count: 30000 rows at the smaller house, 61000 at the larger']);
    // Below the floor, a read is too small to tell growth from noise.
    expect(rowsAtSizes({ x: 10 }, { x: 30 })).toEqual([]);
  });
});
