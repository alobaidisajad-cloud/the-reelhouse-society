/**
 * Every edge function has one copy, and scripts/edge-functions.cjs says where.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two folders deploy to the same project. When both held a function of the
 * same name, reading the repo did not tell you what ran — and the copy that
 * handed out the TMDB key was the one nobody was reading. `npm run
 * functions:check` compares the list with what is deployed; this keeps the
 * list honest about the folders.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const fns = require('../../../scripts/edge-functions.cjs') as {
  WEB: string;
  MOBILE: string;
  DEPLOYED: Record<string, { dir: string; verifyJwt: boolean }>;
  NOT_DEPLOYED: Record<string, { dir: string; why: string }>;
  deployCommand: (name: string) => string;
};

const REPO = join(__dirname, '..', '..', '..', '..');
const folders = (dir: string) =>
  readdirSync(join(REPO, dir), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name);

const listed = { ...fns.DEPLOYED, ...fns.NOT_DEPLOYED };

it('no function is in both folders', () => {
  const web = folders(fns.WEB);
  expect(folders(fns.MOBILE).filter((n) => web.includes(n))).toEqual([]);
});

it('every function folder is listed, with the folder it is really in', () => {
  const onDisk = [...folders(fns.WEB).map((n) => [n, fns.WEB]), ...folders(fns.MOBILE).map((n) => [n, fns.MOBILE])];
  expect(onDisk.length).toBeGreaterThan(5);
  expect(onDisk.filter(([n, dir]) => listed[n]?.dir !== dir)).toEqual([]);
});

it('every listed function has its code where the list says', () => {
  expect(Object.entries(listed).filter(([n, { dir }]) => !existsSync(join(REPO, dir, n, 'index.ts'))).map(([n]) => n)).toEqual([]);
});

it('nothing is both deployed and not deployed, and every exception says why', () => {
  expect(Object.keys(fns.NOT_DEPLOYED).filter((n) => n in fns.DEPLOYED)).toEqual([]);
  expect(Object.values(fns.NOT_DEPLOYED).filter(({ why }) => why.length < 20)).toEqual([]);
});

it('the printed deploy command carries --no-verify-jwt exactly when the function must be open', () => {
  const wrong = Object.entries(fns.DEPLOYED).filter(([n, { verifyJwt }]) =>
    fns.deployCommand(n).includes('--no-verify-jwt') === verifyJwt);
  expect(wrong.map(([n]) => n)).toEqual([]);
  expect(fns.deployCommand('fetch-rss')).toMatch(/^cd mobile; /);
  expect(fns.deployCommand('tmdb-proxy')).toMatch(/^cd \.; /);
});
