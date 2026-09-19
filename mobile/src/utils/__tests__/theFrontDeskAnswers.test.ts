/**
 * theFrontDeskAnswers — a member who writes to the house is always heard.
 *
 * The app printed an address (support@reelhouse.app) on a domain with no mail
 * records: every letter a member ever sent bounced, and nothing in the app
 * could have told them. These pin the three things that make the desk real:
 *
 *   1. the address is said ONCE, so it cannot drift again;
 *   2. the letter arrives addressed, with what the desk needs to find the
 *      account — and nothing private (never the member's email or writing);
 *   3. no button does nothing: a phone with no mail app is offered the address
 *      and the help page instead.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const mockOpenURL = jest.fn();
const mockAlert = jest.fn();
jest.mock('react-native', () => ({
  Linking: { openURL: (...a: unknown[]) => mockOpenURL(...a) },
  Alert: { alert: (...a: unknown[]) => mockAlert(...a) },
  Platform: { OS: 'ios', Version: '18.2' },
}));
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
const mockCopy = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockCopy(...a) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.2' } } }));
const mockSafeOpen = jest.fn();
jest.mock('@/src/utils/linking', () => ({ safeOpenURL: (...a: unknown[]) => mockSafeOpen(...a) }));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a) },
}));

// eslint-disable-next-line import/first
import { SUPPORT_EMAIL, SUPPORT_URL, LETTER_RULE, frontDeskLetter } from '@/src/constants/support';
// eslint-disable-next-line import/first
import { writeToFrontDesk, openHousePage, copySupportAddress, devicePlatform } from '@/src/utils/housePages';

const MEMBER = '3f6c2a0e-9b1d-4c1e-8f7a-2d5e6b9c0a14';

/** The letter, opened the way a mail app opens it. */
function readLetter(mailto: string) {
  const [to, query] = mailto.slice('mailto:'.length).split('?');
  const params = new URLSearchParams(query);
  return { to, subject: params.get('subject') ?? '', body: params.get('body') ?? '', query };
}

beforeEach(() => jest.clearAllMocks());

describe('the letter', () => {
  const letter = readLetter(frontDeskLetter({ appVersion: '1.4.2', platform: 'iOS 18.2', memberId: MEMBER }));

  it('is addressed to the desk, with a subject', () => {
    expect(letter.to).toBe(SUPPORT_EMAIL);
    expect(letter.subject).toBe('A letter to the front desk');
  });

  it('leaves the member room to write, ABOVE the details', () => {
    // The cursor lands at the top of the body. The details come after blank
    // lines, so the member types their letter where the cursor already is.
    expect(letter.body.startsWith('\n\n\n' + LETTER_RULE)).toBe(true);
  });

  it('carries the app, the phone and the account — each on its own line', () => {
    const lines = letter.body.split('\n');
    expect(lines).toContain('App: The ReelHouse Society 1.4.2');
    expect(lines).toContain('Device: iOS 18.2');
    expect(lines).toContain(`Member: ${MEMBER}`);
  });

  it('says so plainly when a detail is unknown, rather than printing "null"', () => {
    const blank = readLetter(frontDeskLetter({ appVersion: '', platform: 'iOS 18.2', memberId: null }));
    expect(blank.body).toContain('App: The ReelHouse Society unknown version');
    expect(blank.body).toContain('Member: not signed in');
    expect(blank.body).not.toMatch(/null|undefined/);
  });

  it('is fully encoded — a space or line break never reaches the mail app raw', () => {
    // An unencoded "&" or newline cuts the body short in some mail apps.
    expect(letter.query).not.toMatch(/[\s]/);
    expect(letter.query.split('&')).toHaveLength(2);
    expect(letter.query).toContain('%0A');
  });

  it('never carries the member’s email address — only the id the desk can look up', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'constants', 'support.ts'), 'utf8');
    const iface = src.slice(src.indexOf('export interface LetterContext'), src.indexOf('}', src.indexOf('export interface LetterContext')));
    const fields = [...iface.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
    expect(fields).toEqual(['appVersion', 'platform', 'memberId']);
  });
});

describe('writing to the desk', () => {
  it('opens the mail app with the letter, the app’s own version, and the member', async () => {
    mockOpenURL.mockResolvedValue(true);
    await expect(writeToFrontDesk(MEMBER)).resolves.toBe('opened');
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const sent = readLetter(mockOpenURL.mock.calls[0][0]);
    expect(sent.to).toBe(SUPPORT_EMAIL);
    expect(sent.body).toContain('App: The ReelHouse Society 1.4.2');
    expect(sent.body).toContain('Device: iOS 18.2');
    expect(sent.body).toContain(`Member: ${MEMBER}`);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('asks the mail app directly — never canOpenURL, which says NO on iOS without a plist entry', () => {
    const src = readFileSync(join(__dirname, '..', 'housePages.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/canOpenURL\(/);
  });

  describe('a phone with no mail app', () => {
    const buttons = async () => {
      mockOpenURL.mockRejectedValue(new Error('No app to handle mailto'));
      await expect(writeToFrontDesk(MEMBER)).resolves.toBe('no-mail-app');
      expect(mockAlert).toHaveBeenCalledTimes(1);
      const [title, message, options] = mockAlert.mock.calls[0];
      return { title, message, options: options as { text: string; style?: string; onPress?: () => void }[] };
    };

    it('is told so, and given the address to write from anywhere', async () => {
      const { title, message } = await buttons();
      expect(title).toBe('No mail app on this phone');
      expect(message).toContain(SUPPORT_EMAIL);
    });

    it('can copy the address', async () => {
      const { options } = await buttons();
      mockCopy.mockResolvedValue(true);
      options.find(o => o.text === 'Copy address')!.onPress!();
      await Promise.resolve(); await Promise.resolve();
      expect(mockCopy).toHaveBeenCalledWith(SUPPORT_EMAIL);
      expect(mockToastSuccess).toHaveBeenCalledWith('Address copied.');
    });

    it('can open the help page instead', async () => {
      const { options } = await buttons();
      mockOpenBrowser.mockResolvedValue({ type: 'dismiss' });
      options.find(o => o.text === 'Help & answers')!.onPress!();
      await Promise.resolve();
      expect(mockOpenBrowser).toHaveBeenCalledWith(SUPPORT_URL, expect.any(Object));
    });

    it('and can close it — the cancel is the one marked cancel', async () => {
      const { options } = await buttons();
      expect(options.map(o => o.text)).toEqual(['Copy address', 'Help & answers', 'Close']);
      expect(options.filter(o => o.style === 'cancel').map(o => o.text)).toEqual(['Close']);
    });
  });
});

describe('the address on the clipboard', () => {
  it('is copied, and the member is told', async () => {
    mockCopy.mockResolvedValue(true);
    await copySupportAddress();
    expect(mockCopy).toHaveBeenCalledWith(SUPPORT_EMAIL);
    expect(mockToastSuccess).toHaveBeenCalledWith('Address copied.');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('and when copying fails, the toast carries the address itself', async () => {
    mockCopy.mockRejectedValue(new Error('clipboard busy'));
    await copySupportAddress();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining(SUPPORT_EMAIL));
  });
});

describe('the house’s own pages', () => {
  it('open inside the app, in the house’s colours, as a sheet', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'dismiss' });
    await openHousePage(SUPPORT_URL);
    expect(mockOpenBrowser).toHaveBeenCalledWith(SUPPORT_URL, expect.objectContaining({
      dismissButtonStyle: 'close', presentationStyle: 'pageSheet',
    }));
    expect(mockSafeOpen).not.toHaveBeenCalled();
  });

  it('and in the member’s own browser if the in-app one cannot open', async () => {
    mockOpenBrowser.mockRejectedValue(new Error('no browser'));
    await openHousePage(SUPPORT_URL);
    expect(mockSafeOpen).toHaveBeenCalledWith(SUPPORT_URL);
  });
});

describe('the phone, named for the desk', () => {
  it('names iOS with its version', () => {
    expect(devicePlatform()).toBe('iOS 18.2');
  });

  it('names Android with its release and API level', () => {
    const { Platform } = jest.requireMock('react-native') as { Platform: Record<string, unknown> };
    const was = { ...Platform };
    Object.assign(Platform, { OS: 'android', Version: 35, constants: { Release: '15' } });
    try {
      expect(devicePlatform()).toBe('Android 15 (API 35)');
      delete Platform.constants;
      expect(devicePlatform()).toBe('Android (API 35)');
    } finally {
      for (const k of Object.keys(Platform)) delete Platform[k];
      Object.assign(Platform, was);
    }
  });
});

describe('the address is said once', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const HOME = 'src/constants/support.ts';

  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) sources(path, out);
      else if (/\.(ts|tsx|js|jsx|json)$/.test(name)) out.push(path);
    }
    return out;
  }

  const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))];

  it('walks the whole app, not a list of files I remembered', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some(f => relative(ROOT, f).replace(/\\/g, '/') === HOME)).toBe(true);
  });

  it('typed out only in constants/support.ts', () => {
    const typed = files
      .filter(f => /support@/i.test(readFileSync(f, 'utf8')))
      .map(f => relative(ROOT, f).replace(/\\/g, '/'));
    expect(typed).toEqual([HOME]);
  });

  it('and the dead address is gone from every page a member can see', () => {
    const dead = files
      .filter(f => relative(ROOT, f).replace(/\\/g, '/') !== HOME)
      .filter(f => /support@reelhouse\.app/.test(readFileSync(f, 'utf8')));
    expect(dead).toEqual([]);
  });
});
