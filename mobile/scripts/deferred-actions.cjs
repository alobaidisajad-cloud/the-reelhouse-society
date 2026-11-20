#!/usr/bin/env node
/**
 * Every entry of supabase/DEFERRED-ACTIONS.md says when it falls due, and this
 * says when it has.
 *
 * Each entry (a `## ` heading) carries one line `**Trigger** \`<kind>\` …`:
 *   launch-build         done on or after the launch build: due once
 *                        e2e/old-clients.json holds a client marked
 *                        "launch": true (the launch build, recorded as it ships);
 *   before-launch-build  done before the launch build is made: that same record
 *                        means it is overdue;
 *   date YYYY-MM-DD      due on that day (UTC);
 *   standing             nothing will trigger it; the line goes on to say why
 *                        and what watches it.
 * An entry with no trigger, an unknown one, a standing one with no reason or a
 * date that is not a day is refused; an entry whose trigger has fired is due,
 * and the check fails until it is done and taken out of the file.
 *
 * Run: node scripts/deferred-actions.cjs (from mobile/); exits 1 on either.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..');
const KINDS = ['launch-build', 'before-launch-build', 'date', 'standing'];

/** Every entry: its heading, the trigger's kind, its date (for a date) and the words after it. */
function parse(text) {
  const entries = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      cur = { title: line.slice(3).trim(), trigger: null, rest: '', date: null };
      entries.push(cur);
      continue;
    }
    const m = cur && !cur.trigger && /^\*\*Trigger\*\* `([^`]*)`(.*)$/.exec(line);
    if (m) {
      const [kind, day] = m[1].trim().split(/\s+/);
      cur.trigger = kind;
      cur.date = day || null;
      cur.rest = m[2].replace(/^[\s—–:-]+/, '').trim();
    }
  }
  return entries;
}

/** What the repo says has happened: the launch build recorded, and today. */
function facts(mobile = MOBILE, now = new Date()) {
  const clients = JSON.parse(fs.readFileSync(path.join(mobile, 'e2e', 'old-clients.json'), 'utf8')).clients;
  return { launched: clients.some((c) => c.launch === true), today: now.toISOString().slice(0, 10) };
}

/** The refused entries (with why) and the due ones. */
function check(text, f) {
  const refused = [];
  const due = [];
  for (const e of parse(text)) {
    if (!e.trigger) { refused.push(`${e.title}: no **Trigger** line`); continue; }
    if (!KINDS.includes(e.trigger)) { refused.push(`${e.title}: "${e.trigger}" is not one of ${KINDS.join(', ')}`); continue; }
    if (e.trigger === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || Number.isNaN(Date.parse(e.date))) {
        refused.push(`${e.title}: "date ${e.date || ''}" is not a day`);
        continue;
      }
      if (f.today >= e.date) due.push(`${e.title}: due since ${e.date}`);
      continue;
    }
    if (e.trigger !== 'date' && e.date) { refused.push(`${e.title}: "${e.trigger}" takes no date`); continue; }
    if (e.trigger === 'standing') {
      if (e.rest.length < 20) refused.push(`${e.title}: a standing entry says why and what watches it`);
      continue;
    }
    if (f.launched) due.push(`${e.title}: ${e.trigger === 'launch-build' ? 'the launch build has shipped' : 'overdue: the launch build has shipped'}`);
  }
  return { refused, due };
}

module.exports = { parse, facts, check, KINDS };

if (require.main === module) {
  const text = fs.readFileSync(path.join(MOBILE, 'supabase', 'DEFERRED-ACTIONS.md'), 'utf8');
  const { refused, due } = check(text, facts());
  refused.forEach((r) => console.error(`REFUSED ${r}`));
  due.forEach((d) => console.error(`DUE ${d}`));
  if (refused.length || due.length) process.exit(1);
  console.log(`${parse(text).length} entries, each with its trigger; none due`);
}
