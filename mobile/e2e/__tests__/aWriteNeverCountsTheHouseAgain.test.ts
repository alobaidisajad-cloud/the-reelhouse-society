/**
 * A write never counts the house again.
 *
 * Each record written, changed or taken away counted its film's every record again (note_film_verdict,
 * refresh_film_verdict): a member's record of a film half the house had logged read half the house's
 * records, 1.1 s at 500,000 members, under the train's locks too (load 45122008179, car 25's rehearsal),
 * and growing with the house. 20261122_67 keeps each film's sums and moves them by each statement's own
 * records.
 *
 * This finder holds the rule to the house as production will hold it (the snapshot, then every pending
 * car): each statement of a trigger's function, and of every function of the house it calls, that
 * aggregates over a table of the house is bounded by one piece the write names (one stack's entries, one
 * salon's seats, one member's day), each judged here with its bound, or is a film's first move (counted
 * once, only where its kept sums are not found). Anything else counts what grows with the house at each
 * write, and is refused.
 */
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { read, mask } from '@/test-utils/house';
import { files } from '@/test-utils/universe';

type House = ReturnType<typeof read>;

const MOBILE = join(__dirname, '..', '..');

/** An aggregate, and a table of the house a statement reads (a statement's own rows are no table of it). */
const AGGREGATE = /\b(count|sum|avg|min|max|array_agg|jsonb_agg|jsonb_object_agg|string_agg|bool_or|bool_and)\s*\(/i;
const TABLE = /\b(?:FROM|JOIN)\s+((?:public|private|auth|storage)\.\w+)/gi;
const CALL = /\b((?:public|private)\.\w+)\s*\(/g;

/** A function's body with its comments and quoted words blanked: a job's command in quotes is no call. */
const code = (body: string) => mask(body).text;

/** The functions a function reaches: itself and each function of the house it calls, and theirs. */
function reached(house: House, name: string, seen = new Set<string>()): Set<string> {
  const fn = house.functions.get(name);
  if (!fn || seen.has(name)) return seen;
  seen.add(name);
  for (const call of code(fn.body).matchAll(CALL)) reached(house, call[1] ?? '', seen);
  return seen;
}

/** One read that aggregates over a table of the house, and the triggers that reach it. */
type Count = { fn: string; table: string; statement: string; triggers: string[] };

/** Each trigger's reads that aggregate over the house, by `function reads table`. */
function counts(house: House): Map<string, Count> {
  const out = new Map<string, Count>();
  for (const t of house.triggers.values()) {
    for (const fn of reached(house, t.fn)) {
      for (const statement of code(house.functions.get(fn)?.body ?? '').split(';')) {
        if (!AGGREGATE.test(statement)) continue;
        for (const read of statement.matchAll(TABLE)) {
          const table = read[1] ?? '';
          const key = `${fn} reads ${table}`;
          const seen: Count = out.get(key) ?? { fn, table, statement: statement.replace(/\s+/g, ' ').trim(), triggers: [] };
          seen.triggers.push(`${t.name} on ${t.table}`);
          out.set(key, seen);
        }
      }
    }
  }
  return out;
}

/** Each read bounded by one piece the write names, with its bound. */
const BOUNDED: Record<string, string> = {
  'public.a_notice_gone_is_told reads auth.users': 'its aggregate is over the statement\'s own rows (the notices gone); each member is asked of auth.users by key',
  'public.a_sealed_stack_takes_its_cards reads public.list_items': 'one stack\'s entries, by its key (a stack\'s size, never the house\'s)',
  'public.a_sealed_stack_takes_its_cards reads public.profiles': 'its curator, by key, beside one stack\'s entries counted',
  'private.a_shared_card reads public.list_items': 'one stack\'s entries, by its key (a stack\'s size, never the house\'s)',
  'private.a_shared_card reads public.profiles': 'its curator, by key, beside one stack\'s entries counted',
  'public.error_logs_daily_ceiling reads public.error_logs': 'one member\'s last day of reports, refused past 200',
  'public.recount_lounge_members reads public.lounge_members': 'one salon\'s seats, at most its max_members (50)',
  'public.assign_list_item_position reads public.list_items': 'one stack\'s entries, by its key (a stack\'s size, never the house\'s)',
  'private.member_grams_settle reads private.member_grams_waiting': 'the pieces this transaction\'s own members wait with (by its txid), grouped',
  'private.member_grams_apply reads private.member_grams': 'the pieces this write changed, and one piece\'s list, at most its cap (a thousand)',
  'private.member_grams_apply reads private.member_gram_heads': 'the heads of the pieces this write changed, by key',
};

/**
 * A film's first move: its records counted once, only where its kept sums were not found (the kept row
 * moved first; IF NOT FOUND, then counted), so every later move reads one row.
 */
const FIRST_MOVE = 'private.a_films_verdict_moves reads public.logs';
const isFirstMove = (house: House) => {
  const body = code(house.functions.get('private.a_films_verdict_moves')?.body ?? '');
  const moved = body.search(/\bUPDATE\s+private\.film_tallies\b/i);
  const notFound = body.search(/\bIF\s+NOT\s+FOUND\s+THEN\b/i);
  const counted = body.search(/\bFROM\s+public\.logs\b/i);
  const ended = body.indexOf('END IF', notFound);
  return moved >= 0 && notFound > moved && counted > notFound && ended > counted;
};

/** The reads that count the house again: neither bounded nor a film's first move. */
const unbounded = (house: House) => [...counts(house).entries()]
  .filter(([key]) => !(key in BOUNDED) && !(key === FIRST_MOVE && isFirstMove(house)))
  .map(([key, c]) => `${key} (${c.triggers.join(', ')})`);

/** The house as production will hold it, less the pending cars named. */
function houseWithout(...cars: string[]): House {
  const snapshot = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8').replace(/\r/g, '');
  const applied = new Set(readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()));
  const pending = files('migrations').filter((f) => !applied.has(basename(f)) && !cars.some((c) => basename(f).startsWith(c)))
    .sort((a, b) => (basename(a) < basename(b) ? -1 : 1))
    .map((f) => readFileSync(f, 'utf8').replace(/\r/g, '')).join('\n');
  return read(`${snapshot}\n${pending}`, { pendingFrom: snapshot.length + 1 });
}

const HOUSE = read();

describe('a write never counts the house again, in the house as production will hold it', () => {
  it('bounds each read a write\'s trigger aggregates by one piece the write names, or counts a film once, at its first move', () => {
    expect(unbounded(HOUSE)).toEqual([]);
    // The film's verdict is read by its first move alone, and every bounded read is still in the house.
    expect(isFirstMove(HOUSE)).toBe(true);
    expect([...counts(HOUSE).keys()].sort()).toEqual([...Object.keys(BOUNDED), FIRST_MOVE].sort());
  });

  it('finds the verdict counted again at each record, as production holds it before 20261122_67', () => {
    expect(unbounded(houseWithout('20261122_67'))).toEqual([
      'public.refresh_film_verdict reads public.logs (trg_verdict_film_logs on public.logs)',
    ]);
  });

  it('finds a write that counts the house, in its trigger and in a function it calls, and no call in a job\'s words', () => {
    const planted = read([
      'CREATE FUNCTION public.t_counts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM count(*) FROM public.logs l WHERE l.film_id = NEW.film_id;\n  RETURN NEW;\nEND $$;',
      'CREATE TRIGGER t_counts AFTER INSERT ON public.logs FOR EACH ROW EXECUTE FUNCTION public.t_counts();',
      'CREATE FUNCTION public.t_calls() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM private.t_means(NEW.film_id);\n  RETURN NEW;\nEND $$;',
      'CREATE FUNCTION private.t_means(p integer) RETURNS numeric LANGUAGE sql AS $$ SELECT avg(l.rating) FROM public.logs l WHERE l.film_id = p $$;',
      'CREATE TRIGGER t_calls AFTER UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION public.t_calls();',
      "CREATE FUNCTION public.t_schedules() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM cron.schedule('t-runs', '1 seconds', 'SELECT private.t_job();');\n  RETURN NULL;\nEND $$;",
      'CREATE FUNCTION private.t_job() RETURNS void LANGUAGE sql AS $$ SELECT count(*) FROM public.interactions $$;',
      'CREATE TRIGGER t_schedules AFTER INSERT ON public.dispatch_posts FOR EACH STATEMENT EXECUTE FUNCTION public.t_schedules();',
      'CREATE FUNCTION public.t_own_rows() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM count(*) FROM moved_in n;\n  RETURN NULL;\nEND $$;',
      'CREATE TRIGGER t_own_rows AFTER INSERT ON public.lists REFERENCING NEW TABLE AS moved_in FOR EACH STATEMENT EXECUTE FUNCTION public.t_own_rows();',
    ].join('\n'));
    expect(unbounded(planted)).toEqual([
      'public.t_counts reads public.logs (t_counts on public.logs)',
      'private.t_means reads public.logs (t_calls on public.logs)',
    ]);
  });

  it('judges a film\'s count a first move only where its kept sums were not found', () => {
    const move = (body: string) => read([
      `CREATE FUNCTION private.a_films_verdict_moves(p_film integer, p_logs integer, p_rated integer, p_sum numeric) RETURNS void LANGUAGE plpgsql AS $$\nBEGIN\n${body}\nEND $$;`,
      'CREATE FUNCTION public.note_film_verdict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM private.a_films_verdict_moves(1, 1, 0, 0);\n  RETURN NULL;\nEND $$;',
      'CREATE TRIGGER trg_verdict_film_logs_insert AFTER INSERT ON public.logs REFERENCING NEW TABLE AS moved_in FOR EACH STATEMENT EXECUTE FUNCTION public.note_film_verdict();',
    ].join('\n'));
    const kept = '  UPDATE private.film_tallies SET logs = logs + p_logs WHERE film_id = p_film;';
    const counted = '    INSERT INTO private.film_tallies (film_id, logs, rated, rating_sum) SELECT p_film, count(*), 0, 0 FROM public.logs l WHERE l.film_id = p_film;';
    expect(unbounded(move(`${kept}\n  IF NOT FOUND THEN\n${counted}\n  END IF;`))).toEqual([]);
    expect(unbounded(move(`${kept}\n  IF true THEN\n${counted}\n  END IF;`))).toEqual([`${FIRST_MOVE} (trg_verdict_film_logs_insert on public.logs)`]);
    expect(unbounded(move(`${counted}\n${kept}\n  IF NOT FOUND THEN\n  NULL;\n  END IF;`))).toEqual([`${FIRST_MOVE} (trg_verdict_film_logs_insert on public.logs)`]);
  });
});
