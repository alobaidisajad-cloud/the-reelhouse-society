/**
 * everyBackHasAWayOut.guard.test.ts — no back that can do nothing.
 *
 * `router.back()` with nowhere to go back to does nothing: a screen opened from
 * a notice or a link has no history, and its back button, its "RETURN TO THE
 * LOBBY", its after-save return were all dead. Thirty-two of them. The house's
 * `nav.back()` goes back where there is a back and to the Lobby where there is
 * not, and keeps nav's own history in step (a raw back left it behind).
 *
 * Read from source, comments stripped: every bare `router.back()` in the app
 * lives in typedRouter.ts, or behind its own `canGoBack()`.
 */
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const ROOT = path.join(__dirname, '..', '..', '..');

const FILES = universe('appCode')
  .map((f) => ({ rel: path.relative(ROOT, f).replace(/\\/g, '/'), src: readCode(f) }));

it('reads the app — not an empty sweep', () => {
  expect(FILES.length).toBeGreaterThan(300);
  expect(FILES.some((f) => f.src.includes('nav.back()'))).toBe(true);
});

it('every back goes through nav.back(), or checks canGoBack() first', () => {
  const raw = FILES
    .filter((f) => f.rel !== 'src/utils/typedRouter.ts')
    .flatMap((f) => f.src.split('\n')
      .filter((line) => line.includes('router.back()') && !line.includes('canGoBack()) router.back()'))
      .map((line) => `${f.rel}: ${line.trim()}`));
  expect(raw).toEqual([]);
});
