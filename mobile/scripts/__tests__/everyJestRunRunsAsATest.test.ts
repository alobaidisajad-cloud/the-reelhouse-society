/**
 * everyJestRunRunsAsATest.test.ts — every jest run has NODE_ENV 'test', as jest's own command gives it.
 *
 * The jest command jest-cli ships sets NODE_ENV to 'test' when nothing set it. jest's API (runCLI) sets nothing,
 * and its workers take the caller's environment. React Native reads it: under anything else its
 * Animated throws "Unable to locate attached view" for a view the test renderer never attaches, so a
 * run started through the API fails the tab bar's tests that `npx jest` passes. Every script that
 * starts jest through its API calls jest-run.cjs's asJestsBin first. This file reads source, so it is
 * in SOURCE-READING-TESTS.md, and the push's own jest run (scripts/hooks/jest-run.cjs) runs it too.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '../../test-utils/readCode';
import { files, rel } from '../../test-utils/universe';

type Env = Record<string, string | undefined>;
const { asJestsBin } = require('../hooks/jest-run.cjs') as { asJestsBin: (env: Env) => Env };

const JEST_RUN = join(__dirname, '..', 'hooks', 'jest-run.cjs');

const START = /\brunCLI\s*\(/g;

/** Where code starts jest through its API: each call's line, and whether asJestsBin(process.env) comes before it. */
function startsOf(text: string, name: string): { line: number; told: boolean }[] {
  const code = stripComments(text, name);
  const told = code.search(/\basJestsBin\(\s*process\.env\s*\)/);
  return [...code.matchAll(START)].map((m) => ({
    line: code.slice(0, m.index).split('\n').length,
    told: told >= 0 && told < (m.index ?? 0),
  }));
}

/** The lines where code starts jest through its API untold. */
const untoldStarts = (text: string, name: string): number[] => startsOf(text, name).filter((s) => !s.told).map((s) => s.line);

/** Every code file that ships outside the app, each with where it starts jest. */
const sweep = () => files(['scripts', 'testSupport', 'config', 'mockups'], { ext: ['.js', '.cjs', '.mjs', '.ts'] })
  .map((f) => ({ file: rel(f), starts: startsOf(readFileSync(f, 'utf8'), f) }));

describe('every jest run runs as a test', () => {
  it('runs with NODE_ENV test, as jest\'s own command sets it', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('gives a run NODE_ENV test when nothing set it, and keeps one that was set, as jest\'s own command does', () => {
    expect(asJestsBin({})).toEqual({ NODE_ENV: 'test' });
    expect(asJestsBin({ NODE_ENV: 'production', A: '1' })).toEqual({ NODE_ENV: 'production', A: '1' });
    const env: Env = {};
    expect(asJestsBin(env)).toBe(env);
  });

  it('every script that starts jest through its API gives the run jest\'s own environment first', () => {
    const found = sweep();
    const untold = found.flatMap((f) => f.starts.filter((s) => !s.told).map((s) => `${f.file}: line ${s.line}`));
    expect(untold).toEqual([]);
    // Not a sweep of nothing: the push's own run is among what it read.
    expect(found.find((f) => f.file === 'scripts/hooks/jest-run.cjs')?.starts.length).toBeGreaterThan(0);
  });

  it('can say NO: a start through the API with nothing before it is found, one after asJestsBin is not', () => {
    const text = readFileSync(JEST_RUN, 'utf8');
    const planted = text.split('  asJestsBin(process.env);').join('');
    expect(planted).not.toBe(text);
    expect(untoldStarts(planted, JEST_RUN)).toHaveLength(1);
    expect(untoldStarts(text, JEST_RUN)).toEqual([]);
    expect(untoldStarts('const { runCLI } = require("jest");\nrunCLI({}, []);\nasJestsBin(process.env);\n', 'x.cjs')).toEqual([2]);
    expect(untoldStarts('// runCLI(argv)\nconst a = 1;\n', 'x.cjs')).toEqual([]);
  });
});
