/**
 * aShelfEntryIsOnlyAddedTo.test.ts — a log's format files on the shelf; it never rewrites it.
 *
 * Logging a film with a disc format filed it on the member's shelf by upserting
 * the WHOLE row: a blank note, 'good', and only the formats the device knew. A
 * shelf entry described on the website — "Criterion, spine 62, slipcase torn",
 * condition 'worn', DVD and Blu-ray — became a bare Blu-ray the next time the
 * film was logged, and an offline replay did the same. Here the shelf is a
 * table that holds its rows, so what is asserted is what the member would find.
 */
import { supabase } from '@/src/lib/supabase';
import { fileOnShelf } from '../ShelfService';
import { executeMutation } from '@/src/utils/mutationExecutor';

type Row = { id: string; user_id: string; film_id: number; film_title: string; poster_path: string | null; year: number | null; formats: string[]; notes: string; condition: string };

/** physical_archive, as PostgREST answers the four calls the shelf makes. */
function shelfTable(rows: Row[]) {
  const pick = (r: Row) => ({ id: r.id, formats: [...r.formats] });
  return {
    upsert: (values: Omit<Row, 'id' | 'notes' | 'condition'>[], opts: { onConflict: string; ignoreDuplicates?: boolean }) => ({
      select: async () => {
        const v = values[0];
        const there = rows.find((r) => r.user_id === v.user_id && r.film_id === v.film_id);
        if (there && opts.ignoreDuplicates) return { data: [], error: null };
        if (there) { Object.assign(there, v); return { data: [pick(there)], error: null }; }
        const made: Row = { id: `row-${rows.length + 1}`, notes: '', condition: 'good', ...v } as Row;
        rows.push(made);
        return { data: [pick(made)], error: null };
      },
    }),
    select: () => {
      const f: Record<string, unknown> = {};
      const q = {
        eq: (k: string, v: unknown) => { f[k] = v; return q; },
        maybeSingle: async () => {
          const r = rows.find((x) => x.user_id === f.user_id && x.film_id === f.film_id);
          return { data: r ? pick(r) : null, error: null };
        },
      };
      return q;
    },
    update: (patch: Partial<Row>) => ({
      eq: (_k: 'id', id: string) => ({
        select: () => ({
          single: async () => {
            const r = rows.find((x) => x.id === id)!;
            Object.assign(r, patch);
            return { data: pick(r), error: null };
          },
        }),
      }),
    }),
  };
}

const ENTRY = { user_id: 'm1', film_id: 62, film_title: 'Seven Samurai', poster_path: '/7s.jpg', year: 1954 };
const described = (): Row => ({ id: 'row-1', ...ENTRY, formats: ['DVD', 'Blu-ray'], notes: 'Criterion, spine 62, slipcase torn', condition: 'worn' });

let rows: Row[];
beforeEach(() => {
  rows = [];
  (supabase.from as jest.Mock).mockImplementation((t: string) => {
    if (t !== 'physical_archive') throw new Error(`unexpected table ${t}`);
    return shelfTable(rows);
  });
});

describe('a format filed on the shelf', () => {
  it('files a film not yet there, whole', async () => {
    await expect(fileOnShelf(ENTRY, ['Blu-ray'])).resolves.toEqual({ id: 'row-1', formats: ['Blu-ray'] });
    expect(rows).toEqual([expect.objectContaining({ film_id: 62, formats: ['Blu-ray'], notes: '', condition: 'good' })]);
  });

  it('leaves a described entry its notes and condition, and only adds the format', async () => {
    rows.push(described());
    await fileOnShelf(ENTRY, ['4K UHD']);
    expect(rows).toEqual([{ ...described(), formats: ['DVD', 'Blu-ray', '4K UHD'] }]);
  });

  it('keeps the formats the device never loaded — it merges with the server', async () => {
    rows.push(described());
    // A log of the film on DVD from a phone whose shelf was never opened.
    await expect(fileOnShelf(ENTRY, ['DVD'])).resolves.toEqual({ id: 'row-1', formats: ['DVD', 'Blu-ray'] });
    expect(rows[0]).toEqual(described());
  });
});

describe('the offline replay of a shelf filing', () => {
  it('a payload queued by an older build, blank note and all, takes nothing away', async () => {
    rows.push(described());
    await executeMutation(
      { id: 'q1', type: 'add_archive', createdAt: Date.now(), retries: 0,
        payload: { ...ENTRY, formats: ['Blu-ray', 'VHS'], notes: '', condition: 'good' } } as never,
      {},
    );
    expect(rows).toEqual([{ ...described(), formats: ['DVD', 'Blu-ray', 'VHS'] }]);
  });
});
