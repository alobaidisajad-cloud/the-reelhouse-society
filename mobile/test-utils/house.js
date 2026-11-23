/**
 * house — the database as production will hold it, read from text: the schema snapshot
 * (supabase/schema/live-schema.sql), then every migration production has not had yet, in name
 * order (test-utils/schema.ts's PENDING_SQL), each later statement standing over the one before
 * it. The one reader of functions, triggers, row rules and grants for the sweeps that judge the
 * house's own code: what a definer function reads, what a member may write and how often, which
 * notices a trigger writes and takes back.
 *
 * Plain CommonJS, like universe.js, so the node scripts and the tests read the very same house.
 *
 *   const house = require('../test-utils/house');
 *   const h = house.read();               // the house: { functions, triggers, policies, executes, tables }
 *   h.functions.get('public.get_lobby')   // { name, header, body, definer, args }
 *   house.read(sql)                       // the same, of any text (the guards' planted cases), all of
 *                                         // it read as pending: a function it makes runs for no one until granted
 */
const fs = require('fs');
const path = require('path');
const universe = require('./universe');

const MOBILE = path.join(__dirname, '..');

/**
 * The text with every comment, quoted string and function body blanked to spaces, its length kept,
 * so a statement found in it is a statement and its place is its place in the text; and the body
 * spans, each the place of a dollar-quoted text and its tag.
 */
function mask(sql) {
  const out = sql.split('');
  const bodies = [];
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const to = end < 0 ? sql.length : end;
      blank(i, to);
      i = to;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const to = end < 0 ? sql.length : end + 2;
      blank(i, to);
      i = to;
    } else if (c === '\'') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\'' && sql[j + 1] === '\'') { j += 2; continue; }
        if (sql[j] === '\'') break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (!tag || /\w/.test(sql[i - 1] ?? '')) { i++; continue; }
      const start = i + tag[0].length;
      const end = sql.indexOf(tag[0], start);
      const to = end < 0 ? sql.length : end;
      bodies.push({ from: i, start, end: to, tag: tag[0] });
      blank(i, to + tag[0].length);
      i = to + tag[0].length;
    } else i++;
  }
  return { text: out.join(''), bodies };
}

/** A body's text with its line comments taken out, a quoted string's text kept whole. */
function uncommented(sql) {
  let out = '';
  let quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === '\'') quoted = !quoted;
    if (!quoted && c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end < 0) break;
      i = end - 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** "public.x", "x" or '"x"' as schema.name; a bare name is public's. */
const qualified = (raw) => {
  const parts = raw.replace(/"/g, '').split('.');
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : `public.${parts[0]}`;
};

/** The statement that starts at `at` in the masked text, up to its semicolon. */
const statementAt = (masked, sql, at) => {
  const end = masked.indexOf(';', at);
  return sql.slice(at, end < 0 ? sql.length : end);
};

/**
 * The house a text leaves standing. Each statement is read where it stands, in order, so a later
 * one replaces, alters or drops what an earlier one made.
 */
function read(sql, { pendingFrom = 0 } = {}) {
  if (sql === undefined) ({ text: sql, pendingFrom } = houseText());
  sql = sql.replace(/\r/g, '');
  const isPending = (at) => at >= pendingFrom;
  const { text: masked, bodies } = mask(sql);
  const functions = new Map();
  const triggers = new Map();
  const policies = new Map();
  /** By function name, the roles that may run it (PUBLIC among them when no one took it away). */
  const executes = new Map();
  /** By table, by role, the privileges granted on it (a column grant as `SELECT(col)`). */
  const tables = new Map();

  const roleList = (s) => s.split(',').map((r) => r.trim().replace(/"/g, '')).filter(Boolean);
  const statement = /^[ \t]*(CREATE(?: OR REPLACE)?(?: CONSTRAINT)? TRIGGER|DROP TRIGGER|CREATE(?: OR REPLACE)? FUNCTION|DROP FUNCTION|CREATE POLICY|ALTER POLICY|DROP POLICY|GRANT|REVOKE|ALTER FUNCTION)\b/gm;
  let m;
  while ((m = statement.exec(masked))) {
    const at = m.index + m[0].length - m[1].length;
    const kind = m[1];
    if (/FUNCTION$/.test(kind) && kind.startsWith('CREATE')) {
      const head = /FUNCTION\s+("?[\w]+"?(?:\."?\w+"?)?)\s*\(/.exec(masked.slice(at, at + 400));
      if (!head) continue;
      const name = qualified(head[1]);
      const body = bodies.find((b) => b.from > at);
      if (!body) continue;
      const header = sql.slice(at, body.from);
      const open = at + head.index + head[0].length - 1;
      let depth = 0;
      let close = open;
      for (; close < masked.length; close++) {
        if (masked[close] === '(') depth++;
        if (masked[close] === ')' && --depth === 0) break;
      }
      const tail = sql.slice(body.end + body.tag.length, masked.indexOf(';', body.end + body.tag.length));
      const all = header + tail;
      const fresh = !functions.has(name) || !/OR REPLACE/.test(kind);
      functions.set(name, {
        name,
        header: all,
        body: uncommented(sql.slice(body.start, body.end)),
        definer: /\bSECURITY\s+DEFINER\b/i.test(all),
        args: sql.slice(open + 1, close),
        returnsTrigger: /\bRETURNS\s+trigger\b/i.test(all),
      });
      // A function made new holds what a new function is given in its schema; one replaced keeps its grants.
      if (fresh && !executes.has(name)) executes.set(name, new Set(name.startsWith('public.') && !isPending(at) ? ['PUBLIC'] : []));
      statement.lastIndex = body.end + body.tag.length;
      continue;
    }
    const text = statementAt(masked, sql, at);
    if (kind === 'DROP FUNCTION') {
      for (const f of text.matchAll(/(?:EXISTS\s+|FUNCTION\s+|,\s*)("?\w+"?(?:\."?\w+"?)?)\s*\(/g)) { const n = qualified(f[1]); functions.delete(n); executes.delete(n); }
    } else if (kind === 'ALTER FUNCTION') {
      const f = /FUNCTION\s+("?\w+"?(?:\."?\w+"?)?)\s*\(/.exec(text);
      const fn = f && functions.get(qualified(f[1]));
      if (fn && /\bSECURITY\s+DEFINER\b/i.test(text)) fn.definer = true;
      if (fn && /\bSECURITY\s+INVOKER\b/i.test(text)) fn.definer = false;
    } else if (kind.includes('TRIGGER') && kind.startsWith('CREATE')) {
      // The events with their columns (UPDATE OF review, pull_quote): a trigger on two or more columns is read too.
      const t = /TRIGGER\s+("?\w+"?)\s+(BEFORE|AFTER|INSTEAD OF)\s+([\w\s,]+?)\s+ON\s+("?\w+"?(?:\."?\w+"?)?)[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+("?\w+"?(?:\."?\w+"?)?)\s*\(([^)]*)\)/i.exec(text);
      if (!t) continue;
      const table = qualified(t[4]);
      const name = t[1].replace(/"/g, '');
      triggers.set(`${name} on ${table}`, {
        name, table, timing: t[2].toUpperCase(),
        events: t[3].toUpperCase().split(/\s+OR\s+/).map((e) => e.replace(/\s+OF\s+[\s\S]*$/, '').trim()),
        level: /FOR\s+EACH\s+STATEMENT/i.test(text) ? 'STATEMENT' : 'ROW',
        when: (/\bWHEN\s*\(([\s\S]*?)\)\s*EXECUTE/i.exec(text) ?? [])[1] ?? '',
        fn: qualified(t[5]),
        fnArgs: t[6],
      });
    } else if (kind === 'DROP TRIGGER') {
      const t = /TRIGGER\s+(?:IF\s+EXISTS\s+)?("?\w+"?)\s+ON\s+("?\w+"?(?:\."?\w+"?)?)/i.exec(text);
      if (t) triggers.delete(`${t[1].replace(/"/g, '')} on ${qualified(t[2])}`);
    } else if (kind === 'CREATE POLICY' || kind === 'ALTER POLICY' || kind === 'DROP POLICY') {
      const p = /POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+("?\w+"?(?:\."?\w+"?)?)/i.exec(text);
      if (!p) continue;
      const table = qualified(p[2]);
      const key = `${p[1].replace(/"/g, '')} on ${table}`;
      if (kind === 'DROP POLICY') { policies.delete(key); continue; }
      const clause = (word) => {
        const w = new RegExp(`\\b${word}\\s*\\(`, 'i').exec(masked.slice(at, at + text.length));
        if (!w) return null;
        const open = at + w.index + w[0].length - 1;
        let depth = 0;
        for (let k = open; k < sql.length; k++) {
          if (masked[k] === '(') depth++;
          if (masked[k] === ')' && --depth === 0) return sql.slice(open + 1, k);
        }
        return null;
      };
      const before = policies.get(key);
      const rolesAt = /\bTO\s+([\w\s,"]+?)(?:\s+USING\b|\s+WITH\s+CHECK\b|$)/i.exec(text);
      policies.set(key, {
        name: p[1].replace(/"/g, ''), table,
        cmd: kind === 'ALTER POLICY' ? before?.cmd ?? 'ALL' : ((/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(text) ?? [])[1] ?? 'ALL').toUpperCase(),
        restrictive: kind === 'ALTER POLICY' ? before?.restrictive ?? false : /\bAS\s+RESTRICTIVE\b/i.test(text),
        roles: rolesAt ? roleList(rolesAt[1]) : before?.roles ?? ['PUBLIC'],
        using: clause('USING') ?? (kind === 'ALTER POLICY' ? before?.using ?? null : null),
        check: clause('WITH\\s+CHECK') ?? (kind === 'ALTER POLICY' ? before?.check ?? null : null),
      });
    } else if (kind === 'GRANT' || kind === 'REVOKE') {
      const g = kind === 'GRANT'
        ? /^GRANT\s+([\s\S]+?)\s+ON\s+(FUNCTION|TABLE|ALL\s+\w+\s+IN\s+SCHEMA)?\s*([\s\S]+?)\s+TO\s+([\s\S]+?)(?:\s+WITH\s+GRANT\s+OPTION)?$/i.exec(text.trim())
        : /^REVOKE\s+(?:GRANT\s+OPTION\s+FOR\s+)?([\s\S]+?)\s+ON\s+(FUNCTION|TABLE|ALL\s+\w+\s+IN\s+SCHEMA)?\s*([\s\S]+?)\s+FROM\s+([\s\S]+?)(?:\s+CASCADE|\s+RESTRICT)?$/i.exec(text.trim());
      if (!g) continue;
      const roles = roleList(g[4]);
      const on = (g[2] ?? 'TABLE').toUpperCase();
      if (on === 'FUNCTION' && /^(ALL|EXECUTE)/i.test(g[1])) {
        for (const f of g[3].matchAll(/("?\w+"?(?:\."?\w+"?)?)\s*\(/g)) {
          const n = qualified(f[1]);
          const set = executes.get(n) ?? new Set();
          for (const r of roles) {
            if (kind === 'GRANT') set.add(r);
            else set.delete(r);
          }
          executes.set(n, set);
        }
      } else if (on === 'TABLE') {
        const privs = [...g[1].matchAll(/(SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN|ALL(?:\s+PRIVILEGES)?)(\s*\([^)]*\))?/gi)]
          .flatMap((p) => {
            const word = p[1].toUpperCase().startsWith('ALL') ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] : [p[1].toUpperCase()];
            const cols = p[2] ? p[2].replace(/[()\s"]/g, '').split(',') : null;
            return word.flatMap((w) => (cols ? cols.map((c) => `${w}(${c})`) : [w]));
          });
        for (const t of g[3].split(',')) {
          const name = qualified(t.trim());
          const byRole = tables.get(name) ?? new Map();
          for (const r of roles) {
            const set = byRole.get(r) ?? new Set();
            for (const p of privs) {
              if (kind === 'GRANT') set.add(p);
              else { set.delete(p); if (!p.includes('(')) for (const q of [...set]) if (q.startsWith(`${p}(`)) set.delete(q); }
            }
            byRole.set(r, set);
          }
          tables.set(name, byRole);
        }
      }
    }
  }
  return { functions, triggers, policies, executes, tables };
}

/** The snapshot, then every migration production has not had, in name order (what production will hold), and where the pending begin. */
function houseText() {
  const snapshot = fs.readFileSync(path.join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8').replace(/\r/g, '');
  const applied = new Set(fs.readFileSync(path.join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  const pending = universe.files('migrations').filter((f) => !applied.has(path.basename(f)))
    .sort((a, b) => (path.basename(a) < path.basename(b) ? -1 : 1))
    .map((f) => fs.readFileSync(f, 'utf8').replace(/\r/g, '')).join('\n');
  return { text: `${snapshot}\n${pending}`, pendingFrom: snapshot.length + 1 };
}

/** Whether a member (or a visitor) may run the function: authenticated, anon or PUBLIC hold it. */
const membersRun = (house, name) => ['authenticated', 'anon', 'PUBLIC'].some((r) => house.executes.get(name)?.has(r));

/** The triggers of a table, as production will hold them. */
const triggersOn = (house, table) => [...house.triggers.values()].filter((t) => t.table === qualified(table));

module.exports = { read, houseText, mask, uncommented, qualified, membersRun, triggersOn };
