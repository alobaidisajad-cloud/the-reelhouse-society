/**
 * societyPricing — every number the Society page prints, worked out in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions of the store's answer, so each rule below is tested without a
 * screen. The rules, all learned the hard way:
 *
 *   · THE AMOUNT CHARGED IS THE BIG NUMBER. Apple requires the billed amount to
 *     be the most prominent price; a yearly rank shows its yearly price, never
 *     its per-month equivalent, in the large figure.
 *   · A LOCAL PRICE IS NEVER MIXED WITH A DOLLAR ONE. The store's own strings
 *     are used whole ("£19.99"). The per-month figure is the store's own
 *     `pricePerMonthString`; when the store gives a price but not that string,
 *     the line is left out rather than worked out and printed in dollars.
 *   · NO INTL. Hermes cannot be relied on to have it (see dates-and-timezones);
 *     the one sum done here is on the static US fallback, with toFixed.
 *   · A CLAIM IS PRINTED ONLY WHEN THE NUMBERS BEHIND IT ARE KNOWN. "Save 16%"
 *     and "less than a single year of the Auteur" are computed from the prices
 *     on screen, and simply not said when those prices are not known.
 */
import type { TierPricing } from '@/src/lib/revenueCat';
import { FOUNDING, rankById, RANKS, type PaidRankId } from '@/src/constants/membership';

export type Billing = 'monthly' | 'annual';
export type Pricing = Record<string, TierPricing>;

export interface TicketPrice {
  /** The amount the store will charge for the period, whole: "$19.99", "£19.99". */
  amount: string;
  /** Beside the amount. */
  per: 'A YEAR' | 'A MONTH';
  /** The line under it. */
  terms: string;
  /** The docked bar's one-line summary. */
  summary: string;
  /** What a screen reader says for the price. */
  spoken: string;
}

/** True when the store answered with at least one price. */
const storeAnswered = (pricing: Pricing) => Object.keys(pricing).length > 0;

export function ticketPrice(rank: PaidRankId, billing: Billing, pricing: Pricing): TicketPrice {
  const r = rankById(rank);
  const live = pricing[rank];
  const yearly = billing === 'annual';
  const staticPrice = yearly ? r.priceAnnual : r.priceMonthly;
  const amount = (yearly ? live?.annual : live?.monthly) ?? `$${staticPrice}`;

  let perMonth: string | null = null;
  if (yearly) {
    if (live?.annual) perMonth = live.annualPerMonth ?? null;          // the store's own, or nothing
    else if (r.priceAnnual) perMonth = `$${(Number(r.priceAnnual) / 12).toFixed(2)}`; // the dollar fallback, in dollars
  }

  const renews = yearly ? 'Renews yearly.' : 'Renews monthly.';
  const terms = perMonth ? `About ${perMonth} a month. ${renews}` : renews;
  const unit = yearly ? 'a year' : 'a month';
  return {
    amount,
    per: yearly ? 'A YEAR' : 'A MONTH',
    terms,
    summary: `${amount} ${unit} · renews ${yearly ? 'yearly' : 'monthly'}`,
    spoken: `${amount} ${unit}, renews ${yearly ? 'yearly' : 'monthly'}`,
  };
}

/**
 * What choosing a year saves, in whole percent — the SMALLEST saving across the
 * ranks, so the one badge on the switch is true of every ticket under it.
 *
 * From the store's own numbers when it answered; from the static prices only
 * when it did not (those are the prices then on screen). If the store answered
 * without the numbers needed, nothing is claimed.
 */
export function savePercent(pricing: Pricing): number | null {
  const paid = RANKS.filter((r) => r.id !== 'cinephile');
  const savings: number[] = [];
  for (const r of paid) {
    let monthly: number | undefined;
    let annual: number | undefined;
    if (storeAnswered(pricing)) {
      monthly = pricing[r.id]?.monthlyPrice;
      annual = pricing[r.id]?.annualPrice;
    } else {
      monthly = Number(r.priceMonthly);
      annual = Number(r.priceAnnual);
    }
    if (!monthly || !annual || !isFinite(monthly) || !isFinite(annual)) return null;
    savings.push(Math.floor((1 - annual / (monthly * 12)) * 100));
  }
  const least = Math.min(...savings);
  return least > 0 ? least : null;
}

export interface FoundingPitch {
  amount: string;
  /** The sentence under the title. */
  body: string;
}

/**
 * The founding seat's price, and its pitch. "It costs less than a single year of
 * the Auteur" is said only when it is TRUE of the prices on screen.
 */
export function foundingPitch(pricing: Pricing): FoundingPitch {
  const answered = storeAnswered(pricing);
  const amount = pricing.founding?.lifetime ?? `$${FOUNDING.price}`;
  const seat = answered ? pricing.founding?.lifetimePrice : Number(FOUNDING.price);
  const year = answered ? pricing.auteur?.annualPrice : Number(rankById('auteur').priceAnnual);
  const cheaper = typeof seat === 'number' && typeof year === 'number' && seat > 0 && seat < year;
  const opening = 'The Auteur rank, permanently, for one payment.';
  return {
    amount,
    body: cheaper
      ? `${opening} It costs less than a single year of the Auteur, and lasts somewhat longer.`
      : `${opening} It never renews, and it does not end.`,
  };
}

/**
 * The limit, and never the count.
 *
 * The page used to print "100 SEATS · 100 REMAIN — None taken yet." True, and
 * it told every visitor that nobody had joined. The offer's real terms are the
 * limit, so that is what is said; the count is still read, quietly, so the
 * certificate retires itself when the last seat goes.
 */
export const SEATS_LINE = `LIMITED TO THE FIRST ${FOUNDING.seats} MEMBERS`;
