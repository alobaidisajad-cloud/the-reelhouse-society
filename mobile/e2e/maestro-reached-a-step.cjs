#!/usr/bin/env node
/**
 * maestro-reached-a-step.cjs — did a Maestro run reach the app at all?
 *
 *   node mobile/e2e/maestro-reached-a-step.cjs <maestro-output>
 *
 * Exit 0: some step ran and answered (COMPLETED or FAILED): what happened is the app's, and its
 * verdict stands. Exit 1: no step answered: Maestro's iOS driver never started ("iOS driver not
 * ready in time"), or the first launch was never answered, so the app was never asked anything.
 * That is the harness's own failure, and the iPad job gives such a stage once more, as the
 * iPhone's launch gives a simulator that never started the app (ios-launch.yml). A step that
 * ran and failed is never tried again.
 *
 * iPhone launch 43776770824: the iPad's first stage timed out starting the driver, its second
 * printed its launch and nothing after it, and the third then turned a home screen on its side,
 * looking for a sign-in sheet that was never opened.
 */
const { readFileSync } = require('fs');

/**
 * A step's answer: Maestro prints it after the step's "...", on the same line or (when the
 * simulator speaks between them, as its GL warning does) on the next.
 */
const ANSWER = /(?:^|\s)(COMPLETED|FAILED)\s*$/m;

/** Whether this Maestro output holds an answered step. */
const reachedAStep = (output) => ANSWER.test(String(output).replace(/\r\n/g, '\n'));

module.exports = { reachedAStep };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node e2e/maestro-reached-a-step.cjs <maestro-output>');
    process.exit(2);
  }
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { /* no output at all: no step was reached */ }
  process.exit(reachedAStep(text) ? 0 : 1);
}
