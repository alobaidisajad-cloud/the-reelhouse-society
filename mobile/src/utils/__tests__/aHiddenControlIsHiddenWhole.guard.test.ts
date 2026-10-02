/**
 * aHiddenControlIsHiddenWhole.guard.test.ts — a pressable kept from screen
 * readers is kept from them whole.
 *
 * Six sheets' backdrops were `accessible={false} importantForAccessibility="no"`:
 * off the iOS tree, but on Android "no" hides only the view, not what it holds,
 * and the screen capture read each as a full-screen control with no name. The
 * house form is "no-hide-descendants" (the Concierge's backdrop): the backdrop
 * closes the sheet for a finger, and a screen reader has the sheet's named Close.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const files = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', '.expo'].includes(e.name)) files(full, out);
    } else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
};

/** Every opening tag of a pressable, read to its closing `>` at brace depth 0. */
export function pressableTags(src: string): string[] {
  const tags: string[] = [];
  const open = /<(Pressable|PressableScale)\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

const halfHidden = (tag: string) =>
  /accessible=\{false\}/.test(tag) && /importantForAccessibility="no"/.test(tag);

it('reads a tag whole, arrow functions and all', () => {
  const [tag] = pressableTags('<PressableScale onPress={() => a > b} accessible={false} importantForAccessibility="no"><View /></PressableScale>');
  expect(halfHidden(tag)).toBe(true);
  expect(halfHidden(pressableTags('<Pressable accessible={false} importantForAccessibility="no-hide-descendants" />')[0])).toBe(false);
});

it('no pressable in the app is hidden by halves', () => {
  const found: string[] = [];
  const all = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))];
  expect(all.length).toBeGreaterThan(200); // the app was read, so none found means none
  for (const f of all) {
    const src = readFileSync(f, 'utf8');
    if (!src.includes('importantForAccessibility="no"')) continue;
    for (const tag of pressableTags(src)) {
      if (halfHidden(tag)) found.push(`${f.slice(ROOT.length + 1)}: ${tag.slice(0, 60)}…`);
    }
  }
  expect(found).toEqual([]);
});
