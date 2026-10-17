/**
 * theRunKeepsWhatItWrites.test.ts — every file e2e/run-flows.sh writes into its run's folder
 * ($OUT, the runner's temp) is kept with the run's logs (e2e.yml's "Keep the run's logs"), or
 * named below as the run's scratch with why; and the step before it scrubs the member's password
 * from exactly the files it keeps (e2e/scrub.mjs). A record the runner writes and no one can read
 * after the run (the launch with animations on, the variant's commands) fails here first.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RUN_FLOWS = readFileSync(join(__dirname, '..', 'run-flows.sh'), 'utf8');
const E2E_YML = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
const KEEP = "Keep the run's logs";
const SCRUB = "The member's password, out of the kept logs";

/** The run's scratch: written and read again within the run, never evidence on its own. */
const SCRATCH: Record<string, string> = {
  'attempt.out': "each attempt's output, copied whole into maestro.log or set aside under first-attempts/",
};

/** Each name the runner writes into $OUT, by the paths it names. */
const written = [...new Set([...RUN_FLOWS.matchAll(/"\$OUT\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1] ?? ''))].sort();

/** One step of e2e.yml, from its name to the next step. */
const step = (name: string) => {
  const at = E2E_YML.indexOf(`- name: ${name}`);
  if (at < 0) throw new Error(`e2e.yml has no step named ${name}`);
  const next = E2E_YML.indexOf('\n      - ', at + 1);
  return E2E_YML.slice(at, next === -1 ? undefined : next);
};
const kept = [...step(KEEP).matchAll(/runner\.temp \}\}\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1] ?? '');
const scrubbed = [...step(SCRUB).matchAll(/"\$RUNNER_TEMP\/([A-Za-z0-9_.-]+)"/g)].map((m) => m[1] ?? '');

it("reads the runner's writes and both steps (an empty reading would pass anything)", () => {
  expect(written.length).toBeGreaterThan(30);
  for (const list of [written, kept, scrubbed]) expect(list).toEqual(expect.arrayContaining(['maestro.log', 'logcat-stream.txt']));
});

it('keeps every file the runner writes, or names it as scratch with why', () => {
  expect(written.filter((f) => !kept.includes(f) && !SCRATCH[f])).toEqual([]);
});

it('names as scratch only what the runner writes and does not keep', () => {
  expect(Object.keys(SCRATCH).filter((f) => !written.includes(f) || kept.includes(f))).toEqual([]);
});

it('scrubs the password from exactly the files it keeps, each once, before it keeps them', () => {
  expect([...scrubbed].sort()).toEqual([...new Set(kept)].sort());
  expect(new Set(kept).size).toBe(kept.length);
  expect(E2E_YML.indexOf(`- name: ${SCRUB}`)).toBeLessThan(E2E_YML.indexOf(`- name: ${KEEP}`));
});
