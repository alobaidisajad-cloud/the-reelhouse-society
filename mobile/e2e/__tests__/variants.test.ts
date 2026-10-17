/**
 * variants.test.ts — the phone's variants (e2e/variants.json, e2e/variants.mjs, WORKLIST P0.86):
 * every one says why it is run, sets something and puts it back (plain alone sets nothing); a reset
 * that puts back what was read has a read and the pattern its answer must match; a variant that
 * runs every flow leaves the animation scales alone (run-flows.sh sets them to 0 before each flow);
 * and the commands are refused, never guessed, for an unknown variant or a read that gave nothing
 * usable. runFlows.rehearsal.test.ts holds run-flows.sh to running them around the whole run.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'variants.mjs');
interface Variant { why: string; flows?: boolean; read?: string; answer?: string; ready?: string[]; judges?: string[]; setup: string[]; reset: string[] }
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
const NAMED = /The variants \(mobile\/e2e\/variants\.json\): (.+)$/m.exec(E2E_YML)?.[1]?.trim().split(', ');
/** The commands a variant may send: a setting, the density, an overlay, the night mode, or the system's language. */
const COMMAND = /^(settings put (global|system|secure) \S+ \S+|wm density (\d+|reset)|cmd overlay (enable|disable) \S+|cmd uimode night \S+|setprop persist\.sys\.locale \S+; stop; start)$/;

describe.each(Object.entries(VARIANTS))('%s', (name, v) => {
  it('says why it is run, in words', () => {
    expect(v.why.length).toBeGreaterThanOrEqual(30);
  });

  it('sets something and puts it back, one command for each it set; plain alone is the phone as it is', () => {
    if (name === 'plain') {
      expect([v.setup, v.reset, v.read, v.flows]).toEqual([[], [], undefined, undefined]);
      return;
    }
    expect(v.setup.length).toBeGreaterThan(0);
    expect(v.reset.length).toBe(v.setup.length);
    for (const c of [...v.setup, ...v.reset]) expect(c).toMatch(COMMAND);
  });

  it('puts back what it read only with a read and the pattern its answer must match', () => {
    const putsBackTheRead = v.reset.some((c) => c.includes('{was}'));
    expect({ read: Boolean(v.read), answer: Boolean(v.answer) }).toEqual({ read: putsBackTheRead, answer: putsBackTheRead });
  });
});

describe.each(Object.entries(VARIANTS).filter(([, v]) => v.flows))('%s, which runs every flow', (_name, v) => {
  it('leaves the animation scales alone: run-flows.sh sets them to 0 before each flow', () => {
    expect(v.setup.filter((c) => /\b(window_animation|transition_animation|animator_duration)_scale\b/.test(c))).toEqual([]);
  });
});

it('is the list the workflow says a variant run may be given, and the night walks every one', () => {
  expect(NAMED).toEqual(Object.keys(VARIANTS));
  expect(/^\s+variant: \[(.+)\]$/m.exec(NIGHTLY)?.[1]?.split(', ')).toEqual(Object.keys(VARIANTS));
});

it('gives each step its commands, and fills in what was read', () => {
  expect(commandsFor('light', 'read')).toEqual({ commands: ['cmd uimode night'] });
  expect(commandsFor('light', 'setup')).toEqual({ commands: ['cmd uimode night no'] });
  expect(commandsFor('light', 'reset', 'auto')).toEqual({ commands: ['cmd uimode night auto'] });
  expect(commandsFor('narrowest', 'read')).toEqual({ commands: [] });
  expect(commandsFor('narrowest', 'ready')).toEqual({ commands: [] });
  expect(commandsFor('narrowest', 'reset')).toEqual({ commands: ['wm density reset'] });
  expect(commandsFor('right-to-left', 'reset', 'en-US')).toEqual({ commands: ['setprop persist.sys.locale en-US; stop; start'] });
  expect((commandsFor('right-to-left', 'ready') as { commands: string[] }).commands[0]).toBe('am get-config | grep -q ldrtl');
});

it("waits, after any variant that restarts the system, until the app's own launch screen resolves", () => {
  // Run 38991750276: the system answered its new language and said it had booted (that flag is
  // never cleared by a restart) while it had not yet loaded the app: "Activity class does not exist".
  const restarts = Object.entries(VARIANTS).filter(([, v]) => v.setup.some((c) => / stop; start$/.test(c)));
  expect(restarts.map(([n]) => n)).toEqual(['right-to-left']);
  for (const [, v] of restarts) {
    expect(v.ready?.at(-1)).toBe('cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER com.reelhouse.society | grep -q com.reelhouse.society/');
    expect(v.ready?.some((c) => c.includes('sys.boot_completed'))).toBe(false);
  }
});

it('adds a judge only by a name run-flows.sh runs, to the bold and largest text', () => {
  const judges = Object.fromEntries(Object.keys(VARIANTS).map((n) => [n, (commandsFor(n, 'judges') as { commands: string[] }).commands]));
  expect(Object.entries(judges).filter(([, j]) => j.length > 0)).toEqual([['largest-text', ['cut-text']], ['bold-text', ['cut-text']]]);
  const runFlows = readFileSync(join(__dirname, '..', 'run-flows.sh'), 'utf8');
  for (const j of Object.values(judges).flat()) expect(runFlows).toContain(`judges | grep -qx ${j}`);
});

it('says which run each variant is: every flow and the walk, or the walk alone', () => {
  const runs = Object.fromEntries(Object.keys(VARIANTS).map((n) => [n, (commandsFor(n, 'runs') as { commands: string[] }).commands]));
  expect(runs).toEqual({
    plain: ['walk'], 'motion-on': ['walk'], 'largest-text': ['flows'], 'bold-text': ['walk'],
    narrowest: ['flows'], 'three-button': ['walk'], 'right-to-left': ['flows'], light: ['walk'],
  });
});

it('takes back the language only as a language, with or without its script', () => {
  for (const was of ['en-US', 'ar-IQ', 'zh-Hant-TW', 'fil']) expect(commandsFor('right-to-left', 'reset', was)).toHaveProperty('commands');
  for (const was of ['closed', 'en_US', 'en-US; reboot']) expect(commandsFor('right-to-left', 'reset', was)).toHaveProperty('refused');
});

it('refuses, rather than guesses, an unknown variant or step, and a reset with nothing usable to put back', () => {
  expect(commandsFor('sideways', 'setup')).toEqual({ refused: `no variant named sideways (the variants: ${Object.keys(VARIANTS).join(', ')})` });
  expect(commandsFor('light', 'undo')).toEqual({ refused: 'a step is read, setup, ready, reset, runs or judges, not undo' });
  expect(commandsFor('light', 'reset')).toEqual({ refused: "light's reset puts back what was read, and was given nothing" });
  expect(commandsFor('light', 'reset', 'closed')).toEqual({
    refused: "light's read answered closed, which ^(no|yes|auto|custom_schedule|custom_bedtime)$ does not match: nothing is put back",
  });
});

it('refuses on its command line with exit 2 and nothing on its output, for run-flows.sh to send nothing', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'sideways', 'setup'], { encoding: 'utf8' });
  expect({ status: r.status, stdout: r.stdout }).toEqual({ status: 2, stdout: '' });
  expect(r.stderr).toContain('no variant named sideways');
  const ok = spawnSync(process.execPath, [SCRIPT, 'motion-on', 'setup'], { encoding: 'utf8' });
  expect({ status: ok.status, stdout: ok.stdout }).toEqual({ status: 0, stdout: `${VARIANTS['motion-on']?.setup.join('\n')}\n` });
});
