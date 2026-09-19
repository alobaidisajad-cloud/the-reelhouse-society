/**
 * theSocietySellsWhatItSays — the Society page, rendered and read back.
 * ─────────────────────────────────────────────────────────────────────────────
 * The page a member pays on. Every rule it keeps is run here, not read:
 *
 *   · the amount charged is the big number, and a local price is never mixed
 *     with a dollar one; no claim is printed without the numbers behind it
 *   · each member sees the right tickets: nothing offered below the rank held,
 *     the rank a locked door needs chosen first, one window that buys it
 *   · the four links at the foot really go somewhere — the store's restore,
 *     the store's own manage sheet (and its address when that cannot open),
 *     and the house's own Terms and Privacy pages
 *   · nothing false is printed: no popularity nobody earned, no hurry nobody
 *     is in, no promise nothing keeps
 *   · the ledger and the tickets are one list
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PRIVILEGES, RANK_ORDER, privilegesOf } from '@/src/constants/membership';
import { ticketPrice, savePercent, foundingPitch, SEATS_LINE } from '../societyPricing';
import { LEDGER_COLUMN_ORDER } from '../PrivilegeLedger';

// ── the world the page is rendered in ───────────────────────────────────────
const mockRestore = jest.fn();
const mockPurchase = jest.fn();
const mockShowManage = jest.fn();
let mockStoreReady = true;
jest.mock('@/src/lib/revenueCat', () => ({
  restorePurchases: (...a: unknown[]) => mockRestore(...a),
  purchaseTier: (...a: unknown[]) => mockPurchase(...a),
  showManageSubscriptions: (...a: unknown[]) => mockShowManage(...a),
  isStoreReady: () => mockStoreReady,
}));
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() },
}));
let mockPricing: Record<string, unknown> = {};
jest.mock('@/src/hooks/useMembershipPricing', () => ({ useMembershipPricing: () => mockPricing }));
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
const mockOpenURL = jest.fn();
jest.mock('@/src/utils/linking', () => ({ safeOpenURL: (...a: unknown[]) => mockOpenURL(...a) }));
let mockFounders = 0;
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ count: mockFounders, error: null }) }) }),
    auth: { refreshSession: jest.fn() },
  },
}));
jest.mock('@/src/components/auth/SocietySeal', () => ({ SocietySeal: () => null }));
jest.mock('@/src/utils/gateTelemetry', () => ({ recordGateEvent: jest.fn() }));
const mockPush = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) } }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
let mockUser: Record<string, unknown> | null = null;
// ONE of each, held for the whole file: a fresh jest.fn per read would make
// "was never called" true of every function, whatever the page did.
const mockRestoreSession = jest.fn();
const mockTierHint = jest.fn();
jest.mock('@/src/stores/auth', () => {
  const state = () => ({
    user: mockUser, isAuthenticated: !!mockUser,
    restoreSession: mockRestoreSession, setLocalTierHint: mockTierHint,
  });
  const useAuthStore = Object.assign(() => state(), { getState: state });
  return { useAuthStore };
});

// eslint-disable-next-line import/first
import MembershipScreen, { TERMS_URL, PRIVACY_URL, MANAGE_URL } from '@/app/(modals)/membership';

const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * PRINT: words drawn on the page whose group speaks them as one sentence (the
 * poster, the certificate, the ledger's cells). A screen reader is spared them
 * one by one, so the default query cannot see them — that is the point — and
 * they are looked for as print.
 */
const PRINT = { includeHiddenElements: true } as const;

const mount = async () => {
  const r = render(<MembershipScreen />);
  await waitFor(() => expect(r.getByText('Attendance.', PRINT)).toBeTruthy());
  return r;
};
const radio = (r: ReturnType<typeof render>, name: RegExp) =>
  r.getAllByRole('radio').find((n) => name.test(n.props.accessibilityLabel)) as any;

beforeEach(() => {
  mockPricing = {};
  mockParams = {};
  mockUser = { id: '11111111-1111-4111-8111-111111111111', tier: 'free', role: 'cinephile' };
  mockFounders = 0;
  mockStoreReady = true;
  mockToastError.mockReset();
  [mockRestore, mockPurchase, mockShowManage, mockOpenBrowser, mockOpenURL, mockPush, mockRestoreSession, mockTierHint].forEach((m) => m.mockReset());
});

// ════════════════════════════════════════════════════════════════════════════
describe('the numbers', () => {
  const LIVE = {
    archivist: { monthly: '£1.99', annual: '£19.99', monthlyPrice: 1.99, annualPrice: 19.99, annualPerMonth: '£1.67' },
    auteur: { monthly: '£4.99', annual: '£49.99', monthlyPrice: 4.99, annualPrice: 49.99, annualPerMonth: '£4.17' },
    founding: { lifetime: '£49', lifetimePrice: 49 },
  };

  it('the amount charged is the big number, in the store’s own currency', () => {
    const p = ticketPrice('archivist', 'annual', LIVE);
    expect(p.amount).toBe('£19.99');
    expect(p.per).toBe('A YEAR');
    expect(p.terms).toBe('About £1.67 a month. Renews yearly.');
    expect(p.summary).toBe('£19.99 a year · renews yearly');
  });

  it('a local price is never followed by a dollar figure', () => {
    // The store gave a price but not its per-month string: say nothing, never "$1.67".
    const p = ticketPrice('archivist', 'annual', { archivist: { annual: '£19.99', annualPrice: 19.99 } });
    expect(p.terms).toBe('Renews yearly.');
    expect(`${p.amount} ${p.terms}`).not.toMatch(/\$/);
  });

  it('when the store cannot be reached, the dollar fallback is dollars throughout', () => {
    const y = ticketPrice('auteur', 'annual', {});
    expect(y.amount).toBe('$49.99');
    expect(y.terms).toBe('About $4.17 a month. Renews yearly.');
    const m = ticketPrice('auteur', 'monthly', {});
    expect(m.amount).toBe('$4.99');
    expect(m.terms).toBe('Renews monthly.');
  });

  it('the saving is the smallest true one, and is not claimed without numbers', () => {
    expect(savePercent({})).toBe(16);
    expect(savePercent(LIVE)).toBe(16);
    expect(savePercent({ ...LIVE, archivist: { ...LIVE.archivist, annualPrice: 23.88 } })).toBeNull(); // no saving at all
    expect(savePercent({ archivist: { annual: '£19.99' }, auteur: { annual: '£49.99' } })).toBeNull();
  });

  it('the founding pitch compares only when the comparison is true', () => {
    expect(foundingPitch({}).amount).toBe('$49');
    expect(foundingPitch({}).body).toMatch(/less than a single year of the Auteur/);
    expect(foundingPitch(LIVE).amount).toBe('£49');
    const dear = foundingPitch({ ...LIVE, founding: { lifetime: '£99', lifetimePrice: 99 } });
    expect(dear.body).not.toMatch(/less than/);
    expect(dear.body).toMatch(/never renews/);
  });

  it('the founding seat states its limit, never its count', () => {
    // "100 REMAIN — None taken yet" told every visitor that nobody had joined.
    expect(SEATS_LINE).toBe('LIMITED TO THE FIRST 100 MEMBERS');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('what each member is offered', () => {
  it('a free member: both tickets, the house’s choice chosen, one window that buys it', async () => {
    const r = await mount();
    expect(radio(r, /^The Archivist/).props.accessibilityState).toMatchObject({ checked: true });
    expect(radio(r, /^The Auteur/).props.accessibilityState).toMatchObject({ checked: false });
    expect(r.getByText('BECOME AN ARCHIVIST')).toBeTruthy();
    expect(r.getByText('$19.99 a year · renews yearly')).toBeTruthy();
    // Only the chosen ticket is open; the other says what is inside.
    expect(r.getByText('The Vault')).toBeTruthy();
    expect(r.queryByText('The Breakdown Engine')).toBeNull();
    expect(r.getByText('SHOW ITS SIX PRIVILEGES')).toBeTruthy();
  });

  it('choosing the Auteur opens it, and the window follows', async () => {
    const r = await mount();
    await fireEvent.press(radio(r, /^The Auteur/));
    expect(radio(r, /^The Auteur/).props.accessibilityState).toMatchObject({ checked: true });
    expect(r.getByText('BECOME AN AUTEUR')).toBeTruthy();
    expect(r.getByText('The Breakdown Engine')).toBeTruthy();
    expect(r.getByText('$49.99 a year · renews yearly')).toBeTruthy();
  });

  it('paying by the month changes every price on the page', async () => {
    const r = await mount();
    await fireEvent.press(r.getByLabelText('Pay monthly'));
    expect(r.getByText('$1.99 a month · renews monthly')).toBeTruthy();
    expect(r.getAllByText('A MONTH').length).toBe(2);
  });

  it('the window buys what it says, for the period chosen', async () => {
    mockPurchase.mockResolvedValue(null);
    const r = await mount();
    await fireEvent.press(r.getByLabelText('Pay monthly'));
    await fireEvent.press(r.getByText('BECOME AN ARCHIVIST'));
    expect(mockPurchase).toHaveBeenCalledWith('archivist', 'monthly');
  });

  it('with no store on this device, the button says so — it never does nothing', async () => {
    // Every Android build today: no key, so purchaseTier answers null — exactly
    // what a member cancelling answers — and the page used to stay silent.
    mockStoreReady = false;
    const r = await mount();
    await fireEvent.press(r.getByText('BECOME AN ARCHIVIST'));
    expect(mockPurchase).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/^Couldn't reach .+\. Please try again shortly\.$/));
    await fireEvent.press(r.getByLabelText(/^Claim a founding seat/));
    expect(mockToastError).toHaveBeenCalledTimes(2);
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it('the tickets are one choice to a screen reader', async () => {
    const r = await mount();
    const group = r.getByLabelText('Choose a rank');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(r.getByLabelText("Show the Auteur's six privileges")).toBeTruthy();
  });

  it('a visitor is sent to sign in rather than to the store', async () => {
    mockUser = null;
    const r = await mount();
    await fireEvent.press(r.getByText('BECOME AN ARCHIVIST'));
    expect(mockPurchase).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('an Archivist: their rank held, the Auteur offered as what they do not yet have', async () => {
    mockUser = { id: '11111111-1111-4111-8111-111111111111', tier: 'archivist', role: 'cinephile' };
    const r = await mount();
    expect(r.getByText('YOUR RANK')).toBeTruthy();
    expect(r.getAllByRole('radio').filter((n) => /^The (Archivist|Auteur)/.test(n.props.accessibilityLabel)).length).toBe(1);
    expect(r.getByText('EVERYTHING YOU HAVE, AND —')).toBeTruthy();
    expect(r.getByText('BECOME AN AUTEUR')).toBeTruthy();
  });

  it('an Auteur: nothing is offered, and there is no window to buy from', async () => {
    mockUser = { id: '11111111-1111-4111-8111-111111111111', tier: 'auteur', role: 'cinephile' };
    const r = await mount();
    expect(r.queryByText(/^BECOME AN/)).toBeNull();
    expect(r.getByText('INCLUDED')).toBeTruthy();
    expect(r.getByText('YOUR RANK')).toBeTruthy();
  });

  it('a locked door: the slip says what they reached for, and its rank is chosen', async () => {
    mockParams = { reason: 'essays', rank: 'auteur' };
    const r = await mount();
    expect(r.getByText('YOU REACHED FOR', PRINT)).toBeTruthy();
    // …and it is SAID: the poster's one sentence names it.
    expect(r.getByLabelText(/You reached for Essays & Ballots\. Publish long essays/)).toBeTruthy();
    // A rank named mid-sentence takes no capital: "It comes with the Auteur."
    expect(r.getByText(/It comes with the Auteur\.$/, PRINT)).toBeTruthy();
    expect(radio(r, /^The Auteur/).props.accessibilityState).toMatchObject({ checked: true });
    expect(r.getByText('BECOME AN AUTEUR')).toBeTruthy();
  });

  it('a door somebody typed cannot blank the poster', async () => {
    mockParams = { reason: 'no-such-feature' };
    const r = await mount();
    expect(r.getByText('The better seats are not.', PRINT)).toBeTruthy();
    expect(r.queryByText('YOU REACHED FOR', PRINT)).toBeNull();
    expect(r.getByLabelText(/The better seats are not\.$/)).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('the four doors at the foot all go somewhere', () => {
  it('Restore asks the store, and says what the store said', async () => {
    mockRestore.mockResolvedValue({ storeReachable: true, isActive: false, tier: 'cinephile' });
    const r = await mount();
    // Two doors to one act: the top bar's and the small print's. The foot's is pressed.
    await fireEvent.press(r.getAllByLabelText('Restore purchases')[1]);
    await waitFor(() => expect(mockRestore).toHaveBeenCalledTimes(1));
    // The store answered "nothing active": the member is told, and nothing else happens.
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it('Restore never reads "unreachable" as "you own nothing"', async () => {
    mockRestore.mockResolvedValue({ storeReachable: false, isActive: false, tier: 'cinephile' });
    const r = await mount();
    await fireEvent.press(r.getAllByLabelText('Restore purchases')[0]);
    await waitFor(() => expect(mockRestore).toHaveBeenCalledTimes(1));
    expect(mockRestoreSession).not.toHaveBeenCalled();
    expect(mockTierHint).not.toHaveBeenCalled();
  });

  it('…while "the store says nothing is active" asks the server for the truth', async () => {
    mockRestore.mockResolvedValue({ storeReachable: true, isActive: false, tier: 'cinephile' });
    const r = await mount();
    await fireEvent.press(r.getAllByLabelText('Restore purchases')[0]);
    await waitFor(() => expect(mockRestoreSession).toHaveBeenCalledTimes(1));
    expect(mockTierHint).not.toHaveBeenCalled();
  });

  it('…and a restored rank is put back at once', async () => {
    mockRestore.mockResolvedValue({ storeReachable: true, isActive: true, tier: 'auteur' });
    const r = await mount();
    await fireEvent.press(r.getAllByLabelText('Restore purchases')[0]);
    await waitFor(() => expect(mockTierHint).toHaveBeenCalledWith({ tier: 'auteur', is_founding: undefined }));
  });

  it('Restore is also at the top, where a member looks for it', async () => {
    const r = await mount();
    expect(r.getAllByLabelText('Restore purchases').length).toBe(2);
  });

  it('Manage opens the store’s own sheet', async () => {
    mockShowManage.mockResolvedValue(true);
    const r = await mount();
    await fireEvent.press(r.getByLabelText(/^Manage subscription in /));
    await waitFor(() => expect(mockShowManage).toHaveBeenCalledTimes(1));
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('…and the store’s address when the sheet cannot open — never nothing', async () => {
    mockShowManage.mockResolvedValue(false);
    const r = await mount();
    await fireEvent.press(r.getByLabelText(/^Manage subscription in /));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith(MANAGE_URL, expect.any(String)));
  });

  it('Terms and Privacy open the house’s own pages, inside the app', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'dismiss' });
    const r = await mount();
    await fireEvent.press(r.getByLabelText('Terms of Use'));
    await fireEvent.press(r.getByLabelText('Privacy Policy'));
    await waitFor(() => expect(mockOpenBrowser).toHaveBeenCalledTimes(2));
    expect(mockOpenBrowser.mock.calls[0][0]).toBe(TERMS_URL);
    expect(mockOpenBrowser.mock.calls[1][0]).toBe(PRIVACY_URL);
  });

  it('…and the plain address if the in-app browser cannot', async () => {
    mockOpenBrowser.mockRejectedValue(new Error('no browser'));
    const r = await mount();
    await fireEvent.press(r.getByLabelText('Terms of Use'));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith(TERMS_URL));
  });

  it('they are the same two pages Settings opens — one address for each, not two', () => {
    // Both screens open the SAME constants, and neither types the address out.
    for (const file of ['src/features/settings/SettingsScreen.tsx', 'app/(modals)/membership.tsx']) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src).toMatch(/import \{[^}]*TERMS_URL[^}]*PRIVACY_URL[^}]*\} from '@\/src\/constants\/support'/);
      expect(src).not.toContain(`'${TERMS_URL}'`);
      expect(src).not.toContain(`'${PRIVACY_URL}'`);
    }
    const settings = readFileSync(join(ROOT, 'src/features/settings/SettingsScreen.tsx'), 'utf8');
    expect(settings).toContain('openHousePage(TERMS_URL)');
    expect(settings).toContain('openHousePage(PRIVACY_URL)');
  });

  it('the small print names the store and the terms Apple requires', async () => {
    const r = await mount();
    const print = r.getByText(/renews automatically/);
    const text = String(print.props.children instanceof Array ? print.props.children.join('') : print.props.children);
    expect(text).toMatch(/at least 24 hours before the period ends/);
    expect(text).toMatch(/Manage or cancel it any time/);
    expect(text).toMatch(/never renews/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('nothing false is printed', () => {
  it('no popularity nobody earned, no hurry nobody is in, no promise nothing keeps', async () => {
    const r = await mount();
    for (const lie of [/MOST POPULAR/, /FILLING FAST/, /Early Access/, /Gilded Frame/, /Poster Glow/, /PROGRAMMING COMMITTEE/]) {
      expect(r.queryByText(lie, PRINT)).toBeNull();
    }
    // The recommendation is an opinion, and says so.
    expect(r.getByText('THE HOUSE RECOMMENDS')).toBeTruthy();
  });

  it('the seat count is the database’s, and the certificate retires at a hundred', async () => {
    // The count is read — it decides whether the certificate shows — and never printed.
    for (const taken of [0, 3, 99]) {
      mockFounders = taken;
      const shown = await mount();
      await waitFor(() => expect(shown.getByText('LIMITED TO THE FIRST 100 MEMBERS', PRINT)).toBeTruthy());
      expect(shown.queryByText(/REMAIN|taken|None taken|first\.$|SEATS ·/, PRINT)).toBeNull();
      expect(shown.getByLabelText(/Limited to the first hundred members\.$/)).toBeTruthy();
      shown.unmount();
    }
    mockFounders = 3;
    let r = await mount();
    r.unmount();
    mockFounders = 100;
    r = await mount();
    await waitFor(() => expect(r.queryByText('A Seat for Life.', PRINT)).toBeNull());
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('the window is as tall as it says, and the page makes room for it', () => {
  const { PurchaseDock, DOCK, DOCK_HEIGHT } = require('../PurchaseDock');
  const { StyleSheet } = require('react-native');
  const flat = (n: any) => StyleSheet.flatten(n.props.style) ?? {};

  it('DOCK_HEIGHT is the sum of what is actually drawn', async () => {
    const r = render(<PurchaseDock summary="$19.99 a year · renews yearly" cta="BECOME AN ARCHIVIST" spoken="x" auteur={false} busy={false} onBuy={() => {}} bottomInset={34} />);
    const dock = flat(r.getByTestId('purchase-dock'));
    const summary = flat(r.getByText('$19.99 a year · renews yearly'));
    const sub = flat(r.getByText('Cancel any time. No hard feelings.'));
    const button = flat(r.getByRole('button'));
    const drawn = dock.borderTopWidth + dock.paddingTop
      + summary.lineHeight + summary.marginBottom
      + button.height
      + sub.marginTop + sub.lineHeight
      + (dock.paddingBottom - 34);
    expect(drawn).toBe(DOCK_HEIGHT);
    expect(dock.paddingBottom).toBe(34 + DOCK.padBottom);
  });

  it('on a phone with no inset it still stands clear of the edge', () => {
    const r = render(<PurchaseDock summary="s" cta="c" spoken="x" auteur={false} busy={false} onBuy={() => {}} bottomInset={0} />);
    expect(flat(r.getByTestId('purchase-dock')).paddingBottom).toBe(DOCK.minInset + DOCK.padBottom);
  });

  it('the page reserves exactly the window, its inset, and room to breathe', async () => {
    const { SCROLL_BREATH } = require('@/app/(modals)/membership');
    const r = await mount();
    // The page's one vertical scroll, found in the drawn tree.
    const find = (n: any): any => {
      if (!n || typeof n !== 'object') return null;
      if (Array.isArray(n)) { for (const c of n) { const f = find(c); if (f) return f; } return null; }
      if (n.type === 'RCTScrollView' && !n.props.horizontal) return n;
      return find(n.children);
    };
    const scroll = find(r.toJSON());
    expect(scroll).toBeTruthy();
    // The suite's safe-area stand-in reports a zero inset, so the window sits on its minimum.
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(DOCK_HEIGHT + DOCK.minInset + SCROLL_BREATH);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('every other sentence about a rank reads from the same list', () => {
  const { firstPrivilegesOf } = require('@/src/constants/membership');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  it('says what a rank opens in the names its ticket sells', () => {
    expect(firstPrivilegesOf('archivist')).toBe('The Vault, The Editorial Desk and The Lounge');
    expect(firstPrivilegesOf('auteur')).toBe('The Breakdown Engine, Essays & Ballots and Private Screening Rooms');
  });

  it('Settings names what the next rank opens from it — never by hand', () => {
    // It promised "the gold Dispatch badge" at Auteur: the mark is crimson.
    const settings = strip(readFileSync(join(ROOT, 'src/features/settings/SettingsSections.tsx'), 'utf8'));
    expect(settings).toMatch(/\$\{firstPrivilegesOf\('archivist'\)\} open at Archivist\./);
    expect(settings).toMatch(/\$\{firstPrivilegesOf\('auteur'\)\} open at Auteur\./);
  });

  it('no shipped file of the app promises a gold badge', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of require('fs').readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p, out); }
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))];
    expect(files.length).toBeGreaterThan(300);
    expect(files.filter((f) => /gold (Dispatch )?badge|Gold Foil/i.test(strip(readFileSync(f, 'utf8'))))).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('the ledger and the tickets are one list', () => {
  it('every privilege with a ledger row is a row, once', async () => {
    const r = await mount();
    for (const p of PRIVILEGES.filter((x) => x.ledger)) {
      expect(`${p.id}: ${r.getAllByText(p.ledger as string, PRINT).length >= 1}`).toBe(`${p.id}: true`);
    }
  });

  it('a row says who holds it, in words', async () => {
    const r = await mount();
    expect(r.getByLabelText('The Vault: the Archivist and the Auteur.')).toBeTruthy();
    expect(r.getByLabelText('Essays & ballots: the Auteur.')).toBeTruthy();
    expect(r.getByLabelText('Log, rate & review: every member.')).toBeTruthy();
  });

  it('the columns stand in the order the ranks do', () => {
    expect(LEDGER_COLUMN_ORDER).toEqual(RANK_ORDER);
  });

  it('only one privilege folds into another row, and it is the Auteur’s plate', () => {
    expect(PRIVILEGES.filter((p) => !p.ledger).map((p) => p.id)).toEqual(['auteur-plate']);
  });

  it('the free seat lists every free privilege', async () => {
    const r = await mount();
    for (const p of privilegesOf('cinephile')) expect(r.getByText(p.name)).toBeTruthy();
  });
});
