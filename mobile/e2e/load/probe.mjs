#!/usr/bin/env node
/**
 * probe.mjs — every busy screen's reads, timed against a house of 100,000
 * members (seed.sql), each against its budget.
 *
 * Each read runs as the app runs it: as a signed-in member (role
 * authenticated, their JWT claims), through the same row rules, for the member
 * it is hardest for — the whale with 10,000 films, the celebrity a third of
 * the house follows, the Lounge with 200,000 messages. One untimed run warms
 * the cache, then five are timed by the database itself (EXPLAIN ANALYZE's
 * execution time, so the runner's process start never counts) and the median
 * is held to the budget. A read over budget fails the run and prints its plan.
 *
 * Writes go to $GITHUB_STEP_SUMMARY when it is set. Run on the CI runner only:
 * it refuses any database but the runner's own.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { BOUND, readOf, rowsAtSizes, shapeFaults } from './plan-shape.cjs';

const DB = process.env.LOAD_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/@(127\.0\.0\.1|localhost):/.test(DB)) {
  console.error(`Refusing to probe ${DB.replace(/:[^:@/]+@/, ':***@')}: the load test only ever runs against the runner's own database.`);
  process.exit(2);
}

const mid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const WHALE = mid(1);
const CELEBRITY = mid(2);
const MEMBER = mid(5000);
const HOT_LOUNGE = '00000000-0000-4000-a000-000000000001';
const HOT_POST = '00000000-0000-4000-9000-000000000001';
const HOT_BALLOT = '00000000-0000-4000-9300-000000000001';
/** A moderator (seed.sql: members 3 and 6; member 6 ruled every verdict, so member 3 may hear its appeals). */
const MODERATOR = mid(3);
/** The house's size, as the run names it. */
const MEMBERS = Number(process.env.LOAD_MEMBERS ?? 100000);

/** The budget, in milliseconds of database time, for a read a screen waits on. */
const BUDGET = 100;
/** Whether the house holds the stacks search under measurement (e2e/load/proposed.sql), timed beside today's. */
const PROPOSED_STACKS = execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-c',
  "SELECT to_regprocedure('public.get_filtered_stacks_proposed(text, boolean, integer, timestamp with time zone, uuid, integer)') IS NOT NULL"],
{ encoding: 'utf8' }).trim() === 't';

const PROBES = [
  // The launch: every film the whale has logged and kept, in one trip (get_marks_ledger), as the phone
  // reads it at each start.
  { screen: 'Launch', what: 'the marks ledger, of the whale', as: WHALE, sql: 'SELECT public.get_marks_ledger()' },
  // Whom the member follows and has asked to follow, in one trip (get_my_follows), as the phone reads it at
  // each start: of the member who follows 2,000.
  { screen: 'Launch', what: 'the follow list, of a member who follows 2,000', as: mid(4), sql: 'SELECT public.get_my_follows()' },
  // The Lobby
  { screen: 'Lobby', what: 'the day\'s wall (get_lobby)', as: MEMBER, sql: 'SELECT public.get_lobby()' },
  // The Reel
  { screen: 'Reel', what: 'the house feed, first page', as: MEMBER, sql: 'SELECT * FROM public.get_community_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, first page (follows ~25)', as: MEMBER, sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, for a member who follows the celebrity', as: mid(3), sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, for a member who follows 2,000', as: mid(4), sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'stacks, first page', as: MEMBER, sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('', false, 60)" },
  { screen: 'Reel', what: 'stacks, searched', as: MEMBER, sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('stack 12', false, 60)" },
  // A word every stack has (the walk's best case, a search's worst), and a member's handle (the seed's 'm' || n).
  // Walked newest first, each stack of the page read by its id (20261122_26), never every stack hashed.
  { screen: 'Reel', what: 'stacks, searched for a word every stack has', as: MEMBER, index: ['idx_lists_created_at_id_desc', 'lists_pkey'], sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('stack', false, 60)" },
  // The handle's members' stacks read by each member's own index (20261122_12), never every stack joined.
  { screen: 'Reel', what: 'stacks, searched by an author\'s handle', as: MEMBER, index: 'idx_lists_user_created_id', sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('m2001', false, 60)" },
  // Many asked of the newest 300 stacks first (20261122_26), so no index that gathers every holder is read.
  { screen: 'Reel', what: 'stacks, searched by a handle many members share', as: MEMBER, index: ['idx_lists_created_at_id_desc', 'lists_pkey'], sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('m1', false, 60)" },
  // Two letters no stack and no handle holds: found absent from the short pieces' index (20261122_13, _15), not walked.
  { screen: 'Reel', what: 'stacks, searched for two letters none holds', as: MEMBER, index: 'lists_short_grams', sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('zq', false, 60)" },
  // The same, by the search under measurement (e2e/load/proposed.sql), when it is there.
  ...(PROPOSED_STACKS ? [['stack 12', 'a rare word'], ['stack', 'a word every stack has'], ['m2001', 'an author\'s handle'], ['m1', 'a handle many members share']].map(([q, what]) => (
    { screen: 'Reel', what: `stacks, searched for ${what}, as proposed`, as: MEMBER, sql: `SELECT * FROM public.get_filtered_stacks_proposed('${q.replace(/'/g, "''")}', false, 60)` })) : []),
  // A member's file
  { screen: 'Profile', what: 'the counts, of the whale', as: MEMBER, sql: `SELECT public.get_profile_counts('${WHALE}')` },
  { screen: 'Profile', what: 'the honours and passport, of the whale', as: MEMBER, sql: `SELECT public.get_public_profile_analytics('${WHALE}')` },
  // The whale's 10,000 records read once (20261122_12), every figure counted from that one read.
  { screen: 'Profile', what: 'the projector room, of the whale', as: WHALE, sql: `SELECT public.get_user_analytics('${WHALE}')` },
  { screen: 'Profile', what: 'the taste profile, of the whale', as: MEMBER, sql: `SELECT public.get_taste_profile('${WHALE}')` },
  // The year's grid of nights (calendar_days), the Year in Cinema's first page (year_viewings), and how a
  // member's taste meets the whale's (get_taste_match), each as the profile asks it. The grid and the
  // year read their span alone (20261122_21): each film's last viewing by its day, and the films seen
  // again in the span by the months of their earlier viewings; bound to a year of the whale's own record
  // (its 10,000 films over 2,000 days, about 1,830 a year, and its films seen again), never the whole.
  { screen: 'Profile', what: 'the calendar of nights, of the whale', as: MEMBER, rows: 5000, index: ['idx_logs_user_watched_id', 'logs_seen_again_by_month'],
    sql: `SELECT * FROM public.calendar_days('${WHALE}')` },
  { screen: 'Profile', what: 'the Year in Cinema, first page, of the whale', as: WHALE, rows: 5000, index: ['idx_logs_user_watched_id', 'logs_seen_again_by_month'],
    sql: `SELECT * FROM public.year_viewings('${WHALE}', EXTRACT(year FROM now())::int)` },
  { screen: 'Profile', what: 'the taste match, with the whale', as: MEMBER, sql: `SELECT public.get_taste_match('${WHALE}')` },
  // The rank the member holds and where it came from, as sign-in asks it.
  { screen: 'Launch', what: 'where the member\'s rank came from (my_entitlement_source)', as: MEMBER, sql: 'SELECT public.my_entitlement_source()' },
  // A stack's certifications counted, as its page asks it: of a member's newest stack.
  { screen: 'Reel', what: 'a stack\'s certifications counted', as: MEMBER,
    sql: `SELECT public.list_certify_count((SELECT id FROM public.lists WHERE user_id = '${MEMBER}' ORDER BY created_at DESC, id DESC LIMIT 1))` },
  { screen: 'Profile', what: 'the Archive, first page, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating, watched_date, status FROM public.logs WHERE user_id = '${WHALE}' ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'the Ledger at one rating chip, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating, review FROM public.logs WHERE user_id = '${WHALE}' AND rating >= 3 AND rating < 4 ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'HIGHEST RATED over the whole record, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating FROM public.logs WHERE user_id = '${WHALE}' AND rating >= 4 ORDER BY rating DESC, watched_date DESC NULLS LAST, id DESC LIMIT 6` },
  { screen: 'Profile', what: 'the Ledger searched, of the whale', as: MEMBER,
    sql: `SELECT id FROM public.logs WHERE user_id = '${WHALE}' AND (film_title ILIKE '%film 12%' OR review ILIKE '%film 12%') ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'the watchlist, first page', as: MEMBER,
    sql: `SELECT id, film_id, film_title FROM public.watchlists WHERE user_id = '${WHALE}' ORDER BY created_at DESC, id DESC LIMIT 60` },
  { screen: 'Profile', what: 'followers of the celebrity, first page', as: MEMBER,
    // as ProfileWriteService.getSocialConnections asks it
    sql: `SELECT user_id, created_at FROM public.interactions WHERE target_user_id = '${CELEBRITY}' AND type = 'follow' ORDER BY created_at DESC, user_id DESC LIMIT 51` },
  // A film
  { screen: 'Film', what: 'the house\'s logs of the hot film, first page', as: MEMBER,
    sql: 'SELECT id, user_id, rating, review, created_at FROM public.logs WHERE film_id = 1 ORDER BY created_at DESC LIMIT 20' },
  { screen: 'Film', what: 'the house verdict of the hot film', as: MEMBER, sql: 'SELECT avg_rating, rating_count, log_count FROM public.films WHERE id = 1' },
  // A film's written critiques, as its page (ten) and its Log Archive (twenty) read them: for the hot film
  // (a third of its 47,000 logs reviewed) and for a film like most (some 50 critiques among its 170 logs).
  ...[[1, 'the hot film'], [4251, 'a film like most']].flatMap(([film, which]) => [
    { screen: 'Film', what: `the critiques of ${which}, first page`, as: MEMBER,
      sql: `SELECT l.id, l.rating, l.review, l.created_at, p.username FROM public.logs l LEFT JOIN public.profiles p ON p.id = l.user_id WHERE l.film_id = ${film} AND l.review IS NOT NULL AND l.review <> '' ORDER BY l.created_at DESC, l.id DESC LIMIT 10` },
    { screen: 'Film', what: `the Log Archive of ${which}, first page`, as: MEMBER,
      sql: `SELECT id, rating, review, created_at FROM public.logs WHERE film_id = ${film} AND review IS NOT NULL AND review <> '' ORDER BY created_at DESC, id DESC LIMIT 20` },
  ]),
  // The Dispatch
  { screen: 'Dispatch', what: 'the door (dispatch_door)', as: MEMBER, sql: 'SELECT public.dispatch_door()' },
  { screen: 'Dispatch', what: 'a member\'s room totals', as: MEMBER, sql: `SELECT public.dispatch_room_totals('${CELEBRITY}')` },
  // The archive's films searched by a word, as the Dispatch archive asks it.
  { screen: 'Dispatch', what: 'the archive\'s films, searched (dispatch_archive_films)', as: MEMBER, sql: "SELECT * FROM public.dispatch_archive_films('the')" },
  // as useMemberRoom asks it, for a member whose one filing is the house's oldest (post 2999): read
  // newest first, the paper's own index would walk past every other filing to reach it
  { screen: 'Dispatch', what: 'a member\'s room, first page', as: MEMBER,
    sql: `SELECT id, kind, title, body, certify_count, created_at FROM public.dispatch_posts WHERE user_id = '${mid(38988)}' AND is_published AND withheld_at IS NULL AND ended_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 20` },
  { screen: 'Dispatch', what: 'the paper, first page', as: MEMBER,
    // as the app's pageQuery asks it: published and not withheld (an ended ballot stays in the paper)
    sql: 'SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 30' },
  // …and in its other orders: most certified, and one section (TAKES) in each.
  { screen: 'Dispatch', what: 'the paper, most certified first', as: MEMBER,
    sql: 'SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL ORDER BY certify_count DESC, id DESC LIMIT 30' },
  { screen: 'Dispatch', what: 'one section of the paper, newest first', as: MEMBER,
    sql: "SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL AND kind = 'take' ORDER BY created_at DESC, id DESC LIMIT 30" },
  { screen: 'Dispatch', what: 'one section of the paper, most certified first', as: MEMBER,
    sql: "SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL AND kind = 'take' ORDER BY certify_count DESC, id DESC LIMIT 30" },
  // A series of 24 parts at the essay ceiling (seed.sql), as the series page asks it. Today it reads
  // every part's whole text (length() reads it as sending it would); with the train it reads each
  // part's words as the house stored them when the part was written (20261109_01).
  { screen: 'Dispatch', what: 'a series, every part\'s whole text (today)', as: MEMBER,
    sql: "SELECT id, title, length(full_content) FROM public.dispatch_posts WHERE series_id = '00000000-0000-4000-9200-000000000001' AND is_published AND withheld_at IS NULL AND ended_at IS NULL ORDER BY part_number LIMIT 24" },
  { screen: 'Dispatch', what: 'a series, its words as stored', as: MEMBER,
    sql: "SELECT id, title, words FROM public.dispatch_posts WHERE series_id = '00000000-0000-4000-9200-000000000001' AND is_published AND withheld_at IS NULL AND ended_at IS NULL ORDER BY part_number LIMIT 24" },
  { screen: 'Dispatch', what: 'the hot post\'s critiques, newest first', as: MEMBER,
    sql: `SELECT id, author_username, body, certify_count, created_at FROM public.dispatch_comments WHERE post_id = '${HOT_POST}' ORDER BY created_at DESC LIMIT 30` },
  { screen: 'Dispatch', what: 'the hot post\'s critiques, most certified first', as: MEMBER,
    sql: `SELECT id, author_username, body, certify_count, created_at FROM public.dispatch_comments WHERE post_id = '${HOT_POST}' ORDER BY certify_count DESC, created_at DESC LIMIT 30` },
  // The Lounge
  // Each room's newest hundred since the reading read from the front of its index (20261122_60), never
  // every word since gathered first: at most a hundred a room, 200 rooms within the bound at any size.
  { screen: 'Lounge', what: 'unread counts, for a member in 200 rooms', as: WHALE, index: 'lounge_messages_room_newest', sql: 'SELECT * FROM public.get_lounge_unread_counts()' },
  // The corridor in one trip (proposed.sql's get_lounge_list): for the member in 200 rooms, for one
  // in a few, and for the host of the busiest room.
  // The newest salons from the front of their index (lounges_newest, 20261122_12), never every salon sorted;
  // and the member's rooms counted as above (20261122_60).
  { screen: 'Lounge', what: 'the corridor in one trip, for a member in 200 rooms', as: WHALE, index: ['lounges_newest', 'lounge_messages_room_newest'], sql: 'SELECT public.get_lounge_list()' },
  { screen: 'Lounge', what: 'the corridor in one trip, for a member', as: MEMBER, index: 'lounges_newest', sql: 'SELECT public.get_lounge_list()' },
  { screen: 'Lounge', what: 'the corridor in one trip, for the busiest room\'s host', as: mid(((1 * 61) % 100000) + 1), index: 'lounges_newest', sql: 'SELECT public.get_lounge_list()' },
  // The room's rule asked of each word read, by its salon's own row (20261122_12), never every salon read first.
  { screen: 'Lounge', what: 'the busiest room\'s last 100 messages', as: mid(((1 * 61) % 100000) + 1), index: 'lounges_pkey',
    sql: `SELECT m.id, m.content, m.created_at, p.username FROM public.lounge_messages m LEFT JOIN public.profiles p ON p.id = m.user_id WHERE m.lounge_id = '${HOT_LOUNGE}' ORDER BY m.created_at DESC LIMIT 100` },
  // Notices
  { screen: 'Notices', what: 'the celebrity\'s first page', as: CELEBRITY,
    sql: `SELECT id, type, message, is_read, created_at FROM public.notifications WHERE user_id = '${CELEBRITY}' ORDER BY created_at DESC, id DESC LIMIT 30` },
  // The board and its bell in one read, as the phone asks it (notices_page): its count read to a thousand
  // (20261122_04), so the celebrity's 50,000 unread are never all read.
  // Its page from the front of the member's newest-first index, the celebrity's 50,000 never gathered and sorted.
  { screen: 'Notices', what: 'the celebrity\'s board and bell (notices_page)', as: CELEBRITY, index: 'notifications_member_newest', sql: 'SELECT public.notices_page(30)' },
  // Search: the house-wide search's three house sources, as the phone asks each (a page of 21), for a
  // word few hold and for one many hold. A word in no review or stack ("tarkovsky") is the rare word's
  // worst case: every reader of the trigram indexes, none of the walk.
  { screen: 'Search', what: 'members, a handle few share (search_members)', as: MEMBER, sql: "SELECT * FROM public.search_members('m54321', false, NULL, NULL, 21)" },
  // Two letters many hold: many or few asked first by a walk of 2,000 handles in their own order
  // (20261122_23), so the handles are walked to the page and the short pieces' index, which gathers every
  // holder, is not read; a handle's beginning read as one range of the handles' beginnings (20261122_22).
  // Two letters none holds: found absent from the short pieces' index (20261122_14, _15), never read member by member.
  { screen: 'Search', what: 'members, a handle many share (search_members)', as: MEMBER, index: ['profiles_username_unique', 'profiles_username_beginning'], sql: "SELECT * FROM public.search_members('m1', false, NULL, NULL, 21)" },
  { screen: 'Search', what: 'members, two letters none holds (search_members)', as: MEMBER, index: 'profiles_short_grams', sql: "SELECT * FROM public.search_members('zq', false, NULL, NULL, 21)" },
  // One letter, as a member types the first: a handle or a name that begins with it read as one range of
  // the beginnings (20261122_17, _18, _22, _23), never every one holding a word that starts with it; and a
  // letter every handle and name holds, whose page is met at once.
  { screen: 'Search', what: 'members, one letter no name begins with (search_members)', as: MEMBER, index: ['profiles_display_name_beginning', 'profiles_username_beginning'], sql: "SELECT * FROM public.search_members('1', false, NULL, NULL, 21)" },
  { screen: 'Search', what: 'members, one letter every member holds (search_members)', as: MEMBER, sql: "SELECT * FROM public.search_members('m', false, NULL, NULL, 21)" },
  // Words many hold whose holders sort far into the handles (a name's middle, "Member 95..."): walked in the
  // list of their rarest piece's first thousand holders (20261122_62), never the handles to the page (they
  // read 94,445 handles at 100,000 members). And a name's beginning held past a thousand, the same way.
  { screen: 'Search', what: 'members, words in the middle of many names (search_members)', as: MEMBER, index: 'member_grams_pkey', sql: "SELECT * FROM public.search_members('mber 95', false, NULL, NULL, 21)" },
  { screen: 'Search', what: 'members, a beginning of many names (search_members)', as: MEMBER, index: 'member_grams_pkey', sql: "SELECT * FROM public.search_members('member 95', false, NULL, NULL, 21)" },
  { screen: 'Search', what: 'records, a word none holds (search_logs)', as: MEMBER, sql: "SELECT * FROM public.search_logs('tarkovsky', 'tarkovsky', NULL, NULL, 21)" },
  { screen: 'Search', what: 'records, a word many hold (search_logs)', as: MEMBER, sql: "SELECT * FROM public.search_logs('considered', 'considered', NULL, NULL, 21)" },
  { screen: 'Search', what: 'stacks, a word none holds (search_stacks)', as: MEMBER, sql: "SELECT * FROM public.search_stacks('tarkovsky', NULL, NULL, 21)" },
  { screen: 'Search', what: 'stacks, one member\'s (search_stacks)', as: MEMBER, sql: "SELECT * FROM public.search_stacks('stack 2001-', NULL, NULL, 21)" },
  { screen: 'Search', what: 'stacks, a word every stack holds (search_stacks)', as: MEMBER, sql: "SELECT * FROM public.search_stacks('stack', NULL, NULL, 21)" },
  // Two letters no stack holds: found absent from the short pieces' index (20261122_13, _15), not walked through every stack.
  { screen: 'Search', what: 'stacks, two letters (search_stacks)', as: MEMBER, index: 'lists_short_grams', sql: "SELECT * FROM public.search_stacks('m1', NULL, NULL, 21)" },
  // A ballot counted, as a member who voted reads it: the hot ballot, one member in five voted (seed.sql).
  // Each option's votes as counted when cast (20261122_27), never the ballot's every vote read again.
  { screen: 'Dispatch', what: 'the hot ballot counted, as a voter (ballot_tally)', as: mid(10), index: 'ballot_counts_pkey', sql: `SELECT public.ballot_tally('${HOT_BALLOT}')` },
  // A member's blocks and mutes, read whole as Settings reads them: the whale keeps 500.
  { screen: 'Settings', what: 'the whale\'s 500 blocks (get_user_blocks)', as: WHALE, sql: `SELECT * FROM public.get_user_blocks('${WHALE}')` },
  // The Tribunal as a member meets it: a verdict on them, their verdicts' first page, their withheld pieces
  // (the whale: 40 verdicts, 40 withheld logs).
  { screen: 'Tribunal', what: 'a verdict, as its member reads it (get_my_verdict)', as: WHALE, sql: "SELECT public.get_my_verdict('00000000-0000-4000-b200-000000000001')" },
  { screen: 'Tribunal', what: 'the whale\'s verdicts, first page (get_my_verdicts)', as: WHALE, sql: 'SELECT public.get_my_verdicts()' },
  { screen: 'Tribunal', what: 'the whale\'s withheld pieces (get_my_withheld_pieces)', as: WHALE, sql: 'SELECT public.get_my_withheld_pieces()' },
  // The Tribunal as a moderator meets it: what waits, the reports most reported first, the hot case's
  // evidence (300 reports of one log), the appeals waiting, the members under sanction, and twenty
  // members' histories (reports and verdicts in proportion to the house, seed.sql).
  { screen: 'Tribunal', what: 'what waits for a moderator (tribunal_waiting)', as: MODERATOR, sql: 'SELECT public.tribunal_waiting()' },
  { screen: 'Tribunal', what: 'the reports, most reported first, first page (get_priority_reports)', as: MODERATOR, sql: 'SELECT * FROM public.get_priority_reports(20)' },
  { screen: 'Tribunal', what: 'the hot case\'s evidence (get_report_evidence)', as: MODERATOR, sql: "SELECT public.get_report_evidence('00000000-0000-4000-b300-000000000001')" },
  { screen: 'Tribunal', what: 'the appeals waiting, first page (get_pending_appeals)', as: MODERATOR, index: 'mod_actions_appeals_waiting', sql: 'SELECT public.get_pending_appeals()' },
  { screen: 'Tribunal', what: 'the members under sanction, first page (get_sanctioned_members)', as: MODERATOR, index: 'profiles_under_sanction', sql: 'SELECT public.get_sanctioned_members()' },
  // Each member's own verdicts from the front of their index, to their page (20261122_61), never every verdict ranked.
  { screen: 'Tribunal', what: 'twenty members\' histories (get_moderation_history_for_users)', as: MODERATOR, index: 'idx_mod_actions_target',
    sql: `SELECT * FROM public.get_moderation_history_for_users(ARRAY[${[1, ...Array.from({ length: 19 }, (_, r) => ((r + 1) * 29) % MEMBERS + 1)].map((n) => `'${mid(n)}'`).join(', ')}]::uuid[], 5)` },
];

/** An annotation holds one message; GitHub encodes its line breaks as %0A. */
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const claims = (sub) => JSON.stringify({ sub, role: 'authenticated' }).replace(/'/g, "''");

/** One probe: a warm-up, then five timed runs, all inside one rolled-back transaction. */
function time(p) {
  const head = `BEGIN; SET LOCAL statement_timeout = '60s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(p.as)}', true);`;
  const runs = Array.from({ length: 5 }, () => `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${p.sql};`).join('\n');
  const sql = `${head}\n${p.sql};\n${runs}\nROLLBACK;`;
  const out = execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const times = [...out.matchAll(/"Execution Time": ([\d.]+)/g)].map((m) => Number(m[1]));
  if (times.length !== 5) throw new Error(`expected 5 timings, read ${times.length}`);
  return times.sort((a, b) => a - b);
}

/**
 * The plan of a read over budget. A function's call plans as one "Function
 * Scan", which says nothing; auto_explain (when the role may load it) prints
 * the plan of every statement the function runs, and those come first.
 */
function plan(p) {
  const inner = "LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0; SET auto_explain.log_analyze = on; SET auto_explain.log_buffers = on; SET auto_explain.log_nested_statements = on; SET auto_explain.log_format = 'json'; SET client_min_messages = log;";
  const sql = `${inner}\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(p.as)}', true);\nEXPLAIN (ANALYZE, BUFFERS) ${p.sql};\nROLLBACK;`;
  const r = spawnSync('psql', [DB, '-X', '-q', '-t', '-A', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // auto_explain may be refused; any other error is the reason the plan is missing.
  const errors = (r.stderr || '').split('\n').filter((l) => /ERROR:/.test(l) && !/auto_explain/.test(l)).join('\n');
  return [errors && `── psql said ──\n${errors}`, slowestInside(r.stderr || ''), `── the call ──\n${r.stdout || ''}`].filter(Boolean).join('\n');
}

/**
 * Every statement's plan of one run of a read, as JSON: the read's own (EXPLAIN ANALYZE) and, through
 * auto_explain, each statement a function inside it ran; for its shape (plan-shape.cjs).
 */
function plansOf(p) {
  const inner = "LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0; SET auto_explain.log_analyze = on; SET auto_explain.log_timing = off; SET auto_explain.log_nested_statements = on; SET auto_explain.log_format = 'json'; SET client_min_messages = log;";
  const sql = `${inner}\nBEGIN; SET LOCAL statement_timeout = '60s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(p.as)}', true);\nEXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${p.sql};\nROLLBACK;`;
  const r = spawnSync('psql', [DB, '-X', '-q', '-t', '-A', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const plans = [];
  const own = (r.stdout || '').slice((r.stdout || '').indexOf('['));
  try { plans.push(...JSON.parse(own.slice(0, own.lastIndexOf(']') + 1))); } catch { /* the read's own plan unread: its statements below still count */ }
  for (const block of (r.stderr || '').split(/^LOG:\s+duration: /m).slice(1)) {
    const at = block.indexOf('{');
    try {
      const one = JSON.parse(block.slice(at, block.lastIndexOf('}') + 1));
      if (!/^\s*(LOAD|BEGIN|EXPLAIN|SELECT set_config|SET )/i.test(one['Query Text'] ?? '')) plans.push(one);
    } catch { /* not a plan */ }
  }
  return plans;
}

/**
 * auto_explain's JSON, one LOG per statement the read ran: the slowest
 * statement inside a function, as a compact tree (an annotation holds about
 * 4,000 characters, and a plan in text with its query beside it does not fit).
 */
function slowestInside(log) {
  const plans = [];
  for (const block of log.split(/^LOG:\s+duration: /m).slice(1)) {
    const at = block.indexOf('{');
    try { plans.push({ ms: parseFloat(block), plan: JSON.parse(block.slice(at, block.lastIndexOf('}') + 1)) }); } catch { /* not a plan */ }
  }
  const inner = plans.filter((x) => !/^\s*(LOAD|BEGIN|EXPLAIN|SELECT set_config)/i.test(x.plan['Query Text'] ?? ''));
  if (!inner.length) return '';
  const worst = inner.reduce((a, b) => (b.ms > a.ms ? b : a));
  const lines = [];
  const walk = (n, depth) => {
    const on = [n['Relation Name'], n['Index Name'] && `using ${n['Index Name']}`].filter(Boolean).join(' ');
    const bufs = (n['Shared Hit Blocks'] ?? 0) + (n['Shared Read Blocks'] ?? 0);
    const cond = n['Index Cond'] ?? n['Filter'] ?? n['Hash Cond'] ?? '';
    lines.push(`${'  '.repeat(depth)}${n['Node Type']}${on ? ` ${on}` : ''} · ${n['Actual Total Time']} ms · rows ${n['Actual Rows']} × ${n['Actual Loops']} · buffers ${bufs}${cond ? ` · ${String(cond).slice(0, 120)}` : ''}`);
    for (const c of n.Plans ?? []) walk(c, depth + 1);
  };
  walk(worst.plan.Plan, 0);
  return `── the slowest statement inside: ${worst.ms} ms ──\n${lines.join('\n')}`;
}

const rows = [];
/** Each read's rows read of the growing tables, by its name: kept (LOAD_SHAPE_OUT) to judge against another size. */
const readRows = {};
/** Each read's median, for the slowest's plans below. */
const medians = [];
let over = 0;
for (const p of PROBES) {
  const budget = p.budget ?? BUDGET;
  try {
    const t = time(p);
    const median = t[2];
    medians.push({ p, median });
    // Its shape: what it reads of tables that grow with the house, within its bound, and no table read whole.
    const plans = plansOf(p);
    const grown = readOf(plans).grown;
    readRows[`${p.screen} · ${p.what}`] = grown;
    const faults = shapeFaults(plans, p.rows ?? BOUND, p.index);
    const ok = median <= budget && !faults.length;
    if (!ok) over++;
    rows.push(`| ${p.screen} | ${p.what} | ${median.toFixed(1)} | ${t[4].toFixed(1)} | ${budget} | ${grown} | ${ok ? '✓' : faults.length ? '✗ SHAPE' : '✗ OVER'} |`);
    console.log(`${ok ? '✓' : '✗'} ${p.screen} · ${p.what}: median ${median.toFixed(1)} ms, worst ${t[4].toFixed(1)} ms (budget ${budget}), ${grown} rows read of the growing tables`);
    for (const f of faults) console.log(`::error title=Load — ${p.screen}: ${p.what}::${escape(f)}`);
    if (!ok) {
      // the plan rides in the annotation: a run's logs need a signed-in reader, its annotations do not
      const shown = plan(p);
      console.log(shown);
      const head = shown.trim().split('\n').slice(0, 45).join('\n').slice(0, 3800);
      console.log(`::error title=Load — ${p.screen}: ${p.what}::median ${median.toFixed(1)} ms over a budget of ${budget} ms%0A${escape(head)}`);
    }
  } catch (e) {
    over++;
    rows.push(`| ${p.screen} | ${p.what} | — | — | ${budget} | — | ✗ FAILED |`);
    console.log(`::error title=Load — ${p.screen}: ${p.what}::${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ⏎ ')}`);
  }
}

// The plans of the slowest reads, within budget too, when the run asks (LOAD_PLAN_SLOWEST=n): what a
// speed batch studies, since the bar is the fastest a read can be (audit A-SCALE-PLAN).
const slowest = Number(process.env.LOAD_PLAN_SLOWEST ?? 0);
if (slowest > 0) {
  for (const { p, median } of [...medians].sort((a, b) => b.median - a.median).slice(0, slowest)) {
    console.log(`\n══ ${p.screen} · ${p.what}: median ${median.toFixed(1)} ms ══\n${plan(p)}`);
  }
}

// The stacks search under measurement answers as today's does: the same stacks in the same order, for
// every way the Reel asks (no search, a rare word, a word every stack has, a handle, the following
// filter, the next page after a cursor). A faster search that answers otherwise is not the same read.
if (PROPOSED_STACKS) {
  const ask = (fn, args) => {
    const sql = `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(MEMBER)}', true);\n`
      + `SELECT coalesce(string_agg(id::text, ',' ORDER BY n), '') FROM public.${fn}(${args}) WITH ORDINALITY AS t(id, title, description, username, user_id, created_at, films, film_count, certify_count, is_ranked, n);\nROLLBACK;`;
    return execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).pop() ?? '';
  };
  // The next page: after the 30th of the rare word's first page.
  const first = ask('get_filtered_stacks_auth_cursor_v2', "'stack', false, 30").split(',');
  const after = first.length === 30
    ? execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-c', `SELECT created_at FROM public.lists WHERE id = '${first[29]}'`], { encoding: 'utf8' }).trim()
    : '';
  const cases = [
    ["''", 'no search'], ["'stack 12'", 'a rare word'], ["'stack'", 'a word every stack has'], ["'m2001'", 'a handle'],
    ["'m1'", 'a handle many share'],
    ["'stack 1', true", 'the following filter'],
    ...(after ? [[`'stack', false, 60, '${after}'::timestamptz, '${first[29]}'::uuid`, 'the next page']] : []),
  ];
  let differ = 0;
  for (const [args, what] of cases) {
    const full = args.includes(',') ? args : `${args}, false, 60`;
    const today = ask('get_filtered_stacks_auth_cursor_v2', full);
    const proposed = ask('get_filtered_stacks_proposed', full);
    const same = today === proposed;
    if (!same) differ++;
    console.log(`${same ? '✓' : '✗'} stacks search, as proposed, answers as today's for ${what} (${today.split(',').filter(Boolean).length} stacks)`);
  }
  if (differ) { over++; console.log(`::error title=Load — the stacks search as proposed::answers otherwise than today's in ${differ} case(s)`); }
}

// The rows each read read, kept for a run at another size (LOAD_SHAPE_OUT); and, given the rows a run at
// a smaller house read (LOAD_SHAPE_AGAINST), every read whose rows grew with the house fails.
if (process.env.LOAD_SHAPE_OUT) writeFileSync(process.env.LOAD_SHAPE_OUT, JSON.stringify(readRows, null, 1));
if (process.env.LOAD_SHAPE_AGAINST) {
  const grew = rowsAtSizes(JSON.parse(readFileSync(process.env.LOAD_SHAPE_AGAINST, 'utf8')), readRows);
  for (const g of grew) { over++; console.log(`::error title=Load — a read that grows with the house::${escape(g)}`); }
  console.log(grew.length ? `\n${grew.length} read(s) grew with the house` : '\nno read grew with the house');
}

// What the search indexes made for short words (20261122_13, _14) and for a name's and a handle's beginning
// (20261122_17, _22) cost the house at this size, beside the trigram indexes of the same words, and the films
// seen again by month (20261122_20) beside the logs' own day index: their size on disk, and a
// member's write through them: a stack's 1,000-letter description and a member's name, each written five
// times (the median), with every index as built; with the GIN indexes' pending list off, so each write pays
// its pieces at once, as a write past the list's end does; and with the new indexes dropped. All in one
// transaction, rolled back; a member's name settled into the pieces' lists in its own statement (20261122_62),
// as its commit would.
try {
  const sizes = execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-F', ' ', '-c',
    "SELECT relname, pg_relation_size(oid) FROM pg_class WHERE relname IN ('lists_short_grams', 'lists_title_trigram', 'lists_description_trigram', 'profiles_short_grams', 'profiles_display_name_beginning', 'profiles_username_beginning', 'profiles_username_trigram', 'profiles_display_name_trigram', 'logs_seen_again_by_month', 'idx_logs_user_watched_id', 'lists', 'profiles', 'logs', 'member_grams', 'member_grams_pkey', 'member_gram_heads') ORDER BY relname"],
  { encoding: 'utf8' }).trim();
  console.log(`\nThe search indexes at ${Number(process.env.LOAD_MEMBERS ?? 100000).toLocaleString('en-US')} members (bytes):\n${sizes}`);
  // 999 letters and one digit: the description's ceiling is 1,000 (lists_description_len). The accented
  // letters are made by chr(), so the command's own text is plain ASCII on any runner's shell.
  const words = "(SELECT left(string_agg(md5(i::text) || ' Le cin' || chr(233) || 'ma ' || i, ' '), 999) FROM generate_series(1, 40) i)";
  const writes = (sql) => Array.from({ length: 5 }, (_, k) => `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${sql.split('$K').join(String(k))};`).join('\n');
  const both = () => `${writes(`UPDATE public.lists SET description = ${words} || '$K' WHERE id = (SELECT id FROM public.lists WHERE is_private = false ORDER BY created_at, id LIMIT 1)`)}
${writes(`UPDATE public.profiles SET display_name = 'Agn' || chr(232) || 's Varda $K' WHERE id = '${MEMBER}'`)}`;
  const out = execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN; SELECT set_config('request.jwt.claims', '', true); SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
${both()}
ALTER INDEX public.lists_short_grams SET (fastupdate = off); ALTER INDEX public.profiles_short_grams SET (fastupdate = off);
${both()}
DROP INDEX public.lists_short_grams; DROP INDEX public.profiles_short_grams; DROP INDEX public.profiles_display_name_beginning;
${both()}
ROLLBACK;`], { encoding: 'utf8' });
  const t = [...out.matchAll(/"Execution Time": ([\d.]+)/g)].map((m) => Number(m[1]));
  if (t.length !== 30) throw new Error(`expected 30 timings, read ${t.length}`);
  const median = (from) => [...t.slice(from, from + 5)].sort((x, y) => x - y)[2];
  for (const [at, how] of [[0, 'with the new indexes'], [10, 'with them, their pieces paid at once'], [20, 'without them']]) {
    console.log(`${how}: a stack's description written, median ${median(at)} ms; a member's name written, median ${median(at + 5)} ms`);
  }
} catch (e) { console.log(`the search indexes' cost could not be read: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ⏎ ')}`); }

const members = Number(process.env.LOAD_MEMBERS ?? 100000).toLocaleString('en-US');
const table = ['| Screen | Read | Median ms | Worst ms | Budget | Rows read | |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Load: ${members} members\n\n${table}\n`);
console.log(`\n${PROBES.length - over} of ${PROBES.length} within budget`);
process.exit(over ? 1 : 0);
