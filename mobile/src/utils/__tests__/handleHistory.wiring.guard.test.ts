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
const service = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'ProfileWriteService.ts'), 'utf8');
const screen = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'user', '[username].tsx'), 'utf8');

describe('the handle being given up is recorded at the FUNNEL, not at one door', () => {
  /**
   * This started at the call site in useEditProfile, and that was a gap.
   * `ProfileService.updateProfile` has THREE doors — useEditProfile, useUpdateUser and
   * auth.updateUser — and the last two take a `Partial<User>`, which includes
   * `username`. Only one of the three recorded anything.
   *
   * No caller passes a handle through the other two today, so nothing was broken. But
   * "the path I happened to be looking at" is exactly how the rest of this batch got
   * closed three times over, so the recording now sits at the single point every
   * handle change already funnels through.
   */
  it('lives in the write service, which every path goes through', () => {
    expect(service).toMatch(/import\s*\{[^}]*rememberPreviousHandle[^}]*\}\s*from\s*['"][^'"]*handleHistory['"]/);
    expect(service).toMatch(/rememberPreviousHandle\(userId,\s*previous\)/);
  });

  it('is NOT duplicated back at a call site, where it could drift', () => {
    expect(edit).not.toMatch(/rememberPreviousHandle\(/);
  });

  it('records only when a handle actually changed', () => {
    expect(service).toMatch(/if \(typeof dbUpdates\.username === 'string'\)/);
    expect(service).toMatch(/previous\.toLowerCase\(\) !== dbUpdates\.username\.toLowerCase\(\)/);
  });

  it('records the OLD handle, read before the new one replaced it', () => {
    // Recording the handle being moved TO would leave the repair unable to recognise
    // the one the member is stranded on.
    //
    // UPDATED, and the implementation is stronger than what this used to assert.
    // It required the old handle be read from the profile CACHE. That cache is now
    // only written when storage can be encrypted, so on a device whose keystore has
    // failed it does not exist — and this recording would have stopped happening
    // silently, with no other symptom. The caller passes the value it already holds,
    // and the cache remains only as a fallback for callers that do not.
    expect(service).toMatch(/previousUsername\?: string/);
    expect(service).toMatch(/let previous = previousUsername;/);
    expect(service).toMatch(/CACHE_KEYS\.USER\(userId\)/);
  });

  it('and the rename doors hand it over rather than relying on that cache', () => {
    const auth = fs.readFileSync(path.join(__dirname, '..', '..', 'stores', 'auth.ts'), 'utf8');
    // auth.updateUser optimistically moves the store BEFORE calling the service, so
    // memory already holds the NEW name there — `prevUser` is the only reliable source.
    expect(auth).toMatch(/updateProfile\(user\.id, safeUpdates as Partial<User>, prevUser\?\.username\)/);
  });

  it('records AFTER the write succeeds — a handle we failed to give up is not a past one', () => {
    const write = service.indexOf("supabase.from('profiles').update(validatedData)");
    const record = service.indexOf('rememberPreviousHandle(userId');
    expect(write).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(write);
  });

  it('does not import the auth store — that would close a require cycle', () => {
    // auth.ts imports this module. Importing it back breaks the app at load time.
    expect(service).not.toMatch(/from\s*['"][^'"]*stores\/auth['"]/);
  });

  it('still lands before the auth store moves, which starts the doomed refetch', () => {
    // updateProfile is awaited before useEditProfile touches the store, so the
    // recording is complete by the time isSelf can flip.
    const call = edit.indexOf('ProfileService.updateProfile(');
    const storeMove = edit.indexOf('useAuthStore.setState(');
    expect(call).toBeGreaterThan(-1);
    expect(storeMove).toBeGreaterThan(-1);
    expect(call).toBeLessThan(storeMove);
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
