/* global STEP, http -- Maestro hands a script its env (STEP) and its http client. */
// One step of the upgrade (e2e/fault-proxy.mjs's /upgrade): old or new. Maestro
// runs this script on the runner, so the proxy's control port is at localhost.
// A step not taken (no old build to install, an install Android refused) stops
// the flow and says why: an upgrade run on the new build alone proves nothing.
const answer = http.post('http://localhost:54331/upgrade', {
  body: JSON.stringify({ step: STEP }),
  headers: { 'Content-Type': 'application/json' },
});
if (answer.status !== 200) {
  throw new Error(`the upgrade's ${STEP} step did not happen (${answer.status}): ${answer.body}`);
}
