/**
 * reading-areas.cjs — which of the deep pass's nine areas reads each file that ships, runs or deploys, and
 * which files are left out of the reading map, each with why.
 *
 * The area ids are the coverage map's rows in the review rulebook (AREA-1 … AREA-7, AREA-SHARED, AREA-MACH).
 * scripts/reading-map.cjs decides a file in this order, the first answer winning:
 *   1. EXCLUDED: it does not ship, run or deploy, or it is read another way (the reason says how);
 *   2. PLACES: the file or folder is one area's by where it lives;
 *   3. NAMES: its name says the area plainly (a Tribunal store, a Lounge service);
 *   4. for a code file in a shared folder: the areas of the app files that import it; one area, or
 *      AREA-SHARED when two or more do;
 *   5. for a test: the area of the app files it imports;
 *   6. FALLBACK: what a shared folder holds when nothing above decided.
 * A file nothing decides has no area, and scripts/__tests__/readingMap.test.ts refuses it.
 */

const AREAS = [
  { id: 'AREA-1', holds: 'Sign-in, account, settings, Society membership' },
  { id: 'AREA-2', holds: 'Lobby, Reel, Stacks' },
  { id: 'AREA-3', holds: 'Film page, the log, the Vault, Year in Cinema' },
  { id: 'AREA-4', holds: 'Dispatch: critiques and essays' },
  { id: 'AREA-5', holds: 'Lounge: salons and messages' },
  { id: 'AREA-6', holds: 'Collection and profiles, Notices, Darkroom search' },
  { id: 'AREA-7', holds: 'The Tribunal: reports, verdicts, appeals, blocks' },
  { id: 'AREA-SHARED', holds: 'Shared parts used everywhere, and every server function in both server folders' },
  { id: 'AREA-MACH', holds: 'The machinery: workflows, scripts, settings, the test harness, the register, email templates, native code, package patches, native packages and licences' },
];

/** Prose that describes the code as it stands, read as the machinery's (comment-truth's living docs and its own ledgers' rules). */
const LIVING_DOCS = /^mobile\/(README|ARCHITECTURE|CONTRIBUTING|ANDROID_LAUNCH)\.md$|^mobile\/(mockups|\.maestro)\/README\.md$|^mobile\/test-utils\/SOURCE-READING-TESTS\.md$|^mobile\/supabase\/DEFERRED-ACTIONS\.md$/;
/**
 * Left out of the reading map. `applied` is decided by reading-map.cjs from mobile/supabase/APPLIED.txt, the one
 * list of migrations production has run.
 */
const EXCLUDED = [
  { why: 'applied: production runs it, and what runs is read whole as the live schema (mobile/supabase/schema/live-schema.sql), not one old change at a time', applied: true },
  { why: 'never applied: SQL the Supabase CLI does not read (the universe kind "not a migration")', re: /^supabase\/migrations\/archive\// },
  { why: "the Supabase CLI's own record of the project it is linked to, written by the CLI", re: /(^|\/)supabase\/(supabase\/)?\.temp\// },
  { why: 'loose SQL no tool applies and no test reads (the universe kind "loose sql")', re: /^mobile\/supabase\/sql\// },
  { why: "recordings of TMDB's own answers, which the stand-in replays: captured by a tool, not written (theRecordingsTravel holds each one tracked)", re: /^mobile\/e2e\/supabase\/functions\/tmdb-proxy\/fixtures\// },
  { why: 'device and CI logs captured from real runs, fed whole to the judges\' tests: captured, not written; the tests that read them are read', re: /^mobile\/e2e\/__tests__\/fixtures\/(soft-crash|own-crash|maestro-ipad)-/ },
  { why: 'measured times recorded from CI runs; the code that derives shards and ceilings from them is read', re: /^mobile\/e2e\/(flow|screen)-history\.json$/ },
  { why: "the verdicts a mutants run wrote; scripts/mutants.cjs and everyMutantIsSound, which hold them, are read", re: /^mobile\/register\/mutant-results\.json$/ },
  { why: "written by npm from package.json; the packages and their licences are read from package.json and the installed packages' own manifests, and the nightly's advisories check every version it pins", re: /^mobile\/package-lock\.json$/ },
  { why: 'the reading log itself: written only by scripts/ledger-write.cjs, from coverage records', re: /^mobile\/scripts\/(COMMENTS-READ|READING-LOG)\.md$/ },
  { why: 'generated from register/classes.yaml by scripts/register.cjs, which the reader of classes.yaml reads', re: /^mobile\/register\/CLASSES\.md$/ },
  { why: "the audit's records: plans, findings and past batches' probes, which nothing runs", re: /^mobile\/audit\// },
  { why: 'design mockups: drawings, never shipped', re: /^mobile\/design\// },
  { why: "another tool's old spec notes: records, never run", re: /^mobile\/\.kiro\// },
  { why: "the editor's own settings on one machine", re: /^mobile\/\.vscode\// },
  { why: 'a record or report: it describes a day, not the code that ships (the living docs are read)', re: /\.md$/, unless: LIVING_DOCS },
  { why: 'the website, frozen: read only as a caller of the same server; its two preview-card endpoints and their routing file are in, by the owner\'s exception', re: /^(src|public|tests|scripts|brand|slides|docs)\/|^(index\.html|package\.json|package-lock\.json|vite\.config\.js|tsconfig\.json|eslint\.config\.js|playwright\.config\.ts|\.lighthouserc\.json|README\.md)$/ },
  { why: 'marketing pieces and one-off tools at the top of the repo: posters, slides, videos and their generators, which neither the app nor the website ships', re: /^(generate-[a-z]+\.js|migrate-logger\.js|[a-z0-9-]+\.(html|png|webm|txt)|deploy\.ps1|cleanup\.ps1)$/ },
];

/** Where a file lives decides its area. First match wins; the folder rules follow the file rules. */
const PLACES = [
  // The website host's preview-card endpoints and their routing (the owner's exception to the freeze).
  { area: 'AREA-SHARED', re: /^api\/(og\.js|proxy-image\.ts)$|^vercel\.json$/ },
  // Every server function, in both server folders, and every database change not yet applied.
  { area: 'AREA-SHARED', re: /^(mobile\/)?supabase\/functions\// },
  { area: 'AREA-SHARED', re: /^(mobile\/)?supabase\/migrations\/[^/]+\.sql$|^mobile\/supabase\/migrations-down\// },
  { area: 'AREA-SHARED', re: /^mobile\/supabase\/schema\/|^mobile\/supabase\/_schema_baseline\.sql$/ },
  // The machinery.
  { area: 'AREA-MACH', re: /^\.github\/|^(email-templates|supabase\/email_templates)\/|^\.(gitleaks\.toml|gitleaksignore|gitattributes|gitignore|easignore)$/ },
  { area: 'AREA-MACH', re: /^mobile\/(scripts|e2e|\.maestro|mockups|test-utils|githooks|plugins|modules|patches|register|store|types|\.claude)\// },
  { area: 'AREA-MACH', re: /^mobile\/supabase\/(diagnostics|restore)\/|^mobile\/supabase\/(APPLIED\.txt|DEFERRED-ACTIONS\.md)$/ },
  { area: 'AREA-MACH', re: /^mobile\/src\/test-support\/|^mobile\/src\/utils\/__tests__\/theBatchReportIsAnswered\.test\.ts$/ },
  { area: 'AREA-MACH', re: /^mobile\/[^/]+$/ },
  // AREA-1: sign-in, account, settings, Society membership.
  { area: 'AREA-1', re: /^mobile\/app\/(\(modals\)\/(login|membership)|auth-callback|reset-password|settings)\.tsx$/ },
  { area: 'AREA-1', re: /^mobile\/src\/(components\/(auth|society|clearance)|features\/(settings|archive))\// },
  // AREA-2: Lobby, Reel, Stacks.
  { area: 'AREA-2', re: /^mobile\/app\/\(tabs\)\/(index|reels)\.tsx$|^mobile\/app\/stacks\/|^mobile\/app\/\(modals\)\/list-modal\.tsx$/ },
  { area: 'AREA-2', re: /^mobile\/src\/components\/(lobby|home|reels|feed)\// },
  { area: 'AREA-2', re: /^mobile\/__tests__\/components\/feed\// },
  // AREA-3: film page, the log, the Vault, Year in Cinema.
  { area: 'AREA-3', re: /^mobile\/app\/(film|log|film-reviews)\/|^mobile\/app\/(year-in-cinema|\(modals\)\/log-modal)\.tsx$/ },
  { area: 'AREA-3', re: /^mobile\/src\/components\/(film|log)\/|^mobile\/src\/providers\/FilmDetailProvider\.tsx$/ },
  // AREA-4: Dispatch.
  { area: 'AREA-4', re: /^mobile\/app\/dispatch\/|^mobile\/app\/\(tabs\)\/dispatch\.tsx$/ },
  { area: 'AREA-4', re: /^mobile\/src\/components\/(dispatch|critique)\// },
  // AREA-5: Lounge.
  { area: 'AREA-5', re: /^mobile\/app\/lounge(\.tsx|\/)|^mobile\/app\/\(tabs\)\/lounge\.tsx$|^mobile\/app\/\(modals\)\/cover-picker\.tsx$/ },
  { area: 'AREA-5', re: /^mobile\/src\/components\/lounge\// },
  // AREA-6: collection and profiles, Notices, Darkroom search.
  { area: 'AREA-6', re: /^mobile\/app\/(user|person|dossier)\/|^mobile\/app\/(edit-profile|\(tabs\)\/(profile|darkroom)|\(modals\)\/(notifications-modal|search-modal|social-modal))\.tsx$/ },
  { area: 'AREA-6', re: /^mobile\/src\/(components\/(profile|person|darkroom|search)|features\/profile)\// },
  // AREA-7: the Tribunal.
  { area: 'AREA-7', re: /^mobile\/app\/\(admin\)\// },
  { area: 'AREA-7', re: /^mobile\/src\/components\/(moderation|admin)\// },
  // The house's frame, drawn under every screen.
  { area: 'AREA-SHARED', re: /^mobile\/app\/(_layout|\+not-found|\+native-intent|\(tabs\)\/_layout|\(modals\)\/_layout)\.tsx$/ },
  { area: 'AREA-SHARED', re: /^mobile\/src\/components\/(layout|atmosphere|motion|text|theme|ui)\// },
  { area: 'AREA-SHARED', re: /^mobile\/src\/(theme|constants|types|schemas|linking|generated|lore)\/|^mobile\/src\/global\.d\.ts$/ },
  { area: 'AREA-SHARED', re: /^mobile\/assets\// },
];

/**
 * A name that says its area plainly, for a file in a shared folder (src/hooks, src/lib, src/utils, src/services,
 * src/stores, src/providers, the top of src/components, and the tests beside them). Each is tried, in this order,
 * against the file's name cut into lower-case words (useLogFlow is "use log flow"), so a word inside
 * another ("Alone" holding "salon") never decides.
 */
const NAMES = [
  { area: 'AREA-3', re: /\bfilms? verdict\b/ },
  { area: 'AREA-7', re: /\b(tribunal|moderation\w*|moderat\w*|verdicts?|appeals?|slurs?|blocks?|blocked|blocking|ban check|banned|suspension|suspended|struck|report store|a reports? (is filed|block))\b/ },
  { area: 'AREA-4', re: /\b(dispatch\w*|essays?|critiques?|ballots?|writing room)\b/ },
  { area: 'AREA-5', re: /\b(lounges?|salons?)\b/ },
  { area: 'AREA-6', re: /\b(darkroom|catalogue)\b/ },
  { area: 'AREA-1', re: /^(a |use )?handle\b|\bhandle (guard|history|notice|not changed|is judged)\b|\blog in\b/ },
  { area: 'AREA-3', re: /\b(vault|years?|films?|watchlist|marks (disk|ledger|writes)|mark counts|tell marks|logs?|logged|logging|viewings?|rewatch|diary)\b/ },
  { area: 'AREA-2', re: /\b(stacks?|lobby|feeds?|reels?)\b/ },
  { area: 'AREA-6', re: /\b(profiles?|follow\w*|notif\w*|notices?|search\w*|person|dossier|discover\w*|social|circle)\b/ },
  { area: 'AREA-1', re: /\b(auth|login|sign in|signing in|sign out|signing out|signout|password|recovery|membership|society|clearance|tiers?|initiation|settings?|second key|username|eraser?|erasing|deletion|delete account|pricing|revenue ?cat|standing|ranks?|session|welcome)\b/ },
];

/** A file name as lower-case words: camel case, dashes and dots all cut. */
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase()).join(' ');

/** The folders whose files are shared unless a name or the importers say otherwise. */
const SHARED_FOLDERS = /^mobile\/src\/(hooks|lib|utils|services|stores|providers|components)\/|^mobile\/src\/__tests__\/|^mobile\/app\/__tests__\//;

/**
 * What a shared folder holds when nothing else decided: the root tests and the sheets' tests that import no app
 * file read the app as a whole.
 */
const FALLBACK = [
  { area: 'AREA-SHARED', re: SHARED_FOLDERS },
  { area: 'AREA-SHARED', re: /^mobile\/__tests__\/|^mobile\/app\/\(modals\)\/__tests__\// },
];

module.exports = { AREAS, EXCLUDED, PLACES, NAMES, SHARED_FOLDERS, FALLBACK, words };
