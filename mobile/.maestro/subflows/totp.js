/* global maestro, http, output -- Maestro hands a script the text it copied, its http client and its output. */
// The code the key on the screen shows now, as an authenticator app would show it
// (e2e/fault-proxy.mjs's /totp): the runner holds no authenticator, so the proxy is
// one. The key is the text the flow copied off the Tribunal's door, its label and
// its spacing taken off. Maestro runs this script on the runner, so the proxy's
// control port is at localhost. No key or no code stops the flow and says why.
const secret = String(maestro.copiedText || '').replace(/^The key:/, '').replace(/\s+/g, '');
const answer = http.post('http://localhost:54331/totp', {
  body: JSON.stringify({ secret: secret }),
  headers: { 'Content-Type': 'application/json' },
});
if (answer.status !== 200) {
  throw new Error(`no code for the key on the screen (${answer.status}): ${answer.body}`);
}
output.code = JSON.parse(answer.body).code;
