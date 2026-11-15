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

/**
 * And every dismissal (review round 4): a bare `router.dismiss()` left nav's own history behind
 * (the social sheet's, on the way to a member's file), and with nothing to dismiss it does nothing.
 * `nav.dismiss()` keeps the history in step and goes to the Lobby where there is nothing to close.
 */
it('every dismissal goes through nav.dismiss()', () => {
  const raw = FILES
    .filter((f) => f.rel !== 'src/utils/typedRouter.ts')
    .flatMap((f) => f.src.split('\n')
      .filter((line) => line.includes('router.dismiss()'))
      .map((line) => `${f.rel}: ${line.trim()}`));
  expect(raw).toEqual([]);
  // The one that is left, where nav keeps it.
  expect(FILES.find((f) => f.rel === 'src/utils/typedRouter.ts')?.src).toContain('router.dismiss();');
});
