/**
 * handleHistory.wiring.guard.test.ts — the rename fix must actually be wired in
 * ───────────────────────────────────────────────────────────────────────────
 * handleHistory.test.ts proves the decision is right. Batch 14 measured, on this
 * codebase, that a correct function with its call sites deleted leaves the whole suite
 * green — so "right" is not the same as "reached".
 *
 * Both ends live inside hooks that render a screen booting realtime, film stores,
 * navigation and Supabase. A render test of either would be mocking scaffolding rather
 * than behaviour, and would be deleted the first time it got in the way. So this is a
 * deletion tripwire over the two call sites, plus the three ordering/instrument
 * properties that are silently wrong rather than loudly broken if changed.
 */
import * as fs from 'fs';
import * as path from 'path';

const HOOKS = path.join(__dirname, '..', '..', 'hooks');
const edit = fs.readFileSync(path.join(HOOKS, 'useEditProfile.ts'), 'utf8');
const controller = fs.readFileSync(path.join(HOOKS, 'useProfileController.ts'), 'utf8');
const screen = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'user', '[username].tsx'), 'utf8');

describe('useEditProfile records the handle being given up', () => {
  it('imports and calls rememberPreviousHandle', () => {
    expect(edit).toMatch(/import\s*\{[^}]*rememberPreviousHandle[^}]*\}\s*from\s*['"][^'"]*handleHistory['"]/);
    expect(edit).toMatch(/rememberPreviousHandle\(/);
  });

  it('records only on a save that actually renamed', () => {
    expect(edit).toMatch(/if \(usernameChanged\) rememberPreviousHandle\(/);
  });

  it('records the OLD handle, not the new one', () => {
    // storedUsername is the handle as it was before the form was submitted.
    // Passing sanitizedUsername here would record the handle we are moving TO, and the
    // repair would then never recognise the one we are stranded on.
    expect(edit).toMatch(/rememberPreviousHandle\(user\.id,\s*storedUsername\)/);
  });

  it('records BEFORE the auth store moves', () => {
    // The store update is what flips isSelf and starts the doomed refetch on the screen
    // underneath. Recording after it is a race against a re-render that has already
    // been scheduled.
    const at = edit.indexOf('rememberPreviousHandle(user.id');
    const storeMove = edit.indexOf('useAuthStore.setState(');
    expect(at).toBeGreaterThan(-1);
    expect(storeMove).toBeGreaterThan(-1);
    expect(at).toBeLessThan(storeMove);
  });
});

describe('useProfileController repairs the route', () => {
  it('imports and calls both halves', () => {
    expect(controller).toMatch(/import\s*\{[^}]*shouldRepairHandleRoute[^}]*\}\s*from\s*['"][^'"]*handleHistory['"]/);
    expect(controller).toMatch(/wasMyHandle\(/);
    expect(controller).toMatch(/shouldRepairHandleRoute\(/);
  });

  it('feeds the decision the real state, not constants', () => {
    const call = controller.slice(
      controller.indexOf('shouldRepairHandleRoute({'),
      controller.indexOf('shouldRepairHandleRoute({') + 400
    );
    expect(call).toMatch(/usernameOverride/);
    expect(call).toMatch(/routeUsername:\s*username/);
    expect(call).toMatch(/liveUsername:\s*user\?\.username/);
    expect(call).toMatch(/wasOurs:\s*wasOurHandle/);
    expect(call).toMatch(/loading:\s*data\.loading/);
    expect(call).toMatch(/hasTargetUser:\s*!!data\.targetUser/);
  });

  it('acts on the decision instead of computing and discarding it', () => {
    expect(controller).toMatch(/if \(!repairRoute[^)]*\) return;[\s\S]{0,120}setParams\(/);
  });

  it('holds the not-found screen while the route is being corrected', () => {
    // Without this the screen still paints "Member Not Found" for a frame or two
    // between the repair being decided and the corrected fetch landing.
    expect(controller).toMatch(/setRepairingHandle\(true\)/);
    expect(controller).toMatch(/repairingHandle,/);          // returned to the screen
    expect(screen).toMatch(/if \(loading \|\| repairingHandle\) return/);
  });

  it('the hold can NEVER become a permanent spinner', () => {
    // A hanging "RETRIEVING DOSSIER" with no way out would be a worse failure than the
    // bug. Two independent releases: the profile arriving, and a hard timeout.
    expect(controller).toMatch(/setTimeout\(\(\) => setRepairingHandle\(false\), \d+\)/);
    expect(controller).toMatch(/if \(data\.targetUser\) setRepairingHandle\(false\)/);
  });

  it('uses the route-bound navigation object, NOT router.setParams', () => {
    // The auth store moves ~750ms before Edit Profile pops, so at the moment of repair
    // this screen is NOT the focused one. expo-router's imperative setParams dispatches
    // SET_PARAMS with no `source`, and BaseRouter then falls back to state.index — it
    // would rewrite Edit Profile's params and leave this route stale.
    expect(controller).toMatch(/navigation\.setParams\(/);
    expect(controller).not.toMatch(/router\.setParams\(/);
    expect(controller).toMatch(/const navigation = useNavigation\(\)/);
  });
});
