/**
 * TOUCH WEIGHTS — every control a slip on costs something, and whether it says so.
 * ──────────────────────────────────────────────────────────────────────────
 * DECISIONS 4: a control that destroys, commits or spends, or is the way out, carries a `touch`
 * weight on PressableScale, which grows its own box to 48. This reads every PressableScale (and
 * ActionBtn, which passes `touch` through) in the app's code with the TypeScript parser and names
 * each one's label as written and its weight. aSlipThatCostsHasItsRoom.test.ts holds the list
 * in mockups/touch-weighted.txt to it, so no site loses its weight unseen.
 *
 *   node mockups/tools/touch-weights.cjs           prints the weighted sites
 *   node mockups/tools/touch-weights.cjs --write   writes them to mockups/touch-weighted.txt
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { files, rel, MOBILE } = require('../../test-utils/universe');

const LIST = path.join(MOBILE, 'mockups', 'touch-weighted.txt');
/** The tags whose `touch` is a control's weight. */
const TAGS = new Set(['PressableScale', 'ActionBtn']);
/** Labels that begin with one of these words name a control a slip on costs something. */
const WORDS = /^(Back|Go back|Close|Cancel|Withdraw|Report|Remove|Delete|Decline|Admit|Ban|Suspend|Exile|Dismiss|Warn|File|Amend|Send|Save|Restore|Join|Subscribe|Buy|Purchase|Request|Keep the draft|Take the draft|Discard|Sign out|Block|Unblock)\b/i;

/** The label as written: a string's words, a template's words up to its first `${`, else the code on one line. */
function labelOf(init, sf) {
  if (!init) return '';
  if (ts.isStringLiteral(init)) return init.text;
  const e = ts.isJsxExpression(init) ? init.expression : init;
  if (!e) return '';
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return `${e.head.text}…`;
  return `{${e.getText(sf).replace(/\s+/g, ' ')}}`;
}

/** Every control site: `{ file, line, label, weight }` (weight '' when it has none). */
function sites() {
  const out = [];
  for (const abs of files('appCode', { ext: ['.tsx'] })) {
    const text = fs.readFileSync(abs, 'utf8');
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && TAGS.has(n.tagName.getText(sf))) {
        const attr = (name) => n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === name);
        const label = attr('accessibilityLabel') || attr('label');
        const touch = attr('touch');
        out.push({
          file: rel(abs),
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          label: labelOf(label && label.initializer, sf),
          weight: touch ? labelOf(touch.initializer, sf) : '',
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** A site as the list writes it. */
const lineOf = (s) => `${s.file} · ${s.label} · ${s.weight}`;

/** The list's lines (comments and blanks left out). */
function listed() {
  return fs.readFileSync(LIST, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
}

const HEAD = [
  '# Every control that carries a touch weight (DECISIONS 4; PressableScale `touch`): <file> · <label as written> · <weight>.',
  '# aSlipThatCostsHasItsRoom.test.ts fails when a weighted site is not listed here, or a line here is no longer a',
  '# weighted site. Written by `node mockups/tools/touch-weights.cjs --write`; read the diff before committing it.',
  '',
];

module.exports = { sites, lineOf, listed, WORDS, LIST };

if (require.main === module) {
  const lines = sites().filter((s) => s.weight).map(lineOf).sort();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(LIST, [...HEAD, ...lines, ''].join('\n'));
    console.log(`${lines.length} weighted sites written to ${rel(LIST)}`);
  } else console.log(lines.join('\n'));
}
