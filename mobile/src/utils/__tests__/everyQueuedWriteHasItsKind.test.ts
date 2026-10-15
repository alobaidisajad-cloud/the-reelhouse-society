/**
 * everyQueuedWriteHasItsKind.test.ts — every write the app queues has a kind
 * in the typed map ('words', 'record' or 'toggle'), which decides whether it is
 * kept for its member or lets lapse when their session ends elsewhere.
 *
 * The map is a Record over the queue's type union, so the compiler refuses a
 * type with no kind. This sweep holds the other end: every `enqueueMutation(`
 * call site in the app is found, the types it can queue are read from it, and
 * each must be in the map. A call site whose type cannot be read fails too, so
 * a new one is looked at rather than passed.
 */
import { relative } from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import { QUEUED_WRITE_KIND, WORDS_NOUN } from '../queueOwnership';

/** The text between a call's parentheses, from the `(` at `open`. */
function argumentsAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced call');
}

const union = (() => {
  const queue = readCode('src/utils/offlineQueue.ts');
  const start = queue.indexOf('type:');
  return new Set([...queue.slice(start, queue.indexOf(';', start)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
})();

/** The queue types one call's arguments can name: a bare `type: '…'`, or any union member. */
function typesIn(args: string): string[] {
  const named = new Set<string>();
  for (const m of args.matchAll(/\btype:\s*'([a-z_]+)'\s*[,}]/g)) named.add(m[1]);
  for (const m of args.matchAll(/'([a-z_]+)'/g)) if (union.has(m[1])) named.add(m[1]);
  return [...named];
}

const sites: { where: string; types: string[] }[] = [];
for (const file of universe('appCode')) {
  const src = readCode(file);
  const where = relative(MOBILE, file).replace(/\\/g, '/');
  if (where === 'src/utils/offlineQueue.ts') continue; // the definition
  for (const m of src.matchAll(/\benqueueMutation\(/g)) {
    const open = m.index! + m[0].length - 1;
    const args = argumentsAt(src, open).trim();
    if (/^\w+$/.test(args)) {
      // A write handed in by a wrapper: each call of that wrapper is a site.
      const before = src.slice(0, m.index);
      const wrapper = [...before.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].pop()?.[1];
      if (!wrapper) {
        sites.push({ where: `${where} (${args})`, types: [] });
        continue;
      }
      for (const w of src.matchAll(new RegExp(`\\b${wrapper}\\(`, 'g'))) {
        if (src.slice(w.index! - 9, w.index).includes('function')) continue;
        sites.push({ where: `${where} (${wrapper})`, types: typesIn(argumentsAt(src, w.index! + wrapper.length)) });
      }
    } else {
      sites.push({ where, types: typesIn(args) });
    }
  }
}

describe('every queued write has its kind', () => {
  it('the map names every type of the queue, and nothing else', () => {
    expect(union.size).toBeGreaterThan(40);
    expect(new Set(Object.keys(QUEUED_WRITE_KIND))).toEqual(union);
  });

  it('found the call sites (a parse that finds none would pass everything)', () => {
    expect(sites.length).toBeGreaterThan(35);
  });

  it('every call site queues a type that can be read from it', () => {
    expect(sites.filter((s) => s.types.length === 0).map((s) => s.where)).toEqual([]);
  });

  it('every type a call site queues has its kind in the map', () => {
    const missing = sites.flatMap((s) => s.types
      .filter((t) => !(t in QUEUED_WRITE_KIND))
      .map((t) => `${s.where}: ${t}`));
    expect(missing).toEqual([]);
  });

  it('the member is told what each kind of their own words is', () => {
    const words = Object.entries(QUEUED_WRITE_KIND).filter(([, k]) => k === 'words').map(([t]) => t);
    expect(words.length).toBeGreaterThan(0);
    expect(words.filter((t) => !WORDS_NOUN[t as keyof typeof WORDS_NOUN])).toEqual([]);
  });
});
