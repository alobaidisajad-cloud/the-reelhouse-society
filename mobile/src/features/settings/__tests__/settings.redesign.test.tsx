/**
 * settings.redesign.test.tsx — the dossier desk, driven.
 *
 * A 1,700-line feature that had no tests at all, and whose worst defects were
 * invisible to reading: four notification switches nobody read, an account
 * deletion that erased two different amounts depending on which door you came
 * through, a password panel that undercut the standard the join screen enforces,
 * and a billing card with no billing in it.
 *
 * These drive the screen. Where a fact is pure geometry — the numbers that put a
 * control on the 48pt floor, the halos that let one control steal another's
 * taps — it is read from the source, because layout arithmetic has no rendered
 * symptom until it is wrong on a device.
 */
import React, { act } from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import { SettingsScreen } from '../SettingsScreen';

const DIR = join(__dirname, '..');
const SCREEN = readFileSync(join(DIR, 'SettingsScreen.tsx'), 'utf8');
const SECTIONS = readFileSync(join(DIR, 'SettingsSections.tsx'), 'utf8');
const STYLES = readFileSync(join(DIR, 'settings.styles.ts'), 'utf8');
const VAULT = readFileSync(join(DIR, 'DataVault.tsx'), 'utf8');

let mockUser: Record<string, unknown> | null;
let mockPerm: string;
let mockPrevent: { enabled: boolean; cb: ((o: { data: { action: unknown } }) => void) | null };
const mockLogout = jest.fn(() => Promise.resolve());
const mockClearAll = jest.fn();
const mockRequestDeletion = jest.fn(() => Promise.resolve());
const mockNavReplace = jest.fn();
const mockRequestPermission = jest.fn(() => Promise.resolve('granted'));
const mockAlert = jest.fn();

jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: (...a: unknown[]) => mockNavReplace(...a) } }));
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (enabled: boolean, cb: (o: { data: { action: unknown } }) => void) => { mockPrevent = { enabled, cb }; },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => {
    const state = { user: mockUser, logout: mockLogout, setPreference: jest.fn(() => Promise.resolve()) };
    return sel ? sel(state) : state;
  };
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({ user: mockUser, setPreference: jest.fn(() => Promise.resolve()) });
  return { useAuthStore };
});
jest.mock('@/src/stores/settings', () => {
  const useSettingsStore = (sel?: (s: unknown) => unknown) => {
    const state = { tactileAudioEnabled: true, setTactileAudioEnabled: jest.fn() };
    return sel ? sel(state) : state;
  };
  (useSettingsStore as unknown as { getState: () => unknown }).getState = () => ({ tactileAudioEnabled: true });
  return { useSettingsStore };
});
jest.mock('@/src/stores/mmkv-storage', () => ({ storage: { clearAll: () => mockClearAll(), set: jest.fn(), getString: jest.fn(), delete: jest.fn() } }));
jest.mock('@/src/services/AuthService', () => ({ AuthService: { requestAccountDeletion: () => mockRequestDeletion(), updatePassword: jest.fn() } }));
jest.mock('@/src/hooks/useUpdateUser', () => ({ useUpdateUser: () => ({ mutateAsync: jest.fn(() => Promise.resolve()), isPending: false }) }));
jest.mock('@/src/services/ModerationService', () => ({ ModerationService: { getPendingCount: jest.fn(() => Promise.resolve(3)) } }));
jest.mock('@/src/lib/pushNotifications', () => ({
  getPushPermissionState: jest.fn(() => Promise.resolve(mockPerm)),
  requestPushPermission: () => mockRequestPermission(),
}));
jest.mock('@/src/features/settings/DataVault', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, '[DataVault]') };
});
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = jest.fn() as jest.Mock & { error: jest.Mock; success: jest.Mock };
  t.error = jest.fn(); t.success = jest.fn();
  return { __esModule: true, default: t };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (p: Record<string, unknown>) => React.createElement('Icon', p) });
});
jest.mock('react-native/Libraries/Alert/Alert', () => ({ alert: (...a: unknown[]) => mockAlert(...a) }));
// The global mock carries no version, so the footer line could never render and
// a test asserting only that the SOURCE mentions it proved nothing.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.2', extra: {} } } }));

const BASE = {
  id: 'u1', username: 'sajjadobaidi', email: 'member@example.com',
  created_at: '2026-03-04T00:00:00Z', is_social_private: false, preferences: {},
};

const mount = () => render(<SettingsScreen />);
const settle = async (r: ReturnType<typeof mount>) => {
  await act(async () => {});
  await waitFor(() => expect(r.getAllByText('Settings').length).toBeGreaterThan(0));
  return r;
};

/**
 * Source with its comments removed.
 *
 * Every explanatory comment in these files NAMES the thing it removed — "the
 * dropped clause (SECURE CHECKOUT)", "the biometric route did not call
 * storage.clearAll()". Asserting absence against raw source therefore fails on
 * the very prose that documents the fix. Strip first, always.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const CODE_SCREEN = code(SCREEN);
const CODE_SECTIONS = code(SECTIONS);
const CODE_VAULT = code(VAULT);

/** Brace-matched — never `[^}]*`, which stops inside a nested object. */
function styleBody(src: string, name: string): string {
  const at = src.indexOf(`\n  ${name}: {`);
  const at2 = at === -1 ? src.indexOf(`\n    ${name}: {`) : at;
  if (at2 === -1) throw new Error(`style not found: ${name}`);
  const open = src.indexOf('{', at2);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unterminated style: ${name}`);
}

/** Every `<PressableScale` tag's props, stopping at the first unbraced `>`. */
function pressableTags(src: string): string[] {
  return [...src.matchAll(/<PressableScale\b/g)].map(m => {
    const at = m.index!;
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      else if (src[i] === '>' && depth === 0) return src.slice(at, i);
    }
    return src.slice(at);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { ...BASE };
  mockPerm = 'granted';
  mockPrevent = { enabled: false, cb: null };
});

describe('the page says what it is', () => {
  it('is called Settings, and the title is centred', async () => {
    const r = await settle(mount());
    expect(r.queryByText('Dossier Settings')).toBeNull();
    // The hero centres its children, so a one-line title looked right by
    // accident; a wrapped one sat left inside a centred block.
    expect(styleBody(STYLES, 'heroTitle')).toMatch(/textAlign: 'center'/);
  });

  it('keeps its own name in the bar once the letterhead is gone', async () => {
    const r = await settle(mount());
    // Exactly one Settings is offered to a reader — the heading. The bar's
    // echo is in the tree but hidden, which is why it does not appear here.
    expect(r.getAllByText('Settings')).toHaveLength(1);
    expect(r.getAllByText('Settings', { includeHiddenElements: true })).toHaveLength(2);
    expect(CODE_SCREEN).toMatch(/interpolate\(scrollY\.value/);
  });

  it('and the bar’s echo is hidden from assistive tech', () => {
    // A reader already has the real header; it would otherwise meet the word
    // twice before reaching anything it can act on.
    const at = SCREEN.indexOf('style={[st.navTitle, navTitleStyle]}');
    const tag = SCREEN.slice(at, SCREEN.indexOf('>', SCREEN.indexOf('Settings', at)));
    expect(tag).toMatch(/accessibilityElementsHidden/);
    expect(tag).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });
});

describe('membership & billing — the card that had no billing', () => {
  it('gives every rank a way through to The Society', async () => {
    const r = await settle(mount());
    expect(r.getByText('CHOOSE YOUR RANK')).toBeTruthy();
  });

  it('including the Auteur, who had no control at all', async () => {
    // The member paying most got a sentence and nothing to press, so there was
    // no route from this page to cancelling or restoring.
    mockUser = { ...BASE, tier: 'auteur' };
    const r = await settle(mount());
    expect(r.getByText('Auteur')).toBeTruthy();
    expect(r.getByText(/highest rank/)).toBeTruthy();
    expect(r.getByText('CHOOSE YOUR RANK')).toBeTruthy();
  });

  it('never names one rank as though it were the only next step', async () => {
    // The Society shows all three side by side and you may go straight from
    // free to Auteur, so naming a single step would be a lie.
    const r = await settle(mount());
    expect(r.queryByText(/RISE TO/)).toBeNull();
    expect(r.queryByText(/UPGRADE/)).toBeNull();
  });

  it('shows the three standings with yours lit', async () => {
    const r = await settle(mount());
    for (const rank of ['CINEPHILE', 'ARCHIVIST', 'AUTEUR']) expect(r.getByText(rank)).toBeTruthy();
    expect(r.getByLabelText(/Your rank is Cinephile/)).toBeTruthy();
  });

  it('and a founding member reads as Auteur, not as a fourth stop', async () => {
    mockUser = { ...BASE, tier: 'founding' };
    const r = await settle(mount());
    expect(r.getByText('Auteur')).toBeTruthy();
    expect(r.queryByText('FOUNDING')).toBeNull();
  });

  it('says patronage nowhere', () => {
    expect(CODE_SECTIONS).not.toMatch(/PATRONAGE/);
    expect(SECTIONS).toMatch(/MEMBERSHIP & BILLING/);
  });

  it('the small print fits on one line', () => {
    // 7pt with 2pt tracking wrapped and crowded the card's edge.
    expect(CODE_SECTIONS).toMatch(/IN-APP PURCHASE · APP STORE/);
    expect(CODE_SECTIONS).not.toMatch(/SECURE CHECKOUT/);
    expect(Number(styleBody(SECTIONS, 'microNote').match(/fontSize: ([\d.]+)/)![1])).toBeGreaterThanOrEqual(7.5);
  });
});

describe('account', () => {
  it('draws the handle and email as records, not as fields you cannot type in', async () => {
    const r = await settle(mount());
    expect(r.getByText('HANDLE')).toBeTruthy();
    expect(r.queryByText('USERNAME')).toBeNull();
    expect(r.getByText('CHANGED IN YOUR PROFILE')).toBeTruthy();   // and where it can be
    expect(styleBody(SECTIONS, 'recordValue')).toMatch(/borderBottomWidth: 1/);
    expect(styleBody(SECTIONS, 'recordValue')).not.toMatch(/borderWidth:/);
  });

  it('the biometric switch admits all three things it does', async () => {
    // It said "for destructive actions". It also puts a vault screen in front
    // of the member's OWN Physical Archive, unannounced.
    const r = await settle(mount());
    const line = r.getByText(/Face ID or Touch ID/);
    const said = String(line.props.children);
    expect(said).toMatch(/sign out/);
    expect(said).toMatch(/delete your account/);
    expect(said).toMatch(/Physical Archive/);
    expect(r.queryByText(/for destructive actions/)).toBeNull();
  });

  it('every switch says its own name', async () => {
    const r = await settle(mount());
    // A Switch with no label announces "off, switch" and never which switch.
    for (const name of ['Biometric security', 'New Followers', 'Certifications', 'Annotations', 'System Alerts', 'Tactile feedback']) {
      expect(r.getByLabelText(name)).toBeTruthy();
    }
  });

  it('the off state is drawn by the app on BOTH platforms', () => {
    // On iOS trackColor.false tints only the outline; the fill stays system
    // default, so an off switch was a bright grey pill on the darkest page.
    const at = SECTIONS.indexOf('<Switch');
    expect(SECTIONS.slice(at, at + 700)).toMatch(/ios_backgroundColor/);
  });
});

describe('the password panel upheld a weaker standard than the front door', () => {
  it('uses the join screen’s own checker and meter', () => {
    // Joining requires all five tests. Changing a password here required one —
    // eight characters — so a member could downgrade from inside the house.
    expect(SECTIONS).toMatch(/from '@\/src\/components\/auth\/PasswordStrengthMeter'/);
    expect(SECTIONS).toMatch(/getPasswordChecks/);
    expect(SECTIONS).toMatch(/pwPassed === PW_CHECK_LABELS\.length/);
  });

  it('and no longer advertises the weaker bar', () => {
    expect(CODE_SECTIONS).not.toMatch(/Min\. 8 characters/);
    expect(CODE_SECTIONS).not.toMatch(/newPassword\.length < 8/);
  });
});

describe('privacy', () => {
  it('splits the name from its explanation instead of wrapping', async () => {
    const r = await settle(mount());
    expect(r.getByText('Public')).toBeTruthy();
    expect(r.getByText('Anyone can see your activity')).toBeTruthy();
    expect(r.queryByText(/Public — Anyone/)).toBeNull();
  });

  it('names what is being certified and annotated', async () => {
    const r = await settle(mount());
    expect(r.getByText('WHO CAN CERTIFY YOUR LOGS')).toBeTruthy();
    expect(r.getByText('WHO CAN ANNOTATE YOUR LOGS')).toBeTruthy();
  });

  it('each option is a 48pt row that claims nothing beyond itself', () => {
    // 38pt rows stacked with no gap, each carrying a 10pt halo: 20pt of overlap
    // and the LOWER option wins, so the bottom of every choice selected the one
    // beneath it — on a privacy control.
    expect(Number(styleBody(SECTIONS, 'radioOption').match(/minHeight: (\d+)/)![1])).toBeGreaterThanOrEqual(48);
  });

  it('and the groups announce themselves as groups', () => {
    expect((SECTIONS.match(/accessibilityRole="radiogroup"/g) || [])).toHaveLength(3);
  });
});

describe('notifications — four switches nobody read', () => {
  it('says what they actually govern', async () => {
    const r = await settle(mount());
    expect(r.getByText(/These govern what reaches your lock screen/)).toBeTruthy();
    expect(r.getByText(/notification list keeps everything/)).toBeTruthy();
  });

  it('drops the prose that said nothing you could act on', () => {
    expect(CODE_SECTIONS).not.toMatch(/cinematic alerts/);
    expect(CODE_SECTIONS).not.toMatch(/MOBILE INTEGRATION/);
  });

  it('stays silent when the phone is delivering them', async () => {
    // A permanent banner announcing that all is well is noise.
    mockPerm = 'granted';
    const r = await settle(mount());
    expect(r.queryByText(/WITHHOLDING/)).toBeNull();
    expect(r.queryByText(/HAS NOT BEEN ASKED/)).toBeNull();
  });

  it('speaks up when the phone is withholding them', async () => {
    mockPerm = 'denied';
    const r = await settle(mount());
    await waitFor(() => expect(r.getByText('THIS DEVICE IS WITHHOLDING ALERTS')).toBeTruthy());
    expect(r.getByLabelText('Open system settings')).toBeTruthy();
  });

  it('and offers to ask when it never has', async () => {
    mockPerm = 'undetermined';
    const r = await settle(mount());
    await waitFor(() => expect(r.getByText('THIS DEVICE HAS NOT BEEN ASKED')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText('Allow alerts on this device')); });
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('says nothing at all where push cannot work', async () => {
    // A simulator, or the push module absent. Alarming someone about a thing
    // that cannot apply to them is worse than silence.
    mockPerm = 'unavailable';
    const r = await settle(mount());
    expect(r.queryByText(/WITHHOLDING/)).toBeNull();
    expect(r.queryByText(/HAS NOT BEEN ASKED/)).toBeNull();
  });

  it('reading the permission never spends the one prompt', () => {
    // iOS grants exactly one. Spending it on a screen someone is inspecting
    // spends it for ever.
    const lib = readFileSync(join(DIR, '..', '..', 'lib', 'pushNotifications.ts'), 'utf8');
    const at = lib.indexOf('export async function getPushPermissionState');
    const body = lib.slice(at, lib.indexOf('export async function requestPushPermission'));
    expect(body).toMatch(/getPermissionsAsync/);
    expect(body).not.toMatch(/requestPermissionsAsync/);
  });
});

describe('this device', () => {
  it('is named for what it is, so the instant save needs no note', async () => {
    const r = await settle(mount());
    expect(r.getByText('THIS DEVICE')).toBeTruthy();
    expect(r.queryByText('EXPERIENCE')).toBeNull();
  });
});

describe('the way out, and the way to leave for good', () => {
  it('every exit warns about unsaved work, not only the arrow', () => {
    // The guard hung off the back button's onPress, so the iOS swipe gesture
    // and Android's hardware back walked past it in silence.
    expect(SCREEN).toMatch(/usePreventRemove\(isDirty && !saving/);
    expect(mockPrevent).toBeDefined();
  });

  it('deletion erases the same amount whichever door you came through', async () => {
    // The email-code route wiped the device; the biometric route did not, so
    // drafts, the import receipt and local flags outlived the account.
    const codePath = SCREEN.slice(SCREEN.indexOf("otpAction === 'deleteAccount'"));
    expect(codePath.slice(0, 200)).toMatch(/completeAccountDeletion\(\)/);
    const biometricPath = SCREEN.slice(SCREEN.indexOf('const handleDeleteAccount'));
    expect(biometricPath.slice(0, 2200)).toMatch(/completeAccountDeletion\(\)/);
    // and there is exactly one place that erases
    expect((CODE_SCREEN.match(/storage\.clearAll\(\)/g) || [])).toHaveLength(1);
  });

  it('the erasure removes the rows, the session AND the device', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const completeAccountDeletion'), SCREEN.indexOf('const executePendingOtpAction'));
    expect(fn).toMatch(/requestAccountDeletion/);
    expect(fn).toMatch(/logout\(\)/);
    expect(fn).toMatch(/storage\.clearAll\(\)/);
    expect(fn).toMatch(/nav\.replace\('\/login'\)/);
  });
});

describe('the security box no longer strands you', () => {
  it('offers a new code, and says why one never came', () => {
    // It opened BEFORE the send was attempted; a failure left a live box, an
    // empty field, and a toast that had already gone.
    expect(SCREEN).toMatch(/SEND A NEW CODE/);
    expect(SCREEN).toMatch(/setOtpError/);
    expect(SCREEN).toMatch(/st\.modalFail/);
  });

  it('and will not ask again before the server would accept it', () => {
    expect(SCREEN).toMatch(/OTP_RESEND_SECONDS = 60/);
    expect(SCREEN).toMatch(/resendIn > 0/);
  });

  it('its two buttons cannot steal each other’s taps', () => {
    // 12pt apart with 15pt halos each: the right edge of CANCEL pressed VERIFY,
    // on the box that authorises deleting an account.
    for (const name of ['modalBtnCancel', 'modalBtnConfirm']) {
      expect(Number(styleBody(STYLES, name).match(/minHeight: (\d+)/)![1])).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('nothing claims a halo it does not own', () => {
  it('EVERY pressable across the feature declines the default', () => {
    // PressableScale's default is 15pt on every side, given by NOT passing the
    // prop. It is invisible to both accessibility layers, and where controls
    // stack the later sibling wins the overlap — which is how the bottom of
    // SIGN OUT came to press DELETE ACCOUNT.
    const tags = [...pressableTags(SCREEN), ...pressableTags(SECTIONS), ...pressableTags(VAULT)];
    expect(tags.length).toBeGreaterThanOrEqual(14);          // never vacuous
    expect(tags.filter(t => !/hitSlop=\{null\}/.test(t))).toHaveLength(0);
    expect(CODE_SCREEN + CODE_SECTIONS + CODE_VAULT).not.toMatch(/HITSLOP_/);
  });

  it('and every control reaches 48 by its own geometry', () => {
    const checks: [string, string, string][] = [
      [STYLES, 'navBackBtn', 'height'], [STYLES, 'navBackBtn', 'width'],
      [STYLES, 'navSaveBtn', 'minHeight'], [STYLES, 'modalResend', 'minHeight'],
      [SECTIONS, 'radioOption', 'minHeight'], [SECTIONS, 'actionBtn', 'minHeight'],
      [SECTIONS, 'actionBtnSpaced', 'minHeight'], [SECTIONS, 'primaryBtn', 'minHeight'],
      [SECTIONS, 'saveFieldBtn', 'minHeight'], [SECTIONS, 'permBtn', 'minHeight'],
      [SECTIONS, 'notifRow', 'minHeight'],
      [VAULT, 'actionBtn', 'minHeight'], [VAULT, 'importAnotherBtn', 'minHeight'],
      [VAULT, 'undoBtn', 'minHeight'],
    ];
    for (const [src, name, prop] of checks) {
      const found = styleBody(src, name).match(new RegExp(`${prop}: (\\d+)`));
      expect(found).not.toBeNull();
      expect(Number(found![1])).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('the page reads in chapters, and wastes no words', () => {
  it('the ornament marks a chapter, not every gap', () => {
    // It appeared at five section joins and was missing at three, which reads
    // as an accident rather than a rhythm.
    expect((SCREEN.match(/style=\{st\.ornRule\}/g) || [])).toHaveLength(4);
  });

  it('the footer stops repeating the section directly above it', async () => {
    const r = await settle(mount());
    expect(r.getAllByText('PRIVACY POLICY')).toHaveLength(1);
    expect(r.getAllByText('TERMS OF SERVICE')).toHaveLength(1);
  });

  it('and carries the edition, where a club record carries its number', async () => {
    const r = await settle(mount());
    expect(r.getByText(/EDITION/)).toBeTruthy();
    expect(r.getByText(/1\.4\.2/)).toBeTruthy();
  });

  it('label and description are no longer the same size', () => {
    const label = Number(styleBody(SECTIONS, 'notifLabel').match(/fontSize: (\d+)/)![1]);
    const desc = Number(styleBody(SECTIONS, 'rowDesc').match(/fontSize: (\d+)/)![1]);
    expect(desc).toBeLessThan(label);
  });

  it('leaves no style behind, in any of the three sheets', () => {
    // Enumerated, not listed. Naming the ones I remembered is how two halos
    // survived a sweep on the last page.
    for (const [src, sheet, prefix] of [
      [STYLES, 'export const st = StyleSheet.create(', 'st'],
      [SECTIONS, 'const st = StyleSheet.create(', 'st'],
      [VAULT, 'const s = StyleSheet.create(', 's'],
    ] as const) {
      const at = src.indexOf(sheet);
      const keys = [...src.slice(at).matchAll(/\n {2,4}([a-zA-Z][a-zA-Z0-9]*): \{/g)].map(m => m[1]);
      expect(keys.length).toBeGreaterThan(15);
      const reachable = src === STYLES ? SCREEN + SECTIONS + VAULT : src.slice(0, at);
      expect(keys.filter(k => !new RegExp(`${prefix}\\.${k}\\b`).test(reachable))).toEqual([]);
    }
  });
});

describe('motion and type answer to the reader', () => {
  it('no entrance is written by hand any more', () => {
    // Thirteen builders, none checking the setting. Adding it thirteen times
    // invites the fourteenth to forget.
    expect(CODE_SCREEN).not.toMatch(/FadeInDown/);
    expect(CODE_SECTIONS).not.toMatch(/FadeInDown/);
    expect(SCREEN).toMatch(/enterDown\(/);
  });

  it('the shared entrance defers to the system setting', () => {
    const enter = readFileSync(join(DIR, '..', '..', 'utils', 'enter.ts'), 'utf8');
    expect(enter).toMatch(/reduceMotion\(ReduceMotion\.System\)/);
  });

  it('and so does every timing on the page, and the glow', () => {
    const offenders = CODE_SCREEN.split('\n').filter(l => /withTiming\(/.test(l) && !/reduceMotion/.test(l));
    expect(offenders).toEqual([]);
    const glow = readFileSync(join(DIR, '..', '..', 'hooks', 'useAmbientGlow.ts'), 'utf8');
    expect(glow).toMatch(/reduceMotion: ReduceMotion\.System/);
  });

  it('text scales, with a ceiling — on EVERY styled line', () => {
    // Settings is the first page someone with low vision opens, and it had no
    // scaling props at all. Counting props only proves that SOME line has one;
    // enumerate the <Text> tags instead, so a single omission is caught.
    const bare: string[] = [];
    for (const [file, src] of [['SettingsScreen', CODE_SCREEN], ['SettingsSections', CODE_SECTIONS]] as const) {
      for (const m of src.matchAll(/<(?:Animated\.)?Text\b/g)) {
        const at = m.index!;
        let depth = 0;
        let tag = src.slice(at);
        for (let i = at; i < src.length; i++) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          else if (src[i] === '>' && depth === 0) { tag = src.slice(at, i); break; }
        }
        if (!/scaledTextProps|displayTextProps|decorativeTextProps|deckLabelProps/.test(tag)) {
          bare.push(file + ': ' + tag.replace(/\s+/g, ' ').slice(0, 70));
        }
      }
    }
    expect(bare).toEqual([]);
  });
});

describe('the keyboard does not cover what you are typing', () => {
  it('the screen scrolls the focused field into view', () => {
    // A KeyboardAvoidingView around a ScrollView is the "blind container
    // padding" this app already learned makes room WITHOUT scrolling to it:
    // opening CHANGE PASSWORD at the foot of eight cards left the member typing
    // a new cipher behind the keyboard.
    expect(CODE_SCREEN).toMatch(/automaticallyAdjustKeyboardInsets/);
    const beforeModal = CODE_SCREEN.slice(0, CODE_SCREEN.indexOf('<Modal'));
    expect(beforeModal).not.toMatch(/<KeyboardAvoidingView/);
  });

  it('but the modal keeps its padding, which is correct there', () => {
    // RN Modal windows never resize for the keyboard, so
    // automaticallyAdjustKeyboardInsets cannot reach inside one.
    const modal = SCREEN.slice(SCREEN.indexOf('<Modal'));
    expect(modal).toMatch(/<KeyboardAvoidingView behavior="padding"/);
  });
});

describe('the archive desk', () => {
  it('no longer prints an escape sequence at the member', () => {
    // Inside JSX text, \u2026 is five literal characters.
    expect(CODE_VAULT).not.toMatch(/> \\u2026and /);
    expect(VAULT).toMatch(/\{'\\u2026'\}and /);
  });

  it('and only the export you pressed says it is running', () => {
    expect(VAULT).toMatch(/exporting === 'csv'/);
    expect(VAULT).toMatch(/exporting === 'json'/);
    expect(CODE_VAULT).not.toMatch(/setExporting\((?:true|false)\)/);
  });
});
