#!/usr/bin/env node
/**
 * sentences.cjs — every sentence a member can see or hear, with where it stands and when.
 *
 *   node mockups/tools/sentences.cjs [--md FILE] [--json FILE]
 *
 * Read from the app's code (app/ and src/, parsed by TypeScript, source.cjs), so a
 * reader judges the whole list for truth, clarity and the 1924 voice instead of hunting for it. A
 * sentence is:
 *   text       words written between JSX tags
 *   child      a string a JSX child works out (`{busy ? 'FILING…' : 'FILE'}`)
 *   prop:<p>   a string handed to a prop that is shown or spoken (a label, a placeholder, a hint):
 *              every prop but the ones that steer the code (TECH_PROPS)
 *   call:<f>   a string handed to what shows or speaks it (an alert, a toast, an announcement)
 *   key:<k>    a string kept under a key that is shown (`title:`, `message:`, `label:` …) in any
 *              object: the copy tables in src/lore and the like
 * Each with its file and line; the routes whose screens reach the file (source.cjs,
 * routesReaching); and its state: the nearest condition it is drawn under (`isError && …`, an
 * early `if (…) return`), named by the screen inventory's states (inventory.cjs, STATES) where it
 * reads as one, `shown` where none does, with the condition itself beside it.
 */
const fs = require('fs');
const { ts, appSources, routeSources, walk, lineOf, routesReaching } = require('./source.cjs');
const { STATES } = require('./inventory.cjs');

/** Props that steer the code, never shown. */
const TECH_PROPS = new Set(['testID', 'nativeID', 'key', 'id', 'name', 'style', 'className', 'href', 'source', 'uri', 'variant', 'kind', 'mode',
  'type', 'size', 'color', 'tint', 'tintColor', 'align', 'direction', 'role', 'accessibilityRole', 'importantForAccessibility', 'keyboardType',
  'autoCapitalize', 'autoComplete', 'textContentType', 'returnKeyType', 'pointerEvents', 'resizeMode', 'contentFit', 'cachePolicy', 'animation',
  'animationType', 'presentation', 'ellipsizeMode', 'behavior', 'transition', 'placement', 'icon', 'tab', 'section', 'screen', 'route', 'event',
  'textAlign', 'fontFamily', 'face', 'weight', 'tone', 'ink', 'ground', 'layer', 'edge', 'side', 'position', 'blurType', 'blurAmount', 'mask',
  'importance', 'collapsable', 'keyboardAppearance', 'inputMode', 'enterKeyHint', 'dataDetectorType', 'selectionColor', 'placeholderTextColor',
  'cursorColor', 'statusBarStyle', 'barStyle', 'gestureDirection', 'activeTintColor', 'pathname', 'list', 'trace', 'lightKey', 'recyclingKey',
  'contentPosition', 'priority', 'decoding', 'hitSlop', 'shape', 'fit', 'axis', 'track', 'layout', 'slot', 'room',
  // drawing: an SVG's paths, paints and units
  'd', 'viewBox', 'fill', 'stroke', 'fillRule', 'clipRule', 'transform', 'gradientUnits', 'patternUnits', 'strokeDasharray', 'strokeLinecap',
  'strokeLinejoin', 'stopColor', 'offset', 'preserveAspectRatio', 'textAnchor', 'dominantBaseline', 'fontWeight', 'fontStyle', 'xlinkHref',
  // the house's own steering props: a touch's weight, an input's submit, whose page, what is locked, what a list holds
  'touch', 'submitBehavior', 'targetUsername', 'lockedTo', 'includes']);
/** Calls that show or speak what they are handed. */
const SPEAKS = /^(Alert\.alert|Alert\.prompt|reelToast|reelToast\.\w+|showToast|AccessibilityInfo\.announceForAccessibility\w*|announce\w*|say|speak)$/;
/** Calls whose strings are never a member's: logs, traces, errors, queries, imports. */
const SILENT = /^(console\.\w+|e2eTrace\w*|Sentry\.\w+|addBreadcrumb|captureException|captureMessage|require|import|\w+\.from|\w+\.select|\w+\.eq|\w+\.neq|\w+\.rpc|\w+\.channel|\w+\.on|\w+\.order|\w+\.in|\w+\.is|\w+\.or|\w+\.match|\w+\.ilike|\w+\.like|\w+\.contains|\w+\.filter|\w+\.storage|\w+\.getItem|\w+\.setItem|\w+\.removeItem|\w+\.getString|\w+\.set|\w+\.delete|\w+\.getBoolean|\w+\.getNumber|fetch|\w+\.test|\w+\.replace|\w+\.split|\w+\.startsWith|\w+\.endsWith|\w+\.includes|\w+\.indexOf|\w+\.join|\w+\.padStart|\w+\.padEnd|\w+\.toLocaleString|RegExp|router\.\w+|\w+\.push|\w+\.navigate|Linking\.\w+|useQuery|queryKey|\w+\.invalidateQueries|\w+\.getQueryData|\w+\.setQueryData|\w+\.cancelQueries|Haptics\.\w+|StyleSheet\.\w+|\w+\.addEventListener|\w+\.removeEventListener|\w+\.emit|\w+\.log)$/;
/** Object keys whose strings are shown. */
const SHOWN_KEYS = /^(title|message|label|hint|placeholder|subtitle|body|caption|description|text|heading|eyebrow|cta|action|lede|line|lines|said|words|note|empty|error|prompt|question|answer|detail|tagline|name|verb|confirm|cancel|accessibilityLabel|accessibilityHint|summary|headline|kicker|byline|footnote|explainer|warning|button|tip|promise|privilege)$/;
/**
 * Words: a letter, and not a token the code steers by. Several words always count; one word counts
 * unless it reads as code: an identifier (`moveUp`, `memory-disk`), a path, a colour, a format or
 * a drawing's path (`M12 4l…`).
 */
function isWords(s) {
  const t = s.trim();
  if (!/\p{L}/u.test(t)) return false;
  if (/^[Mm]\s*-?\d/.test(t) || /^(rgba?|hsla?)\(/.test(t) || /^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (/\s/.test(t)) return true;
  if (/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(t)) return false;
  if (/^[a-z0-9_./:@-]+$/.test(t)) return false;
  return true;
}

/** A node's callee, as written: `Alert.alert`, `toast.error`. */
const calleeOf = (call) => call.expression.getText().replace(/\s+/g, '');

/** The strings an expression can come to: literals through ?:, &&, ||, ??, parentheses and templates. */
function stringsIn(e, out = []) {
  if (!e) return out;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) out.push(e);
  else if (ts.isTemplateExpression(e)) out.push(e);
  else if (ts.isParenthesizedExpression(e)) stringsIn(e.expression, out);
  else if (ts.isConditionalExpression(e)) { stringsIn(e.whenTrue, out); stringsIn(e.whenFalse, out); }
  else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(e.operatorToken.kind)) {
    if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) stringsIn(e.left, out);
    stringsIn(e.right, out);
  }
  return out;
}

/** A string node's words: a template's text with each `${…}` shown as `{…}`. */
function wordsOf(node) {
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => `{${s.expression.getText()}}${s.literal.text}`).join('');
  return node.text;
}

/** Inside a call whose strings are never a member's. */
function silenced(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && SILENT.test(calleeOf(p))) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isTypeNode(p) && !ts.isTypeLiteralNode(p)) return true;
  }
  return false;
}

/** The nearest condition a node is drawn under, and the state it reads as. */
function stateOf(node) {
  let nearest = null;
  for (let c = node, p = node.parent; p; c = p, p = p.parent) {
    let cond = null;
    let otherwise = false;
    if (ts.isConditionalExpression(p) && c !== p.condition) { cond = p.condition.getText(); otherwise = c === p.whenFalse; }
    else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && c === p.right) cond = p.left.getText();
    else if (ts.isIfStatement(p) && c !== p.expression) { cond = p.expression.getText(); otherwise = c === p.elseStatement; }
    if (!cond) continue;
    const flat = cond.replace(/\s+/g, ' ');
    const said = (otherwise ? `not (${flat})` : flat).slice(0, 80);
    nearest = nearest ?? said;
    // The other branch of a state's condition is the screen without that state: read on up.
    if (otherwise || /^!(?!!)/.test(flat)) continue;
    const hit = Object.entries(STATES).find(([, re]) => re.test(cond));
    if (hit) return { state: hit[0], when: said };
    if (/\berror\b|\bfailed\b|\bunreachable\b/i.test(cond)) return { state: 'failed', when: said };
    if (/\bloading\b|\breading\b|\bpending\b|\bsearching\b|\bisFetching\b/i.test(cond)) return { state: 'loading', when: said };
    if (/\bempty\b|\.length === 0|!\w+\.length\b/i.test(cond)) return { state: 'empty', when: said };
    if (/\boffline\b|\bisOnline\b/i.test(cond)) return { state: 'offline', when: said };
  }
  return { state: 'shown', when: nearest };
}

/** Every sentence one file holds: { words, kind, line, state, when }. */
function sentencesOf(src) {
  const out = [];
  const add = (node, kind) => {
    const words = wordsOf(node).replace(/\s+/g, ' ').trim();
    if (!words || !isWords(words) || silenced(node)) return;
    out.push({ words, kind, line: lineOf(src, node), ...stateOf(node) });
  };
  walk(src.tree, (n) => {
    if (ts.isJsxText(n)) {
      const words = n.text.replace(/\s+/g, ' ').trim();
      if (words && /\p{L}/u.test(words)) out.push({ words, kind: 'text', line: lineOf(src, n), ...stateOf(n) });
    } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const s of stringsIn(n.expression)) add(s, 'child');
    } else if (ts.isJsxAttribute(n) && !TECH_PROPS.has(n.name.getText())) {
      const init = n.initializer;
      const found = !init ? [] : ts.isStringLiteral(init) ? [init] : init.expression ? stringsIn(init.expression) : [];
      for (const s of found) add(s, `prop:${n.name.getText()}`);
    } else if (ts.isCallExpression(n) && SPEAKS.test(calleeOf(n))) {
      for (const a of n.arguments) {
        for (const s of stringsIn(a)) add(s, `call:${calleeOf(n)}`);
        // An alert's buttons: { text: 'Depart' }.
        if (ts.isArrayLiteralExpression(a)) for (const el of a.elements) if (ts.isObjectLiteralExpression(el)) for (const p of el.properties) if (ts.isPropertyAssignment(p) && p.name.getText() === 'text') for (const s of stringsIn(p.initializer)) add(s, `call:${calleeOf(n)}`);
      }
    } else if (ts.isPropertyAssignment(n) && SHOWN_KEYS.test(n.name.getText().replace(/['"]/g, '')) && !ts.isJsxAttribute(n.parent)) {
      for (const s of stringsIn(n.initializer)) add(s, `key:${n.name.getText().replace(/['"]/g, '')}`);
    }
  });
  // One sentence once: an alert's button is both a call's string and a shown key.
  const seen = new Set();
  return out.filter((s) => { const k = `${s.line}|${s.words}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The whole list: every sentence with its file, line, routes and state. */
function sentences(sources = appSources(), routes = routeSources()) {
  const reach = routesReaching(routes);
  const out = [];
  for (const src of sources) {
    for (const s of sentencesOf(src)) out.push({ ...s, file: src.rel, routes: reach.get(src.rel) ?? [] });
  }
  return out;
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
function markdown(list) {
  const lines = ['# Every sentence a member sees or hears', '', `Written by mockups/tools/sentences.cjs from the code: ${list.length} sentences. Routes: the screens whose code reaches the file (all of them past eight are counted). State: the nearest condition the words are drawn under.`, '',
    '| Words | Where | Kind | State | When | Routes |', '|---|---|---|---|---|---|'];
  for (const s of list) {
    const routes = s.routes.length > 8 ? `${s.routes.length} routes` : s.routes.map((r) => r.replace(/^app\//, '')).join(', ') || '(no route reaches it)';
    lines.push(`| ${cell(s.words)} | ${s.file}:${s.line} | ${s.kind} | ${s.state} | ${cell(s.when ?? '')} | ${cell(routes)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const list = sentences();
  const by = {};
  for (const s of list) by[s.kind.split(':')[0]] = (by[s.kind.split(':')[0]] ?? 0) + 1;
  const orphans = list.filter((s) => !s.routes.length).length;
  console.log(`${list.length} sentences (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}); ${orphans} in files no route reaches`);
  if (opt('--md')) fs.writeFileSync(opt('--md'), markdown(list));
  if (opt('--json')) fs.writeFileSync(opt('--json'), `${JSON.stringify(list, null, 2)}\n`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { TECH_PROPS, isWords, sentencesOf, sentences, stateOf, markdown };
