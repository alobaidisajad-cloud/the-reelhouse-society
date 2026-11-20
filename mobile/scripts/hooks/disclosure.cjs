#!/usr/bin/env node
/**
 * disclosure.cjs — no commit message or test title in a push describes an open hole in public.
 *
 *   node scripts/hooks/disclosure.cjs <base> <commit>
 *
 * Reads every commit message from <base> to <commit>, and every test title those commits add (an
 * it/test/describe line added to a *.test.ts(x) file). Refuses, naming each:
 *   - a word or phrase that describes a hole (HOLE: an exploit, a bypass, an injection, a leak of a
 *     password or key, a takeover...);
 *   - four words in a row from the private register (mobile/audit/final/private: the private classes'
 *     titles and fixes), unless the public register says them too, as ordinary phrasing.
 * The private half is read from the main checkout's folder; where there is none it says so and
 * checks the words alone. Exits 1 on any finding.
 */
const { execFileSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const MOBILE = join(ROOT, 'mobile');

/** What describes a hole, in any public text. */
const HOLE = /\b(exploit(?:able|ed|s)?|vulnerab\w*|bypass(?:es|ed|ing)?|privilege escalation|escalat\w* (?:a |his |her |their )?privileges?|injection|xss|csrf|ssrf|rce|takeover|backdoor|security hole|open hole|unauthenticated access|cve-\d{4}-\d+|leak(?:s|ed|ing)? (?:the |a |any |every )?(?:password|token|key|secret|session|email)s?)\b/i;

/** A text's runs of four words, lower case, letters and digits only. */
const fours = (text) => {
  const words = String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set();
  for (let i = 0; i + 4 <= words.length; i++) out.add(words.slice(i, i + 4).join(' '));
  return out;
};

/**
 * Each finding in these texts ({ where, text }): a hole's word, or four words of the private register
 * the public one does not also say.
 */
const findings = (texts, privateText, publicText) => {
  const quoted = fours(privateText);
  for (const f of fours(publicText)) quoted.delete(f);
  return texts.flatMap(({ where, text }) => {
    const hole = HOLE.exec(text);
    const said = [...fours(text)].find((f) => quoted.has(f));
    return [
      ...(hole ? [`${where} names a hole: "${hole[0]}"`] : []),
      ...(said ? [`${where} says four words of the private register: "${said}"`] : []),
    ];
  });
};

/** The titles a diff adds to test files: the string an added it/test/describe line opens with. */
const titlesAdded = (diff) => {
  const out = [];
  let file = '';
  for (const line of String(diff).split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    if (!/\.test\.tsx?$/.test(file) || !line.startsWith('+')) continue;
    const m = /\b(?:it|test|describe)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(line);
    if (m) out.push({ where: `${file}: a test title`, text: m[2] });
  }
  return out;
};

/** The private register's titles and fixes, from the main checkout's private folder, or null. */
const privateRegister = () => {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8' }).trim();
  const file = join(common, '..', 'mobile', 'audit', 'final', 'private', 'register.private.yaml');
  if (!existsSync(file)) return null;
  const yaml = require(require.resolve('yaml/package.json', { paths: [MOBILE] }).replace(/package\.json$/, 'dist/index.js'));
  return (yaml.parse(readFileSync(file, 'utf8')).classes ?? []).map((c) => `${c.title ?? ''}\n${c.fix ?? ''}`).join('\n');
};

if (require.main === module) {
  const [base, commit] = process.argv.slice(2);
  if (!base || !commit) { console.error('usage: disclosure.cjs <base> <commit>'); process.exit(2); }
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const messages = git('log', '--format=%H%x00%B%x1e', `${base}..${commit}`).split('\x1e').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [hash, text] = s.split('\x00'); return { where: `commit ${hash.slice(0, 8)}'s message`, text }; });
  const titles = titlesAdded(git('diff', '--no-color', '-U0', `${base}..${commit}`, '--', '*.test.ts', '*.test.tsx'));
  const priv = privateRegister();
  if (priv === null) console.log('No private register in this checkout: the words alone are checked.');
  const found = findings([...messages, ...titles], priv ?? '', readFileSync(join(MOBILE, 'register', 'classes.yaml'), 'utf8'));
  for (const f of found) console.log(`✗ ${f}`);
  console.log(`${messages.length} commit messages and ${titles.length} test titles read: ${found.length ? `${found.length} would say too much in public` : 'none describes a hole'}`);
  process.exit(found.length ? 1 : 0);
}

module.exports = { HOLE, findings, fours, titlesAdded };
