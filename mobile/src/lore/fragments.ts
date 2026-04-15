/**
 * LORE FRAGMENTS — The Society's Living Memory
 *
 * 150+ one-liner "transmissions" from the Society's 100-year history.
 * Used in: loading states, empty states, pull-to-refresh, Buster bubbles,
 * section subtitles, and the login screen.
 *
 * Categories:
 *   founding   — 1924 origin stories
 *   operations — Society rules, rituals, secrets
 *   buster     — Mascot personality lines
 *   loading    — Projector/archive themed loading text
 *   errors     — Cinematic error messages
 *   empty      — For screens with no data yet
 *   wisdom     — Quotes about cinema and the Society
 */

// ── FOUNDING — Paris, 1924 ──────────────────────────────────────
export const FOUNDING = [
  'The first screening was held in a basement in Paris. Three attended. The projectionist wept.',
  'Membership Rule #1: You must speak of The Society outside The Society. Silence is grounds for expulsion.',
  'The original ledger was bound in goatskin. We have since… modernized.',
  'The Lumière brothers lit the first lamp. We have kept it burning.',
  'Founded in the shadow of the Grand Café, 14 Boulevard des Capucines.',
  'The 1924 charter was written on the back of a Méliès lobby card.',
  'Three founding members. One projector. A lifetime of cinema ahead.',
  'The Society has no address. It has coordinates.',
  'The first rule was simple: watch everything, forget nothing.',
  'Dues were originally paid in film stock. Times change. Standards don\'t.',
  'The Paris chapter remains the oldest. No one knows who runs it.',
  'In 1924, cinema was 29 years old. So were we, in spirit.',
  'The founders believed cinema could outlive empires. They were right.',
  'There is a screening room beneath the Cinémathèque. You weren\'t told.',
  'Every member since 1924 has been assigned a number. Yours is pending.',
];

// ── OPERATIONS — Rules, rituals, secrets ────────────────────────
export const OPERATIONS = [
  'Your Ledger is encrypted with the same cipher used by the 1947 Paris chapter.',
  'This vault is deeper than you think. Keep cataloging.',
  'The Archivist Council meets at midnight. You weren\'t told.',
  'Every log you write becomes part of the permanent archive.',
  'The Society does not rank films. The Society preserves them.',
  'Membership is not bought. It is earned through devotion to the art.',
  'All critiques are permanent. Choose your words with care.',
  'The vault has never been breached. Your collection is safe.',
  'A stack is not a list. It is a thesis.',
  'The Dispatch is our newspaper. Every word matters.',
  'The Lounge exists for those who have earned the right to speak.',
  'Your watchlist is a promise you made to yourself.',
  'The Archive remembers what you have forgotten.',
  'Rating a film is an act of courage. Half-stars doubly so.',
  'The physical vault preserves what streaming cannot: permanence.',
];

// ── BUSTER — Mascot personality ─────────────────────────────────
export const BUSTER = [
  'Buster has been the Society\'s mascot since 1924. He does not age. No one asks why.',
  'Buster once watched 847 films in a single year. He doesn\'t recommend it.',
  'If Buster is crying, the screening was either beautiful or the projector broke.',
  'Buster\'s favourite film changes every Tuesday. He won\'t tell you which.',
  'Buster has seen your watchlist. He is concerned.',
  'Buster doesn\'t sleep. He just dims.',
  'Buster was named after Buster Keaton. He has his deadpan.',
  'Buster remembers every film you\'ve logged. Yes, that one too.',
  'Buster is not a ghost. He is a permanent resident.',
  'Buster has opinions about your ratings but keeps them to himself.',
  'Buster once haunted a drive-in theater for three decades. He misses it.',
  'Buster believes every film deserves at least one viewer. Even that one.',
  'The floating? It\'s not a glitch. Buster just prefers hovering.',
  'Buster has been waiting for you. He\'s patient like that.',
  'Buster\'s crown only appears when he\'s proud of you.',
];

// ── LOADING — Projector/archive themed ──────────────────────────
export const LOADING = [
  'Threading the projector…',
  'Developing the negatives…',
  'Consulting the Elder Archivists…',
  'Decrypting the vault registry…',
  'Warming the projection lamp…',
  'Retrieving your dossier from the archive…',
  'Splicing the reels…',
  'Adjusting the carbon arc lamp…',
  'Dusting off the catalogue…',
  'The archive is vast. One moment…',
  'Unlocking the film vault…',
  'Calibrating the aperture gate…',
  'Rewinding to the beginning…',
  'The projectionist is preparing your reel…',
  'Searching the Society\'s records…',
  'Indexing the collection…',
  'Pulling your file from the stacks…',
  'The archive never sleeps. It merely blinks.',
];

// ── ERRORS — Cinematic failure messages ─────────────────────────
export const ERRORS = [
  'The projector lamp has flickered. Please try again.',
  'A reel has jammed in transit. The engineers are notified.',
  'The telegraph line to the archive is disrupted.',
  'The projection booth reports a malfunction.',
  'The vault door is stuck. Give it a moment.',
  'Signal lost. The screening will resume shortly.',
  'The archive clerk seems to be on break.',
  'A frame has been lost. We are recovering.',
  'The connection was severed mid-reel.',
  'Something went dark in the projection booth.',
];

// ── EMPTY — For screens with no data ────────────────────────────
export const EMPTY = [
  'The screening room is dark. Be the first to turn on the projector.',
  'This shelf is bare. Every great collection starts with one.',
  'The foyer is quiet tonight. The portraits on the wall are watching.',
  'Nothing here yet. The ink is still drying on your membership card.',
  'An empty ledger is full of potential.',
  'The seats are empty. The screen awaits.',
  'No dispatches have arrived yet. The courier is en route.',
  'The archive returns silence. For now.',
  'Your vault stands ready. The first addition is the hardest.',
  'Even the founding members started with nothing.',
];

// ── WISDOM — Quotes about cinema ────────────────────────────────
export const WISDOM = [
  'Cinema is the most beautiful fraud in the world. — Jean-Luc Godard',
  'A film is a petrified fountain of thought. — Jean Cocteau',
  'Every great film should seem new every time you see it. — Roger Ebert',
  'The cinema is truth twenty-four frames per second. — Jean-Luc Godard',
  'Film is a disease. When it infects your bloodstream, it takes over. — Frank Capra',
  'Cinema is a matter of what\'s in the frame and what\'s out. — Martin Scorsese',
  'Movies touch our hearts and awaken our vision. — Martin Scorsese',
  'A story should have a beginning, a middle, and an end, but not necessarily in that order. — Jean-Luc Godard',
  'The length of a film should be directly related to the endurance of the human bladder. — Alfred Hitchcock',
  'I steal from every movie ever made. — Quentin Tarantino',
];

// ── HELPERS ──────────────────────────────────────────────────────

/** Pick a random fragment from a specific category */
export function pickRandom(category: readonly string[]): string {
  return category[Math.floor(Math.random() * category.length)];
}

/** Pick a random loading line */
export function pickLoading(): string {
  return pickRandom(LOADING);
}

/** Pick a random error line */
export function pickError(): string {
  return pickRandom(ERRORS);
}

/** Pick a random empty-state line */
export function pickEmpty(): string {
  return pickRandom(EMPTY);
}

/** Pick a random Buster line */
export function pickBuster(): string {
  return pickRandom(BUSTER);
}

/** Pick any random lore fragment from all categories */
export function pickAny(): string {
  const all = [...FOUNDING, ...OPERATIONS, ...BUSTER, ...WISDOM];
  return pickRandom(all);
}

/** Pick a random wisdom quote */
export function pickWisdom(): string {
  return pickRandom(WISDOM);
}
