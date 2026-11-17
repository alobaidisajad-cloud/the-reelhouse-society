/**
 * aPressOnWordsActsOnce.test.ts — review round 8 (onePress)
 * ─────────────────────────────────────────────────────────────────────────────
 * A PressableScale waits out 400 ms after a press before it hears another; words with a press of
 * their own (a stack's curator, a link in a salon) had no such wait, so a quick double tap opened
 * the curator's file twice, one over the other, and a link twice. onePress hears each press once
 * in that span, by what it does, on the forward clock.
 */
import { ONE_PRESS_MS, onePress } from '../onePress';

let clock = 0;
beforeEach(() => {
  // Far from any press another case heard: the span is kept by name, for the app's whole life.
  clock += 1_000_000;
  // The forward clock monotonicNow reads: performance's, or Date's where there is none (bare Hermes).
  jest.spyOn('performance' in globalThis ? performance : Date, 'now').mockImplementation(() => clock);
});
afterEach(() => jest.restoreAllMocks());

it('waits out the same span as a PressableScale', () => {
  expect(ONE_PRESS_MS).toBe(400);
});

it('a second tap on the same words within 400 ms does nothing', () => {
  const open = jest.fn();
  onePress('curator:morpho', open);
  clock += 120;
  onePress('curator:morpho', open);
  clock += ONE_PRESS_MS - 121;
  onePress('curator:morpho', open);
  expect(open).toHaveBeenCalledTimes(1);
});

it('a tap once 400 ms have passed acts again', () => {
  const open = jest.fn();
  onePress('curator:vertigo', open);
  clock += ONE_PRESS_MS;
  onePress('curator:vertigo', open);
  expect(open).toHaveBeenCalledTimes(2);
});

it('another name, or another link, is its own press', () => {
  const opened: string[] = [];
  onePress('curator:kane', () => opened.push('kane'));
  onePress('curator:rosebud', () => opened.push('rosebud'));
  onePress('link:https://example.com/a', () => opened.push('a'));
  onePress('link:https://example.com/b', () => opened.push('b'));
  expect(opened).toEqual(['kane', 'rosebud', 'a', 'b']);
});

it('a swallowed tap does not stretch the wait: the span runs from the press that acted', () => {
  const open = jest.fn();
  onePress('link:https://example.com/c', open);
  clock += 300;
  onePress('link:https://example.com/c', open);
  clock += 100;
  onePress('link:https://example.com/c', open);
  expect(open).toHaveBeenCalledTimes(2);
});
