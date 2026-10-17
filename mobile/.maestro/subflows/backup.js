/* global STEP, http -- Maestro hands a script its env (STEP) and its http client. */
// One step of Android's backup and restore (e2e/fault-proxy.mjs's /backup):
// save, reinstall, restore or marker. Maestro runs this script on the runner,
// so the proxy's control port is at localhost. A step Android did not take as
// it must stops the flow and says why: a marker not back means nothing was
// restored, and the run proves nothing.
const answer = http.post('http://localhost:54331/backup', {
  body: JSON.stringify({ step: STEP }),
  headers: { 'Content-Type': 'application/json' },
});
if (answer.status !== 200) {
  throw new Error(`the backup's ${STEP} did not happen (${answer.status}): ${answer.body}`);
}
