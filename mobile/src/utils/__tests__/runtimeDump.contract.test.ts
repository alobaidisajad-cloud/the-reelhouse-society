/**
 * runtimeDump.contract.test.ts — the list of what the phone lacks is checked
 * against the phone's own runtime, not against memory.
 * ─────────────────────────────────────────────────────────────────────────────
 * The sealed E2E build writes, on its first screen, the own property names of
 * the global object and of each built-in the app touches (src/utils/e2eRuntime.ts):
 * Hermes with React Native's polyfills and the app's own. The run fails unless
 * that is the committed copy (e2e/runtime-dump.mjs). Here the copy is compared
 * with Node, which jest runs on: every name Node has and the phone lacks, used
 * anywhere in app/ or src/, must be in src/utils/runtimeLacks.json, which
 * jest.setup.ts takes away and runtimeLacks.guard.test.ts finds; and every entry
 * of that list must be one the phone truly lacks.
 *
 * Until a run has written the copy, the register holds that as pending on the
 * class (RUNTIME-api-missing-on-phone), and this says so by name; once the copy
 * is committed, the pending note must go.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MOBILE } from '@/test-utils/readCode';
import { apiFor, appSources, namesOnNode, programFor, readList, unlisted, type Source } from '@/test-utils/runtimeLacks';
import { runtimeNames } from '@/src/utils/e2eRuntime';

const COPY_FILE = 'e2e/runtime/phone-runtime.json';
const COPY: Record<string, string[] | null> | null = existsSync(join(MOBILE, COPY_FILE))
  ? JSON.parse(readFileSync(join(MOBILE, COPY_FILE), 'utf8')) : null;
const LIST = readList();
const NODE = namesOnNode(runtimeNames.toString(), LIST.reads);

const { readCommitted } = require('../../../scripts/register.cjs') as { readCommitted: () => { classes: Record<string, unknown>[] } };
const CLASS = readCommitted().classes.find((c) => c.id === 'RUNTIME-api-missing-on-phone');

it('Node, read by the very function the phone runs, answers for every built-in the dump reads', () => {
  expect(Object.keys(NODE)).toEqual(LIST.reads);
  expect(LIST.reads.filter((r) => !NODE[r]?.length)).toEqual([]);
  expect(NODE.AbortSignal).toEqual(expect.arrayContaining(['timeout', 'any']));
});

it('the phone\'s runtime is committed — or the register holds it as pending, by name', () => {
  expect(CLASS).toBeDefined();
  if (COPY) {
    expect(CLASS?.pending).toBeUndefined();
    expect(Object.keys(COPY).sort()).toEqual([...LIST.reads].sort());
  } else {
    expect(String(CLASS?.pending ?? '')).toContain(COPY_FILE);
  }
});

it('every API the list names, the phone lacks and Node has', () => {
  for (const { api } of LIST.lacks) {
    const [target, name] = api.startsWith('globalThis.') ? ['globalThis', api.slice(11)]
      : api.includes('.prototype.') ? [api.split('.').slice(0, 2).join('.'), api.split('.')[2]] : api.split('.');
    expect(`${api} on Node: ${NODE[target]?.includes(name)}`).toBe(`${api} on Node: true`);
    if (COPY) expect(`${api} on the phone: ${!!COPY[target]?.includes(name)}`).toBe(`${api} on the phone: false`);
  }
  if (!COPY) expect(String(CLASS?.pending ?? '')).toContain(COPY_FILE);
});

it('a name Node has and the phone lacks is used nowhere in app/ or src/ that the list does not name', () => {
  if (!COPY) { expect(String(CLASS?.pending ?? '')).toContain(COPY_FILE); return; }
  expect(unlisted(NODE, COPY, LIST.lacks, appSources(), programFor)
    .map((u) => `${u.file}:${u.line} ${u.api} — ${u.code}`)).toEqual([]);
});

describe('the comparison says NO', () => {
  // The phone as Node, less what is planted as lacking.
  const less = (gone: Record<string, string[]>) => Object.fromEntries(Object.entries(NODE)
    .map(([t, names]) => [t, (names ?? []).filter((n) => !(gone[t] ?? []).includes(n))]));
  const plant = (text: string): Source[] => [{ file: 'app/planted.tsx', text }];

  it('to a use of a static, a global or a method the phone lacks, until the list names it', () => {
    const phone = less({ Promise: ['withResolvers'], globalThis: ['structuredClone'], 'String.prototype': ['isWellFormed'] });
    const text = 'const r = Promise.withResolvers(); const c = structuredClone(x); const ok = name.isWellFormed();';
    expect(unlisted(NODE, phone, LIST.lacks, plant(text)).map((u) => u.api).sort())
      .toEqual(['Promise.withResolvers', 'String.prototype.isWellFormed', 'globalThis.structuredClone']);
    const listed = [...LIST.lacks, ...['Promise.withResolvers', 'globalThis.structuredClone', 'String.prototype.isWellFormed']
      .map((api) => ({ api, read: 'planted' }))];
    expect(unlisted(NODE, phone, listed, plant(text))).toEqual([]);
    // Lacked, but used nowhere: nothing to say.
    expect(unlisted(NODE, phone, LIST.lacks, plant('const r = 1;'))).toEqual([]);
  });

  it('to a lack the phone has not got at all: the whole built-in missing', () => {
    const phone = { ...NODE, URLSearchParams: null };
    expect(unlisted(NODE, phone, LIST.lacks, plant('const has = URLSearchParams.prototype; const q = URLSearchParams.length;'))
      .map((u) => u.api)).toContain(apiFor('URLSearchParams', 'length'));
  });
});
