#!/usr/bin/env node
/**
 * stand-ins.mjs — the outside world the edge functions call, in the sealed world.
 *
 * The functions read each outside address from their settings, production's own
 * by default (EXPO_PUSH_URL, REVENUECAT_API_URL, TMDB_ORIGIN, FEED_ORIGIN); the
 * functions world names this server for all four (place.mjs). It answers as
 * each service answers, keeps every request it was sent, and answers anything
 * it does not stand in for with 404, so a function that calls somewhere new is
 * seen.
 *
 *   POST /--/api/v2/push/send          Expo: a ticket per message; a token
 *                                      holding "Dead" is DeviceNotRegistered
 *   GET  /v1/subscribers/<id>          RevenueCat: the record scripted for <id>,
 *                                      or 404 (a member the store never saw)
 *   GET  /3/...                        TMDB: the answer scripted for the path,
 *                                      a film made up from its id, or 404
 *   GET  .../rss                       a feed: two items of RSS 2.0 (the Guardian's own
 *                                      paths end so; FEED_ORIGIN keeps the path)
 *
 * The suites steer it, never the functions:
 *   POST /__script  { revenuecat: {<id>: {status, body}}, tmdb: {<path>: {status,
 *                     body, text, delayMs}}, tmdbKeyRefused: true, expo: {status} }
 *   GET  /__seen    every request since the last reset: { method, path, query,
 *                   headers, body }
 *   POST /__reset   forgets the script and the requests
 *
 *   node mobile/e2e/functions/stand-ins.mjs [port]      (54990 by default)
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.STAND_INS_PORT ?? 54990);

let script = {};
let seen = [];

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
});

/** A film TMDB would send for an id: enough for sync-films to shape every column. */
const film = (id) => ({
  id,
  title: `Stand-in film ${id}`,
  release_date: '1999-03-31',
  runtime: 136,
  popularity: 42.5,
  poster_path: `/poster-${id}.jpg`,
  genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
  production_countries: [{ iso_3166_1: 'US' }],
  credits: {
    cast: [
      { id: 6384, name: 'First Billed', profile_path: '/first.jpg', order: 0 },
      { id: 2975, name: 'Second Billed', profile_path: null, order: 1 },
    ],
    crew: [{ id: 9339, name: 'The Director', profile_path: '/director.jpg', job: 'Director' }],
  },
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Film | The stand-in</title>
<item><title>A &amp; B: the first notice</title><link>https://www.theguardian.com/film/first</link>
<pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate><dc:creator>A Critic</dc:creator>
<description><![CDATA[<p>The first notice.</p>]]></description><category>Film</category>
<media:content width="140" url="https://i.guim.co.uk/small.jpg"/><media:content width="460" url="https://i.guim.co.uk/large.jpg"/></item>
<item><title>The second notice</title><link>https://www.theguardian.com/film/second</link>
<pubDate>Thu, 15 Oct 2026 09:00:00 GMT</pubDate><description>Plain words.</description></item>
</channel></rss>`;

async function answer(req, res) {
  const url = new URL(req.url, 'http://stand-ins');
  const body = await readBody(req);
  const path = url.pathname;

  if (path === '/__reset' && req.method === 'POST') { script = {}; seen = []; return send(res, 200, { reset: true }); }
  if (path === '/__script' && req.method === 'POST') { script = { ...script, ...JSON.parse(body || '{}') }; return send(res, 200, script); }
  if (path === '/__seen' && req.method === 'GET') return send(res, 200, seen);
  if (path === '/__alive') return send(res, 200, { alive: true });

  seen.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), headers: req.headers, body });

  // ── Expo ──
  if (path === '/--/api/v2/push/send' && req.method === 'POST') {
    if (script.expo?.status) return send(res, script.expo.status, { errors: [{ code: 'STAND_IN', message: 'scripted failure' }] });
    const messages = JSON.parse(body || '[]');
    return send(res, 200, {
      data: messages.map((m) => (String(m.to).includes('Dead')
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${m.to}` })),
    });
  }

  // ── RevenueCat ──
  const subscriber = /^\/v1\/subscribers\/([^/]+)$/.exec(path);
  if (subscriber && req.method === 'GET') {
    const scripted = script.revenuecat?.[decodeURIComponent(subscriber[1])];
    if (!scripted) return send(res, 404, { code: 7259, message: 'Subscriber not found.' });
    return send(res, scripted.status ?? 200, scripted.body ?? {});
  }

  // ── TMDB ──
  if (path.startsWith('/3/') && req.method === 'GET') {
    if (script.tmdbKeyRefused) return send(res, 401, { status_code: 7, status_message: 'Invalid API key: You must be granted a valid key.', success: false });
    const scripted = script.tmdb?.[path];
    if (scripted) {
      if (scripted.delayMs) await new Promise((r) => setTimeout(r, scripted.delayMs));
      if (scripted.text !== undefined) return send(res, scripted.status ?? 200, scripted.text, 'text/html');
      return send(res, scripted.status ?? 200, scripted.body ?? {});
    }
    const movie = /^\/3\/movie\/(\d+)$/.exec(path);
    if (movie) return send(res, 200, film(Number(movie[1])));
    if (/^\/3\/trending\/movie\/(day|week)$/.test(path)) return send(res, 200, { page: 1, results: [film(603)], total_pages: 1, total_results: 1 });
    return send(res, 404, { status_code: 34, status_message: 'The resource you requested could not be found.', success: false });
  }

  // ── a feed ──
  if (path.endsWith('/rss') && req.method === 'GET') return send(res, 200, FEED, 'application/rss+xml');

  return send(res, 404, { error: `no stand-in for ${req.method} ${path}` });
}

createServer((req, res) => {
  answer(req, res).catch((e) => send(res, 500, { error: String(e) }));
}).listen(PORT, '0.0.0.0', () => console.log(`stand-ins listening on ${PORT}`));
