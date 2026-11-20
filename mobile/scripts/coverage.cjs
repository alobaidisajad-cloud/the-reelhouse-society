#!/usr/bin/env node
/**
 * coverage.cjs — what a reader or reviewer actually opened, taken from its own work log, against what it was
 * given to read. What it says it read counts for nothing.
 *
 *   node mobile/scripts/coverage.cjs opened --log <agent.jsonl>
 *   node mobile/scripts/coverage.cjs check --log <agent.jsonl> --scope <scope> [--allow-write <file>]... [--out <record>]
 *
 * The log is the JSONL transcript the Agent tool keeps for each agent
 * (~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl, its metadata file beside it). Each line is one
 * message; a tool call is a `tool_use` block ({ id, name, input }) and its answer a `tool_result` block naming that
 * id. Opened means the Read tool's answer held those lines: the answer numbers every line it shows ("12\tcode"),
 * so the lines are taken from the answer, never from the call's offset and limit. A call that failed, a file too
 * large to show, and a reread answered "unchanged" open nothing. A picture counts as opened whole when its answer
 * held the image.
 *
 * A scope ({ id, commit, copy, planted, files: { path: "whole" | [[from, to], ...] }, cells: [{ id, evidence:
 * [path, ...] }] }) is the slice: paths from the repo, read in the copy at `copy`. The check passes only when every
 * line and every cell's every picture of the scope was opened, and nothing outside the copy was touched: a file
 * read, searched or written outside it (but a --allow-write file, and the log's own saved outputs it was pointed
 * to), a shell run from outside it or naming a path outside it or above it, the network, or another agent.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── paths ────────────────────────────────────────────────────────────────────

/** A path in one spelling: forward slashes, a drive letter in capitals, git-bash's /c/ read as C:/. */
function norm(p) {
  let s = String(p).replace(/\\/g, '/');
  const bash = /^\/([a-zA-Z])(\/|$)/.exec(s);
  if (bash) s = `${bash[1].toUpperCase()}:/${s.slice(3)}`;
  s = s.replace(/^([a-z]):/, (m, d) => `${d.toUpperCase()}:`);
  s = path.posix.normalize(s);
  return s.length > 3 && s.endsWith('/') ? s.slice(0, -1) : s;
}

/** Whether a path is the root or inside it. Windows paths are matched without case. */
function inside(p, root) {
  const a = norm(p).toLowerCase();
  const r = norm(root).toLowerCase();
  return a === r || a.startsWith(`${r}/`);
}

// ── the log ──────────────────────────────────────────────────────────────────

/** The tool calls of a log, in order, each with its answer: { id, name, input, cwd, at, result, error }. */
function callsOf(text) {
  const uses = new Map();
  const order = [];
  const results = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = o.message && Array.isArray(o.message.content) ? o.message.content : [];
    for (const b of content) {
      if (b.type === 'tool_use' && !uses.has(b.id)) {
        uses.set(b.id, { id: b.id, name: b.name, input: b.input || {}, cwd: o.cwd || null, at: o.timestamp || null });
        order.push(b.id);
      } else if (b.type === 'tool_result' && !results.has(b.tool_use_id)) {
        results.set(b.tool_use_id, { content: b.content, error: b.is_error === true, at: o.timestamp || null });
      }
    }
  }
  return order.map((id) => {
    const u = uses.get(id);
    const r = results.get(id);
    return { ...u, result: r ? r.content : null, error: r ? r.error : true, answeredAt: r ? r.at : null };
  });
}

/** The text and pictures of an answer. */
function answerParts(content) {
  if (typeof content === 'string') return { text: content, image: false };
  if (!Array.isArray(content)) return { text: '', image: false };
  return {
    text: content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n'),
    image: content.some((c) => c && (c.type === 'image' || c.type === 'document')),
  };
}

/**
 * The lines a Read answer showed, as one range [first, last], or null. Each shown line starts with its number and
 * a tab (or an arrow); the numbers must run on by one from the first, and the run ends at the first line that does
 * not continue it, so text after the file (a reminder) never counts.
 */
function linesShown(text) {
  let first = null;
  let next = null;
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)(?:\t|→)/.exec(line);
    if (first === null) {
      if (m) { first = Number(m[1]); next = first + 1; }
      continue;
    }
    if (m && Number(m[1]) === next) { next += 1; continue; }
    break;
  }
  return first === null ? null : [first, next - 1];
}

const NEVER_INSIDE = new Set(['WebFetch', 'WebSearch', 'Agent', 'Task', 'SendMessage', 'Skill', 'Monitor', 'TaskStop',
  'EnterWorktree', 'ExitWorktree', 'Artifact', 'ArtifactComments', 'ArtifactData', 'SlashCommand', 'RemoteTrigger']);
const HARMLESS = new Set(['ToolSearch', 'TodoWrite', 'SubagentHandback', 'BashOutput', 'KillShell']);
const FILE_TOOLS = { Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path', NotebookRead: 'notebook_path' };
const NETWORK = /(^|[\s;&|(])(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|gh|ssh|scp|sftp|ftp|nc|npm|npx|pnpm|yarn|pip|git\s+(fetch|pull|clone|push|remote|submodule))(?=$|[\s;&|)])/i;
const ABS_WIN = /[A-Za-z]:[\\/][^\s'"`|;&<>()]*/g;
const ABS_POSIX = /(?:^|[\s'"`=(])(\/[A-Za-z~][^\s'"`|;&<>()]*)/g;
const HOME = /(^|[\s'"`=(])(~[\\/]|~$|\$HOME\b|\$env:|%USERPROFILE%|%APPDATA%|\$USERPROFILE\b)/i;
const ALLOWED_POSIX = new Set(['/dev/null', '/dev/stdout', '/dev/stderr']);

/** Where a shell call runs: its leading cd, or the log's working folder. */
function shellCwd(command, cwd) {
  const m = /^\s*(?:cd|Set-Location|pushd)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(?:&&|;|\|\|)/i.exec(command);
  return m ? (m[1] || m[2] || m[3]) : cwd;
}

/**
 * Everything a log did outside the copy, one line each. `allowWrite` are files the reviewer may write (its
 * findings file); a saved output (a long answer the tool kept in a file and named) may be read where it was named.
 */
function outsideOf(calls, copy, { allowWrite = [] } = {}) {
  const out = [];
  const saved = new Set();
  const flag = (c, why) => out.push({ call: c.id, tool: c.name, why });
  for (const c of calls) {
    const said = answerParts(c.result).text;
    if (HARMLESS.has(c.name)) continue;
    if (NEVER_INSIDE.has(c.name) || c.name.startsWith('mcp__')) { flag(c, 'reaches outside the copy (the network, another agent, or another tool)'); continue; }
    const field = FILE_TOOLS[c.name];
    if (field) {
      const p = c.input[field];
      if (!p) { flag(c, 'names no file'); continue; }
      const writing = c.name !== 'Read' && c.name !== 'NotebookRead';
      if (writing && allowWrite.some((w) => norm(w).toLowerCase() === norm(p).toLowerCase())) continue;
      if (!writing && saved.has(norm(p).toLowerCase())) continue;
      if (!inside(p, copy)) flag(c, `${writing ? 'wrote' : 'read'} ${norm(p)}`);
      else if (writing) flag(c, `changed the copy: ${norm(p)}`);
    } else if (c.name === 'Grep' || c.name === 'Glob') {
      const where = c.input.path || c.cwd;
      if (!where || !inside(where, copy)) flag(c, `searched ${where ? norm(where) : 'an unnamed folder'}`);
    } else if (c.name === 'Bash' || c.name === 'PowerShell') {
      const cmd = String(c.input.command || '');
      const cwd = shellCwd(cmd, c.cwd);
      if (!cwd || !inside(cwd, copy)) flag(c, `ran a shell in ${cwd ? norm(cwd) : 'an unnamed folder'}`);
      if (NETWORK.test(cmd)) flag(c, 'ran a command that reaches the network or a package registry');
      if (HOME.test(cmd)) flag(c, 'named the home folder');
      if (/(^|[\s'"`=(/\\])\.\.([\\/]|$|[\s'"`])/.test(cmd)) flag(c, 'named a folder above its own (..)');
      for (const p of cmd.match(ABS_WIN) || []) if (!inside(p, copy)) flag(c, `named ${norm(p)}`);
      for (const m of cmd.matchAll(ABS_POSIX)) {
        const p = m[1];
        if (ALLOWED_POSIX.has(p)) continue;
        if (!/^\/[a-zA-Z](\/|$)/.test(p) || !inside(p, copy)) flag(c, `named ${p}`);
      }
    } else {
      flag(c, 'a tool the check does not know');
    }
    for (const m of said.matchAll(/(?:saved to|Full output saved to):\s*(\S+)/gi)) saved.add(norm(m[1]).toLowerCase());
  }
  return out;
}

/** Path (normalized) → { ranges, whole } of what the log's Read answers showed. */
function openedOf(calls) {
  const opened = new Map();
  for (const c of calls) {
    if (c.name !== 'Read' || c.error || !c.input.file_path) continue;
    const key = norm(c.input.file_path).toLowerCase();
    const { text, image } = answerParts(c.result);
    if (!opened.has(key)) opened.set(key, { path: norm(c.input.file_path), ranges: [], whole: false });
    const o = opened.get(key);
    if (image) o.whole = true;
    const shown = linesShown(text);
    if (shown) o.ranges.push(shown);
  }
  for (const o of opened.values()) o.ranges = merge(o.ranges);
  return opened;
}

// ── ranges ───────────────────────────────────────────────────────────────────

function merge(ranges) {
  const s = ranges.filter((r) => r[1] >= r[0]).map((r) => [r[0], r[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/** The parts of `want` that `have` does not hold. */
function missing(want, have) {
  const out = [];
  const h = merge(have);
  for (const [a, b] of merge(want)) {
    let at = a;
    for (const [x, y] of h) {
      if (y < at || x > b) continue;
      if (x > at) out.push([at, Math.min(b, x - 1)]);
      at = Math.max(at, y + 1);
      if (at > b) break;
    }
    if (at <= b) out.push([at, b]);
  }
  return out;
}

const size = (ranges) => ranges.reduce((n, [a, b]) => n + b - a + 1, 0);

/** A file's lines as the Read tool numbers them. */
function lineCount(text) {
  if (!text.length) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf)$/i;

// ── the check ────────────────────────────────────────────────────────────────

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** The record's own hash, over everything but itself: a record changed by hand no longer matches it. */
const sealOf = (record) => sha(JSON.stringify({ ...record, seal: undefined }));

/**
 * The coverage record of a log against a scope. `logText` is the transcript; `scope` the parsed scope; `logPath`
 * only names it. Lines are counted in the copy.
 */
function check({ logText, logPath = null, scope, allowWrite = [] }) {
  const calls = callsOf(logText);
  const copy = scope.copy;
  const opened = openedOf(calls);
  const outside = outsideOf(calls, copy, { allowWrite });
  const files = {};
  let want = 0;
  let got = 0;
  for (const [rel, part] of Object.entries(scope.files || {})) {
    const abs = norm(path.posix.join(norm(copy), rel));
    const o = opened.get(abs.toLowerCase()) || { ranges: [], whole: false };
    if (BINARY.test(rel)) {
      files[rel] = { required: 1, covered: o.whole ? 1 : 0, missing: o.whole ? [] : ['the picture'] };
      want += 1; got += o.whole ? 1 : 0;
      continue;
    }
    let n = 0;
    try { n = lineCount(fs.readFileSync(abs, 'utf8')); } catch { files[rel] = { required: 1, covered: 0, missing: ['not in the copy'] }; want += 1; continue; }
    const req = part === 'whole' ? (n ? [[1, n]] : []) : merge(part.map(([a, b]) => [Math.max(1, a), Math.min(n, b)]));
    const miss = missing(req, o.ranges);
    files[rel] = { required: size(req), covered: size(req) - size(miss), missing: miss };
    want += size(req); got += size(req) - size(miss);
  }
  const cells = {};
  for (const cell of scope.cells || []) {
    const lacking = cell.evidence.filter((rel) => {
      const o = opened.get(norm(path.posix.join(norm(copy), rel)).toLowerCase());
      return !o || (!o.whole && !o.ranges.length);
    });
    cells[cell.id] = { evidence: cell.evidence.length, missing: lacking };
    want += 1; got += lacking.length ? 0 : 1;
  }
  const times = calls.map((c) => c.at).filter(Boolean).sort();
  const record = {
    id: scope.id,
    scope: { id: scope.id, sha256: sha(JSON.stringify(scope)) },
    commit: scope.commit || null,
    copy: norm(copy),
    planted: Boolean(scope.planted),
    log: { path: logPath ? norm(logPath) : null, sha256: sha(logText), calls: calls.length, began: times[0] || null, ended: times[times.length - 1] || null },
    files,
    cells,
    percent: want ? Math.floor((got / want) * 10000) / 100 : 100,
    outside,
    pass: got === want && outside.length === 0,
  };
  record.seal = sealOf(record);
  return record;
}

module.exports = { norm, inside, callsOf, linesShown, openedOf, outsideOf, missing, merge, size, lineCount, check, sealOf, sha };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  const all = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
  const log = arg('--log');
  if (!log) { console.error('usage: coverage.cjs opened|check --log <agent.jsonl> [--scope <scope.json>]'); process.exit(2); }
  const logText = fs.readFileSync(log, 'utf8');
  if (argv[0] === 'opened') {
    const opened = openedOf(callsOf(logText));
    for (const o of opened.values()) console.log(`${o.path}  ${o.whole ? 'whole picture' : o.ranges.map(([a, b]) => `${a}-${b}`).join(', ')}`);
    process.exit(0);
  }
  const scope = JSON.parse(fs.readFileSync(arg('--scope'), 'utf8'));
  const record = check({ logText, logPath: log, scope, allowWrite: all('--allow-write') });
  if (arg('--out')) fs.writeFileSync(arg('--out'), JSON.stringify(record, null, 1));
  for (const [f, r] of Object.entries(record.files)) if (r.missing.length) console.log(`MISSING ${f}: ${r.missing.map((m) => (Array.isArray(m) ? `${m[0]}-${m[1]}` : m)).join(', ')}`);
  for (const [c, r] of Object.entries(record.cells)) if (r.missing.length) console.log(`MISSING cell ${c}: ${r.missing.join(', ')}`);
  for (const o of record.outside) console.log(`OUTSIDE ${o.tool}: ${o.why}`);
  console.log(`${record.pass ? 'PASS' : 'FAIL'}: ${record.percent}% of the scope opened, ${record.outside.length} touches outside the copy`);
  process.exit(record.pass ? 0 : 1);
}
