import { colors } from '@/src/theme/theme';

// ── Tier Data (matches web MembershipPage.tsx exactly) ──
export const TIERS = [
  {
    id: 'cinephile',
    name: 'The\nCinephile',
    label: 'BASIC ACCESS',
    labelColor: colors.fog,
    price: 'Free',
    pricePeriod: 'FOREVER',
    billing: null,
    priceMonthly: null,
    priceAnnual: null,
    annualEquiv: null,
    borderColor: 'rgba(184,137,26,0.08)',
    bgGradient: ['rgba(22,18,12,0.98)', 'rgba(10,7,3,0.98)'] as const,
    accentColor: colors.fog,
    dotColor: colors.fog,
    includes: null,
    featuredFeature: null,
    features: ['Log & Rate Films', 'The Diary & Watchlist', 'Basic Profile', 'Unlimited Custom Lists', 'Import & Export Archive'],
    cta: 'JOIN FREE',
    ctaStyle: 'ghost' as const,
  },
  {
    id: 'archivist',
    name: 'The\nArchivist',
    label: 'PREMIUM TOOLS',
    labelColor: colors.sepia,
    price: '1.99',
    pricePeriod: '/ MO',
    billing: 'BILLED ANNUALLY ($19.99/YR)',
    // Billing-choice statics (fallbacks when live store pricing is unavailable).
    priceMonthly: '1.99',
    priceAnnual: '19.99',
    annualEquiv: '1.67',
    borderColor: 'rgba(184,137,26,0.35)',
    bgGradient: ['rgba(30,24,14,0.98)', 'rgba(10,7,3,0.98)'] as const,
    accentColor: colors.sepia,
    dotColor: colors.sepia,
    popular: true,
    includes: 'Everything in Free, plus:',
    featuredFeature: {
      title: 'The Editorial\nDesk',
      desc: 'Pro-level review formatting. Inject movie stills, pull-quotes, and drop caps into your logs.',
    },
    // ── NO LINE ABOUT THE FRAME ────────────────────────────────────────────
    // This list used to promise a `Gilded Frame (Exclusive Animated Gold
    // Borders)`. There was no such thing. It appeared in exactly one place in
    // the whole codebase — here, in the sales list — and nowhere in the app.
    // We were charging for it.
    //
    // It is not replaced with a description of the rank mark either, for the
    // same reason the Auteur list below dropped its badge line: the card DRAWS
    // the real mark, above the price. A description can disagree with the
    // thing. A rendering cannot.
    //
    // What an Archivist's rank actually looks like lives in `roomTier` — light
    // and edges, in three chosen places, on purpose: "if everything carried the
    // tier, the tier would stop meaning anything."
    // THE ARCHIVE was withheld from free members and never once offered to
    // them — a gate with no sign on it, found by the guard rather than by
    // anybody reading this list. The words are the archive screen's own: what
    // the rank buys is not the filings, which are public and already on the
    // page. It is the GATHERING of them.
    features: [
      'The Archive\n(Every Filing on One Film,\nGathered)',
      'The Physical Archive\n(Track 4K/Blu-Ray/VHS)',
      'The Vault (Private Notes)',
      'The Lounge\n(Exclusive Cinema Chat Rooms)',
    ],
    cta: 'BECOME AN ARCHIVIST',
    ctaStyle: 'primary' as const,
  },
  {
    id: 'auteur',
    name: 'The Auteur',
    label: 'ULTIMATE PATRONAGE',
    // One ruby family — the legible crimson token, not a fourth stray red.
    labelColor: colors.crimson,
    price: '4.99',
    pricePeriod: '/ MO',
    billing: 'BILLED ANNUALLY ($49.99/YR)',
    // Billing-choice statics (fallbacks when live store pricing is unavailable).
    priceMonthly: '4.99',
    priceAnnual: '49.99',
    annualEquiv: '4.17',
    borderColor: colors.crimsonBorder,
    bgGradient: ['rgba(30,12,12,0.98)', 'rgba(10,7,3,0.98)'] as const,
    accentColor: colors.crimson,
    dotColor: colors.crimson,
    includes: 'Everything in Archivist, plus:',
    featuredFeature: {
      title: 'The Breakdown\nEngine',
      desc: 'Break down films across 6 specific axes \u2014 Story, Script, Acting, Cinematography, Editing & Sound.',
    },
    // ── NO LINE ABOUT THE BADGE ────────────────────────────────────────────
    // This list used to promise a `Gold Foil "Auteur" Badge`. The card now
    // DRAWS the real mark, above the price, so a sentence describing it would
    // be a second copy of one fact — and the copy is the one that goes stale.
    // It already had: the mark is not gold.
    //
    // A description can disagree with the thing. A rendering cannot.
    features: [
      'Publish Essays to The\nDispatch',
      'Curatorial Control\n(Select Alternative TMDB\nPosters)',
      // Was `Poster Glow Profile Aesthetics`, which named nothing that exists.
      // The feature is real and already built — `ProfileBackdrop` dresses the
      // room with the centre panel of the member's own triptych, washed and
      // vignetted. It just had a name no member could have matched to it, and
      // "poster glow" is something else entirely: an ungated effect on the film
      // page that everybody already gets.
      'The Backdrop\n(Your Room, Dressed by\nYour Own Film)',
      'Early Access to New\nFeatures',
    ],
    cta: 'BECOME AN AUTEUR',
    ctaStyle: 'auteur' as const,
  },
];
