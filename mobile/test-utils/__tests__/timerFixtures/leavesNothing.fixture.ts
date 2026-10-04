/**
 * Every way a timer properly ends: it runs, it is cleared, it is cleared by
 * the number it converts to, the file's own afterAll clears it, and a tick
 * queued at the very end runs in the turn the environment lets pass. The
 * environment must pass this file. util.promisify(setTimeout) still works.
 */
import { promisify } from 'util';

let kept: ReturnType<typeof setTimeout>;
afterAll(() => clearTimeout(kept));

it('ends every timer it starts', async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  clearTimeout(setTimeout(() => {}, 60_000));
  clearInterval(setInterval(() => {}, 1_000));
  clearTimeout(Number(setTimeout(() => {}, 60_000)));
  clearImmediate(setImmediate(() => {}));
  kept = setTimeout(() => {}, 60_000);
  await expect(promisify(setTimeout)(1, 'waited')).resolves.toBe('waited');
  setImmediate(() => {});
});
