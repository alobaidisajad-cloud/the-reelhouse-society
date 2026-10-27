/**
 * Every kind of member writing other members read has a door to report it (P4.50).
 *
 * The house moderates in the app alone, so writing a member cannot report is writing nobody can
 * take down. Two lists are held together here:
 *   · every kind in ReportableContentType has a report door on a screen (a ReportSheet's
 *     contentType), or is listed with why it has none;
 *   · every table whose member text the house cleans (its a_clean_member_text trigger, read from
 *     the schema snapshot) is the text of a reportable kind, or is listed as reaching no other
 *     member, with its reason. A new table of member writing fails until it is one or the other.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';
import { SNAPSHOT_SQL } from '@/test-utils/schema';
import { ReportableContentType } from '@/src/types/moderation';

const ROOT = join(__dirname, '..', '..', '..');

/** Kinds with no door, and why. */
const NO_DOOR: Record<string, string> = {
  dossier: 'the old essays (dispatch_dossiers_legacy): no screen draws them; kept so old reports stay readable',
  dossier_comment: 'the old essays\' critiques (dossier_comments_legacy): no screen draws them; kept so old reports stay readable',
};

/** Each table of cleaned member text: the kind it is reported as, or why no other member reads it. */
const TABLES: Record<string, { kind: string } | { private: string }> = {
  dispatch_posts: { kind: 'dispatch_post' },
  dispatch_comments: { kind: 'dispatch_comment' },
  dispatch_dossiers_legacy: { kind: 'dossier' },
  dossier_comments_legacy: { kind: 'dossier_comment' },
  logs: { kind: 'log' },
  log_comments: { kind: 'log_comment' },
  lists: { kind: 'list' },
  list_comments: { kind: 'list_comment' },
  lounges: { kind: 'lounge' },
  lounge_messages: { kind: 'lounge_message' },
  profiles: { kind: 'profile' },
  log_private_notes: { private: 'the member\'s own notes, read by them alone' },
  physical_archive: { private: 'drawn to others as a case alone: notes are never drawn, condition spoken only as a grading word (spokenCondition)' },
  reports: { private: 'a reporter\'s words, read by the house alone' },
  mod_actions: { private: 'the house\'s own record of what it did' },
  warnings: { private: 'the house\'s words to one member' },
};

const sources = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => readFileSync(join(ROOT, f), 'utf8'))
  .join('\n');

/** The kinds a screen opens a report as: literals, and the kinds a variable door is typed with. */
const doors = new Set([
  ...[...sources.matchAll(/contentType="([a-z_]+)"/g)].map((m) => m[1]!),
  ...[...sources.matchAll(/contentType=\{[^}]*?'([a-z_]+)'\}/g)].map((m) => m[1]!),
  ...[...sources.matchAll(/type: '([a-z_]+)' \| '([a-z_]+)'; id: string; userId: string/g)].flatMap((m) => [m[1]!, m[2]!]),
]);

const cleaned = [...SNAPSHOT_SQL().matchAll(/CREATE TRIGGER a_clean_member_text [^;]*? ON public\.(\w+)/g)].map((m) => m[1]!);

describe('a shelf other members read', () => {
  it('speaks a case\'s condition only as a grading word: anything an import carried stays unspoken', () => {
    const { spokenCondition } = require('@/src/components/profile/ProfilePhysicalTab') as typeof import('@/src/components/profile/ProfilePhysicalTab');
    expect(spokenCondition(' Very Good ')).toBe('condition very good');
    expect(spokenCondition('signed, the night my father died')).toBe('');
    expect(spokenCondition(null)).toBe('');
  });
});

describe('every kind of member writing', () => {
  it('is read from both lists (the scans have not gone blind)', () => {
    expect(ReportableContentType.options.length).toBeGreaterThanOrEqual(10);
    expect(cleaned.length).toBeGreaterThanOrEqual(12);
    expect(doors.size).toBeGreaterThanOrEqual(8);
  });

  it('has a report door on a screen, or is listed with why it has none', () => {
    const without = ReportableContentType.options.filter((k) => !doors.has(k) && !(k in NO_DOOR));
    const stale = Object.keys(NO_DOOR).filter((k) => doors.has(k) || !(ReportableContentType.options as readonly string[]).includes(k));
    expect({ without, stale }).toEqual({ without: [], stale: [] });
  });

  it('every table of cleaned member text is a reportable kind, or reaches no other member, with why', () => {
    const unplaced = cleaned.filter((t) => !(t in TABLES));
    const gone = Object.keys(TABLES).filter((t) => !cleaned.includes(t));
    const unknownKinds = Object.values(TABLES).flatMap((v) => ('kind' in v && !(ReportableContentType.options as readonly string[]).includes(v.kind) ? [v.kind] : []));
    expect({ unplaced, gone, unknownKinds }).toEqual({ unplaced: [], gone: [], unknownKinds: [] });
  });
});
