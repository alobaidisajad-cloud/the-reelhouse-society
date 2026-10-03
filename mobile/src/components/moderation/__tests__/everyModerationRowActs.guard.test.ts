/**
 * everyModerationRowActs.guard.test.ts — a BLOCK or MUTE row does what it says.
 * ─────────────────────────────────────────────────────────────────────────────
 * ContentActionSheet blocks and mutes nobody itself: it calls the handlers its
 * screen gives it. The Dispatch reader's BLOCK closed the sheet and went back,
 * and never blocked the author; its MUTE row only closed the sheet. A member
 * who blocked someone abusive was told nothing and stayed reachable.
 *
 * So every screen that opens the sheet is read: each onBlock must call
 * blockUser, each onMute muteUser, each onUnblock unblockUser and each onUnmute
 * unmuteUser. A render test sees one screen; this sees every one.
 */
import { readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import { readCode } from '@/test-utils/readCode';

const ROOT = join(__dirname, '..', '..', '..', '..');

const ACTS: Record<string, string> = { onBlock: 'blockUser', onMute: 'muteUser', onUnblock: 'unblockUser', onUnmute: 'unmuteUser' };

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/** The text of a `prop={…}` value, its braces balanced. */
function propBody(element: string, prop: string): string | null {
  const at = element.search(new RegExp(`\\b${prop}=\\{`));
  if (at < 0) return null;
  let depth = 0;
  for (let i = element.indexOf('{', at); i < element.length; i++) {
    if (element[i] === '{') depth++;
    if (element[i] === '}' && --depth === 0) return element.slice(element.indexOf('{', at) + 1, i);
  }
  return null;
}

/** Each `<ContentActionSheet … />` in a file, as text. */
function sheetsIn(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/<ContentActionSheet\b/g)) {
    let depth = 0;
    for (let i = m.index!; i < code.length; i++) {
      if (code[i] === '{') depth++;
      if (code[i] === '}') depth--;
      if (depth === 0 && code.startsWith('/>', i)) { out.push(code.slice(m.index!, i + 2)); break; }
    }
  }
  return out;
}

describe('every BLOCK and MUTE row does what it says', () => {
  const files = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))];
  const found: { at: string; element: string }[] = [];
  for (const f of files) {
    const code = readCode(f);
    if (!code.includes('<ContentActionSheet')) continue;
    for (const element of sheetsIn(code)) found.push({ at: relative(ROOT, f).split(sep).join('/'), element });
  }

  it('finds every screen that opens the sheet', () => {
    expect(found.map((s) => s.at).sort()).toEqual(expect.arrayContaining([
      'app/dispatch/[id].tsx', 'app/log/[id].tsx', 'app/stacks/[id].tsx', 'app/user/[username].tsx',
    ]));
  });

  it('each handler a sheet is given performs its act', () => {
    const dead: string[] = [];
    for (const { at, element } of found) {
      for (const [prop, act] of Object.entries(ACTS)) {
        const body = propBody(element, prop);
        if (body !== null && !new RegExp(`\\b${act}\\(`).test(body)) dead.push(`${at}: ${prop} does not call ${act}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('reads a handler that does nothing as dead', () => {
    const element = '<ContentActionSheet onBlock={() => { setOpen(false); nav.back(); }} onMute={() => { muteUser(id); }} />';
    expect(propBody(element, 'onBlock')).not.toMatch(/\bblockUser\(/);
    expect(propBody(element, 'onMute')).toMatch(/\bmuteUser\(/);
    expect(sheetsIn(`x ${element} y`)).toEqual([element]);
  });
});
