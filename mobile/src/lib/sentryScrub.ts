/**
 * sentryScrub — what may leave the phone in a crash report or a trace (P4.44).
 *
 * An allow-list, not a scrub: every key of an event's extra, tags and contexts is kept only when it
 * is listed here with its type, and its value is that type. Nothing a member wrote, and no email,
 * handle or member id, is on the list; a key not on it is dropped whole. Request addresses (in
 * breadcrumbs, in the event's request, in a trace's spans) are cut to scheme, host and path: a
 * query carries a search's words or a handle. A server's check failure ("Failing row contains
 * …") is cut at those words, and an email anywhere in a message is replaced. The member is not
 * named at all: no user, no id.
 *
 * sentry.ts hands every event, breadcrumb and transaction through these before they are sent.
 */

/** A code's own label: an identifier-like word or dotted path, never a sentence. */
const LABEL = /^[A-Za-z][\w.:/-]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = 'label' | 'contentId' | 'code' | 'count' | 'boolean' | 'ratio' | 'componentStack';

const fits: Record<Kind, (v: unknown) => boolean> = {
  label: (v) => typeof v === 'string' && LABEL.test(v),
  // The id of a film, a log, a stack, a salon: never of a member.
  contentId: (v) => (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && (UUID.test(v) || /^[\w-]{1,40}$/.test(v))),
  // A PostgreSQL SQLSTATE, or PostgREST's own (PGRST116).
  code: (v) => typeof v === 'string' && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(v),
  count: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0,
  boolean: (v) => typeof v === 'boolean',
  ratio: (v) => typeof v === 'number' && Number.isFinite(v),
  // React's component stack: the app's own component names and files.
  componentStack: (v) => typeof v === 'string' && v.length <= 400 && !/@/.test(v),
};

/** Every key the app's reports may carry, with its type. */
export const REPORT_KEYS: Record<string, Kind> = {
  scope: 'label', where: 'label', action: 'label', boundary: 'label', context: 'label', mode: 'label',
  section: 'label', shareType: 'label', step: 'label', mutationType: 'label', table: 'label',
  logId: 'contentId', stackId: 'contentId', filmId: 'contentId', loungeId: 'contentId', errorId: 'contentId',
  pgCode: 'code',
  pages: 'count', retryCount: 'count', invalidCount: 'count', totalRows: 'count',
  ratio: 'ratio',
  degraded: 'boolean', clearedPlaintext: 'boolean', isEditing: 'boolean',
  componentStack: 'componentStack',
};

/** The house's hosts and request paths a deadline may be tagged with (captureDeadline). */
const HOUSE_PATH = /^\/(rest\/v1|functions\/v1|auth\/v1|storage\/v1|realtime\/v1)(\/[\w.-]+){0,3}$/;

/** Tags: the app's own, and the SDK's (which name the device, the event and the route's boundary). */
const TAG_KEYS: Record<string, (v: unknown) => boolean> = {
  host: (v) => typeof v === 'string' && /^[\w.-]+(:\d+)?$/.test(v),
  path: (v) => typeof v === 'string' && HOUSE_PATH.test(v),
  boot_complete: (v) => v === 'true' || v === 'false' || typeof v === 'boolean',
  tier: (v) => typeof v === 'string' && LABEL.test(v),
  auth_refused: (v) => v === 'sign_in' || v === 'refresh' || v === 'code',
};
const SDK_TAG = /^(event\.|os(\.|$)|device(\.|$)|app(\.|$)|expo|expo_router\.|runtime|mechanism|level$|release$|dist$|environment$|handled$)/;

/** Contexts the SDK fills with the phone and the app, never the member; 'route' keeps its name alone. */
const SDK_CONTEXTS = new Set(['app', 'device', 'os', 'runtime', 'culture', 'trace', 'react_native_context', 'expo', 'flags']);

type Bag = Record<string, unknown>;

/** Keeps only listed keys whose values are their listed type. */
export function keepListed(bag: Bag | undefined, listed: Record<string, (v: unknown) => boolean>): Bag | undefined {
  if (!bag) return bag;
  const out: Bag = {};
  for (const [k, v] of Object.entries(bag)) if (listed[k]?.(v)) out[k] = v;
  return out;
}

const extraFits = Object.fromEntries(Object.entries(REPORT_KEYS).map(([k, kind]) => [k, fits[kind]]));

/** A request address cut to scheme, host and path: a query or a fragment may carry a member's words. */
export function cutUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)?([^?#]*)/i.exec(url);
  return m ? `${m[1] ?? ''}${m[2] ?? ''}` : url;
}

/** A description such as "GET https://…?q=words": its address cut the same way. */
const cutAddressesIn = (text: unknown): unknown =>
  typeof text === 'string' ? text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#]*|\/[\w./-]+)[?#]\S*/gi, '$1') : text;

/** A message without what a member may have written: a check failure's row, and any email. */
export function cutWords(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(Failing row contains)[\s\S]*/i, '$1 [cut]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
}

/** The address fields a breadcrumb, a request or a span may carry. */
const ADDRESS_KEYS = ['url', 'http.url', 'url.full', 'http.query', 'http.fragment', 'to', 'from'];

function cutData(data: Bag | undefined): Bag | undefined {
  if (!data) return data;
  const out: Bag = { ...data };
  for (const k of ADDRESS_KEYS) if (k in out) out[k] = k === 'http.query' || k === 'http.fragment' ? undefined : cutUrl(out[k]);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

type Crumb = { category?: string; message?: string; data?: Bag; type?: string; level?: string };

/** A breadcrumb with no typed text: addresses cut, a console line's words not kept. */
export function scrubBreadcrumb<C extends Crumb>(crumb: C): C {
  const out = { ...crumb, data: cutData(crumb.data) };
  if (out.category === 'console') {
    out.message = '[console]';
    delete out.data;
  } else if (typeof out.message === 'string') {
    out.message = cutWords(cutAddressesIn(out.message)) as string;
  }
  return out;
}

type SentEvent = {
  user?: unknown;
  extra?: Bag;
  tags?: Bag;
  contexts?: Bag;
  message?: unknown;
  request?: { url?: string; query_string?: unknown; data?: unknown; cookies?: unknown; headers?: unknown };
  breadcrumbs?: Crumb[];
  exception?: { values?: { type?: string; value?: string }[] };
  spans?: { description?: string; data?: Bag }[];
};

/** The event as it may leave the phone. */
export function scrubEvent<E extends SentEvent>(event: E): E {
  const out: E = { ...event };
  delete out.user;
  if (event.extra) out.extra = keepListed(event.extra, extraFits);
  if (event.tags) {
    out.tags = keepListed(event.tags, Object.fromEntries(
      Object.keys(event.tags).map((k) => [k, TAG_KEYS[k] ?? ((v: unknown) => SDK_TAG.test(k) && (typeof v !== 'string' || v.length < 120))]),
    ));
  }
  if (event.contexts) {
    const contexts: Bag = {};
    for (const [k, v] of Object.entries(event.contexts)) {
      if (SDK_CONTEXTS.has(k)) contexts[k] = v;
      else if (k === 'route' && v && typeof v === 'object') contexts.route = { name: (v as Bag).name };
    }
    out.contexts = contexts;
  }
  if (typeof event.message === 'string') out.message = cutWords(cutAddressesIn(event.message));
  if (event.request) out.request = { url: cutUrl(event.request.url) as string | undefined };
  if (event.breadcrumbs) out.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.exception?.values) {
    out.exception = { ...event.exception, values: event.exception.values.map((v) => ({ ...v, value: cutWords(cutAddressesIn(v.value)) as string | undefined })) };
  }
  if (event.spans) out.spans = event.spans.map((s) => ({ ...s, description: cutAddressesIn(s.description) as string | undefined, data: cutData(s.data) }));
  return out;
}
