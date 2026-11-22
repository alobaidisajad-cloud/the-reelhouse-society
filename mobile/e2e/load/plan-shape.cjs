/**
 * plan-shape.cjs — whether a busy read stays the same size as the house grows (built for millions).
 *
 * A timing at 100,000 members passes a read that walks rows in proportion to the house and dies at a
 * million. So each busy read's plan is judged by its shape, from the plans the database ran (EXPLAIN
 * ANALYZE, every statement inside a function through auto_explain): the rows each scan read of a
 * table that grows with the house (every table but the film catalogue and the house's own settings),
 * counted as the database counts them (the rows it kept, the rows its filter took away, the rows a
 * recheck took away, times the loops; for a bitmap, the rows its index scans gathered when more). A read
 * is size-independent when:
 *   - no sequential scan reads a growing table past FLOOR rows (a whole table read, however fast now),
 *     but one its limit stopped, having thrown away at most FLOOR rows (a walk that meets its page at
 *     once: a letter every member's name holds);
 *   - all it reads of growing tables stays within its bound: BOUND, or the probe's own `rows`, said
 *     with why (the whale's own 10,000 films grow with a member's own record, not with the house);
 *   - a read held to an index (the probe's own `index`) reads by it: the plan that keeps it the size of
 *     its answer at every size, not one the planner may leave as the house grows.
 * And measured at two sizes (rowsAtSizes), a read whose rows read grow with the house fails however
 * small it is.
 *
 * Plain CommonJS, so probe.mjs imports it and the tests require it.
 */

/** Tables that do not grow with the house: the film catalogue and the house's own rows. */
const FIXED = new Set(['films', 'house_settings', 'lobby_editions', 'lobby_withheld', 'founding_seat_counter', 'gate_metrics', 'gate_day']);

/** A sequential scan of a growing table may read this many rows (a table this small is read whole by any plan). */
const FLOOR = 1000;

/** What a busy read may read of growing tables in all, unless its probe names its own bound. */
const BOUND = 20000;

const SCANS = new Set(['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Tid Scan', 'Tid Range Scan', 'Sample Scan']);

/** Whether a relation grows with the house. */
const grows = (relation) => !!relation && !FIXED.has(relation);

/** The rows a bitmap heap scan's index scans gathered (each one's rows times its loops, under any AND or OR). */
function gatheredBy(heap) {
  let sum = 0;
  const walk = (n) => {
    if (n['Node Type'] === 'Bitmap Index Scan') sum += (n['Actual Rows'] ?? 0) * (n['Actual Loops'] ?? 1);
    for (const c of n.Plans ?? []) walk(c);
  };
  for (const c of heap.Plans ?? []) walk(c);
  return sum;
}

/**
 * Each scan of a plan tree (one statement's "Plan"), with the rows it read: kept, filtered away and
 * rechecked away, times its loops; and whether a limit stopped it (`stopped`): a scan right under a
 * Limit (through a Gather, whose workers stop with it) that threw away at most FLOOR rows. Such a walk
 * reads its limit and what it threw away, however large the table: the rows it keeps come first.
 */
function scansOf(plan) {
  const out = [];
  const walk = (n, underLimit) => {
    if (!n) return;
    if (SCANS.has(n['Node Type']) && n['Relation Name']) {
      const removed = (n['Rows Removed by Filter'] ?? 0) + (n['Rows Removed by Index Recheck'] ?? 0);
      const perLoop = (n['Actual Rows'] ?? 0) + removed;
      const loops = n['Actual Loops'] ?? 1;
      // A bitmap gathers every row its index finds before its heap reads the first, however few a limit
      // keeps: it read what its index scans gathered, when that is more.
      const read = n['Node Type'] === 'Bitmap Heap Scan' ? Math.max(perLoop * loops, gatheredBy(n)) : perLoop * loops;
      out.push({ node: n['Node Type'], relation: n['Relation Name'], index: n['Index Name'] ?? null, read,
        stopped: underLimit && removed * loops <= FLOOR });
    }
    const type = n['Node Type'];
    const passes = type === 'Limit' || ((type === 'Gather' || type === 'Gather Merge') && underLimit);
    for (const c of n.Plans ?? []) walk(c, passes);
  };
  walk(plan, false);
  return out;
}

/** Every index a plan tree read by, a bitmap's among them (its index scan names no table). */
function indexesOf(plan) {
  const out = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n['Index Name']) out.add(n['Index Name']);
    for (const c of n.Plans ?? []) walk(c);
  };
  walk(plan);
  return out;
}

/** What a read read of growing tables, over every statement's plan (each { Plan } as EXPLAIN's JSON gives it). */
function readOf(plans) {
  const scans = plans.flatMap((p) => scansOf(p.Plan ?? p));
  return { scans, grown: scans.filter((s) => grows(s.relation)).reduce((sum, s) => sum + s.read, 0) };
}

/** The faults of a read's shape, in words; [] when it stays the same size as the house grows. */
function shapeFaults(plans, bound = BOUND, index = null) {
  const { scans, grown } = readOf(plans);
  const faults = scans.filter((s) => s.node === 'Seq Scan' && grows(s.relation) && s.read > FLOOR && !s.stopped)
    .map((s) => `reads ${s.relation} whole (a sequential scan of ${s.read} rows): it grows with the house`);
  if (grown > bound) faults.push(`reads ${grown} rows of tables that grow with the house, past its bound of ${bound}`);
  if (index && !plans.some((p) => indexesOf(p.Plan ?? p).has(index))) faults.push(`does not read by its index, ${index}`);
  return faults;
}

/**
 * The reads whose rows read grew with the house between two sizes: a read is size-independent when
 * at twice the members it reads no more than `slack` times what it read (a bounded read reads the
 * same; one that walks the house reads about twice).
 */
function rowsAtSizes(small, large, slack = 1.25) {
  return Object.keys(small).filter((k) => k in large && large[k] > FLOOR && large[k] > small[k] * slack)
    .map((k) => `${k}: ${small[k]} rows at the smaller house, ${large[k]} at the larger`);
}

module.exports = { FIXED, FLOOR, BOUND, grows, scansOf, indexesOf, readOf, shapeFaults, rowsAtSizes };
