/**
 * Every route catches its own crash (RouteErrorBoundary), so one screen that
 * throws takes down that screen and not the house: a route without its own
 * ErrorBoundary hands the throw to the root, and the whole app goes to the
 * global error screen.
 *
 * The root layout is the one exception: its boundary replaces the providers
 * the house's net is drawn with (safe area, fonts), so it keeps expo-router's.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';

const APP = path.join(__dirname, '..', '..', '..', 'app');
const EXPORT = /export\s*\{\s*RouteErrorBoundary\s+as\s+ErrorBoundary\s*\}\s*from\s*'@\/src\/components\/RouteErrorBoundary'/;

function routes(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (e.name.endsWith('.tsx')) out.push(path.relative(APP, p).split(path.sep).join('/'));
  }
  return out;
}

const ROOT = '_layout.tsx';

describe('every route has its own crash net', () => {
  const all = routes(APP);

  it('finds the routes it is about', () => {
    expect(all).toEqual(expect.arrayContaining(['film/[id].tsx', '(tabs)/index.tsx', '(modals)/log-modal.tsx', ROOT]));
  });

  // Read as code, comments blanked: an export switched off by `//` is no net.
  it('each exports the house boundary, except the root', () => {
    const bare = all.filter((r) => r !== ROOT && !EXPORT.test(readCode(path.join(APP, r))));
    expect(bare).toEqual([]);
  });

  it('the detector says no to a route without one', () => {
    expect(EXPORT.test("export default function X() { return null; }")).toBe(false);
    expect(EXPORT.test("export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';")).toBe(true);
  });
});
