#!/usr/bin/env node
/**
 * repeated-elements.cjs — every element the app repeats, each use side by side, so the same thing
 * can be made to look and act the same everywhere.
 *
 *   node mockups/tools/repeated-elements.cjs [--md FILE] [--json FILE]
 *   node mockups/tools/repeated-elements.cjs --shots OUT [--src DIR] [--width W]
 *
 * From the app's code (source.cjs):
 *   parts     every component of the app's own (a capitalised name imported from app/ or src/)
 *             drawn from two files or more: each use with its file, line and the props it is
 *             handed as written, under its kind (KINDS: header, empty, failed, sheet, rank mark …)
 *   buttons   every PressableScale whose label is its own Text: grouped by how the label is set
 *             (face, size, spacing, colour, case) and how the button is drawn (ground, edge,
 *             corner, height), as the styles in its own file give them; one group is one look
 *   toasts    every toast the app raises, by kind, with its words
 * --shots: the drawn pages (mockups/out/screens, or the captures with --src) read for each part's
 * own file (`data-src`, mockups/srcMark.ts): every place a page draws it is cut out as a picture,
 * and OUT/index.html lays each part's pictures side by side.
 */
const fs = require('fs');
const path = require('path');
const { ts, MOBILE, appSources, walk, lineOf, tagOf, importsOf, localImports, nameOf } = require('./source.cjs');

/** A part's kind, by its name. */
const KINDS = [
  ['header', /Header$|NavBar$|Masthead$|TitleBar$/],
  ['empty', /Empty|NotInTheArchive/],
  ['failed', /TryAgain|Unreachable|ErrorBoundary|EmptyOffline/],
  ['sheet', /Sheet$|Modal$|Panel$/],
  ['rank mark', /Rank|Badge|Seal$|Stamp$/],
  ['divider', /Divider$|Rule$/],
  ['card', /Card$|Tile$|Plate$/],
  ['row', /Row$|Entry$/],
  ['notice', /Notice$|Banner$|Toast/],
  ['control', /Button$|Toggle$|Switch$|Chip$|Input$|Picker$|Calendar$/],
  ['loading', /Skeleton|Preloader|Shimmer|Unready/],
];
const kindOf = (name) => KINDS.find(([, re]) => re.test(name))?.[0] ?? 'other';

/** A JSX element's props as written: `title="No Seat Yet" onPress={…}`, short. */
function propsOf(el) {
  const opening = ts.isJsxElement(el) ? el.openingElement : el;
  return opening.attributes.properties.map((a) => {
    if (!ts.isJsxAttribute(a)) return `{...${a.expression.getText().slice(0, 20)}}`;
    const k = a.name.getText();
    if (!a.initializer) return k;
    if (ts.isStringLiteral(a.initializer)) return `${k}="${a.initializer.text.slice(0, 40)}"`;
    const e = a.initializer.expression;
    const t = e ? e.getText().replace(/\s+/g, ' ') : '';
    return t.length <= 30 ? `${k}={${t}}` : `${k}={…}`;
  }).join(' ');
}

/** Each StyleSheet in one file, by its variable: { s: { label: { fontSize: '12', … } } }. */
function sheetsOf(src) {
  const sheets = {};
  walk(src.tree, (n) => {
    if (!ts.isVariableDeclaration(n) || !n.initializer || !ts.isCallExpression(n.initializer)) return;
    if (n.initializer.expression.getText() !== 'StyleSheet.create') return;
    const obj = n.initializer.arguments[0];
    if (!obj || !ts.isObjectLiteralExpression(obj)) return;
    const styles = {};
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
      styles[nameOf(p)] = Object.fromEntries(p.initializer.properties.filter(ts.isPropertyAssignment).map((q) => [nameOf(q), q.initializer.getText().replace(/\s+/g, ' ')]));
    }
    sheets[n.name.getText()] = styles;
  });
  return sheets;
}

/** The style a `style={…}` resolves to in its own file, where it names that file's sheets. */
function styleOf(el, sheets) {
  const opening = ts.isJsxElement(el) ? el.openingElement : el;
  const a = opening.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'style');
  const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null;
  const out = {};
  const take = (x) => {
    if (!x) return;
    if (ts.isArrayLiteralExpression(x)) x.elements.forEach(take);
    else if (ts.isPropertyAccessExpression(x) && sheets[x.expression.getText()]) Object.assign(out, sheets[x.expression.getText()][x.name.text] ?? {});
    else if (ts.isObjectLiteralExpression(x)) for (const q of x.properties) if (ts.isPropertyAssignment(q)) out[nameOf(q)] = q.initializer.getText();
    else if (ts.isBinaryExpression(x) || ts.isConditionalExpression(x)) out['(chosen in code)'] = x.getText().slice(0, 30);
  };
  take(e);
  return out;
}

const LABEL_KEYS = ['fontFamily', 'fontSize', 'letterSpacing', 'color', 'textTransform', 'fontWeight'];
const BOX_KEYS = ['backgroundColor', 'borderWidth', 'borderColor', 'borderRadius', 'height', 'minHeight', 'paddingVertical', 'paddingHorizontal'];
const pick = (style, keys) => keys.filter((k) => style[k] != null).map((k) => `${k}: ${style[k]}`).join('; ');

/** The whole table: parts, buttons and toasts. */
function table(sources = appSources()) {
  const uses = new Map();
  const buttons = new Map();
  const toasts = [];
  for (const src of sources) {
    const imports = importsOf(src);
    const local = new Set(localImports(src));
    const sheets = sheetsOf(src);
    walk(src.tree, (n) => {
      // A toast: reelToast.error(…) and its kin (src/utils/reelToast.ts), or showToast(…) beneath it.
      const callee = ts.isCallExpression(n) ? n.expression.getText() : '';
      if (/^reelToast(\.\w+)?$|^showToast$/.test(callee)) {
        const said = n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0])) ? n.arguments[0].text : n.arguments[0]?.getText().slice(0, 50);
        toasts.push({ kind: callee.split('.')[1] ?? (callee === 'showToast' ? n.arguments[1]?.getText() ?? 'info' : 'info'), said, at: `${src.rel}:${lineOf(src, n)}` });
      }
      if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) return;
      const tag = tagOf(n);
      const from = imports[tag.split('.')[0]];
      if (/^[A-Z]/.test(tag) && from && (from.startsWith('@/') || from.startsWith('.')) && local.size) {
        // Named by the file it resolves to, as a drawn page's data-src names it, not as imported.
        const base = from.startsWith('@/') ? path.join(MOBILE, from.slice(2)) : path.resolve(path.dirname(src.abs), from);
        const home = [...local].find((f) => f.replace(/(\/|\\)index\.tsx?$|\.tsx?$/, '') === base) ?? base;
        const key = `${tag}  (${path.relative(MOBILE, home).split(path.sep).join('/').replace(/\.tsx?$/, '')})`;
        if (!uses.has(key)) uses.set(key, []);
        uses.get(key).push({ at: `${src.rel}:${lineOf(src, n)}`, file: src.rel, props: propsOf(n) });
      }
      if (tag === 'PressableScale' && ts.isJsxElement(n)) {
        const label = n.children.find((c) => ts.isJsxElement(c) && /^(Text|SaidText)$/.test(tagOf(c)));
        if (!label) return;
        const words = label.children.filter(ts.isJsxText).map((t) => t.text.trim()).join(' ').trim()
          || label.children.filter((c) => ts.isJsxExpression(c) && c.expression).map((c) => `{${c.expression.getText().slice(0, 24)}}`).join(' ');
        const look = `label ${pick(styleOf(label, sheets), LABEL_KEYS) || '(its style is not in its file)'} | button ${pick(styleOf(n, sheets), BOX_KEYS) || '(none in its file)'}`;
        if (!buttons.has(look)) buttons.set(look, []);
        buttons.get(look).push({ at: `${src.rel}:${lineOf(src, n)}`, words });
      }
    });
  }
  const parts = [...uses.entries()].map(([name, list]) => ({ name, kind: kindOf(name.split(' ')[0]), files: new Set(list.map((u) => u.file)).size, uses: list }))
    .filter((p) => p.files >= 2).sort((a, b) => (a.kind === b.kind ? b.uses.length - a.uses.length : a.kind < b.kind ? -1 : 1));
  return { parts, buttons: [...buttons.entries()].map(([look, list]) => ({ look, uses: list })).sort((a, b) => b.uses.length - a.uses.length), toasts };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
function markdown(t) {
  const out = ['# Every repeated element, side by side', '', 'Written by mockups/tools/repeated-elements.cjs from the code.', '',
    `## Buttons: ${t.buttons.length} looks over ${t.buttons.reduce((n, b) => n + b.uses.length, 0)} buttons`, '', '| Look | Uses | Words and where |', '|---|---|---|'];
  for (const b of t.buttons) out.push(`| ${cell(b.look)} | ${b.uses.length} | ${cell(b.uses.map((u) => `${u.words} (${u.at})`).join('; '))} |`);
  out.push('', `## Parts drawn from two files or more: ${t.parts.length}`);
  for (const p of t.parts) {
    out.push('', `### ${p.kind}: ${p.name}: ${p.uses.length} uses in ${p.files} files`, '', '| Where | Props |', '|---|---|');
    for (const u of p.uses) out.push(`| ${u.at} | ${cell(u.props)} |`);
  }
  out.push('', `## Toasts: ${t.toasts.length}`, '', '| Kind | Words | Where |', '|---|---|---|');
  for (const x of t.toasts.sort((a, b) => (a.kind < b.kind ? -1 : 1))) out.push(`| ${x.kind} | ${cell(x.said)} | ${x.at} |`);
  return `${out.join('\n')}\n`;
}

/**
 * The places one page draws a part: its elements (each a rect, from the part's own file) gathered
 * into groups that touch or nearly touch (within GAP), one group a place.
 */
const GAP = 8;
function placesOf(rects, gap = GAP) {
  const groups = [];
  for (const r of rects.slice().sort((a, b) => a.top - b.top || a.left - b.left)) {
    const near = groups.find((g) => r.left <= g.right + gap && r.right >= g.left - gap && r.top <= g.bottom + gap && r.bottom >= g.top - gap);
    if (near) Object.assign(near, { left: Math.min(near.left, r.left), top: Math.min(near.top, r.top), right: Math.max(near.right, r.right), bottom: Math.max(near.bottom, r.bottom) });
    else groups.push({ ...r });
  }
  return groups.filter((g) => g.right - g.left >= 4 && g.bottom - g.top >= 4);
}

async function shots(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const { chromium, open, screens } = require('./harness.cjs');
  const out = path.resolve(opt('--shots'));
  const src = path.resolve(opt('--src', path.join(MOBILE, 'mockups', 'out', 'screens')));
  const width = Number(opt('--width', '390'));
  const t = table();
  const files = new Map(t.parts.map((p) => [p.name.match(/\(([^)]+)\)/)[1], p.name]));
  fs.mkdirSync(out, { recursive: true });
  const shown = new Map();
  const browser = await chromium.launch();
  try {
    for (const name of screens(src)) {
      const page = await open(browser, path.join(src, `${name}.html`), { width });
      const found = await page.evaluate((wanted) => {
        const by = {};
        for (const e of document.querySelectorAll('[data-src]')) {
          const file = e.dataset.src.replace(/:\d+$/, '').replace(/\.tsx?$/, '');
          if (!wanted.includes(file)) continue;
          const r = e.getBoundingClientRect();
          (by[file] = by[file] ?? []).push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
        return by;
      }, [...files.keys()].map((f) => f.replace(/\.tsx?$/, '')));
      // The page as drawn, whole: a place is cut from within it, never past its edges.
      const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      for (const [file, rects] of Object.entries(found)) {
        for (const [i, g] of placesOf(rects).slice(0, 3).entries()) {
          const x = Math.max(0, g.left - 4);
          const y = Math.max(0, g.top - 4);
          const clip = { x, y, width: Math.min(size.w, g.right + 4) - x, height: Math.min(600, Math.min(size.h, g.bottom + 4) - y) };
          if (clip.width < 4 || clip.height < 4) continue;
          const pic = `${file.replace(/[^A-Za-z0-9]+/g, '-')}--${name}-${i}.png`;
          await page.screenshot({ path: path.join(out, pic), clip, fullPage: true });
          if (!shown.has(file)) shown.set(file, []);
          shown.get(file).push({ pic, page: name });
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  const rows = [...shown.entries()].map(([file, pics]) => `<h2>${file}</h2><div class="row">${pics.map((p) => `<figure><img src="${p.pic}"><figcaption>${p.page}</figcaption></figure>`).join('')}</div>`);
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Repeated elements</title><style>body{background:#0D0B09;color:#e8dcc4;font:13px monospace;margin:16px}.row{display:flex;gap:12px;overflow-x:auto}figure{margin:0}img{display:block;max-width:360px;border:1px solid #333}</style>${rows.join('')}`);
  // A part is cut out where its own file marks a Text or a control (data-src): one that marks
  // nothing (a wrapper, a motion, a primitive drawn in its callers' names) or that no drawn page
  // holds is named, so it is pictured some other way or drawn.
  const never = [...files.keys()].filter((f) => !shown.has(f.replace(/\.tsx?$/, '')));
  console.log(`${shown.size} parts pictured from ${screens(src).length} pages into ${out}; ${never.length} parts whose own file marks nothing on a drawn page: ${never.join(', ')}`);
  return 0;
}

function main(argv) {
  if (argv.includes('--shots')) return shots(argv);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const t = table();
  console.log(`${t.parts.length} parts drawn from two files or more; buttons: ${t.buttons.length} looks over ${t.buttons.reduce((n, b) => n + b.uses.length, 0)} buttons; ${t.toasts.length} toasts`);
  if (opt('--md')) fs.writeFileSync(opt('--md'), markdown(t));
  if (opt('--json')) fs.writeFileSync(opt('--json'), `${JSON.stringify(t, null, 2)}\n`);
  return 0;
}

if (require.main === module) Promise.resolve(main(process.argv.slice(2))).then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 2; });

module.exports = { KINDS, kindOf, table, markdown, placesOf, sheetsOf, styleOf };
