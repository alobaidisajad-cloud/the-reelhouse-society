/**
 * pushPresent.test.ts — the run takes the message notify-push sent for the member's phone, and only it
 * (e2e/push-present.mjs, WORKLIST P4.22).
 *
 * The Expo stand-in keeps every request as the text it was sent; the run takes the last message sent
 * to the member's token, never another phone's, and hands it to the app whole in the link the E2E
 * build presents (src/utils/e2ePresent.ts reads it back). The script is a module: it is asked
 * through node, as the run asks it.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { basename } from 'path';
import { files as universe } from '@/test-utils/universe';
import { messageOf } from '@/src/utils/e2ePresent';
import { routeMarkOf } from '@/src/components/layout/E2ERouteMark';

const SCRIPT = pathToFileURL(join(__dirname, '..', 'push-present.mjs')).href;

/** What the script's `name` answers for `arg`, asked through node. */
function ask(name: 'messageFor' | 'linkOf' | 'TOKEN' | 'markOf' | 'kinds', arg?: unknown): unknown {
  const code = `import * as m from ${JSON.stringify(SCRIPT)}; const a = JSON.parse(process.argv[1]);
    const v = ${JSON.stringify(name)} === 'kinds' ? Object.keys(m.KINDS)
      : typeof m[${JSON.stringify(name)}] === 'function' ? m[${JSON.stringify(name)}](a) : m[${JSON.stringify(name)}];
    process.stdout.write(JSON.stringify(v ?? null));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(arg ?? null)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const TOKEN = ask('TOKEN') as string;
const send = (messages: unknown[]) => ({ method: 'POST', path: '/--/api/v2/push/send', body: JSON.stringify(messages) });
const ours = (title: string) => ({ to: TOKEN, title, body: 'started following your frequency.', data: { type: 'follow', notificationId: 'n-1' }, sound: 'default', channelId: 'members' });

it("takes the last message sent to the member's phone, from the text the stand-in kept", () => {
  const seen = [
    send([ours('first')]),
    { method: 'GET', path: '/3/movie/1', body: '' },
    send([{ ...ours('another phone'), to: 'ExponentPushToken[someone-else]' }, ours('last')]),
  ];
  expect((ask('messageFor', seen) as { title: string }).title).toBe('last');
});

it("takes nothing when no message reached the member's phone, or a body was not a message", () => {
  expect(ask('messageFor', [send([{ ...ours('x'), to: 'ExponentPushToken[someone-else]' }])])).toBeNull();
  expect(ask('messageFor', [{ method: 'POST', path: '/--/api/v2/push/send', body: '{not json' }])).toBeNull();
});

it('hands the message whole to the link the E2E build presents', () => {
  const m = ours('A new follower');
  expect(messageOf(ask('linkOf', m) as string)).toEqual({ title: m.title, body: m.body, data: m.data, sound: 'default', channelId: 'members' });
});

it('waits for the room as the app marks it: a member\'s file, a log, a salon, the notices sheet', () => {
  for (const path of ['/user/e2e_admin', '/log/00000000-0000-4000-8000-000000000001', '/lounge/00000000-0000-4000-b200-000000000001', '/notifications-modal']) {
    expect(ask('markOf', path)).toBe(routeMarkOf(path));
  }
});

it('sends every kind a push flow taps, and every push flow taps a kind it sends', () => {
  // push_tap is the follow's (its three states); push_tap_<kind> each of the rest (run-flows.sh).
  const flows = universe('flows').map((f) => basename(f)).filter((f) => /^push_tap.*\.yaml$/.test(f))
    .map((f) => f.replace(/\.yaml$/, '').replace(/^push_tap_?/, '') || 'follow').sort();
  expect(flows).toEqual((ask('kinds') as string[]).sort());
  expect(flows).toEqual(['critique', 'follow', 'house', 'salon']);
});
