/* global SET, TO, http -- Maestro hands a script its env (SET, TO) and its http client. */
// Changes the phone mid-flow (e2e/fault-proxy.mjs's /phone): SET says what, TO
// its value, as a flow's env gives it (always words): "true" and "false" are
// themselves, "reset" stays a word, anything else is a number. Maestro runs this
// script on the runner, so the proxy's control port is at localhost. A refusal
// stops the flow and says why.
const to = TO === 'true' ? true : TO === 'false' ? false : TO === 'reset' ? 'reset' : Number(TO);
const answer = http.post('http://localhost:54331/phone', {
  body: JSON.stringify({ set: SET, to: to }),
  headers: { 'Content-Type': 'application/json' },
});
if (answer.status !== 200) {
  throw new Error(`the phone was not changed (${answer.status}): ${answer.body}`);
}
