/**
 * everyRuleIsTrue.test.ts — the house rules are claims, and claims can rot.
 * ─────────────────────────────────────────────────────────────────────────────
 * A rules page tells a member what the house will do. A clause the code does not
 * honour is a lie printed in the one place that must not contain any — and it
 * rots silently, because nothing about changing a policy makes anybody open a
 * page of prose.
 *
 * One had already rotted. Clause V read "Five members report a filing and the
 * house reads it", and there is no five: no threshold, no trigger, no counter
 * that acts. Reports raise a filing up a docket ordered by how many it carries,
 * and a person reads it. A member could have counted on that number for as long
 * as the page existed.
 *
 * So each clause that CAN be checked is pinned here to the schema object that
 * makes it true. If a policy is renamed or a constraint dropped, this fails and
 * names the sentence that has stopped being honest.
 *
 * Two clauses are deliberately unpinned: conduct, and an intention the veil
 * cannot read. They are named below so their absence is a decision.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CLAUSES } from '../paper/PaperMore';

const SCHEMA = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8');

/** The clause, and the thing in the database that makes it true. */
const PINNED: Record<string, { says: RegExp; provenBy: RegExp; what: string }> = {
  III: {
    says: /wire carries its source/i,
    provenBy: /CONSTRAINT wire_source CHECK/,
    what: 'a wire without a source cannot be written, not merely refused by a screen',
  },
  IV: {
    says: /One member, one name/i,
    provenBy: /profiles_username_lower_unique/,
    what: 'one handle, case-insensitively, across the whole house',
  },
  V: {
    says: /A report is not a verdict/i,
    // The docket ORDERS by how many reports a filing carries. That is the whole
    // mechanism, and it is what the clause now describes.
    provenBy: /report_count DESC/,
    what: 'reports order a docket a person reads; nothing acts on a count',
  },
  VI: {
    says: /finished or not/i,
    /**
     * "finished or not" is the half of this clause a database can hold, and it
     * arrived the day an unfinished essay stopped living only on the member's
     * phone. `member_drafts` is owner-only at the row level — this pin is what
     * stops the table ever being opened up without the sentence changing with it.
     *
     * The pin does NOT cover the second sentence. "What you file is the house's
     * and is" is a statement about what FILING MEANS, and no policy expresses
     * that. It is also the half nobody can accidentally break.
     */
    provenBy: /POLICY md_select ON public\.member_drafts[\s\S]{0,200}?user_id = auth\.uid\(\)/,
    what: 'an unfinished essay is readable by its writer and by nobody else',
  },
  VII: {
    says: /ballot is secret until it closes/i,
    provenBy: /POLICY votes_read[\s\S]{0,200}?user_id = auth\.uid\(\)/,
    what: 'a member may read their own vote and no other',
  },
  VIII: {
    says: /Nothing filed is destroyed/i,
    provenBy: /TRIGGER no_hard_delete BEFORE DELETE ON public\.dispatch_posts/,
    what: 'a filing cannot be hard-deleted',
  },
  IX: {
    says: /long forms/i,
    provenBy: /POLICY posts_tier[\s\S]{0,300}?has_tier_at_least\(2\)/,
    what: 'the tier gate is a server policy, not a locked button',
  },
};

/** Named so their absence from PINNED is a decision rather than an oversight. */
const NOT_MACHINE_ENFORCEABLE: Record<string, string> = {
  I: 'conduct — no schema can hold a member to arguing with the film',
  II: 'the house covers a spoiler either way; the clause asks for the INTENTION, which nothing can check',
};

const byNumeral = new Map(CLAUSES);

describe('the schema this test reads is the real one', () => {
  it('is the live schema, not an empty file', () => {
    // Vacuous-guard insurance: every assertion below is a regex against this
    // text, and an unreadable file would pass none of them for the wrong reason
    // — or, if the assertions were inverted, all of them.
    expect(SCHEMA.length).toBeGreaterThan(100_000);
    expect(SCHEMA).toContain('dispatch_posts');
    expect(SCHEMA).toContain('CREATE POLICY');
  });
});

describe('every clause that can be checked is', () => {
  it('accounts for all of them — none is silently unexamined', () => {
    const accounted = new Set([...Object.keys(PINNED), ...Object.keys(NOT_MACHINE_ENFORCEABLE)]);
    const missing = CLAUSES.map(([n]) => n).filter((n) => !accounted.has(n));
    expect(missing).toEqual([]);
    // And nothing is listed that is no longer a clause.
    const stale = [...accounted].filter((n) => !byNumeral.has(n));
    expect(stale).toEqual([]);
  });

  it.each(Object.entries(PINNED))('clause %s is still what it says it is', (numeral, pin) => {
    const text = byNumeral.get(numeral);
    expect(`${numeral} exists: ${text !== undefined}`).toMatch(/true$/);
    // The clause still SAYS what this pin was written for…
    expect(`${numeral} says the right thing: ${pin.says.test(text as string)}`).toMatch(/true$/);
    // …and the database still DOES it.
    expect(`${numeral} — ${pin.what}: ${pin.provenBy.test(SCHEMA)}`).toMatch(/true$/);
  });

  it('and the clause that was false is gone', () => {
    // The exact wording that shipped, kept so it cannot come back by hand.
    const all = CLAUSES.map(([, t]) => t).join(' ');
    expect(all).not.toMatch(/Five members report/i);
    expect(all).not.toMatch(/Five is not a verdict/i);
    // Nor any other bare count of reports, which is the shape of the mistake.
    expect(all).not.toMatch(/\b(three|four|five|six|seven)\s+members\s+report/i);
  });

  it('the standfirst counts nothing', () => {
    // It said "Six" while there were six. A number in prose beside a list is a
    // second copy of the list's length, and the copy is what goes stale.
    const src = readFileSync(join(__dirname, '..', 'paper', 'PaperMore.tsx'), 'utf8');
    const stand = /rulesStand[\s\S]{0,200}?>([\s\S]*?)<\/Text>/.exec(src);
    expect(stand).not.toBeNull();
    expect(stand![1]).not.toMatch(/\b(five|six|seven|eight|nine|ten)\b/i);
  });

  it('the pins can fail', () => {
    // Proving the instrument: a policy that does not exist must not match.
    expect(/CONSTRAINT wire_source CHECK/.test(SCHEMA)).toBe(true);
    expect(/CONSTRAINT nothing_like_this CHECK/.test(SCHEMA)).toBe(false);
  });
});

/**
 * ── THE CLAUSE WAS FIXED IN ONE PLACE AND WAS FALSE IN THREE ─────────────────
 * The first version of this file checked `CLAUSES`, and `CLAUSES` only. It
 * proved the rules PAGE honest and said nothing about the rest of the app, so
 * the same struck sentence went on standing in two other files:
 *
 *   PaperDesk's own `ReportSheet` — sixty lines no screen mounted, whose foot
 *   read "Five members report a filing and the house reads it". It had survived
 *   the dead-export sweep because another component is also called ReportSheet.
 *
 *   PaperCase's docstring — "Five reports send a filing here."
 *
 * And the sweep that found those found a third claim nobody had questioned, on
 * a sheet the app really does ship, from three different screens: "The Tribunal
 * will review within 24 hours." Nothing in this app makes that true — no timer,
 * no deadline, no job that escalates an old report. The only "24 hours" in the
 * whole schema is a daily write limit.
 *
 * A rule fixed in the place you were looking is not a rule fixed. So this reads
 * every surface the app ships and fails on the CLASS: a bare count of reports,
 * and a promise about how soon the house will act.
 */
describe('no surface repeats a claim the house cannot keep', () => {
  const APP = [join(__dirname, '..', '..', '..'), join(__dirname, '..', '..', '..', '..', 'app')];

  /** A docstring quoting a struck sentence is a record, not a claim. */
  const stripComments = (s: string): string => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const collect = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '__tests__', 'mockups', 'android', 'ios', '.expo'].includes(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) collect(full, out);
      else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(full);
    }
    return out;
  };

  const FILES = APP.flatMap((d) => collect(d));

  it('reads the app at all, so an empty sweep cannot pass for a clean one', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.some((f) => f.endsWith('ReportSheet.tsx'))).toBe(true);
  });

  const offenders = (re: RegExp) => FILES
    .filter((f) => re.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(f.lastIndexOf('src')).replace(/\\/g, '/'));

  it('names no number of reports that makes anything happen', () => {
    // The shape of the mistake, not one wording of it.
    expect(offenders(/\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(members?\s+)?reports?\b/i))
      .toEqual([]);
    expect(offenders(/\breports?\s+(send|sends|will send)\b/i)).toEqual([]);
  });

  it('promises no deadline for reading a report', () => {
    // "within 24 hours", "in 48 hours", "within a day" — any of them.
    expect(offenders(/\bwithin\s+\d+\s*(hours?|hrs?|days?)/i)).toEqual([]);
    expect(offenders(/\breview\s+within\b/i)).toEqual([]);
    expect(offenders(/\bwithin\s+(a|one)\s+(hour|day|week)\b/i)).toEqual([]);
  });

  it('these sweeps can fail', () => {
    // The instrument, proved against text that IS in the app.
    expect(offenders(/Report to the Tribunal/i).length).toBeGreaterThan(0);
    expect(offenders(/a sentence that is nowhere in this application/i)).toEqual([]);
  });
});
