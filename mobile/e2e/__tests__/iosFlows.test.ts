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
  });
});
