/**
 * theWebTestFetchesNoBrowser.test.ts — the web job runs on the runner's own Google Chrome, and fetches
 * no browser of Playwright's.
 *
 * playwright.config.ts runs its one project on Chrome (channel 'chrome'), which the runner's image
 * holds. The job fetched all three of Playwright's browsers with their system libraries anyway, and on
 * a cold cache that outlived its five minutes, twice in a row (God-Tier 44447946174, 44510707456): a
 * red night for browsers the test never opens. The job and the config are read as text: neither is
 * code a render reaches.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '@/test-utils/readCode';

const ROOT = join(__dirname, '..', '..', '..', '..');
const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

type Step = { name?: string; run?: string; uses?: string };
const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'god_tier_ci.yml'), 'utf8')) as { jobs: Record<string, { steps?: Step[] }> };
const steps = workflow.jobs['web-visual-regression']?.steps ?? [];
const config = stripComments(readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8'), 'playwright.config.ts');

/** Whether a step fetches a browser of Playwright's own. */
const fetchesABrowser = (s: Step) => /\bplaywright\s+install\b/.test(s.run ?? '');

it('reads the web job and the config, rather than nothing', () => {
  expect(steps.some((s) => /npx playwright test tests\//.test(s.run ?? ''))).toBe(true);
  expect(config).toContain('projects: [');
});

it('fetches no browser, and finds the image\'s Chrome before the test runs', () => {
  expect(steps.filter(fetchesABrowser).map((s) => s.name)).toEqual([]);
  const chrome = steps.findIndex((s) => /^google-chrome --version \|\|/.test(s.run ?? ''));
  const test = steps.findIndex((s) => /npx playwright test/.test(s.run ?? ''));
  expect([chrome >= 0, chrome < test]).toEqual([true, true]);
  expect([fetchesABrowser({ run: 'npx playwright install --with-deps' }), fetchesABrowser({ run: 'npx playwright test' })]).toEqual([true, false]);
});

it('runs every project of the config on Chrome, the browser the image holds', () => {
  const projects = config.slice(config.indexOf('projects: ['), config.indexOf('webServer:'));
  const named = (projects.match(/\bname:\s*'/g) ?? []).length;
  expect(named).toBeGreaterThan(0);
  expect((projects.match(/channel:\s*'chrome'/g) ?? []).length).toBe(named);
});
