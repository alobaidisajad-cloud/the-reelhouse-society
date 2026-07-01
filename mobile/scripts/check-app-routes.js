#!/usr/bin/env node
/**
 * app/-purity guard.
 *
 * Expo Router turns EVERY file under app/ into a navigable route (only `_layout`
 * and `+`-prefixed files are special). A module placed here that does not
 * default-export a React component becomes a reachable route whose default
 * export is `undefined` — rendering it throws:
 *   "Element type is invalid: expected a string ... but got: undefined."
 *
 * That is exactly the _loungeStyles crash (Sentry, build 31). This check fails
 * CI if any file under app/ is not a valid route, so the whole class of bug
 * can never ship again. Put styles/helpers/constants in src/ instead.
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Files that are legitimately not plain routes. */
function isSpecial(basename) {
  const name = basename.replace(/\.[^.]+$/, '');
  // Expo Router specials: layouts and `+`-prefixed system routes.
  if (name === '_layout') return true;
  if (name.startsWith('+')) return true; // +not-found, +html, +native-intent, ...
  return false;
}

/** Cheap static check: does the module expose a default export? */
function hasDefaultExport(src) {
  // export default ... | export { X as default } | module.exports =
  return (
    /export\s+default\b/.test(src) ||
    /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(src) ||
    /module\.exports\s*=/.test(src)
  );
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function main() {
  if (!fs.existsSync(APP_DIR)) {
    console.error(`[check-app-routes] app/ not found at ${APP_DIR}`);
    process.exit(1);
  }

  const files = [];
  walk(APP_DIR, files);

  const offenders = [];
  for (const file of files) {
    const base = path.basename(file);
    if (isSpecial(base)) continue;
    // Skip declaration/spec/test files — they are never routed.
    if (/\.d\.ts$/.test(base) || /\.(test|spec)\.[^.]+$/.test(base)) continue;

    const src = fs.readFileSync(file, 'utf8');
    if (!hasDefaultExport(src)) {
      offenders.push(path.relative(path.resolve(__dirname, '..'), file));
    }
  }

  if (offenders.length > 0) {
    console.error(
      '\n✖ app/-purity check failed. These files under app/ have no default-exported\n' +
        '  component, so Expo Router will register them as broken routes. Move them to src/:\n'
    );
    for (const o of offenders) console.error(`    • ${o}`);
    console.error('\n  (Only `_layout` and `+`-prefixed files may be non-component routes.)\n');
    process.exit(1);
  }

  console.log(`✓ app/-purity check passed (${files.length} files scanned).`);
}

main();
