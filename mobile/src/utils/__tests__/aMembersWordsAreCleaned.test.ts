/**
 * aMembersWordsAreCleaned.test.ts — every word a member can write is cleaned
 * where it is kept, or the reason it is not is written here.
 * ─────────────────────────────────────────────────────────────────────────────
 * The website sent what was typed and the public key writes straight to a
 * table, so production kept 36 values the app would never have stored: a
 * right-to-left override shows one thing and stores another. The database
 * cleans them now (20261003_05): a trigger named a_clean_member_text on each
 * table, its columns the arguments of public.clean_member_words.
 *
 * A new column a member can write is a place the cleaning does not reach until
 * someone remembers it. So the columns are read from production's snapshot —
 * every text and jsonb column the API roles may insert or update — and each is
 * cleaned by its table's trigger or named below with the reason it is not. A
 * reason that no longer names a writable column is stale and fails too.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SCHEMA = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8').replace(/\r/g, '');

/** Not a member's words, each for its reason. */
const NOT_WORDS: Record<string, string[]> = {
  'a handle, judged by enforce_username_policy or copied from one': [
    'profiles.username', 'dispatch_posts.author_username', 'dispatch_comments.author_username',
    'dispatch_dossiers_legacy.author_username', 'dossier_comments_legacy.username', 'log_comments.username',
    'lounge_messages.reply_to_username', 'notifications.from_username',
  ],
  'an address or an image path, opened or drawn, never read as words': [
    'logs.poster_path', 'logs.alt_poster', 'logs.editorial_header', 'logs.video_url', 'list_items.poster_path',
    'lounge_messages.film_poster', 'lounges.cover_image', 'notifications.poster_path', 'physical_archive.poster_path',
    'profiles.avatar_url', 'watchlists.poster_path', 'dispatch_posts.source_url', 'dispatch_posts.subject_image',
    'dispatch_posts.subject_backdrop', 'push_subscriptions.endpoint',
  ],
  'one of a fixed set, held by a CHECK': [
    'dispatch_posts.kind', 'dispatch_posts.subject_kind', 'dispatch_posts.ended_by', 'interactions.type', 'logs.format',
    'logs.physical_media', 'logs.status', 'lounge_members.status', 'lounge_message_reactions.reaction', 'lounge_messages.type',
    'member_drafts.kind', 'member_drafts.scope', 'mod_actions.action', 'notifications.type', 'physical_archive.formats',
    'push_tokens.platform', 'user_blocks.type',
  ],
  'a film\'s title or year, as TMDB gives it': [
    'logs.film_title', 'logs.year', 'list_items.film_title', 'lounge_messages.film_title', 'physical_archive.film_title',
    'watchlists.film_title',
  ],
  'a key, a token or a code, compared and never shown': [
    'lounges.invite_code', 'notifications.group_key', 'push_subscriptions.auth', 'push_subscriptions.p256dh',
    'push_tokens.token',
  ],
  'kept for the house, never shown to a member: the evidence is the text as it came': [
    'analytics_events.event_name', 'analytics_events.properties', 'error_logs.component', 'error_logs.error_message',
    'error_logs.error_stack', 'error_logs.error_type', 'error_logs.url', 'error_logs.user_agent',
  ],
  'written by the house\'s own functions from words already cleaned, or numbers and flags': [
    'notifications.title', 'notifications.body', 'notifications.message', 'notifications.metadata',
    'dispatch_posts.frozen_totals', 'logs.autopsy', 'lounge_messages.metadata', 'mod_actions.content_snapshot',
  ],
  'a draft, cleaned when it is filed': ['member_drafts.payload'],
};

/** Each table's text-like columns and their types. */
function columnTypes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of SCHEMA.matchAll(/CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
    for (const line of m[2].split('\n')) {
      const c = /^ {4}"?(\w+)"? (text\[\]|text|character varying(?:\(\d+\))?|jsonb)(?=[ ,]|$)/.exec(line);
      if (c) out.set(`${m[1]}.${c[1]}`, c[2]);
    }
  }
  return out;
}

/** The columns the API roles may insert or update, from the snapshot's grants. */
function writable(types: Map<string, string>): Set<string> {
  const out = new Set<string>();
  for (const m of SCHEMA.matchAll(/^GRANT (.+) ON TABLE public\.(\w+) TO (anon|authenticated);$/gm)) {
    const [, privileges, table] = m;
    for (const p of privileges.split(/,(?![^(]*\))/)) {
      const columns = /^(INSERT|UPDATE)\(([^)]+)\)$/.exec(p);
      if (columns) {
        for (const c of columns[2].split(',')) out.add(`${table}.${c.trim().replace(/"/g, '')}`);
      } else if (p === 'INSERT' || p === 'UPDATE' || p === 'ALL') {
        for (const key of types.keys()) if (key.startsWith(`${table}.`)) out.add(key);
      }
    }
  }
  return new Set([...out].filter((k) => types.has(k)));
}

type Cleaning = { table: string; updateOf: string[]; args: string[] };

/** Each a_clean_member_text trigger: its table, its UPDATE OF columns, its arguments. */
function cleanings(): Cleaning[] {
  return [...SCHEMA.matchAll(/^CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF ([\w, ]+) ON public\.(\w+) FOR EACH ROW EXECUTE FUNCTION public\.clean_member_words\(([^)]*)\);$/gm)]
    .map((m) => ({
      table: m[2],
      updateOf: m[1].split(',').map((c) => c.trim()),
      args: [...m[3].matchAll(/'([^']+)'/g)].map((a) => a[1]),
    }));
}

describe('every word a member can write is cleaned where it is kept', () => {
  const types = columnTypes();
  const open = writable(types);
  const cleaned = cleanings();
  const cleanedColumns = new Set(cleaned.flatMap((c) => c.args.map((a) => `${c.table}.${a.split('.')[0]}`)));
  const exempt = Object.values(NOT_WORDS).flat();

  it('reads the snapshot: the tables, the grants and the triggers are found', () => {
    expect(types.get('logs.review')).toBe('text');
    expect(types.get('dispatch_posts.options')).toBe('jsonb');
    expect(types.get('physical_archive.formats')).toBe('text[]');
    expect(open.has('logs.review')).toBe(true);
    expect(open.has('profiles.bio')).toBe(true);
    expect(cleaned.length).toBeGreaterThanOrEqual(16);
  });

  it('each column a member can write is cleaned, or not their words for a reason written here', () => {
    const neither = [...open].filter((c) => !cleanedColumns.has(c) && !exempt.includes(c)).sort();
    expect(neither).toEqual([]);
  });

  it('no column is both cleaned and excused, and every excuse names a column a member can write', () => {
    expect(exempt.filter((c) => cleanedColumns.has(c))).toEqual([]);
    expect(exempt.filter((c) => !open.has(c))).toEqual([]);
    expect(new Set(exempt).size).toBe(exempt.length);
  });

  it('each trigger fires on exactly the columns it cleans', () => {
    for (const c of cleaned) {
      expect([...new Set(c.args.map((a) => a.split('.')[0]))].sort()).toEqual([...c.updateOf].sort());
      for (const a of c.args) expect(types.has(`${c.table}.${a.split('.')[0]}`)).toBe(true);
    }
  });

  it('a column cleaned key by key is a jsonb array, and a column cleaned whole is text', () => {
    for (const c of cleaned) {
      for (const a of c.args) {
        const type = types.get(`${c.table}.${a.split('.')[0]}`) ?? '';
        expect(`${c.table}.${a} ${a.includes('.') ? type === 'jsonb' : /^(text|character varying)/.test(type)}`)
          .toBe(`${c.table}.${a} true`);
      }
    }
  });

  it('on each table the cleaning runs before every other BEFORE trigger, so each check reads the kept words', () => {
    for (const { table } of cleaned) {
      const before = [...SCHEMA.matchAll(new RegExp(`^CREATE TRIGGER (\\w+) BEFORE [^\\n]* ON public\\.${table} FOR EACH ROW`, 'gm'))]
        .map((m) => m[1]).sort();
      expect(`${table}: ${before[0]}`).toBe(`${table}: a_clean_member_text`);
    }
  });
});
