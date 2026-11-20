#!/usr/bin/env node
/**
 * image-weight.cjs — the images the app ships, and the size of every image it asks the catalogue for.
 *
 *   node mockups/tools/image-weight.cjs [--json FILE]
 *
 * From the app's code (source.cjs):
 *   shipped  every picture a file of the app's own requires (`require('…/x.png')`): its bytes on
 *            disk, which the bundle carries; the sum is the app's own image weight
 *   asked    every size the code asks TMDB's image server for (`w185`, `original` …: a size handed
 *            to a URL or a helper as written), each with its file and line, counted by size; a size
 *            worked out in code (a ternary over the screen's density) is named as written
 * What a screen downloads when it opens is the lab's to measure (e2e/lab/feel.sh, `bytes`); this is
 * what the code decides before any screen opens. Pictures from the member (an avatar, a salon's
 * cover) are sized where they are uploaded, not here.
 */
const fs = require('fs');
const path = require('path');
const { ts, appSources, walk, lineOf } = require('./source.cjs');

const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
/** A TMDB image size as its server names it. */
const SIZE = /^(w\d{2,4}|h\d{2,4}|original)$/;
const IN_URL = /image\.tmdb\.org\/t\/p\/(w\d{2,4}|h\d{2,4}|original)\b/;

function measure(sources = appSources()) {
  const shipped = new Map();
  const asked = [];
  for (const src of sources) {
    walk(src.tree, (n) => {
      if (ts.isCallExpression(n) && n.expression.getText() === 'require' && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && PICTURE.test(n.arguments[0].text)) {
        const f = path.resolve(path.dirname(src.abs), n.arguments[0].text);
        if (fs.existsSync(f)) shipped.set(path.relative(path.join(__dirname, '..', '..'), f).split(path.sep).join('/'), fs.statSync(f).size);
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        const t = n.text;
        const size = SIZE.test(t) ? t : IN_URL.exec(t)?.[1];
        if (size) asked.push({ size, at: `${src.rel}:${lineOf(src, n)}` });
      }
    });
  }
  const bySize = {};
  for (const a of asked) bySize[a.size] = (bySize[a.size] ?? 0) + 1;
  const files = Object.fromEntries([...shipped].sort());
  return { shipped: { bytes: Object.values(files).reduce((a, b) => a + b, 0), files }, asked: { bySize, sites: asked } };
}

function main(argv) {
  const m = measure();
  const i = argv.indexOf('--json');
  if (i >= 0) fs.writeFileSync(argv[i + 1], `${JSON.stringify(m, null, 2)}\n`);
  console.log(`shipped: ${Object.keys(m.shipped.files).length} pictures, ${m.shipped.bytes} bytes`);
  console.log(`asked of TMDB: ${Object.entries(m.asked.bySize).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { measure, SIZE, IN_URL };
