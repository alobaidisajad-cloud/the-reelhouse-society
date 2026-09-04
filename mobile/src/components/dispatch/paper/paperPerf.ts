import { KIND_RULE } from './paperMetrics';

/**
 * paperPerf — how the Dispatch stays fast with a hundred thousand members.
 * ─────────────────────────────────────────────────────────────────────────────
 * The reliability work already done is about CORRECTNESS at scale — bounded
 * queries, keyset pagination, capped text, trigger-maintained counts. This file
 * is the other half: what the client does sixty times a second while somebody
 * scrolls.
 *
 * The numbers that matter on this page:
 *   · A member scrolls the Dispatch for minutes at a time. Every millisecond in
 *     a row's render is paid on every recycle, forever.
 *   · Five kinds produce five completely different trees. A ballot has posters
 *     and boxes; a take has a sentence. Recycling one into the other is the
 *     most expensive thing this list can do.
 *   · Posts carry film art. Images are the only unbounded cost here.
 */

/**
 * ── ONE: RECYCLE LIKE INTO LIKE ──────────────────────────────────────────────
 * FlashList reuses a row's mounted tree for the next row of the same TYPE. With
 * no `getItemType` every row is one type, so a ballot's tree gets torn down and
 * a take's built in its place — a full unmount/mount on a scroll frame.
 *
 * Typed by kind, a take recycles into a take: same shape, same depth, and the
 * work drops to setting text. This is the single largest win available on this
 * screen and it costs one function.
 *
 * The type must include anything that changes the SHAPE, not just the kind —
 * a take with a still and a take without are different trees.
 */
export const itemType = (item: { kind: string; still?: boolean; removed?: boolean }) =>
  item.removed ? 'removed' : item.still ? `${item.kind}+still` : item.kind;

/**
 * ── TWO: NOTHING NEW ON EVERY RENDER ─────────────────────────────────────────
 * A row that builds an object, an array, or a closure on each render defeats
 * `memo` on everything beneath it. In this design that means:
 *
 *   · Every style comes from the StyleSheet. The only dynamic values are the
 *     five kind colours, and they are frozen constants keyed by kind — never
 *     `{ color: KIND_RULE[kind] }` built inline in a list row.
 *   · `hitSlop` objects are module constants (`SLOP`, `IX_SLOP`), never inline.
 *   · Handlers are passed down already bound, never `() => onPress(id)` written
 *     in the row.
 *   · `keyExtractor` returns the post id and nothing else. An index key makes
 *     every insertion above re-key the whole list.
 *
 * The frozen per-kind style objects live here so there is one of each for the
 * life of the process rather than one per row per render.
 */
export const LEAD_STYLE: Record<string, { color: string }> = Object.freeze(
  Object.fromEntries(
    Object.entries(KIND_RULE).map(([k, c]) => [k, Object.freeze({ color: c })]),
  ),
);

/**
 * ── THREE: IMAGES ARE THE ONLY UNBOUNDED COST ────────────────────────────────
 *   · `recyclingKey` on every image in a recycled row. Without it the row shows
 *     the PREVIOUS post's picture for a frame while the new one decodes, which
 *     is the most visible artefact a recycling list produces.
 *   · `transition={0}` in list rows. A fade on every recycle reads as the list
 *     stuttering, not as polish. Fades belong on a detail screen, once.
 *   · `cachePolicy="memory-disk"`, and `priority="low"` for backdrops so an
 *     atmospheric image never delays an avatar somebody is looking at.
 *   · TMDB SIZED PATHS, never `/original`. A backdrop is drawn 315pt wide at
 *     0.13 opacity; `w780` is already generous and `original` can be 3MB of
 *     decode for a texture nobody can make out. Posters at `w185`, avatars at
 *     `w92`.
 *   · One compositing layer over the art, not two — the warm wash is mixed into
 *     the gradient's stops rather than being its own full-bleed view.
 */
export const TMDB = { backdrop: 'w780', poster: 'w185', avatar: 'w92' } as const;

/**
 * ── FOUR: NEVER MEASURE WHAT YOU CAN DECLARE ─────────────────────────────────
 * `onLayout` in a list row is a round trip per row per recycle. Everything on
 * this page that needs a height derives it from `paperMetrics` instead —
 * `stillHeight(measure)` is arithmetic, not a measurement, which is also why
 * the skeletons can match the posts exactly.
 *
 * FlashList 2 sizes itself; there is no `estimatedItemSize` to get wrong. This
 * feed passed one anyway. It did nothing — `src/types/flash-list.d.ts` declares
 * the prop the library removed so twenty-odd older call sites still typecheck,
 * and FlashList spreads what it does not recognise onto its ScrollView, which
 * ignores a number it has never heard of. Passing it said the list was tuned
 * when it was not, so it is gone from this one.
 */

/**
 * ── FIVE: THE SHAPES THAT ARE EXPENSIVE ──────────────────────────────────────
 *   · `shadow*` on iOS forces an offscreen pass. There is exactly one shadowed
 *     thing that can appear over a scrolling list — the held-filings pill — and
 *     it is a single 31pt element that exists only while filings are held.
 *     No post, no row, and no rule carries a shadow.
 *   · `overflow: 'hidden'` clips, which also costs. It is on the index scroller
 *     and on image frames, where it is doing real work, and nowhere else.
 *   · Gradients: at most one per row, and only on rows that carry art.
 *   · `includeFontPadding: false` on every style in the LABEL face — Android's
 *     default padding silently changes row heights and forces re-layout on font
 *     load. `leadIn` is the one that proves it: `TAKE — ` is printed inline with
 *     the body on a feed row, so its padding sets that row's first line height.
 *
 *     This said "every label" and meant it, and six of the fifty-four styles in
 *     that face had been missed — including `leadIn`. They are set now.
 *
 *     THE READING FACES ARE DELIBERATELY EXEMPT, all twenty-two of them. This
 *     app renders Arabic, and stripping Android's font padding from multi-line
 *     text in a serif or display face is how tall ascenders and descenders get
 *     clipped; sixteen of the twenty-two are multi-line. A label is one line of
 *     small caps and has no such risk, which is the whole reason the rule can be
 *     absolute for one face and wrong for the others. Applying it everywhere
 *     would be a bulk Android change made without an Android device, which is
 *     how this project has been bitten before.
 */

/**
 * ── SIX: THE WRITES ──────────────────────────────────────────────────────────
 * Every mark is optimistic and every mark is idempotent. Certify, save and
 * report are all `insert … on conflict do nothing` / `delete`, so a double tap
 * on a slow connection cannot produce two rows or a wrong count — and the
 * counts themselves are trigger-maintained columns, never a `COUNT(*)` the feed
 * has to run per post.
 *
 * A failed write restores the mark AND says so. The one thing this page must
 * never do is let a member believe something is filed when it is not — which is
 * why an unsent filing stays visible on the page saying exactly that.
 */

/**
 * ── SEVEN: WHAT THE FIRST SCREEN COSTS ───────────────────────────────────────
 * One request returns the page: twenty rows, each with its author's name and
 * avatar path and its film's title, year and art paths, joined server-side by
 * `get_dispatch_paper` — never twenty follow-up lookups from the client.
 *
 * Four skeletons while it lands, shaped exactly like the posts that replace
 * them, so the first paint and the first content share one layout and nothing
 * moves when the data arrives.
 *
 * `PREFETCH_ROWS = 8` stood here and nothing imported it. No section of this
 * file asks for prefetching and none of the reasoning above needs it: one
 * request returns the page, the art is already fetched at sized paths with
 * `cachePolicy="memory-disk"`, and eight rows of speculative decode ahead of a
 * scroll is a cost, not a saving, unless a device says otherwise. A constant
 * kept for a thing the file never argued for is the next audit's phantom
 * finding, so it went — the same call, for the same reason, as `ARRIVE_Y`.
 */
