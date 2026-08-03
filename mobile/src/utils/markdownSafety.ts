import { safeOpenURL } from '@/src/utils/linking';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

/**
 * markdownLinkGuard — the handler every <Markdown> mount must pass as `onLinkPress`.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `react-native-markdown-display` opens links itself when no handler is supplied.
 * From its own source (v7.0.2, `src/lib/util/openUrl.js`):
 *
 *     export default function openUrl(url, customCallback) {
 *       if (customCallback) {
 *         const result = customCallback(url);
 *         if (url && result && typeof result === 'boolean') Linking.openURL(url);
 *       } else if (url) {
 *         Linking.openURL(url);      // <- no handler: opens ANYTHING
 *       }
 *     }
 *
 * With no handler, `[tap me](javascript:…)` / `[tap me](intent://…)` in a member's
 * published dossier reaches the OS directly — bypassing safeOpenURL, whose docstring
 * calls itself "the single choke-point every externally-sourced link must pass
 * through". Every mount in this app was bare.
 *
 * ── ⚠️ THE RETURN VALUE IS THE SECURITY CONTROL ──────────────────────────────
 * Nearly every React Native library reads a `true` return as "I handled it, don't do
 * the default". THIS LIBRARY DOES THE OPPOSITE:
 *
 *     returns true  -> the library ALSO calls raw Linking.openURL  (allowlist bypassed)
 *     returns false -> nothing else runs; our handler is the only opener  ✅
 *     returns a Promise -> nothing (fails its `typeof result === 'boolean'` check)
 *
 * Writing the intuitive `return true` would open every link TWICE, the second time
 * with no validation at all — reintroducing the exact vulnerability this closes.
 *
 * The return type is the literal `false`, not `boolean`, so that mistake is a COMPILE
 * ERROR rather than a silent regression. Do not widen it.
 */
/**
 * Bound what the markdown parser is asked to chew on.
 *
 * ── THE ADVISORY THE REGISTER NAMED IS NOT THE ONE THAT FIRES ────────────────
 * Finding #2 exists to mitigate a `linkify-it` quadratic. That advisory is
 * UNREACHABLE here: the library builds `MarkdownIt({ typographer: true })` and never
 * enables linkify, whose markdown-it default is `false`. That scanner never runs.
 *
 * Two OTHER quadratics are reachable, and both were measured against the installed
 * versions (markdown-it 10.0.0) rather than assumed:
 *
 *            input        20k        80k       200k
 *   smartquotes rule      64ms     4091ms    16843ms
 *   nested emphasis      324ms     6877ms          —
 *
 * Sixteen seconds of frozen JS thread. And it is reachable in production: the WEB app
 * writes `dispatch_dossiers.full_content` with no sanitiser and no length cap to this
 * same database, so the mobile 25,000 write limit bounds one client out of two.
 *
 * ── WHY A CAP AND NOT `typographer: false` ───────────────────────────────────
 * Disabling smartquotes makes that one rule linear (200k: 16843ms -> 9ms) and keeps
 * en-dashes, ellipses and ©, costing only curly quotes. It was tempting. But nested
 * emphasis is quadratic INDEPENDENTLY and is the worse of the two, so killing one rule
 * closes one hole and leaves the larger one open. The cap bounds both. Smart quotes
 * stay, because typography is the product on an app built for film writing.
 *
 * ── WHY 25,000 ───────────────────────────────────────────────────────────────
 * It is MAX_LENGTHS.dossierContent — the limit the sanitiser ALREADY enforces on the
 * write path. One number with one meaning on both sides, rather than a second
 * threshold that drifts from the first. Worst-case adversarial input at that size
 * measures under half a second; the longest real dossier is 2,770 characters.
 *
 * Render-only. Storage is untouched, and the compose preview deliberately does NOT
 * use this — truncating authors' drafts while they write is the app fighting its user.
 */
export function capMarkdownForRender(content: string | null | undefined): string {
  if (!content) return '';
  if (content.length <= MAX_LENGTHS.dossierContent) return content;
  return content.slice(0, MAX_LENGTHS.dossierContent) + '\n\n…';
}

export function onMarkdownLinkPress(url: string): false {
  // An empty href — `[text]()` — is a typo, not an attack. safeOpenURL would show a
  // "Link Unavailable" alert, so a member who mistyped a link would be scolded by a
  // security dialog. Ignore it silently; only a real, disallowed scheme should alert.
  if (typeof url === 'string' && url.trim().length > 0) {
    // Deliberately not awaited: the library inspects the RETURN VALUE synchronously,
    // and a Promise here would fail its boolean check by accident rather than by
    // design. `void` states that the floating promise is intentional.
    void safeOpenURL(url);
  }
  return false;
}
