/* global FAULT, http -- Maestro hands a script its env (FAULT) and its http client. */
// Sets the fault FAULT names on the network between the app and the house
// (e2e/fault-proxy.mjs), or clears it for "none". Maestro runs this script on
// the runner itself, so the proxy's control port is at localhost, where e2e.yml
// started it. An unknown name, or a refusal, stops the flow and says why.
const FAULTS = {
  // Every read and every function answered with a gateway's 503 page.
  house_down: { kind: 'http', route: '^/(rest|functions)/v1/', status: 503 },
  // The plan's EDGE: three seconds late, give or take one, at 20 KB a second.
  edge: { kind: 'slow', latencyMs: 3000, jitterMs: 1000, bytesPerSecond: 20480 },
};
const url = 'http://localhost:54331/fault';
let answer;
if (FAULT === 'none') {
  answer = http.request(url, { method: 'DELETE' });
} else if (FAULTS[FAULT]) {
  const body = JSON.stringify(FAULTS[FAULT]);
  const headers = { 'Content-Type': 'application/json' };
  answer = http.post(url, { body: body, headers: headers });
} else {
  throw new Error(`no fault named ${FAULT} (the faults: ${Object.keys(FAULTS)})`);
}
if (answer.status !== 200) {
  throw new Error(`the fault proxy refused (${answer.status}): ${answer.body}`);
}
