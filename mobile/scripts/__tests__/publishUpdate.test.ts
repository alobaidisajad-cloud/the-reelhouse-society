/**
 * An update reaches phones a few at a time, its crashes readable, every step written (P4.30).
 * scripts/publish-update.cjs, with `eas` and the Sentry upload stood in for.
 */
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { publish, widen, rollback, STEPS, SOAK_HOURS } = require('../publish-update.cjs');

type Call = { cmd: string; args: string[] };
const GROUP = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb';
/** A runner that records each call and answers as `answers` says (0 by default). */
const runner = (answers: Record<string, number> = {}) => {
  const calls: Call[] = [];
  const run = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const [key = ''] = args;
    const code = answers[key] ?? 0;
    const stdout = cmd === 'eas' && args[0] === 'update' ? JSON.stringify([{ group: GROUP, platform: 'ios' }, { group: GROUP, platform: 'android' }]) : '';
    return { code, stdout };
  };
  return { calls, run };
};
const ledger = () => join(mkdtempSync(join(tmpdir(), 'updates-')), 'updates-published.json');
const at = (iso: string) => () => new Date(iso);

describe('publish', () => {
  it('starts with a small share, never every phone', () => {
    expect(STEPS[0]).toBeLessThan(100);
    const { calls, run } = runner();
    const file = ledger();
    publish({ message: 'the Lobby reads faster', run, now: at('2026-11-02T09:00:00Z'), ledgerFile: file, sha: 'abc1234' });
    const start = calls.find((c) => c.args[0] === 'channel:rollout');
    expect(start?.args).toEqual(expect.arrayContaining(['production', '--action', 'create', '--percent', String(STEPS[0])]));
  });

  it('uploads the source maps before any phone gets it', () => {
    const { calls, run } = runner();
    publish({ message: 'x', run, now: at('2026-11-02T09:00:00Z'), ledgerFile: ledger(), sha: 'abc1234' });
    const order = calls.map((c) => (c.cmd === 'npx' ? 'upload' : c.args[0]));
    expect(order).toEqual(['update', 'upload', 'channel:rollout']);
  });

  it('stops when the upload fails: no rollout, and the failure written down', () => {
    const { calls, run } = runner({ 'sentry-expo-upload-sourcemaps': 1 });
    const file = ledger();
    expect(() => publish({ message: 'x', run, now: at('2026-11-02T09:00:00Z'), ledgerFile: file, sha: 'abc1234' })).toThrow(/did not reach Sentry/);
    expect(calls.some((c) => c.args[0] === 'channel:rollout')).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([expect.objectContaining({ group: GROUP, upload: 'failed', steps: [] })]);
  });

  it('writes the update, its branch, the upload and its first share to the ledger', () => {
    const { run } = runner();
    const file = ledger();
    publish({ message: 'x', run, now: at('2026-11-02T09:00:00Z'), ledgerFile: file, sha: 'abc1234' });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([expect.objectContaining({
      group: GROUP, branch: 'production-202611020900-abc1234', upload: 'ok', steps: [{ percent: STEPS[0], at: '2026-11-02T09:00:00.000Z' }],
    })]);
  });

  it('refuses an update with no message', () => {
    expect(() => publish({ message: '', run: runner().run, now: at('2026-11-02T09:00:00Z'), ledgerFile: ledger(), sha: 'a' })).toThrow(/needs --message/);
  });
});

describe('widen and roll back', () => {
  const started = () => {
    const file = ledger();
    publish({ message: 'x', run: runner().run, now: at('2026-11-02T09:00:00Z'), ledgerFile: file, sha: 'abc1234' });
    return file;
  };

  it('waits out the soak, and refuses a share with a new Sentry issue in it', () => {
    const file = started();
    const early = new Date(Date.parse('2026-11-02T09:00:00Z') + (SOAK_HOURS - 1) * 3600000);
    expect(() => widen({ group: GROUP, run: runner().run, now: () => early, newIssuesSince: () => 0, ledgerFile: file })).toThrow(/has soaked/);
    const later = new Date(Date.parse('2026-11-02T09:00:00Z') + SOAK_HOURS * 3600000);
    expect(() => widen({ group: GROUP, run: runner().run, now: () => later, newIssuesSince: () => 2, ledgerFile: file })).toThrow(/2 new Sentry issue/);
  });

  it('then takes the next share, and writes it', () => {
    const file = started();
    const { calls, run } = runner();
    const later = new Date(Date.parse('2026-11-02T09:00:00Z') + SOAK_HOURS * 3600000);
    widen({ group: GROUP, run, now: () => later, newIssuesSince: () => 0, ledgerFile: file });
    expect(calls.map((c) => c.args)).toEqual([expect.arrayContaining(['--action', 'edit', '--percent', String(STEPS[1])])]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([expect.objectContaining({
      steps: [expect.objectContaining({ percent: STEPS[0] }), expect.objectContaining({ percent: STEPS[1] })],
    })]);
  });

  it('rolls back to what the channel ran before, and writes that too', () => {
    const file = started();
    const { calls, run } = runner();
    rollback({ group: GROUP, run, now: at('2026-11-02T10:00:00Z'), ledgerFile: file });
    expect(calls.map((c) => c.args)).toEqual([expect.arrayContaining(['--action', 'end', '--outcome', 'revert'])]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([expect.objectContaining({
      steps: [expect.objectContaining({ percent: STEPS[0] }), expect.objectContaining({ percent: 0, ended: 'rolled back' })],
    })]);
  });
});
