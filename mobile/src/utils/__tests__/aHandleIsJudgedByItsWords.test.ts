/**
 * aHandleIsJudgedByItsWords.test.ts — the handle filter refuses slurs and
 * vulgar words, and welcomes the names and words that contain their letters.
 *
 * It matched twelve letter patterns anywhere, so moby_dick, matsushita,
 * shiitake_fan and scunthorpe were refused, and n1gger and b1tch were not
 * (digits were never read). The same cases run on production in
 * a_handle_is_judged_by_its_words_rehearsal.sql.
 *
 * The rule lives twice, in the apps and in the database; the guard below holds
 * the word lists identical, and the website's copy identical to this one.
 */
import fs from 'fs';
import path from 'path';
import {
  validateUsername, isUnwelcomeHandle,
  UNWELCOME_ANYWHERE, UNWELCOME_WORDS, UNWELCOME_WORD_EDGES,
} from '../validateUsername';

const WELCOME = [
  'moby_dick', 'philip_k_dick', 'dickens_reader', 'matsushita', 'kshitij', 'shiitake_fan',
  'scunthorpe', 'pussycat_fan', 'flame_retardant', 'niggle_and_fuss', 'who_reviews', 'slutsky_reads',
];
const REFUSED = [
  'fuuuck', 'testfuck', 'b1tch_please', 'n1gger_x', 'xniggaz', 'a55hole', 'wh0re', 'faggot',
  'bullshit_critic', 'shitty_films', '5hit', 'cunty',
  'big_pussy', 'retard', 'slut_cinema', 'tranny_x',
];

describe('a handle is judged by its words', () => {
  it.each(WELCOME)('%s is welcome', (handle) => {
    expect(isUnwelcomeHandle(handle)).toBe(false);
    expect(validateUsername(handle)).toEqual({ valid: true, sanitized: handle });
  });

  it.each(REFUSED)('%s is refused', (handle) => {
    expect(isUnwelcomeHandle(handle)).toBe(true);
    expect(validateUsername(handle).error).toBe('This username is not allowed.');
  });
});

describe('one rule, in the apps and in the database', () => {
  const ROOT = path.resolve(__dirname, '../../../..');
  const migration = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20261002_02_a_handle_is_judged_by_its_words.sql'), 'utf8');
  const snapshot = fs.readFileSync(path.join(ROOT, 'mobile/supabase/schema/live-schema.sql'), 'utf8');

  /** The body of handle_is_unwelcome in a file, or null when the file has none. */
  const bodyOf = (sql: string) => {
    const at = sql.indexOf('FUNCTION public.handle_is_unwelcome(');
    return at < 0 ? null : sql.slice(at, sql.indexOf('$$;', at));
  };
  const listsOf = (body: string) => ({
    anywhere: /r\.s ~ '([^']+)'/.exec(body)?.[1],
    words: /ARRAY\[([^\]]+)\]/.exec(body)?.[1].split(',').map((w) => w.trim().replace(/'/g, '')),
    edges: [/w\.word ~ '\^\(([^)]+)\)'/.exec(body)?.[1], /w\.word ~ '\(([^)]+)\)\$'/.exec(body)?.[1]],
  });
  const ours = {
    anywhere: UNWELCOME_ANYWHERE,
    words: UNWELCOME_WORDS,
    edges: [UNWELCOME_WORD_EDGES.join('|'), UNWELCOME_WORD_EDGES.join('|')],
  };

  it('the migration holds the same three lists', () => {
    expect(listsOf(bodyOf(migration)!)).toEqual(ours);
  });

  it('and so does the live database (the snapshot taken after 20261002_02)', () => {
    const live = bodyOf(snapshot);
    expect(live).not.toBeNull();
    expect(listsOf(live!)).toEqual(ours);
  });

  it('the database reads digits as the same letters', () => {
    expect(bodyOf(migration)).toContain("translate(lower(coalesce(p_handle, '')), '013457', 'oieast')");
  });

  it("the website's copy is this one", () => {
    const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(2).join('\n');
    expect(code(path.join(ROOT, 'src/utils/validateUsername.ts')))
      .toBe(code(path.join(ROOT, 'mobile/src/utils/validateUsername.ts')));
  });
});
