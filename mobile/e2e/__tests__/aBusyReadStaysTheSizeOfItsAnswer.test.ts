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
const { FLOOR, BOUND, grows, indexesOf, readOf, rowsAtSizes, scansOf, shapeFaults } = require('../load/plan-shape.cjs');

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

  it('says no to a read held to an index whose plans read by another way, a bitmap\'s index found under its heap scan', () => {
    const bitmap = { Plan: { 'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'lists', 'Actual Rows': 3, 'Actual Loops': 1,
      Plans: [{ 'Node Type': 'Bitmap Index Scan', 'Index Name': 'lists_short_grams', 'Actual Rows': 3, 'Actual Loops': 1 }] } };
    expect([...indexesOf(bitmap.Plan)]).toEqual(['lists_short_grams']);
    expect(shapeFaults([bitmap], BOUND, 'lists_short_grams')).toEqual([]);
    const walked = [plan(scan('Index Scan', 'lists', 900, { 'Index Name': 'idx_lists_created_at_id_desc' }))];
    expect(shapeFaults(walked, BOUND, 'lists_short_grams')).toEqual(['does not read by its index, lists_short_grams']);
    expect(shapeFaults(walked)).toEqual([]);
  });

  it('holds a read to every index of its list: the calendar reads a last viewing by its day and a film seen again by its month', () => {
    const byDay = plan(scan('Index Scan', 'logs', 1800, { 'Index Name': 'idx_logs_user_watched_id' }));
    const byMonth = { Plan: { 'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'logs', 'Actual Rows': 300, 'Actual Loops': 1,
      Plans: [{ 'Node Type': 'Bitmap Index Scan', 'Index Name': 'logs_seen_again_by_month', 'Actual Rows': 300, 'Actual Loops': 1 }] } };
    const both = ['idx_logs_user_watched_id', 'logs_seen_again_by_month'];
    expect(shapeFaults([byDay, byMonth], 5000, both)).toEqual([]);
    // The films seen again read through the member's whole record: the month's index is not read.
    const whole = plan(scan('Index Scan', 'logs', 10000, { 'Index Name': 'idx_logs_user_id_created_at' }));
    expect(shapeFaults([byDay, whole], 20000, both)).toEqual(['does not read by its index, logs_seen_again_by_month']);
    expect(shapeFaults([whole], 20000, both)).toEqual([
      'does not read by its index, idx_logs_user_watched_id', 'does not read by its index, logs_seen_again_by_month']);
  });

  it('says yes to a walk its limit stopped at once, and no to one that threw rows away past the floor or fed a sort', () => {
    const walk = (removed: number) => scan('Seq Scan', 'profiles', 1001, { 'Rows Removed by Filter': removed });
    // A letter every member holds: the walk meets its 1,001 at once (search_members' gathering).
    expect(shapeFaults([{ Plan: { 'Node Type': 'Limit', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [walk(0)] } }])).toEqual([]);
    // Through a Gather, its workers stop with the limit.
    const gathered = { 'Node Type': 'Gather', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [scan('Seq Scan', 'profiles', 334, { 'Actual Loops': 3, 'Rows Removed by Filter': 200 })] };
    expect(shapeFaults([{ Plan: { 'Node Type': 'Limit', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [gathered] } }])).toEqual([]);
    // One that threw away more than the floor walked the house to find its page.
    expect(shapeFaults([{ Plan: { 'Node Type': 'Limit', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [walk(FLOOR + 1)] } }]))
      .toEqual([`reads profiles whole (a sequential scan of ${1001 + FLOOR + 1} rows): it grows with the house`]);
    // A sort under the limit reads every row before the first is kept; so does a scan with no limit.
    const sorted = { 'Node Type': 'Sort', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [walk(0)] };
    expect(shapeFaults([{ Plan: { 'Node Type': 'Limit', 'Actual Rows': 1001, 'Actual Loops': 1, Plans: [sorted] } }]))
      .toEqual(['reads profiles whole (a sequential scan of 1001 rows): it grows with the house']);
    expect(shapeFaults([{ Plan: walk(0) }])).toEqual(['reads profiles whole (a sequential scan of 1001 rows): it grows with the house']);
  });

  it('counts what a bitmap gathered by its index, however few rows its heap read under a limit', () => {
    // One letter every member's handle holds: 40,952 gathered from the short pieces' index, 1,001 read.
    const gathered = (rows: number) => ({ 'Node Type': 'Bitmap Index Scan', 'Index Name': 'profiles_short_grams', 'Actual Rows': rows, 'Actual Loops': 1 });
    const heap = { ...scan('Bitmap Heap Scan', 'profiles', 1001), Plans: [gathered(40952)] };
    expect(scansOf(plan(heap).Plan).map((s: { read: number }) => s.read)).toEqual([40952]);
    expect(shapeFaults([plan(heap)])).toEqual([`reads 40952 rows of tables that grow with the house, past its bound of ${BOUND}`]);
    // Under an AND, each index scan's gathering counts; a bitmap that gathered no more than it read counts its read.
    const and = { ...scan('Bitmap Heap Scan', 'logs', 30), Plans: [{ 'Node Type': 'BitmapAnd', 'Actual Rows': 0, 'Actual Loops': 1, Plans: [gathered(500), gathered(700)] }] };
    expect(scansOf(plan(and).Plan).map((s: { read: number }) => s.read)).toEqual([1200]);
    expect(scansOf(plan({ ...scan('Bitmap Heap Scan', 'lists', 9, { 'Rows Removed by Index Recheck': 3 }), Plans: [gathered(4)] }).Plan)
      .map((s: { read: number }) => s.read)).toEqual([12]);
  });
});
