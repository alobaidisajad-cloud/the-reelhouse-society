/**
 * boundedCounts.guard.test.ts — batch 20
 * ──────────────────────────────────────
 * The register framed all six findings as "add a limit". At FOUR sites, adding a
 * limit *is* the bug: the count on screen was taken from the fetched array, so
 * bounding the fetch silently shrinks the number the member sees.
 *
 *   feed          247 films shipped to draw 24 posters, count = films.length
 *   stack detail  every film loaded, "N REELS" = films.length
 *   log comments  unbounded, "CRITIQUES (N)" = comments.length
 *   unread badge  computed over ONE page of 30 — a member with 50 saw 30
 *
 * So this pins the pairing, not the limit: wherever a fetch is bounded, the count
 * beside it must come from the server. A future limit added without a count is
 * the exact regression these tests exist to stop.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('#45 · the stacks feed ships posters, not whole stacks', () => {
  const feed = stripComments(read('src/services/FeedService.ts'));

  it('calls the function that caps the poster array', () => {
    expect(feed).toMatch(/get_filtered_stacks_auth_cursor_v2/);
    expect(feed).toMatch(/p_poster_count: STACK_CARD_POSTERS/);
  });

  it('does NOT count the array it received', () => {
    // `count: (l.films || []).length` printed "4 FILMS" the moment the array was
    // capped — the same defect batch 15 fixed on the profile.
    expect(feed).not.toMatch(/count: \(l\.films \|\| \[\]\)\.length/);
    expect(feed).toMatch(/count: l\.film_count/);
  });

  it('the superseded function is no longer called', () => {
    expect(feed).not.toMatch(/rpc\('get_filtered_stacks_auth_cursor'/);
  });
});

describe('#45 · the count is REQUIRED, so omitting it cannot compile', () => {
  it('film_count is not optional on the feed row', () => {
    const schema = stripComments(read('src/schemas/feed.schema.ts'));
    expect(schema).toMatch(/film_count: z\.union/);
    // Zod strips unknown keys — a column selected but not declared is silently
    // dropped, which is exactly how the old count would come back.
    expect(schema).not.toMatch(/film_count:[^\n]*optional\(\)/);
  });
});

describe('#44 · log critiques are bounded, and still counted honestly', () => {
  const svc = stripComments(read('src/services/LogService.ts'));

  it('the fetch is bounded', () => {
    expect(svc).toMatch(/COMMENT_PAGE_SIZE/);
    expect(svc).toMatch(/\.limit\(limit\)/);
  });

  it('it keeps the NEWEST comments, not the oldest', () => {
    // The old order was ascending, so a plain `.limit(50)` would have hidden the
    // newest — including a comment the member had just posted.
    expect(svc).toMatch(/\.order\('created_at', \{ ascending: false \}\)/);
  });

  it('the true total travels beside the page', () => {
    expect(svc).toMatch(/count: 'exact', head: true/);
    expect(svc).toMatch(/return \{ comments: valid, total \}/);
  });

  it('the header renders the total, not the array length', () => {
    const ui = stripComments(read('src/components/log/LogComments.tsx'));
    expect(ui).toMatch(/CRITIQUES \(\$\{commentTotal \?\? comments\.length\}\)/);
  });

  it('the page is large enough that nothing is unreachable YET', () => {
    // This screen has no "load earlier" control, unlike the dossier. So the page
    // must stay well clear of any real thread, or a bounded fetch would hide
    // comments the honest total says exist — trading one defect for another.
    // Largest thread in the database: 1. If this is ever lowered, the control
    // has to come first.
    const m = svc.match(/const COMMENT_PAGE_SIZE = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(100);
  });
});

describe('#52 · one malformed row cannot end a member\'s history', () => {
  const store = stripComments(read('src/stores/notificationStore.ts'));

  it('paging asks what the SERVER returned, not what survived validation', () => {
    expect(store).not.toMatch(/_hasMore: validated\.length >= PAGE_SIZE/);
    expect(store).toMatch(/data\.length >= PAGE_SIZE/);
  });

  it('the cursor advances from the RAW row', () => {
    // Otherwise a page that fails validation entirely leaves the cursor put, and
    // with _hasMore driven by the server count that re-fetches forever.
    expect(store).toMatch(/const lastRaw = data\[data\.length - 1\]/);
  });

  it('paging stops if the cursor cannot advance', () => {
    expect(store).toMatch(/_hasMore: !!cursor && data\.length >= PAGE_SIZE/);
    expect(store).toMatch(/_hasMore: !!advanced && data\.length >= PAGE_SIZE/);
  });
});

describe('the unread badge is server truth, and survives a failed action', () => {
  const store = stripComments(read('src/stores/notificationStore.ts'));

  it('asks the database how many are unread', () => {
    expect(store).toMatch(/\.eq\('is_read', false\)/);
  });

  it('no rollback re-derives the badge from what is in memory', () => {
    // Five paths used to recompute it from the local list. Once the badge is
    // server truth, that SHRINKS it after any failed mark-read or dismiss.
    expect(store).not.toMatch(/_unreadCount: previousState\.filter/);
    expect((store.match(/_unreadCount: previousUnread/g) ?? []).length).toBe(5);
  });
});

describe('#94 · the Tribunal asks once, for the whole docket', () => {
  const tribunal = stripComments(read('app/(admin)/tribunal.tsx'));
  const svc = stripComments(read('src/services/ModerationService.ts'));

  it('no per-card query remains', () => {
    expect(tribunal).not.toMatch(/getUserModerationHistory/);
    expect(svc).not.toMatch(/async getUserModerationHistory/);
  });

  it('the batch is keyed on the ACCUMULATED docket, not page one', () => {
    // The docket appends pages; a fetch keyed to the first page would leave every
    // later card with an empty record.
    expect(tribunal).toMatch(/docketUserIds/);
    expect(tribunal).toMatch(/queryKey: \['admin', 'moderation-history', docketUserIds\]/);
  });

  it('it ranks per member, so one heavy offender cannot starve the rest', () => {
    expect(svc).toMatch(/get_moderation_history_for_users/);
    expect(svc).not.toMatch(/mod_actions'\)\s*\.select\('\*'\)/);
  });
});

describe('stack positions belong to the server', () => {
  const slice = stripComments(read('src/stores/domain/listSlice.ts'));

  it('adding a film no longer guesses its position from an array length', () => {
    // `rank_position: currentList.films.length` made the array's completeness
    // load-bearing — bound the query and every new film collides at one position.
    expect(slice).not.toMatch(/rank_position: currentList\.films\.length/);
    expect(slice).not.toMatch(/const position = currentList\.films\.length/);
  });
});

describe('the endorsement index is merged, never replaced', () => {
  const slice = stripComments(read('src/stores/domain/interactionSlice.ts'));

  it('both hydrations preserve what is already known', () => {
    // It used to build a fresh index and assign it, so a re-run discarded
    // anything learned since — including a certification just made.
    expect(slice).toMatch(/\{ \.\.\.state\._endorsedIndex \}/);
    expect(slice).toMatch(/\{ \.\.\.get\(\)\._listEndorsedIndex \}/);
  });
});
