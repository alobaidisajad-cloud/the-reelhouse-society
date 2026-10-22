/**
 * anUnreadyControlIsHollow.guard.test.ts — a control that cannot act yet is drawn hollow, never faded.
 * ─────────────────────────────────────────────────────────────────────────────
 * Controls said "not yet" by fading to 0.3–0.6 of themselves, or by swapping their brass for
 * the dark of the card while their words stayed ink: either way SHARE TO LOUNGE, FILE REPORT,
 * FILE THE ESSAY could not be read until they could be pressed (the polish pass, 2026-10-22).
 * An unready control takes UNREADY (src/theme/unready.ts): its frame says "not yet", its words
 * stay readable. This reads the app's code, whole style objects across their lines, for:
 *   - a fade under 0.7 given on a condition (`x && { opacity: 0.4 }`, `opacity: x ? 1 : 0.4`);
 *   - a style named for the state (…Disabled, …Dim, …Busy, …Blocked) that fades or recolours:
 *     the look of "not yet" comes from UNREADY alone.
 * What is left is a control at work for a moment, or a picture, each named with why. A lighter
 * fade (a press, a closed ballot at 0.82) keeps its words readable and is not this.
 */
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';
import { readCode } from '@/test-utils/readCode';

const MOBILE = join(__dirname, '..', '..', '..');
const DEEP = 0.7;
/** A fade given on a condition, inline or as a ternary. */
const FADES = [
  /[\w.!)]+\s*&&\s*\{[^{}]*?\bopacity:\s*(0?\.\d+)/g,
  /\bopacity:\s*[^,{}]+\?\s*[\d.]+\s*:\s*(0?\.\d+)/g,
];
/** A style named for a control's state, and its body. */
const STATE_STYLE = /\b(\w*(?:Disabled|Dim|Busy|Blocked))\s*:\s*\{([^{}]*)\}/g;
/** What a state style may not do: fade under DEEP, or change the control's colours. */
const RECOLOURS = /\b(?:backgroundColor|color|borderColor)\s*:/;

/** Each that is not a control waiting on its member, by file and its words (whitespace made one space). */
const NOT_UNREADY: Record<string, string> = {
  'app/(modals)/log-modal.tsx · submitting && { opacity: 0.5': 'CLOSE while the log is being sealed: at work for a moment, and an icon, not words',
  'app/user/[username].tsx · followLoading && { opacity: 0.5': 'the follow at work for a moment; its words are back the instant the house answers',
  'src/features/settings/DataVault.tsx · undoing && { opacity: 0.5': 'the undo at work for a moment',
  'src/components/profile/FollowRequestsPanel.tsx · btnBusy': 'admit and decline at work for a moment',
  'src/theme/authStyles.ts · inputDisabled': 'the sign-in fields while the house checks them: at work for a moment, the button says VERIFYING',
  'src/components/profile/NoirPassport.tsx · opacity: earned ? 1 : 0.18': 'a stamp not yet earned: a picture, not a control',
};

const code = universe('appCode').map((f) => ({ f: relative(MOBILE, f).split('\\').join('/'), text: readCode(f) }));
const one = (s: string) => s.replace(/\s+/g, ' ');
/** Each fade given on a condition, in its own words. */
const fadesIn = (text: string) => FADES.flatMap((re) => [...text.matchAll(re)].flatMap(([all, alpha = '1']) => (Number(alpha) < DEEP ? [one(all)] : [])));
/** Each state style that fades or recolours, by its name. */
const stateStylesIn = (text: string) => [...text.matchAll(STATE_STYLE)].flatMap(([, name = '', body = '']) =>
  RECOLOURS.test(body) || [...body.matchAll(/\bopacity:\s*(0?\.\d+)/g)].some(([, alpha = '1']) => Number(alpha) < DEEP) ? [name] : []);
const found = code.flatMap(({ f, text }) => [...fadesIn(text), ...stateStylesIn(text)].map((k) => `${f} · ${k}`));

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

it('reads a style written over several lines, and a state style that only recolours', () => {
  const sample = 'const s = {\n  sendDisabled: {\n    opacity: 0.5,\n  },\n  goBlocked: { backgroundColor: colors.ash },\n};';
  expect(stateStylesIn(sample)).toEqual(['sendDisabled', 'goBlocked']);
  // and a light fade, or a state style that only changes size, is not this
  expect(stateStylesIn('const s = { pressDim: { opacity: 0.85 }, tagOff: { fontSize: 12 } };')).toEqual([]);
});
