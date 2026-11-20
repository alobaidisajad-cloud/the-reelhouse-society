#!/usr/bin/env node
/**
 * transitions.cjs — how every move between screens is drawn, and every move left to chance.
 *
 *   node mockups/tools/transitions.cjs           each route and sheet with its motion, and each fault
 *   node mockups/tools/transitions.cjs --check   fails when a file holds more faults than its count in
 *                                                mockups/finish-record.json (a new file: none)
 *   node mockups/tools/transitions.cjs --lower   writes the counts that fell into the record
 *   node mockups/tools/transitions.cjs --json F  the whole map, as data
 *
 * Every move ends on a screen, so every move is drawn by the screen it opens: a route by its
 * navigator (a Stack.Screen's `animation`, or its Stack's `screenOptions.animation` for a route it
 * does not name), a tab by its Tabs' `screenOptions.animation`, a sheet by its Modal's
 * `animationType`. A fault is a move whose motion is nobody's choice: a navigator with no motion of
 * its own for the routes it leaves to it, a Tabs with none, a Modal with no animationType (React
 * Native then cuts, by default, not by decision). A cut the code names (`'none'`) is a choice.
 */
const fs = require('fs');
const path = require('path');
const { ts, appSources, routeSources, walk, lineOf, tagOf, attrOf, ratchet } = require('./source.cjs');

/** The object literal a JSX attribute holds (`screenOptions={{ … }}`), or null. */
function objectAttr(el, name) {
  const opening = ts.isJsxElement(el) ? el.openingElement : el;
  const a = opening.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
  const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null;
  return e && ts.isObjectLiteralExpression(e) ? e : null;
}

/** A string property of an object literal (`animation: 'none'`), or undefined. */
function stringProp(obj, key) {
  const p = obj?.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText() === key);
  if (!p) return undefined;
  return ts.isStringLiteral(p.initializer) ? p.initializer.text : `{${p.initializer.getText()}}`;
}

/** Each navigator one layout file draws: { kind: 'Stack' | 'Tabs', line, motion, screens: { name: motion } }. */
function navigatorsOf(src) {
  const out = [];
  walk(src.tree, (n) => {
    if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) return;
    const tag = tagOf(n);
    if (tag !== 'Stack' && tag !== 'Tabs') return;
    const screens = {};
    if (ts.isJsxElement(n)) walk(n, (c) => {
      if ((ts.isJsxSelfClosingElement(c) || ts.isJsxElement(c)) && tagOf(c) === `${tag}.Screen`) {
        const name = attrOf(c, 'name')?.value;
        if (typeof name === 'string') screens[name] = { motion: stringProp(objectAttr(c, 'options'), 'animation'), line: lineOf(src, c) };
      }
    });
    out.push({ kind: tag, line: lineOf(src, n), motion: stringProp(objectAttr(n, 'screenOptions'), 'animation'), screens });
  });
  return out;
}

/** The route's name in the navigator of the layout above it: `film/[id]`, `(tabs)`, `darkroom`. */
function routeNames(routeRels) {
  const layouts = routeRels.filter((r) => /\/_layout\.tsx$/.test(r)).map((r) => path.posix.dirname(r)).sort((a, b) => b.length - a.length);
  return routeRels.filter((r) => !/\/_layout\.tsx$/.test(r)).map((r) => {
    const dir = path.posix.dirname(r);
    const home = layouts.find((l) => dir === l || dir.startsWith(`${l}/`));
    return { route: r, layout: `${home}/_layout.tsx`, name: path.posix.relative(home, r).replace(/\.tsx$/, '') };
  }).concat(layouts.filter((l) => l !== 'app').map((l) => {
    // A group's own layout is a screen of the navigator above it, named by its folder.
    const up = layouts.find((u) => u !== l && l.startsWith(`${u}/`));
    return { route: `${l}/_layout.tsx`, layout: `${up}/_layout.tsx`, name: path.posix.relative(up, l) };
  }));
}

/** The whole map: each route's motion and whose choice it is, each sheet's, and every fault by file. */
function measure(routes = routeSources(), sources = appSources()) {
  const byRel = new Map(routes.map((s) => [s.rel, s]));
  const navs = new Map(routes.filter((s) => s.rel.endsWith('/_layout.tsx')).map((s) => [s.rel, navigatorsOf(s)]));
  const files = {};
  const fault = (file, why) => { files[file] = files[file] ?? { off: 0, offs: [] }; files[file].off += 1; files[file].offs.push(why); };
  const moves = [];
  for (const [layout, list] of navs) {
    for (const nav of list) if (!nav.motion) fault(layout, `${nav.line} <${nav.kind}>: no screenOptions.animation: the motion of every screen it does not name is left to the library`);
  }
  for (const { route, layout, name } of routeNames([...byRel.keys()])) {
    const nav = navs.get(layout)?.[0];
    if (!nav) { moves.push({ route, name, motion: null, by: `no navigator in ${layout}` }); continue; }
    const own = nav.screens[name]?.motion;
    moves.push({ route, name, motion: own ?? nav.motion ?? null, by: own ? `its ${nav.kind}.Screen` : nav.motion ? `its ${nav.kind}'s screenOptions` : 'nobody' });
  }
  const sheets = [];
  for (const src of sources) {
    walk(src.tree, (n) => {
      if ((!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) || tagOf(n) !== 'Modal') return;
      const a = attrOf(n, 'animationType');
      const motion = a ? (a.value ?? `{${a.source}}`) : null;
      sheets.push({ at: `${src.rel}:${lineOf(src, n)}`, motion });
      if (!motion) fault(src.rel, `${lineOf(src, n)} <Modal>: no animationType: it opens and closes with React Native's default cut, chosen by nobody`);
    });
  }
  return { moves, sheets, files };
}

function main(argv) {
  const m = measure();
  const at = argv.indexOf('--json');
  if (at >= 0) fs.writeFileSync(argv[at + 1], `${JSON.stringify(m, null, 2)}\n`);
  for (const mv of m.moves) console.log(`${mv.name.padEnd(32)} ${String(mv.motion ?? '—').padEnd(18)} ${mv.by}`);
  const named = m.sheets.filter((s) => s.motion).length;
  console.log(`\n${m.moves.length} routes; ${m.sheets.length} sheets (Modal), ${named} with their motion named`);
  for (const [f, c] of Object.entries(m.files)) console.log(`${f}\n  ${c.offs.join('\n  ')}`);
  return ratchet('transitions', m.files, argv, 'moves whose motion nobody chose');
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { navigatorsOf, routeNames, measure };
