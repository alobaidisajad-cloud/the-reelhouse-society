/**
 * The iOS flow runner (WORKLIST P0.89): the flows the iPhone launch check runs on the simulator
 * (e2e/ios-flows.json) are flows of .maestro that need no server, and the workflow runs each of
 * them, by the list, on the simulator the launch used.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
const list = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'ios-flows.json'), 'utf8')) as { flows: string[] };
const flow = (f: string) => readFileSync(join(MOBILE, '.maestro', f), 'utf8');

/** What in a flow needs the house: a seeded account, a sign-in, or a step on Android's network alone. */
const needsAServer = (text: string) => [
  /\$\{E2E_[A-Z_]+\}/.test(text) && 'a seeded account',
  /sign_in\.yaml|backup\.yaml|fault\.yaml/.test(text) && 'a subflow that reaches the house',
  /toggleAirplaneMode/.test(text) && "Android's airplane mode",
].filter(Boolean);

describe('the flows the iPhone runs', () => {
  it('are flows of .maestro, at least the boot', () => {
    expect(list.flows).toContain('boot_verification.yaml');
    expect(list.flows.filter((f) => !existsSync(join(MOBILE, '.maestro', f)))).toEqual([]);
  });

  it('each need no server: no seeded account, no sign-in, no Android-only step', () => {
    expect(list.flows.map((f) => [f, needsAServer(flow(f))]).filter(([, why]) => (why as unknown[]).length)).toEqual([]);
    expect(needsAServer(flow('login_flow.yaml'))).toContain('a subflow that reaches the house');
    expect(needsAServer(flow('auth_flow.yaml'))).toContain('a seeded account');
  });

  it('are run by the iPhone launch check, each, on the simulator it launched', () => {
    const wf = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');
    expect(wf).toContain("require('./e2e/ios-flows.json').flows");
    expect(wf).toMatch(/"\$MAESTRO_BIN" --device "\$SIM_DEVICE" test "\.maestro\/\$f"/);
    expect(wf).toContain('echo "SIM_DEVICE=$DEV" >> "$GITHUB_ENV"');
    // Maestro's screenshots sit under a hidden .maestro folder: the records are kept with them.
    expect(wf).toMatch(/name: ios-flows\s+path: \$\{\{ runner\.temp \}\}\/ios-flows\s+include-hidden-files: true/);
  });

  it('give Maestro\'s iPhone driver minutes to start, not its default', () => {
    // iPhone launch at ed79856d: the second flow failed on "iOS driver not ready in time".
    const wf = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8').replace(/\r\n/g, '\n');
    const step = wf.slice(wf.indexOf('- name: The flows that need no server, on the simulator'));
    const wait = Number((/MAESTRO_DRIVER_STARTUP_TIMEOUT: '(\d+)'/.exec(step.slice(0, step.indexOf('run: |'))) ?? [])[1]);
    expect(wait).toBeGreaterThanOrEqual(120000);
  });

  it('open a link with the app closed once more on iOS, where the simulator may hang the launch', () => {
    // iPhone launch 39836999452: after a stop, the simulator hung the app's launch (no line from the
    // app at all) and gave up the link at ten seconds.
    const flowText = flow('auth_deep_link.yaml');
    const iosCold = /- stopApp\n(?:[\s\S]*?)- runFlow:\n {4}when:\n {6}platform: iOS\n {4}commands:\n {6}- retry:\n {10}maxRetries: 1\n {10}commands:\n {12}- openLink: "reelhouse:\/\/_sitemap"/;
    expect(flowText.replace(/\r\n/g, '\n')).toMatch(iosCold);
  });

  it('open a link as a member who once answered iOS\'s "Open": the app\'s scheme is approved before any flow runs', () => {
    // iPhone launch 39795157842: the check behind iOS's "Open in ...?" neither asked nor opened the link.
    const wf = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');
    const app = (JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')) as { expo: { scheme: string; ios: { bundleIdentifier: string } } }).expo;
    const approve = `defaults write com.apple.launchservices.schemeapproval \\\n            'com.apple.CoreSimulator.CoreSimulatorBridge-->${app.scheme}' -string ${app.ios.bundleIdentifier}`;
    const at = wf.replace(/\r\n/g, '\n').indexOf(approve);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(wf.replace(/\r\n/g, '\n').indexOf('"$MAESTRO_BIN" --device "$SIM_DEVICE" test'));
  });
});
