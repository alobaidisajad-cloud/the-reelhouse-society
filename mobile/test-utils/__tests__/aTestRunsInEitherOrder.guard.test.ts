/**
 * aTestRunsInEitherOrder.guard.test.ts — a test passes whichever of its file's tests ran before it.
 *
 * The nightly runs each file's tests in a random order, and from 2026-11-13 to -24 it was red every
 * night on seven files whose tests passed only in the order they were written: a mock's answer, a
 * store's memory, a kept draft or the window's text size, left by one test, broke another. Each had
 * landed green, since every run on a push went forwards, and the nightly met it days later. Now:
 *
 *   1. The environment (test-utils/timerCheckingEnvironment.js) runs each block's tests and blocks
 *      last to first when JEST_BACKWARDS=1, and CI runs the suite so in every zone but UTC's
 *      (ciWorkflows.guard holds the workflow to it): every two tests of a file run in both orders on
 *      every push. Proved by running jest on orderFixtures/, as aFileEndsWithNoTimerWaiting does.
 *   2. Reversing misses a state put back only in one block's hooks and read in another block: in
 *      both orders the block's own hooks ran between (aFilmIsKeptAsItsPageDrawsIt's region, its
 *      first block's to put back, read by the second). So a file's `mock…` state that a hook puts
 *      back anywhere is put back by a hook of the file itself, for every block.
 *   3. Every test begins with no member's draft on the phone (jest.afterEnv.ts), its prefix the one
 *      memberDrafts writes.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { files as universe } from '@/test-utils/universe';
import { MOBILE } from '@/test-utils/readCode';
import { DRAFT_PREFIX } from '@/src/utils/memberDrafts';

// Worktrees in this checkout hold copies of the fixtures; the hooks' own pattern leaves them out.
const { ignored } = require('../../scripts/hooks/pre-push.cjs') as { ignored: (mobile: string) => string[] };
const { backwards } = require('../timerCheckingEnvironment') as { backwards: (block: { children: unknown[] }) => void };

/** The fixtures run by jest itself, with this project's config, forwards or backwards. */
function runFixtures(backwardsToo: boolean): { status: string; failed: string[] } {
  const run = spawnSync(
    process.execPath,
    [require.resolve('jest/bin/jest'), '--ci', '--json', '--coverage=false', '--testMatch', '**/orderFixtures/*.fixture.ts',
      '--testPathIgnorePatterns', ...ignored(MOBILE), '--', 'orderFixtures'],
    { cwd: MOBILE, encoding: 'utf8', timeout: 150_000, env: { ...process.env, JEST_BACKWARDS: backwardsToo ? '1' : '' } },
  );
  const report = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))) as {
    testResults: { status: string; assertionResults: { title: string; status: string }[] }[];
  };
  const [file] = report.testResults;
  if (!file) throw new Error(`jest ran no fixture: ${run.stderr.slice(-400)}`);
  return { status: file.status, failed: file.assertionResults.filter((a) => a.status === 'failed').map((a) => a.title) };
}

describe('each file runs backwards too', () => {
  it('a block runs its tests and blocks last to first', () => {
    const block = { children: ['a', 'b', 'c'] };
    backwards(block);
    expect(block.children).toEqual(['c', 'b', 'a']);
  });

  it('forwards, a test that leaves its state behind passes; backwards, the test it breaks fails', () => {
    expect(runFixtures(false)).toEqual({ status: 'passed', failed: [] });
    expect(runFixtures(true)).toEqual({ status: 'failed', failed: ['reads the state as the file set it'] });
  }, 320_000);
});

const HOOKS = new Set(['beforeEach', 'afterEach']);
const MUTATES = /^(push|pop|shift|unshift|splice|set|delete|clear|add|sort|reverse|fill)$/;

/**
 * A file's `mock…` state (a `let`, or a `const` object or array it changes) that a hook inside a
 * describe block writes, while the file has a test outside that block and no hook of the file's
 * own (at its top) puts the state back: as `name (line)` of the block's hook.
 */
export function stateBackInOneBlockAlone(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const state = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    const isLet = !(st.declarationList.flags & ts.NodeFlags.Const);
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !/^mock[A-Z_]/.test(d.name.text)) continue;
      const init = d.initializer;
      if (isLet || (init && (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)))) state.add(d.name.text);
    }
  }
  if (!state.size) return [];
  const rootOf = (e: ts.Expression): string | null => {
    let x = e;
    while (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) x = x.expression;
    return ts.isIdentifier(x) ? x.text : null;
  };
  /** The name a call is made by: `it`, `describe`, `it.each(...)` and `describe.only` by their first word. */
  const callee = (c: ts.CallExpression): string | null => {
    let e: ts.Expression = c.expression;
    while (ts.isCallExpression(e) || ts.isPropertyAccessExpression(e)) e = e.expression;
    return ts.isIdentifier(e) ? e.text : null;
  };
  const tests: ts.Node[] = [];
  /**
   * The hook a node is written in: 'file' for one at the file's top; for one inside a describe,
   * that block, which matters only when the file has a test outside it.
   */
  const hookOf = (n: ts.Node): 'file' | ts.Node | null => {
    for (let p: ts.Node | undefined = n; p; p = p.parent) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && HOOKS.has(p.expression.text)) {
        if (p.parent && ts.isExpressionStatement(p.parent) && p.parent.parent === sf) return 'file';
        for (let b: ts.Node | undefined = p.parent; b; b = b.parent) if (ts.isCallExpression(b) && callee(b) === 'describe') return b;
        return 'file';
      }
    }
    return null;
  };
  const atFile = new Set<string>();
  const inBlock = new Map<string, { line: number; block: ts.Node }>();
  const visit = (n: ts.Node) => {
    let name: string | null = null;
    if (ts.isCallExpression(n) && (callee(n) === 'it' || callee(n) === 'test')) tests.push(n);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) name = rootOf(n.left);
    else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && MUTATES.test(n.expression.name.text)) name = rootOf(n.expression.expression);
    if (name && state.has(name)) {
      const hook = hookOf(n);
      if (hook === 'file') atFile.add(name);
      else if (hook && !inBlock.has(name)) inBlock.set(name, { line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, block: hook });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const outside = (block: ts.Node) => tests.some((t) => t.getStart() < block.getStart() || t.getEnd() > block.getEnd());
  return [...inBlock].filter(([name, at]) => !atFile.has(name) && outside(at.block)).map(([name, at]) => `${name} (${at.line})`);
}

describe("a state one block's hooks put back, the file's hooks put back", () => {
  it('in every test file', () => {
    const found = universe(['tests'], { ext: ['.test.ts', '.test.tsx'] })
      .flatMap((f) => stateBackInOneBlockAlone(f, readFileSync(f, 'utf8')).map((s) => `${path.relative(MOBILE, f).split(path.sep).join('/')}: ${s}`));
    expect(found).toEqual([]);
  });

  it('names the state put back in one block alone, and passes it put back for the file', () => {
    const oneBlock = [
      'let mockRegion = "GB";',
      'const mockSeen: string[] = [];',
      'describe("a", () => { beforeEach(() => { mockRegion = "GB"; mockSeen.length = 0; }); it("x", () => { mockRegion = ""; }); });',
      'describe("b", () => { it("y", () => { expect(mockRegion).toBe("GB"); }); });',
    ].join('\n');
    expect(stateBackInOneBlockAlone('x.test.ts', oneBlock)).toEqual(['mockRegion (3)', 'mockSeen (3)']);
    expect(stateBackInOneBlockAlone('x.test.ts', `${oneBlock}\nbeforeEach(() => { mockRegion = "GB"; mockSeen.length = 0; });`)).toEqual([]);
    // A block that holds every test of the file is the file: its hooks put back for each test.
    expect(stateBackInOneBlockAlone('x.test.ts', oneBlock.split('\n').slice(0, 3).join('\n'))).toEqual([]);
    // Only a file's own mock state: a local, or a state no hook puts back, is not this rule's.
    expect(stateBackInOneBlockAlone('x.test.ts', 'let region = "GB";\ndescribe("a", () => { beforeEach(() => { region = "GB"; }); });')).toEqual([]);
  });
});

it('every test begins with no member draft on the phone, by the prefix memberDrafts writes', () => {
  const afterEnv = readFileSync(path.join(MOBILE, 'jest.afterEnv.ts'), 'utf8');
  expect(afterEnv).toContain(`const DRAFT_PREFIX = '${DRAFT_PREFIX}';`);
  expect(afterEnv).toMatch(/key\.startsWith\('kept_'\) \|\| key\.startsWith\(DRAFT_PREFIX\)/);
});
