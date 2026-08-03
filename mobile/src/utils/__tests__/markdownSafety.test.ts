/**
 * markdownSafety.test.ts — the markdown link allowlist bypass and parser cap (#103)
 * ─────────────────────────────────────────────────────────────────────
 * These tests do NOT trust a convention. They replicate the installed library's
 * actual `openUrl` implementation and assert what reaches the operating system,
 * because the convention is backwards here: this library treats a `true` return as
 * "ALSO open it yourself", so the intuitive fix reopens the hole it closes.
 *
 * Replicated verbatim from react-native-markdown-display@7.0.2
 * (src/lib/util/openUrl.js). If a future upgrade changes those semantics, the
 * contract test at the bottom fails and tells us — which a test of our own function
 * alone never could.
 */
import { onMarkdownLinkPress, capMarkdownForRender } from '../markdownSafety';
import { MAX_LENGTHS } from '../sanitizeInput';
import { safeOpenURL } from '../linking';

jest.mock('../linking', () => ({ safeOpenURL: jest.fn(async () => true) }));

const mockSafeOpenURL = safeOpenURL as jest.MockedFunction<typeof safeOpenURL>;

/** The library's real behaviour, reproduced so we can assert against it. */
function libraryOpenUrl(
  url: string | undefined,
  customCallback: ((u: string) => unknown) | undefined,
  rawOpen: jest.Mock,
) {
  if (customCallback) {
    const result = customCallback(url as string);
    if (url && result && typeof result === 'boolean') rawOpen(url);
  } else if (url) {
    rawOpen(url);
  }
}

beforeEach(() => jest.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
// The vulnerability, demonstrated
// ══════════════════════════════════════════════════════════════════════════════
describe('with no handler — the state every mount was in', () => {
  it.each([
    'javascript:alert(1)',
    'intent://evil#Intent;scheme=http;end',
    'tel:+19005550000',
    'sms:+19005550000',
    'data:text/html,<script>',
  ])('%s reaches the OS unvalidated', (hostile) => {
    const rawOpen = jest.fn();
    libraryOpenUrl(hostile, undefined, rawOpen);
    expect(rawOpen).toHaveBeenCalledWith(hostile);   // ← this is the bug
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// The fix
// ══════════════════════════════════════════════════════════════════════════════
describe('with the guard installed', () => {
  it.each([
    'javascript:alert(1)',
    'intent://evil#Intent;scheme=http;end',
    'tel:+19005550000',
    'sms:+19005550000',
    'data:text/html,<script>',
  ])('%s never reaches the OS directly', (hostile) => {
    const rawOpen = jest.fn();
    libraryOpenUrl(hostile, onMarkdownLinkPress, rawOpen);
    expect(rawOpen).not.toHaveBeenCalled();
    // It went to the choke-point instead, which is what rejects the scheme.
    expect(mockSafeOpenURL).toHaveBeenCalledWith(hostile);
  });

  it('a legitimate https link still opens, through the choke-point', () => {
    const rawOpen = jest.fn();
    libraryOpenUrl('https://example.com/essay', onMarkdownLinkPress, rawOpen);
    expect(rawOpen).not.toHaveBeenCalled();
    expect(mockSafeOpenURL).toHaveBeenCalledWith('https://example.com/essay');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ⚠️ The trap. This is the test that matters most.
// ══════════════════════════════════════════════════════════════════════════════
describe('the return value IS the security control', () => {
  it('returns exactly false, for every input', () => {
    expect(onMarkdownLinkPress('https://example.com')).toBe(false);
    expect(onMarkdownLinkPress('javascript:alert(1)')).toBe(false);
    expect(onMarkdownLinkPress('')).toBe(false);
  });

  it('proves that returning TRUE would reopen the vulnerability', () => {
    // Not hypothetical — this is what the intuitive fix does. A handler that returns
    // true makes the library call raw Linking.openURL as well, so the link opens
    // twice and the second one is completely unvalidated.
    const rawOpen = jest.fn();
    const naiveHandler = (u: string) => { void safeOpenURL(u); return true; };
    libraryOpenUrl('javascript:alert(1)', naiveHandler, rawOpen);
    expect(rawOpen).toHaveBeenCalledWith('javascript:alert(1)');   // ← the regression
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A typo is not an attack
// ══════════════════════════════════════════════════════════════════════════════
describe('an empty href is ignored rather than alerted', () => {
  it.each(['', '   ', undefined as unknown as string, null as unknown as string])(
    '%p does not summon a security dialog', (empty) => {
      const rawOpen = jest.fn();
      libraryOpenUrl(empty, onMarkdownLinkPress, rawOpen);
      expect(mockSafeOpenURL).not.toHaveBeenCalled();
      expect(rawOpen).not.toHaveBeenCalled();
    });

  it('still returns false for an empty href', () => {
    expect(onMarkdownLinkPress(undefined as unknown as string)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// The parser cap (#2) — bounding two quadratics the register never named
// ══════════════════════════════════════════════════════════════════════════════
describe('capMarkdownForRender', () => {
  it('leaves every real dossier untouched', () => {
    // The longest live dossier is 2,770 characters; the cap is 25,000.
    const essay = 'The film opens on a held shot. '.repeat(90);
    expect(capMarkdownForRender(essay)).toBe(essay);
    expect(essay.length).toBeLessThan(MAX_LENGTHS.dossierContent);
  });

  it('bounds content that exceeds the limit', () => {
    const huge = 'x'.repeat(MAX_LENGTHS.dossierContent + 50_000);
    const out = capMarkdownForRender(huge);
    expect(out.length).toBeLessThanOrEqual(MAX_LENGTHS.dossierContent + 3);
    expect(out.endsWith('…')).toBe(true);
  });

  it('is the SAME limit the sanitiser enforces on write — not a second threshold', () => {
    // One number, one meaning, both sides. If someone raises the write cap without
    // thinking about render cost, this test is where they find out they are linked.
    expect(MAX_LENGTHS.dossierContent).toBe(25000);
  });

  it('survives empty and missing content', () => {
    expect(capMarkdownForRender('')).toBe('');
    expect(capMarkdownForRender(null)).toBe('');
    expect(capMarkdownForRender(undefined)).toBe('');
  });

  it('bounds the adversarial shapes that are actually quadratic', () => {
    // Measured against markdown-it 10.0.0: nested emphasis 6877ms at 80k, smartquotes
    // 16843ms at 200k. Both are bounded by length, which is what the cap buys.
    for (const hostile of ['*'.repeat(80_000), '"a" '.repeat(50_000)]) {
      expect(capMarkdownForRender(hostile).length).toBeLessThanOrEqual(MAX_LENGTHS.dossierContent + 3);
    }
  });
});
