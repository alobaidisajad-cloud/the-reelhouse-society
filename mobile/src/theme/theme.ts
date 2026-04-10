// ============================================================
// REELHOUSE MOBILE — NITRATE NOIR DESIGN SYSTEM v3.0
// Exact port of the web CSS custom properties
// ============================================================

export const colors = {
  // ── NITRATE NOIR PALETTE v3.0 — Maximum Premium ──
  ink: '#0B0A08',         // Primary background (warm black, not cold)
  parchment: '#EDE5D8',   // Primary text (warm off-white)
  sepia: '#C4961A',       // Gold accent — buttons, links, active state
  soot: '#0E0D0A',        // Secondary dark surface
  flicker: '#F8F0C0',     // Light accent — hover states, highlights
  bloodReel: '#6B1A0A',   // Deep crimson — destructive actions, stamps
  danger: '#E74C3C',      // Alert red
  ash: '#2A2118',         // Borders, dividers, subtle backgrounds
  bone: '#C8B99A',        // Secondary text
  fog: '#6B6055',         // Muted text, disabled
  silverNitrate: '#D8E0E8', // System/info accent

  // Derived
  transparent: 'transparent',
  sepiaFaint: 'rgba(196, 150, 26, 0.08)',
  sepiaSubtle: 'rgba(196, 150, 26, 0.15)',
  sepiaBorder: 'rgba(196, 150, 26, 0.25)',
  bloodFaint: 'rgba(107, 26, 10, 0.3)',
} as const;

export const fonts = {
  display: 'Rye_400Regular',       // Bold cinematic western serif — titles
  sub: 'SpecialElite_400Regular',   // Typewriter — subheadings, labels
  body: 'CourierPrime_400Regular',  // Monospace — body text, reviews
  bodyBold: 'CourierPrime_700Bold',
  bodyItalic: 'CourierPrime_400Regular_Italic',
  ui: 'Inter_400Regular',           // Clean sans — UI elements
  uiMedium: 'Inter_500Medium',
  uiBold: 'Inter_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,  // --section-gap equivalent
} as const;

export const radii = {
  sm: 3,
  card: 4,
  md: 6,
  lg: 12,
  pill: 9999,
} as const;

// ── Ultra-Premium Nitrate Effects ──
export const effects = {
  // Deep complex drop shadows simulating web's triple layered box-shadow
  shadowSurface: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 10,
  },
  shadowSurfaceHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 36,
    elevation: 15,
  },
  shadowPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  
  // Outer glows for cards and interactive inputs
  glowSepia: {
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  glowFlicker: {
    shadowColor: colors.flicker,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 6,
  },

  // Text glows 
  textGlowSepia: {
    textShadowColor: 'rgba(196, 150, 26, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  textGlowFlicker: {
    textShadowColor: 'rgba(248, 240, 192, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  textShadowDeep: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  }
} as const;

export const typography = {
  jumbo: { fontSize: 64, lineHeight: 68, fontFamily: fonts.display, letterSpacing: 1.28 },
  h1: { fontSize: 45, lineHeight: 50, fontFamily: fonts.display, letterSpacing: 0.9 },
  h2: { fontSize: 32, lineHeight: 36, fontFamily: fonts.display, letterSpacing: 0.64 },
  h3: { fontSize: 24, lineHeight: 28, fontFamily: fonts.display, letterSpacing: 0.48 },
  lg: { fontSize: 18, lineHeight: 28, fontFamily: fonts.body },
  sub: { fontSize: 13, lineHeight: 20, fontFamily: fonts.sub, letterSpacing: 0.65 },
  body: { fontSize: 15, lineHeight: 25, fontFamily: fonts.body },
  bodyBold: { fontSize: 15, lineHeight: 25, fontFamily: fonts.bodyBold },
  caption: { fontSize: 11, lineHeight: 16, fontFamily: fonts.body },
  micro: { fontSize: 8, lineHeight: 12, fontFamily: fonts.ui, letterSpacing: 2 },
  label: { fontSize: 10, lineHeight: 14, fontFamily: fonts.uiMedium, letterSpacing: 3, textTransform: 'uppercase' as const },
} as const;
