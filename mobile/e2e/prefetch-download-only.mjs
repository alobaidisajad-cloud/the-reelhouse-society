#!/usr/bin/env node
/**
 * prefetch-download-only.mjs — the built app's picture prefetch, asked for
 * 'disk', only downloads.
 *
 *   node e2e/prefetch-download-only.mjs <dexdump -d of expo-image's module classes>
 *
 * expo-image's Android prefetch loads each picture through Glide and decodes it
 * whole, under a key no view uses. The app's patch (patches/, applied by
 * postinstall) sends a 'disk' prefetch through Glide's downloadOnly() instead:
 * the file is written to the disk cache with nothing decoded. The patch is to
 * expo-image's Kotlin, which counts only because package.json has expo-image
 * built from source. This reads the answer from the app itself: a method of
 * ExpoImageModule (or a class inside it) that, on CachePolicy.DISK, makes a
 * GlideUrl and hands it to RequestManager.downloadOnly() and submit().
 *
 * A shipped client (E2E_OLD_CLIENT) has no patch: for it the check is not run,
 * and says so.
 *
 * Prints its report; exits 1 unless such a method is found.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE = 'expo.modules.image.ExpoImageModule';
/** What the patched prefetch's method does, each as dexdump spells the instruction. */
export const NEEDS = {
  'reads CachePolicy.DISK': /^sget-object v\d+, Lexpo\/modules\/image\/records\/CachePolicy;\.DISK:/,
  'makes a GlideUrl': /^new-instance v\d+, Lcom\/bumptech\/glide\/load\/model\/GlideUrl;/,
  'calls RequestManager.downloadOnly()': /^invoke-virtual(?:\/range)? \{[^}]*\}, Lcom\/bumptech\/glide\/RequestManager;\.downloadOnly:\(\)/,
  'calls submit()': /^invoke-virtual(?:\/range)? \{[^}]*\}, Lcom\/bumptech\/glide\/RequestBuilder;\.submit:\(\)/,
};

/**
 * Every compiled method of ExpoImageModule and the classes inside it, in
 * dexdump -d text, with which of NEEDS each meets.
 */
export function readPrefetchMethods(text) {
  const methods = [];
  let body = null;
  for (const line of text.split(/\r?\n/)) {
    const head = /\|\[[0-9a-f]+\] (\S+?):/.exec(line);
    if (head) {
      const inModule = head[1].startsWith(`${MODULE}.`) || head[1].startsWith(`${MODULE}$`);
      body = inModule ? { name: head[1], insns: [] } : null;
      if (body) methods.push(body);
      continue;
    }
    const insn = body && /\|[0-9a-f]{4}: (.*)$/.exec(line);
    if (insn) body.insns.push(insn[1]);
  }
  return methods.map(({ name, insns }) => ({
    name,
    meets: Object.keys(NEEDS).filter((k) => insns.some((i) => NEEDS[k].test(i))),
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const client = process.env.E2E_OLD_CLIENT;
  if (client) {
    console.log(`Not run: old client. ${client} ships expo-image without the app's patch, so its prefetch decodes each picture; there is nothing of this app's to check.`);
    process.exit(0);
  }
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node e2e/prefetch-download-only.mjs <dexdump -d output>');
    process.exit(2);
  }
  const methods = readPrefetchMethods(existsSync(file) ? readFileSync(file, 'utf8') : '');
  const all = Object.keys(NEEDS);
  const whole = methods.filter((m) => m.meets.length === all.length);
  if (whole.length > 0) {
    console.log(`The prefetch downloads without decoding: ${whole.map((m) => m.name).join(', ')} ${all.join(', ')}.`);
    process.exit(0);
  }
  const closest = methods.filter((m) => m.meets.length > 0).sort((a, b) => b.meets.length - a.meets.length)[0];
  console.log([
    methods.length === 0
      ? `No method of ${MODULE} is in the APK, so nothing shows what its prefetch does.`
      : `No method of ${MODULE} (${methods.length} read) ${all.join(', ')}.`
        + (closest ? ` Closest: ${closest.name}, which ${closest.meets.join(', ')}.` : ''),
    "Without it, a 'disk' prefetch decodes each picture whole, under a key no view uses.",
    'The patch under patches/ must be applied (postinstall) and expo-image built from source (package.json: expo.autolinking.android.buildFromSource).',
  ].join('\n'));
  process.exit(1);
}
