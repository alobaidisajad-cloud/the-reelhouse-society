/**
 * runtimeLacks.guard.test.ts — no line of the app calls a JavaScript API the
 * phone's runtime lacks, whether or not a test runs that line.
 * ─────────────────────────────────────────────────────────────────────────────
 * On build 41 every visit to the Dispatch said "The paper could not be reached":
 * withTimeout called AbortSignal.timeout, which Hermes does not have, and every
 * read threw before it was sent. jest runs on Node, which has it, and passed.
 * jest.setup.ts now takes each such API away (so a line a test runs fails as on
 * the phone), and this reads EVERY line of app/ and src/ for them, from the one
 * list both use: src/utils/runtimeLacks.json. Where each lack was read is in the
 * list; runtimeDump.contract.test.ts holds the list to the phone's own runtime.
 * On SDK 57 the phone has AbortSignal.timeout and any; what its runtime lacks
 * that Node has is the list now (Array.prototype.toSorted, Object.groupBy, …).
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { MOBILE, readCode } from '@/test-utils/readCode';
import { appSources, findUses, parseApi, programFor, readList, type Source } from '@/test-utils/runtimeLacks';
import { removeWhatThePhoneLacks } from '@/test-utils/asOnThePhone';

const LIST = readList();
const APIS = LIST.lacks.map((l) => l.api);

it('the list: each entry an API in one of the three shapes, read on a built-in the phone\'s dump reads, and says where its lack was read', () => {
  expect(APIS.length).toBeGreaterThanOrEqual(2);
  expect(APIS.filter((a, i) => APIS.indexOf(a) !== i)).toEqual([]);
  for (const l of LIST.lacks) {
    const api = parseApi(l.api);
    const on = api.shape === 'global' ? 'globalThis' : api.shape === 'prototype' ? `${api.owner}.prototype` : api.owner;
    expect(`${l.api}: read on ${on} ${LIST.reads.includes(on)}`).toBe(`${l.api}: read on ${on} true`);
    expect(`${l.api}: ${l.read.length > 40 ? 'says where' : 'SAYS NOT WHERE'}`).toBe(`${l.api}: says where`);
  }
});

it('no file in app/ or src/ uses an API the phone lacks', () => {
  const sources = appSources();
  // It read the app: a walker that found nothing would pass on nothing.
  expect(sources.length).toBeGreaterThan(300);
  expect(sources.some((s) => s.file === 'src/utils/withTimeout.ts')).toBe(true);
  expect(findUses(sources, APIS, programFor)).toEqual([]);
});

describe('the finder says NO', () => {
  const real = (file: string): Source => ({ file, text: readFileSync(join(MOBILE, file), 'utf8') });
  const where = (sources: Source[], apis = APIS) => findUses(sources, apis).map((u) => `${u.file}:${u.api}`);

  it('to AbortSignal.abort written into withTimeout.ts', () => {
    const now = real('src/utils/withTimeout.ts');
    expect(now.text).toContain('const controller = new AbortController();');
    const written = { ...now, text: now.text.replace('const controller = new AbortController();', 'const signal = AbortSignal.abort();') };
    expect(where([now])).toEqual([]);
    expect(where([written])).toEqual(['src/utils/withTimeout.ts:AbortSignal.abort']);
  });

  it('to Object.groupBy planted in a screen no test runs', () => {
    const screen = real('app/+not-found.tsx');
    const planted = { ...screen, text: `${screen.text}\nexport const byKind = (xs: { kind: string }[]) => Object.groupBy(xs, (x) => x.kind);\n` };
    expect(where([planted])).toEqual(['app/+not-found.tsx:Object.groupBy']);
  });

  it('to every way of reaching a static, and to none of what only looks like one', () => {
    const plant = (text: string): Source[] => [{ file: 'src/planted.ts', text }];
    for (const text of [
      'AbortSignal["abort"]()', '(AbortSignal as any).abort()', 'globalThis.Object.groupBy([], f)',
      'const { abort } = AbortSignal;', 'const { groupBy: byKey } = Object;', 'AbortSignal?.abort?.()',
    ]) expect(`${text} → ${where(plant(text)).length}`).toBe(`${text} → 1`);
    for (const text of [
      'function f(signal: AbortSignal) { return signal.aborted; }', 'const t = request.abort;',
      'const AbortSignal = { abort: () => 1 }; AbortSignal.abort();', '// AbortSignal.abort()',
      'const s = "AbortSignal.abort";',
    ]) expect(`${text} → ${where(plant(text)).length}`).toBe(`${text} → 0`);
  });

  it('to a global and to a method of a kind, where the type says it is that kind', () => {
    const plant = (text: string): Source[] => [{ file: 'src/planted.ts', text }];
    const global = ['globalThis.structuredClone'];
    expect(where(plant('const c = structuredClone(x);'), global)).toHaveLength(1);
    expect(where(plant('const c = globalThis.structuredClone(x);'), global)).toHaveLength(1);
    expect(where(plant('import { structuredClone } from "x"; structuredClone(1);'), global)).toHaveLength(0);
    expect(where(plant('const o = { structuredClone: 1 }; o.structuredClone;'), global)).toHaveLength(0);
    // A method: every name that matches, until a program says what kind the value is.
    const method = ['String.prototype.isWellFormed'];
    const text = 'const a = "x".isWellFormed(); const b = other.isWellFormed();';
    expect(where(plant(text), method)).toHaveLength(2);
    const inMemory = (sources: Source[]) => (files: string[]) => {
      const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2024.d.ts'], strict: false, noEmit: true };
      const host = ts.createCompilerHost(options);
      const read = host.getSourceFile;
      host.getSourceFile = (name, version) => {
        const s = sources.find((x) => join(MOBILE, x.file).split('\\').join('/') === name.split('\\').join('/'));
        return s ? ts.createSourceFile(name, s.text, version) : read(name, version);
      };
      return ts.createProgram(files.map((f) => join(MOBILE, f)), options, host);
    };
    const typed = [{ file: 'src/planted.ts', text: 'declare const other: { isWellFormed(): boolean };\n' + text }];
    expect(findUses(typed, method, inMemory(typed)).map((u) => u.code)).toEqual([text]);
    expect(findUses(typed, method, inMemory(typed))).toHaveLength(1);
  });
});

describe('jest takes away exactly the list, as the phone lacks it', () => {
  it('each entry is there on Node, and gone in the tests\' engine', () => {
    const onNode = spawnSync(process.execPath, ['-e',
      `const at = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), globalThis);
       console.log(JSON.stringify(${JSON.stringify(APIS)}.map((a) => typeof at(a.replace(/^globalThis\\./, '')))));`], { encoding: 'utf8' });
    expect(JSON.parse(onNode.stdout)).toEqual(APIS.map(() => 'function'));
    const here = (a: string) => a.replace(/^globalThis\./, '').split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), globalThis);
    expect(APIS.map((a) => `${a}: ${typeof here(a)}`)).toEqual(APIS.map((a) => `${a}: undefined`));
  });

  it('the remover touches what it is given and nothing else', () => {
    const fake = {
      Signal: { timeout: () => 1, any: () => 2, abort: () => 3 },
      Text: { prototype: { isWellFormed: () => true, trim: () => '' } },
      clone: () => 0, keep: () => 0,
    };
    const removed = removeWhatThePhoneLacks(
      [{ api: 'Signal.timeout' }, { api: 'Text.prototype.isWellFormed' }, { api: 'globalThis.clone' }, { api: 'Gone.away' }], fake as never);
    expect(removed).toEqual(['Signal.timeout', 'Text.prototype.isWellFormed', 'globalThis.clone']);
    expect([fake.Signal.timeout, fake.Text.prototype.isWellFormed, fake.clone]).toEqual([undefined, undefined, undefined]);
    expect([typeof fake.Signal.any, typeof fake.Signal.abort, typeof fake.Text.prototype.trim, typeof fake.keep])
      .toEqual(['function', 'function', 'function', 'function']);
  });

  it('jest.setup.ts gives it the list from runtimeLacks.json, and takes nothing away by hand', () => {
    const setup = readCode('jest.setup.ts');
    expect(setup).toMatch(/import runtime from '\.\/src\/utils\/runtimeLacks\.json';/);
    expect(setup).toMatch(/removeWhatThePhoneLacks\(runtime\.lacks\);/);
    // No second list beside it: no built-in the dump reads has a member defined away here.
    const byHand = LIST.reads.filter((r) => r !== 'globalThis')
      .filter((r) => new RegExp(`defineProperty\\(\\s*${r.replace('.', '\\.')}\\b`).test(setup));
    expect(byHand).toEqual([]);
  });
});
