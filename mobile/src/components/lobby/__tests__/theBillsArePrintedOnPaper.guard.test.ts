/**
 * theBillsArePrintedOnPaper.guard.test.ts — the Lobby's bills are printed on the paper token, never
 * on the house's text colour (WORKLIST P0.114).
 *
 * `colors.parchment` is the colour the house sets its words in. The Lobby's white boxes were that
 * colour laid down as a background, and read too white; they now take `colors.paper`, a vellum a
 * step deeper, chosen with the owner. Read from source, comments stripped: no file of the Lobby
 * lays parchment down as a background, and the bills that are paper read the token.
 */
import * as path from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const LOBBY = universe('appCode')
  .map((f) => ({ rel: path.relative(MOBILE, f).replace(/\\/g, '/'), src: readCode(f) }))
  .filter((f) => f.rel.startsWith('src/components/lobby/'));

/** Each place a file lays parchment down as a background, by line. */
const parchmentGrounds = (src: string) => src.split('\n')
  .map((line, i) => ({ line, at: i + 1 }))
  .filter(({ line }) => /background(Color)?\s*:\s*colors\.parchment\b/.test(line));

it('reads the Lobby — not an empty sweep', () => {
  expect(LOBBY.length).toBeGreaterThan(10);
});

it('lays no parchment down as a background anywhere in the Lobby', () => {
  expect(LOBBY.flatMap((f) => parchmentGrounds(f.src).map(({ at }) => `${f.rel}:${at}`))).toEqual([]);
  expect(parchmentGrounds("  paper: { backgroundColor: colors.parchment },")).toHaveLength(1);
  expect(parchmentGrounds('  paper: { backgroundColor: colors.paper },')).toEqual([]);
});

it('prints the featured log, the rank banner and the filings on the paper token', () => {
  for (const bill of ['PairBills.tsx', 'RankBill.tsx', 'FilingsBill.tsx']) {
    const f = LOBBY.find((x) => x.rel === `src/components/lobby/${bill}`);
    expect(f?.src).toMatch(/backgroundColor:\s*colors\.paper\b/);
  }
});
