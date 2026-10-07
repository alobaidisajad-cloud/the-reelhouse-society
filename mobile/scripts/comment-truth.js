#!/usr/bin/env node
/**
 * comment-truth.js — every comment names only what exists, says what is true
 * now, and is no longer than the code it explains.
 *
 *   npm run comments:check              report every finding, exit 1 if any
 *   npm run comments:check -- --kinds LONG,NAME   only these kinds
 *   npm run comments:check -- --json <file>       also write the findings
 *
 * A comment is read by the next person as fact. These are the ways it stops
 * being one, each checked by machine so none depends on anyone noticing:
 *
 *   NAME     names a code or database identifier that exists nowhere — not in
 *            the code, the database snapshot, the migrations, the configs, or
 *            the type declarations of any package the app installs
 *   FILE     names a file that does not exist
 *   LINE     points at a line number, which moves on the next edit
 *   HISTORY  tells what the code was before, or when it changed; git keeps that
 *   `TODO`   a to-do marker: a promise the code does not keep
 *   CODE     code switched off by commenting it out
 *   LONG     more lines than the code it explains
 *   WIDE     a line over 100 characters — LONG, dodged by cramming
 *
 * What a comment is FOR: what the code cannot say — why, what was measured,
 * what must never change. A reason that must hold belongs in a test; the
 * comment can then be one line that names the test.
 *
 * Checked: every code file git tracks or would track in mobile/ (not
 * mockups/out, which is drawn output), the shell scripts, the Maestro flows,
 * the CI workflows, and the living docs. Not checked: SQL migrations — each is
 * the record of one change, which is history by design — and dated reports.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const MOBILE = path.join(__dirname, '..');
const REPO = path.join(MOBILE, '..');

// ── what is checked ──────────────────────────────────────────────────────────

const CODE = /\.(tsx?|jsx?|cjs|mjs)$/;
const HASH = /\.(sh|ya?ml)$/;
/** Docs that describe the code as it is. Dated reports and plans are records. */
const LIVING_DOCS = [
  'README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'ANDROID_LAUNCH.md',
  'mockups/README.md', '.maestro/README.md', 'test-utils/SOURCE-READING-TESTS.md',
];

function gitFiles(cwd, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-co', '--exclude-standard', ...args], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).split('\n').filter(Boolean);
}

function checkedFiles() {
  const mobile = gitFiles(MOBILE, []).filter((f) => !f.startsWith('mockups/out/') && fs.existsSync(path.join(MOBILE, f)));
  const code = mobile.filter((f) => CODE.test(f) && !f.endsWith('.d.ts') || f.startsWith('types/') && f.endsWith('.d.ts'));
  const hash = mobile.filter((f) => HASH.test(f) && !f.startsWith('.github/') && !f.startsWith('audit/'));
  const workflows = gitFiles(REPO, ['.github/workflows']).filter((f) => HASH.test(f)).map((f) => '../' + f);
  const docs = LIVING_DOCS.filter((f) => fs.existsSync(path.join(MOBILE, f)));
  return { code, hash: [...hash, ...workflows], docs };
}

// ── what exists ──────────────────────────────────────────────────────────────

const WORD = /[A-Za-z_$][\w$]*/g;

/** Real-world names that look like code: products, platforms, people's tools. */
const VOCABULARY = new Set([
  'iOS', 'iPadOS', 'macOS', 'iPhone', 'iPhones', 'iPad', 'iPads', 'iCloud', 'eBay', 'iMessage',
  'VoiceOver', 'TalkBack', 'TestFlight', 'GitHub', 'JavaScript', 'TypeScript', 'PowerShell',
  'YouTube', 'WebKit', 'WebView', 'PostgreSQL', 'PostgREST', 'OpenAI', 'ChatGPT', 'FaceTime',
  'AirDrop', 'AirPods', 'CarPlay', 'SwiftUI', 'UIKit', 'AppKit', 'CoreText', 'CoreAnimation',
  'TextKit', 'ProMotion', 'MacBook', 'McDonald', 'DeepL', 'RevenueCat', 'PayTabs', 'OneSignal',
  'LaunchScreen', 'AppStore', 'PlayStore', 'GoogleService', 'StoreKit', 'SQLite', 'JetBrains',
  'NodeJS', 'LinkedIn', 'WhatsApp', 'TikTok', 'SoundCloud', 'MailChimp', 'SendGrid', 'CloudFlare',
  'DevTools', 'LaTeX', 'WordPress', 'SwiftKey', 'OnePlus', 'LineageOS', 'HarmonyOS', 'MyAnimeList',
  'IMDb', 'LetterBoxd', 'Letterboxd', 'MUBI', 'DoorDash', 'PlayStation', 'OpenType', 'TrueType',
  'LibreOffice',
  // Names from outside the app that its comments rightly cite: a pattern, and
  // platform code the app reasons about but does not contain.
  'DataLoader', 'setTextDirection',
  // Maestro's and Android's own code, which the E2E runner's comments cite as the
  // cause of what it handles (e2e/attempt.mjs, e2e/animation-waits.mjs), and the
  // splash handover the app no longer takes (plugins/withSplashWithoutHandoff.js).
  'isDriverReachable', 'LogcatReader', 'UiAutomation', 'WindowManagerService',
  'isHandleSplashScreenExit', 'starting_reveal',
]);

function words(text, into) {
  for (const w of text.match(WORD) || []) into.add(w);
}

function walk(dir, test, out = []) {
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of names) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') walk(p, test, out); } else if (test(d.name)) out.push(p);
  }
  return out;
}

/**
 * Every package the app installs — and every package those install — with the
 * type declarations it ships. React Native's own names also live in its Flow
 * sources and its native iOS and Android code (`clipsToBounds`,
 * `ParagraphShadowNode`), which comments about the platform name.
 */
function dependencyWords(into) {
  const NM = path.join(MOBILE, 'node_modules');
  const pkgOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; } };
  const own = pkgOf(MOBILE);
  const seen = new Set();
  const queue = [...Object.keys({ ...own.dependencies, ...own.devDependencies })];
  for (const t of fs.readdirSync(path.join(NM, '@types'))) queue.push('@types/' + t);
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const root = path.join(NM, name);
    const pkg = pkgOf(root);
    if (!pkg) continue;
    words(name, into);
    for (const f of walk(root, (n) => n.endsWith('.d.ts') || n.endsWith('.d.mts'))) words(fs.readFileSync(f, 'utf8'), into);
    queue.push(...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }));
  }
  const rn = path.join(NM, 'react-native');
  for (const dir of ['Libraries', 'React', 'ReactAndroid/src/main', 'ReactCommon']) {
    for (const f of walk(path.join(rn, dir), (n) => /\.(js|h|mm?|cpp|java|kt)$/.test(n))) words(fs.readFileSync(f, 'utf8'), into);
  }
}

function universe(files) {
  const known = new Set(VOCABULARY);
  for (const f of files.code) words(stripComments(read(f), f), known);
  for (const f of files.hash) words(read(f), known);
  const sql = [
    ...walk(path.join(MOBILE, 'supabase'), (n) => n.endsWith('.sql')),
    ...walk(path.join(REPO, 'supabase'), (n) => n.endsWith('.sql')),
  ];
  for (const f of sql) words(fs.readFileSync(f, 'utf8'), known);
  for (const f of ['package.json', 'app.json', 'eas.json', 'tsconfig.json', 'app.config.js', '.maestro/config.yaml']) {
    if (fs.existsSync(path.join(MOBILE, f))) words(read(f), known);
  }
  dependencyWords(known);
  // A test, a flow or a module is named by its file: `theToastHasOneHome`, `lobby_wall_flow`.
  for (const f of repoFiles().all) words(path.posix.basename(f).split('.')[0], known);
  return known;
}

function read(f) {
  return fs.readFileSync(path.join(MOBILE, f), 'utf8');
}

// ── every file there is, for FILE ────────────────────────────────────────────

let REPO_FILES;
function repoFiles() {
  if (!REPO_FILES) {
    const all = gitFiles(REPO, []);
    REPO_FILES = { all, paths: new Set(all), names: new Set(all.map((f) => path.posix.basename(f))) };
  }
  return REPO_FILES;
}

/**
 * Whether a named file exists — as CI sees it. Against the files git tracks, by
 * their exact case: on this machine the disk ignores case and holds files git
 * ignores, so a name that passed here failed on the runner's Linux. Only an
 * installed package is looked up on disk, and CI installs the same packages.
 */
function fileExists(ref, from) {
  // An opening bracket with no closing one is prose before the name, not part of it.
  const clean = ref.replace(/^@\//, '').replace(/^\((?![^)]*\))/, '').replace(/[.,;:)]+$/, '');
  const { all, names, paths } = repoFiles();
  const dir = path.dirname(path.join(MOBILE, from));
  for (const r of [dir, MOBILE, REPO, path.join(MOBILE, 'src')]) {
    if (paths.has(path.relative(REPO, path.join(r, clean)).split(path.sep).join('/'))) return true;
  }
  if (fs.existsSync(path.join(MOBILE, 'node_modules', clean))) return true;
  // A path git is told to ignore is something a run MAKES (coverage/, a build):
  // named, it is true whether or not this checkout has made it yet.
  for (const r of [dir, MOBILE]) {
    try {
      execFileSync('git', ['check-ignore', '-q', path.join(r, clean)], { cwd: REPO, stdio: 'ignore' });
      return true;
    } catch { /* not ignored */ }
  }
  if (!clean.includes('/')) return names.has(clean);
  const tail = '/' + clean.replace(/^\.{1,2}\//, '');
  return all.some((f) => ('/' + f).endsWith(tail));
}

// ── comments ─────────────────────────────────────────────────────────────────

function kindOf(file) {
  return /\.tsx$/.test(file) ? ts.ScriptKind.TSX
    : /\.(jsx?|cjs|mjs)$/.test(file) ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
}

/** Every comment range in a file, found through the token tree: JSX text is never one. */
function commentRanges(sf) {
  const text = sf.text;
  const seen = new Map();
  const add = (ranges) => { for (const r of ranges || []) if (!seen.has(r.pos)) seen.set(r.pos, r); };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const c of node.getChildren(sf)) visit(c);
  };
  visit(sf);
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

function stripComments(text, file) {
  if (!CODE.test(file)) return text;
  const sf = parse(file, text);
  let out = '';
  let at = 0;
  for (const r of commentRanges(sf)) { out += text.slice(at, r.pos) + ' '; at = r.end; }
  return out + text.slice(at);
}

/** Tool instructions, not prose. */
const DIRECTIVE = /^\s*(?:eslint[\s-]|@ts-|prettier-ignore|istanbul |c8 |#region|#endregion|global |@jsx|@flow|webpackChunkName|@refresh|@__PURE__|#__PURE__|biome-ignore|@vitest-environment|@jest-environment)/;

/** Line comments that touch are one comment. */
function blocks(sf) {
  const text = sf.text;
  const out = [];
  for (const r of commentRanges(sf)) {
    const raw = text.slice(r.pos, r.end);
    const body = r.kind === ts.SyntaxKind.SingleLineCommentTrivia ? raw.replace(/^\/\/\/?/, '') : raw.replace(/^\/\*+!?/, '').replace(/\*\/$/, '');
    if (DIRECTIVE.test(body) || /^\/\/\/\s*<reference/.test(raw)) continue;
    const prev = out[out.length - 1];
    // A comment after code on its line explains that line; the comments under it are their own.
    const lineStart = text.lastIndexOf('\n', r.pos - 1) + 1;
    const trailing = /\S/.test(text.slice(lineStart, r.pos).replace(/^\s*\{\s*$/, ''));
    if (prev && prev.single && !prev.trailing && r.kind === ts.SyntaxKind.SingleLineCommentTrivia
      && /^[ \t]*\r?\n[ \t]*$/.test(text.slice(prev.end, r.pos))) {
      prev.end = r.end;
      prev.body += '\n' + body;
      continue;
    }
    out.push({ pos: r.pos, end: r.end, single: r.kind === ts.SyntaxKind.SingleLineCommentTrivia, trailing, body, jsdoc: raw.startsWith('/**') });
  }
  return out;
}

/** Lines of a comment that say something (not the bare slashes and stars). */
function saidLines(body) {
  return body.split('\n').filter((l) => /[A-Za-z0-9]/.test(l.replace(/^\s*\*?/, ''))).length;
}

// ── LONG: what code a comment explains ───────────────────────────────────────

/** `{/* … *\/}` in JSX: an expression that holds nothing but a comment. */
const isCommentOnly = (node) => node && node.kind === ts.SyntaxKind.JsxExpression && !node.expression;

function codeLineMask(sf, ranges) {
  const text = sf.text;
  const inComment = new Uint8Array(text.length);
  for (const r of ranges) inComment.fill(1, r.pos, r.end);
  // The braces around a JSX comment are part of the comment, not code.
  const visit = (n) => { if (isCommentOnly(n)) inComment.fill(1, n.getStart(sf), n.end); else ts.forEachChild(n, visit); };
  visit(sf);
  const lines = sf.getLineStarts();
  const mask = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const end = i + 1 < lines.length ? lines[i + 1] : text.length;
    for (let c = lines[i]; c < end; c++) if (!inComment[c] && !/\s/.test(text[c])) { mask[i] = 1; break; }
  }
  return mask;
}

const isJsDoc = (node) => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;

function tokenAfter(sf, pos) {
  let found;
  const visit = (node) => {
    if (found || node.end <= pos || isJsDoc(node)) return;
    // The gap between JSX children is not a token.
    if (node.kind === ts.SyntaxKind.JsxText && !/\S/.test(node.text)) return;
    const kids = node.getChildren(sf);
    if (kids.length === 0) { if (node.getStart(sf) >= pos) found = node; return; }
    for (const k of kids) { visit(k); if (found) return; }
  };
  visit(sf);
  return found;
}

/** The largest node that begins at this token: the whole statement, not its first keyword. */
function outermostAt(tok) {
  let n = tok;
  while (n.parent && n.parent.kind !== ts.SyntaxKind.SourceFile && n.parent.kind !== ts.SyntaxKind.SyntaxList
    && n.parent.getStart() === tok.getStart()) n = n.parent;
  return n;
}

const CLOSERS = new Set([ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.EndOfFileToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.SlashToken]);

/** What a comment explains: the next thing, the construct it closes, or the file it heads. */
function explained(sf, block, mask, firstCodeLine) {
  const line = (p) => sf.getLineAndCharacterOfPosition(p).line;
  const startLine = line(block.pos);
  const lineStart = sf.getLineStarts()[startLine];
  // After code on its line, it explains that line (a `{` opening a JSX comment is not code).
  if (/\S/.test(sf.text.slice(lineStart, block.pos).replace(/^\s*\{\s*$/, ''))) return { lines: 1, what: 'its line' };
  // A comment above the first code of the file heads the file.
  if (firstCodeLine === -1 || startLine < firstCodeLine) return { node: sf, what: 'the file' };
  let pos = block.end;
  for (let guard = 0; guard < 8; guard++) {
    const tok = tokenAfter(sf, pos);
    if (!tok) return { node: sf, what: 'the file' };
    if (CLOSERS.has(tok.kind)) {
      const holder = tok.parent;
      // `{/* … */}` in JSX holds nothing: look past it.
      if (holder && holder.kind === ts.SyntaxKind.JsxExpression && !holder.expression) { pos = holder.end; continue; }
      return { node: holder && holder.kind === ts.SyntaxKind.SyntaxList ? holder.parent : holder, what: 'what it closes' };
    }
    const node = outermostAt(tok);
    // Another JSX comment next: the code this one explains is past it.
    if (isCommentOnly(node)) { pos = node.end; continue; }
    // A doc comment describes its one declaration; a line comment heads the paragraph below it.
    return block.jsdoc ? { node, what: 'its declaration' } : { node, last: paragraphEnd(sf, node), what: 'the code under it' };
  }
  return { node: sf, what: 'the file' };
}

const LISTS = ['statements', 'properties', 'members', 'elements', 'children', 'clauses'];

/** The last sibling of a paragraph: siblings follow on until a blank line or a comment. */
function paragraphEnd(sf, node) {
  const list = node.parent && LISTS.map((k) => node.parent[k]).find((l) => Array.isArray(l) && l.includes(node));
  if (!list) return node;
  let last = node;
  for (let i = list.indexOf(node) + 1; i < list.length; i++) {
    const next = list[i];
    // In JSX, whitespace between children is a node: a blank line in it ends the paragraph,
    // and a comment child starts the next one.
    if (next.kind === ts.SyntaxKind.JsxText) { if (/\n[ \t]*\r?\n/.test(next.text)) break; continue; }
    if (isCommentOnly(next)) break;
    // The rest of the previous sibling's own line (a comma, a trailing comment) is its own.
    const gap = sf.text.slice(last.end, next.getStart(sf)).replace(/^[^\n]*/, '');
    if (/\n[ \t]*\r?\n/.test(gap) || /\/\/|\/\*/.test(gap)) break;
    last = next;
  }
  return last;
}

function codeLinesOf(sf, node, mask, last = node) {
  const a = sf.getLineAndCharacterOfPosition(node.kind === ts.SyntaxKind.SourceFile ? 0 : node.getStart(sf)).line;
  const b = sf.getLineAndCharacterOfPosition(last.end).line;
  let n = 0;
  for (let i = a; i <= b; i++) n += mask[i];
  return n;
}

// ── the text checks, shared by code, scripts and docs ────────────────────────

/**
 * Only the markers that mean the CODE's past. "No longer", "is now" and "was
 * deleted" also describe what happens while the app runs (a post that was
 * deleted, a handle that no longer exists), so they are left to the reader.
 */
const HISTORY = [
  /\b20\d\d-\d\d-\d\d\b/,
  /\bbatch(?:es)? \d+\b/i,
  /(?<!\b(?:is|are|be|been|being|was|were|get|gets|got|getting|'s)\s)\bused to\b(?! (?:be )?(?:mean|say|tell|mark|keep|hold|show|draw|build|make|find|read|name|decide|carry|measure|compute|render|test|check|catch|pick|size|place|group|sort|reach|set|give|run|open|send|store|format|scale|fit|match|prove|paint|lay|light|write|clip|detect|drive))/i,
  /\bpreviously\b/i,
  /\bformerly\b/i,
  /\boriginally\b/i,
  /\buntil now\b/i,
  /\b(?:we|I) (?:removed|replaced|renamed|changed|moved|fixed|added|dropped|reverted|rewrote)\b/,
  /\((?:was|formerly|previously)\b/i,
  /\b(?:this|the|that|a later|an earlier) (?:fix|commit|refactor|rewrite)\b/i,
];
const TODO = /\b(?:TODO|FIXME|XXX|HACK)\b/;
const LINE_REF = [
  /[\w\])-]\.(?:tsx?|jsx?|cjs|mjs|sql|sh|ya?ml):\d+/,
  /\b(?:line|lines|L)\s?\d+(?:\s*[-–]\s*\d+)?\b(?= of \S+\.(?:tsx?|jsx?|cjs|mjs|sql)| in \S+\.(?:tsx?|jsx?|cjs|mjs|sql)|\s*$|[.,;)])/i,
];
// `+` is a file's first letter in Expo Router (`+not-found.tsx`).
const FILE_REF = /(?<![\w/.*$+-])((?:@\/|\.{1,2}\/)?[\w.[\]()@+-]+(?:\/[\w.[\]()@+-]+)*\.(?:tsx?|jsx?|cjs|mjs|json|sql|md|ya?ml|sh))(?![\w/*])/g;
const CAMEL = /(?<![\w$.\/@#\\-])[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*(?![\w$])/g;
const SNAKE = /(?<![\w$.\/@#\\-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w$])/g;
const PASCAL = /(?<![\w$.\/@#\\-])[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+(?![\w$])/g;
const TICKED = /`([^`\n]+)`/g;
const IDENT_SPAN = /^<?\/?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?\s*\/?>?$/;

function namesIn(text) {
  const out = new Set();
  const plain = text.replace(/https?:\/\/\S+/g, ' ').replace(/[\w.-]+@[\w.-]+/g, ' ');
  for (const m of plain.matchAll(TICKED)) {
    const span = m[1].trim();
    if (IDENT_SPAN.test(span)) for (const w of span.match(WORD) || []) if (w.length > 1) out.add(w);
  }
  const unticked = plain.replace(TICKED, ' ').replace(FILE_REF, ' ');
  for (const re of [CAMEL, SNAKE, PASCAL]) for (const m of unticked.matchAll(re)) out.add(m[0]);
  return out;
}

function textFindings(text, file, line, known, { skipNames = false, skipFiles = false } = {}) {
  const found = [];
  const say = (kind, detail) => found.push({ kind, file, line, detail });
  const plain = text.replace(/https?:\/\/\S+/g, ' ');
  // A value in backticks is an example (`2024-02-31`), not when something happened.
  const prose = plain.replace(TICKED, ' ');
  for (const re of HISTORY) { const m = prose.match(re); if (m) { say('HISTORY', m[0]); break; } }
  const todo = prose.match(TODO);
  if (todo) say('TODO', todo[0]);
  for (const re of LINE_REF) { const m = plain.match(re); if (m) { say('LINE', m[0]); break; } }
  if (!skipFiles) for (const m of plain.matchAll(FILE_REF)) if (!fileExists(m[1], file)) say('FILE', m[1]);
  if (!skipNames) for (const n of namesIn(plain)) if (!known.has(n)) say('NAME', n);
  return found;
}

// ── CODE: a comment that is code ─────────────────────────────────────────────

function isCode(body, file) {
  const lines = body.split('\n').map((l) => l.replace(/^\s*\*?\s?/, ''));
  const src = lines.join('\n').trim();
  if (!/[;=(){}]/.test(src) || !/[A-Za-z]/.test(src)) return false;
  if (/^[A-Z][a-z]+ [a-z]+ /.test(src)) return false; // a sentence
  const probe = ts.createSourceFile('probe' + (file.endsWith('x') ? '.tsx' : '.ts'), src, ts.ScriptTarget.Latest, false, kindOf(file));
  if (probe.parseDiagnostics.length) return false;
  // One bare name or literal is a word, not code.
  return probe.statements.some((s) => s.kind !== ts.SyntaxKind.ExpressionStatement
    || ![ts.SyntaxKind.Identifier, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NumericLiteral].includes(s.expression.kind));
}

// ── the scan ─────────────────────────────────────────────────────────────────

/** The widest a line holding a comment may be, indent included. 99.8% of the app's fit. */
const WIDTH = 100;

function scanCode(file, text, known) {
  const sf = parse(file, text);
  const ranges = commentRanges(sf);
  const mask = codeLineMask(sf, ranges);
  // A `#!` line runs the file; it is not code a header could explain.
  const firstCodeLine = mask.findIndex((m, i) => m && !(i === 0 && text.startsWith('#!')));
  const found = [];
  const starts = sf.getLineStarts();
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  for (const r of ranges) {
    const body = text.slice(r.pos, r.end).replace(/^\/\/\/?|^\/\*+/, '');
    if (DIRECTIVE.test(body)) continue;
    for (let l = lineOf(r.pos); l <= lineOf(r.end); l++) {
      const end = l + 1 < starts.length ? starts[l + 1] : text.length;
      const width = text.slice(starts[l], end).replace(/\r?\n$/, '').length;
      if (width > WIDTH) { found.push({ kind: 'WIDE', file, line: l + 1, detail: `${width} characters` }); break; }
    }
  }
  // A test's comment is the record of the defect it guards, and names what was
  // there — the component deleted, the file it lived in — on purpose. Its names
  // and files are not held to what exists now; its line numbers still are.
  const narrative = /(^|\/)__tests__\/|\.test\.[jt]sx?$/.test(file);
  for (const b of blocks(sf)) {
    const line = sf.getLineAndCharacterOfPosition(b.pos).line + 1;
    found.push(...textFindings(b.body, file, line, known, { skipNames: narrative, skipFiles: narrative }));
    if (isCode(b.body, file)) found.push({ kind: 'CODE', file, line, detail: b.body.trim().split('\n')[0].slice(0, 60) });
    const said = saidLines(b.body);
    if (said > 1) {
      const ex = explained(sf, b, mask, firstCodeLine);
      const code = ex.lines || codeLinesOf(sf, ex.node, mask, ex.last);
      if (said > code) found.push({ kind: 'LONG', file, line, detail: `${said} lines for ${code} of ${ex.what}` });
    }
  }
  return found;
}

function scanHash(file, text, known) {
  const found = [];
  const lines = text.split('\n');
  let block = null;
  const flush = () => { if (block) found.push(...textFindings(block.text, file, block.line, known)); block = null; };
  lines.forEach((l, i) => {
    // `#` opens a comment at the start of a line or after a space, outside quotes.
    const unquoted = l.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (s) => ' '.repeat(s.length));
    const at = unquoted.search(/(?:^|\s)#(?![!{])/);
    if (at === -1 || i === 0 && l.startsWith('#!')) { flush(); return; }
    const body = l.slice(unquoted.indexOf('#', at)).replace(/^#+/, '');
    const own = !/\S/.test(l.slice(0, unquoted.indexOf('#', at)));
    if (block && own && block.last === i - 1) { block.text += '\n' + body; block.last = i; return; }
    flush();
    block = { text: body, line: i + 1, last: i };
  });
  flush();
  return found;
}

function scanDoc(file, text, known) {
  // Docs are prose about code: a named file must exist, a ticked identifier must exist
  // (prose capitalises freely), and nothing points at a line.
  const found = [];
  // A link is read by where it goes: `[text](path)` names `path`, not the text.
  const fenced = text.replace(/```[\s\S]*?```/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/\[[^\]\n]*\]\(([^)\s]+)\)/g, ' $1 ');
  fenced.split('\n').forEach((l, i) => {
    const say = (kind, detail) => found.push({ kind, file, line: i + 1, detail });
    for (const m of l.matchAll(FILE_REF)) if (!fileExists(m[1], file)) say('FILE', m[1]);
    for (const m of l.matchAll(TICKED)) {
      const span = m[1].trim();
      if (IDENT_SPAN.test(span)) for (const w of span.match(WORD) || []) if (w.length > 1 && !known.has(w)) say('NAME', w);
    }
    for (const re of LINE_REF) { const m = l.match(re); if (m) { say('LINE', m[0]); break; } }
  });
  return found;
}

function scan({ kinds } = {}) {
  const files = checkedFiles();
  const known = universe(files);
  const all = [];
  for (const f of files.code) all.push(...scanCode(f, read(f), known));
  for (const f of files.hash) all.push(...scanHash(f, read(f), known));
  for (const f of files.docs) all.push(...scanDoc(f, read(f), known));
  const keep = kinds ? all.filter((x) => kinds.includes(x.kind)) : all;
  return { files, findings: keep };
}

module.exports = { scan, scanCode, scanHash, scanDoc, textFindings, namesIn, isCode, checkedFiles, universeOf: universe };

if (require.main === module) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
  const kinds = arg('--kinds') && arg('--kinds').split(',');
  const t0 = Date.now();
  const { files, findings } = scan({ kinds });
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(findings, null, 1));
  const by = {};
  for (const x of findings) by[x.kind] = (by[x.kind] || 0) + 1;
  if (!process.argv.includes('--quiet')) for (const x of findings) console.log(`${x.kind.padEnd(8)}${x.file}:${x.line}  ${x.detail}`);
  const count = files.code.length + files.hash.length + files.docs.length;
  console.log(`\n${count} files read (${files.code.length} code, ${files.hash.length} scripts and flows, ${files.docs.length} docs) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (findings.length) {
    console.log(`${findings.length} comments are not true or not short:`, by);
    process.exit(1);
  }
  console.log('every comment names what exists, says what is true now, and is no longer than its code');
}
