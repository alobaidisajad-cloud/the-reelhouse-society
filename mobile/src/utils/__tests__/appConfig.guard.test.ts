/**
 * A real build is app.json exactly; only the E2E build differs, and only as it says.
 * ─────────────────────────────────────────────────────────────────────────────
 * app.config.js exists for the sealed E2E build (e2e.yml sets E2E=1). The risk
 * it brings is a store build that quietly allows plain http or turns updates
 * off — so both halves are proved here, along with the one place the E2E
 * backend address may appear.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const appConfig = require('../../../app.config.js') as (ctx: { config: Record<string, unknown> }) => Record<string, unknown>;
const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;

const withE2E = <T,>(value: string | undefined, fn: () => T): T => {
  const before = process.env.E2E;
  if (value === undefined) delete process.env.E2E;
  else process.env.E2E = value;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.E2E;
    else process.env.E2E = before;
  }
};

it('without E2E, the config IS app.json — nothing added, nothing changed', () => {
  for (const value of [undefined, '', '0', 'true']) {
    const config = withE2E(value, () => appConfig({ config: structuredClone(appJson) }));
    expect(config).toEqual(appJson);
  }
});

it('with E2E=1, only updates and the cleartext plugin change', () => {
  const config = withE2E('1', () => appConfig({ config: structuredClone(appJson) }));
  const { updates, plugins, ...rest } = config as { updates: { enabled: boolean }; plugins: unknown[] };
  const { updates: u0, plugins: p0, ...rest0 } = appJson;
  expect(rest).toEqual(rest0);
  expect(updates).toEqual({ ...u0, enabled: false });
  expect(plugins).toEqual([...p0, './e2e/plugins/withCleartextTraffic']);
});

it('no real build profile sets E2E, or points at a local backend', () => {
  const eas = readFileSync(join(MOBILE, 'eas.json'), 'utf8');
  expect(eas).not.toMatch(/"E2E"/);
  expect(eas).not.toMatch(/10\.0\.2\.2|127\.0\.0\.1|localhost|\.test\b/);
});
