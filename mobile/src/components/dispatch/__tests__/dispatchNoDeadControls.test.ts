/**
 * dispatchNoDeadControls.test.ts — the Dispatch, step 3
 * ─────────────────────────────────────────────────────
 * Every control on this page does something.
 *
 * The paper components were drawn for a screenshot harness, where a
 * `PressableScale` with no `onPress` is correct: nothing is meant to happen. In
 * the app it is a dead end — a control that invites a tap and answers with
 * nothing, which is the single worst thing an interface can do to someone's
 * confidence in it. There were 42 of them the day these files became app code.
 *
 * ── HOW THE TAG IS READ, AND WHY NOT WITH A REGEX ──────────────────────────
 * NOT with a lazy match to the next `>`. A prop like `onPress={() => x}` has a
 * `>` inside its arrow function, so that pattern stops early and reports a wired
 * control as dead. An audit in this project did exactly that and produced two
 * false positives, and the same lazy-match mistake has cost this repo a scan
 * that declared all 71 styles in a file unused.
 *
 * So the tag is walked with brace, paren, bracket and quote depth, and it ends
 * where it really ends.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..', 'paper');
const TOUCHABLES = ['PressableScale', 'Pressable', 'TouchableOpacity'];

interface Tag { file: string; line: number; text: string; }

/** Every opening tag for `name` in `src`, with its full attribute list. */
function tagsOf(src: string, name: string, file: string): Tag[] {
  const out: Tag[] = [];
  const open = `<${name}`;
  let i = 0;
  while ((i = src.indexOf(open, i)) !== -1) {
    const after = src[i + open.length];
    // `<PressableScaleThing` is a different component, not this one.
    if (after && /[A-Za-z0-9_]/.test(after)) { i += open.length; continue; }

    let j = i + open.length;
    let brace = 0, paren = 0, bracket = 0;
    let quote: string | null = null;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (quote) { if (ch === quote && src[j - 1] !== '\\') quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket--;
      else if (ch === '>' && brace === 0 && paren === 0 && bracket === 0) break;
    }
    out.push({ file, line: src.slice(0, i).split('\n').length, text: src.slice(i, j + 1) });
    i = j + 1;
  }
  return out;
}

/**
 * The SCREENS too, not only the components.
 *
 * This scanned `paper/` alone, which is where the controls were DRAWN — and a
 * screen is perfectly capable of mounting its own `PressableScale`. Auditing
 * where a class of defect was first found, rather than everywhere it can occur,
 * is this project's most repeated mistake.
 */
const SCREENS = path.join(__dirname, '..', '..', '..', '..', 'app', 'dispatch');
const screenFiles = fs.existsSync(SCREENS)
  ? fs.readdirSync(SCREENS, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(SCREENS, f))
  : [];

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.tsx'));
const all: Tag[] = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const name of TOUCHABLES) all.push(...tagsOf(src, name, f));
}
for (const full of screenFiles) {
  const src = fs.readFileSync(full, 'utf8');
  const label = 'app/dispatch/' + path.relative(SCREENS, full).replace(/\\/g, '/');
  for (const name of TOUCHABLES) all.push(...tagsOf(src, name, label));
}

describe('the Dispatch has no dead controls', () => {
  it('found the controls at all — a scan that matches nothing passes everything', () => {
    // The guard on the guard. If the tag walker breaks, every assertion below
    // becomes vacuously true against an empty list.
    expect(files.length).toBeGreaterThanOrEqual(9);
    // And the screens were actually reached — an empty `screenFiles` would make
    // the whole extension above silently do nothing.
    expect(screenFiles.length).toBeGreaterThanOrEqual(3);
    expect(all.length).toBeGreaterThan(40);
  });

  it('every one declares an onPress', () => {
    const dead = all
      .filter((t) => !/\bonPress\b/.test(t.text))
      .map((t) => `${t.file}:${t.line}`);
    expect(dead).toEqual([]);
  });

  it('and every one announces what it IS to a screen reader', () => {
    // Not `expect(x.length).toBeLessThanOrEqual(all.length)`, which is what this
    // check said first and is true of every possible input — a vacuous assertion
    // is worse than none, because it looks like coverage.
    //
    // The sound version: every control declares a ROLE. Without one a reader
    // announces the contents and nothing about it being pressable, so an
    // icon-only control is a picture and a text control is a label. The role is
    // what makes it a button, a link, a tab or a radio.
    const roleless = all
      .filter((t) => !/accessibilityRole=/.test(t.text))
      .map((t) => `${t.file}:${t.line}`);
    expect(roleless).toEqual([]);
  });

  it('every declared hitSlop names all four sides', () => {
    // PressableScale already applies 15pt on EVERY side. A hitSlop that names
    // only some of them therefore does not add to the others — it REPLACES the
    // whole object and SHRINKS the target on the sides it left out. That is a
    // documented trap in this project: a partial value reads like "a bit more
    // room here" and is in fact "no room anywhere else".
    //
    // The reason a control names a hitSlop here is almost always to take the
    // horizontal component to ZERO, so an adjacent control does not lose the
    // touch to whichever sibling renders later. Naming all four is what makes
    // that intent explicit rather than accidental.
    const partial = all
      .filter((t) => /hitSlop=\{\{/.test(t.text))
      .filter((t) => {
        const sides = ['top', 'bottom', 'left', 'right'];
        return sides.some((s) => !new RegExp(`\\b${s}:`).test(t.text));
      })
      .map((t) => `${t.file}:${t.line}`);
    expect(partial).toEqual([]);
  });
});
