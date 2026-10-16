/**
 * variants.test.ts — the phone's variants for the route walk (e2e/variants.json, e2e/variants.mjs,
 * WORKLIST P0.86): every one says why it is run, sets something and puts it back (plain alone sets
 * nothing), a reset that puts back what was read has a read and the words it may answer; and the
 * commands are refused, never guessed, for an unknown variant or a read that gave nothing usable.
 * runFlows.rehearsal.test.ts holds run-flows.sh to running them in order around the walk.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'variants.mjs');
interface Variant { why: string; read?: string; answers?: string[]; setup: string[]; reset: string[] }
const VARIANTS = (JSON.parse(readFileSync(join(__dirname, '..', 'variants.json'), 'utf8')) as { variants: Record<string, Variant> }).variants;
const E2E_YML = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
const NIGHTLY = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'nightly.yml'), 'utf8');

/** One of the script's own answers, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
const LIST = JSON.stringify(VARIANTS);
const commandsFor = (name: string, step: string, was?: string) =>
  ask(`m.commandsFor(${LIST}, ${JSON.stringify(name)}, ${JSON.stringify(step)}, ${was === undefined ? 'undefined' : JSON.stringify(was)})`);
/** The variants the workflow's input names, in its own words. */
const NAMED = /The variants \(mobile\/e2e\/variants\.json\): (.+)$/m.exec(E2E_YML)?.[1].trim().split(', ');

describe.each(Object.entries(VARIANTS))('%s', (name, v) => {
  it('says why it is run, in words', () => {
    expect(v.why.length).toBeGreaterThanOrEqual(30);
  });

  it('sets something and puts it back, one command for each it set; plain alone is the phone as it is', () => {
    if (name === 'plain') {
      expect([v.setup, v.reset, v.read]).toEqual([[], [], undefined]);
      return;
    }
    expect(v.setup.length).toBeGreaterThan(0);
    expect(v.reset.length).toBe(v.setup.length);
    for (const c of [...v.setup, ...v.reset]) expect(c).toMatch(/^(settings put (global|system|secure) \S+ \S+|wm density (\d+|reset)|cmd overlay (enable|disable) \S+|cmd uimode night \S+)$/);
  });

  it('puts back what it read only with a read and the words that read may answer', () => {
    const putsBackTheRead = v.reset.some((c) => c.includes('{was}'));
    expect({ read: Boolean(v.read), answers: Boolean(v.answers?.length) }).toEqual({ read: putsBackTheRead, answers: putsBackTheRead });
  });

});

it('is the list the workflow says a variant run may be given, and the night walks every one', () => {
  expect(NAMED).toEqual(Object.keys(VARIANTS));
  expect(/^\s+variant: \[(.+)\]$/m.exec(NIGHTLY)?.[1].split(', ')).toEqual(Object.keys(VARIANTS));
});

it('gives each step its commands, and fills in what was read', () => {
  expect(commandsFor('light', 'read')).toEqual({ commands: ['cmd uimode night'] });
  expect(commandsFor('light', 'setup')).toEqual({ commands: ['cmd uimode night no'] });
  expect(commandsFor('light', 'reset', 'auto')).toEqual({ commands: ['cmd uimode night auto'] });
  expect(commandsFor('narrowest', 'read')).toEqual({ commands: [] });
  expect(commandsFor('narrowest', 'reset')).toEqual({ commands: ['wm density reset'] });
});

it('refuses, rather than guesses, an unknown variant or step, and a reset with nothing usable to put back', () => {
  expect(commandsFor('sideways', 'setup')).toEqual({ refused: `no variant named sideways (the variants: ${Object.keys(VARIANTS).join(', ')})` });
  expect(commandsFor('light', 'undo')).toEqual({ refused: 'a step is read, setup or reset, not undo' });
  expect(commandsFor('light', 'reset')).toEqual({ refused: "light's reset puts back what was read, and was given nothing" });
  expect(commandsFor('light', 'reset', 'closed')).toEqual({
    refused: "light's read answered closed, which is none of no, yes, auto, custom_schedule, custom_bedtime: nothing is put back",
  });
});

it('refuses on its command line with exit 2 and nothing on its output, for run-flows.sh to send nothing', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'sideways', 'setup'], { encoding: 'utf8' });
  expect({ status: r.status, stdout: r.stdout }).toEqual({ status: 2, stdout: '' });
  expect(r.stderr).toContain('no variant named sideways');
  const ok = spawnSync(process.execPath, [SCRIPT, 'motion-on', 'setup'], { encoding: 'utf8' });
  expect({ status: ok.status, stdout: ok.stdout }).toEqual({ status: 0, stdout: `${VARIANTS['motion-on'].setup.join('\n')}\n` });
});
