/**
 * anUnreadyControlIsHollow.guard.test.ts — a control that cannot act yet is drawn hollow, never faded.
 * ─────────────────────────────────────────────────────────────────────────────
 * Seventeen controls said "not yet" by fading to 0.3–0.6 of themselves: ink on brass fell to
 * about 1.5:1, and SHARE TO LOUNGE, FILE REPORT, RESET PASSWORD could not be read until they
 * could be pressed (the polish pass, 2026-10-22). An unready control takes UNREADY
 * (src/theme/unready.ts): its frame says "not yet", its words stay readable. This reads the
 * app's code for a fade under 0.7 given on a condition; what is left is a control at work for
 * a moment, or a picture, each named with why. A lighter fade (a press, a closed ballot at
 * 0.82) keeps its words readable and is not this.
 */
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';
import { readCode } from '@/test-utils/readCode';

const MOBILE = join(__dirname, '..', '..', '..');
const DEEP = 0.7;
/** A fade given on a condition: `x && { opacity: 0.4 }`, `opacity: x ? 1 : 0.4`, or a style named for the state. */
const FADES = [
  /[\w.!]+\s*&&\s*\{[^{}]*?\bopacity:\s*(0?\.\d+)/,
  /\bopacity:\s*[^,{}]+\?\s*[\d.]+\s*:\s*(0?\.\d+)/,
  /\b\w*(?:Disabled|Dim|Busy|Blocked)\s*:\s*\{[^{}]*?\bopacity:\s*(0?\.\d+)/,
];

/** Each deep fade that is not a control waiting on its member, by file and the words that give it. */
const NOT_UNREADY: Record<string, string> = {
  'app/(modals)/log-modal.tsx · submitting && { opacity: 0.5': 'CLOSE while the log is being sealed: at work for a moment, and an icon, not words',
  'app/user/[username].tsx · followLoading && { opacity: 0.5': 'the follow at work for a moment; its words are back the instant the house answers',
  'src/features/settings/DataVault.tsx · undoing && { opacity: 0.5': 'the undo at work for a moment',
  'src/components/profile/FollowRequestsPanel.tsx · btnBusy: { opacity: 0.4': 'admit and decline at work for a moment',
  'src/components/profile/NoirPassport.tsx · opacity: earned ? 1 : 0.18': 'a stamp not yet earned: a picture, not a control',
};

const code = universe('appCode').map((f) => ({ f: relative(MOBILE, f).split('\\').join('/'), text: readCode(f) }));
const found = code.flatMap(({ f, text }) => text.split(/\r?\n/).flatMap((line) => FADES
  .map((re) => re.exec(line))
  .filter((m): m is RegExpExecArray => !!m && Number(m[1]) < DEEP)
  .map((m) => `${f} · ${m[0]}`)));

it('reads the app’s code — it is not passing on none', () => {
  expect(code.length).toBeGreaterThan(400);
  expect(code.some(({ f, text }) => f === 'src/theme/unready.ts' && /export const UNREADY\b/.test(text))).toBe(true);
});

it('fades no control that waits on its member: an unready one is hollow', () => {
  expect(found.filter((k) => !(k in NOT_UNREADY))).toEqual([]);
});

it('and every fade it lets stand is still there', () => {
  expect(Object.keys(NOT_UNREADY).filter((k) => !found.includes(k))).toEqual([]);
});
