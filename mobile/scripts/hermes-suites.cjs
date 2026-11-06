#!/usr/bin/env node
/**
 * hermes-suites.cjs — the pure src/utils suites, run by the phone's own runtime (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * jest runs on Node, and Node is not the phone: on build 41 withTimeout called an
 * API Hermes lacked and every Dispatch read threw, under green tests. So each
 * src/utils suite that needs nothing of Node is bundled as the phone's bundle is
 * (the app's Metro config, production, Hermes's transform profile), after React
 * Native's own globals and network polyfills (setUpGlobals, setUpXHR, read from
 * the pinned react-native package, never rewritten) and test-utils/hermesHarness.js,
 * then compiled by the app's hermesc and run by a Hermes built from the commit
 * React Native pins (god_tier_ci.yml builds it). A suite that touches a global
 * neither Hermes nor those polyfills give fails, by name.
 *
 *   node scripts/hermes-suites.cjs bundle <dir>
 *     bundles every suite that can run, into <dir>, with <dir>/plan.json saying
 *     which and why each other one cannot (Node's files or programs, a drawn
 *     screen, jest's module registry, development's own code);
 *   node scripts/hermes-suites.cjs run <dir> --hermes <bin> --hermesc <bin>
 *     compiles and runs each, one Hermes per suite; exits 1 on any failure, on a
 *     suite that said nothing, on a run without withTimeout's suite, and on a
 *     suite that reaches the phone's native modules unlisted in REACHES_NATIVE
 *     (or listed there and no longer reaching them);
 *   node scripts/hermes-suites.cjs bundle <dir> --bare, then run <dir> --bare …
 *     the run's own proof: withTimeout's suite without the network polyfills
 *     must fail for want of AbortController.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { builtinModules } = require('module');
const ts = require('typescript');
const { files } = require('../test-utils/universe');

const MOBILE = path.resolve(__dirname, '..');
const SUITES = path.join(MOBILE, 'src/utils/__tests__');
const HARNESS = path.join(MOBILE, 'test-utils/hermesHarness.js');
const CORE = path.join(MOBILE, 'node_modules/react-native/Libraries/Core');
const GLOBALS_SETUP = path.join(CORE, 'setUpGlobals.js');
const NETWORK_SETUP = path.join(CORE, 'setUpXHR.js');
/** A run without these is no proof: withTimeout's suite is the one build 41 needed. */
const MUST_RUN = ['withTimeout'];
/**
 * The suites whose code asks the phone's native modules for something (through
 * React Native's bridge, which a bare Hermes has not): jest stands a mock in for
 * each module; here they cannot run. The run fails on a suite that reaches them
 * unlisted, and on a listed one that no longer does.
 */
const REACHES_NATIVE = [
  'aLinkIsReadByItsKinds', 'anAddressIsToldFromAHandle', 'calendarDates', 'inputTrustBoundary', 'markdownSafety',
  'mutationExecutor.pbt', 'offlineQueue', 'prefetchPictures', 'queueErrorClassification', 'requestReview',
  'roomFilters', 'theDeadLetterIsNobodyElsesToKeep', 'tier', 'whatThisPhoneHoldsIsSaid', 'withRetry',
];
const NATIVE_REFUSAL = '__fbBatchedBridgeConfig is not set';

const NODE = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const REGISTRY = /\bjest\.(doMock|dontMock|unmock|isolateModules|isolateModulesAsync|resetModules|createMockFromModule|enableAutomock|disableAutomock)\b/;
const NODE_TEXT = /\b(read(?:File|dir)Sync|existsSync|execSync|spawnSync|__dirname|__filename)\b|\bprocess\.(cwd|argv|exit|platform|version|versions|hrtime|memoryUsage|on|stdout|stderr)\b|\brequire\.resolve\b/;
const DRAWS = /@testing-library|react-native-testing-library/;

const fail = (message) => { console.error(message); process.exit(1); };
const rel = (file) => path.relative(MOBILE, file).split(path.sep).join('/');
const nameOf = (file) => path.basename(file).replace(/\.test\.tsx?$/, '');

/** The names a file declares at its top: its imports, variables, functions and classes. */
function topNames(source) {
  const names = new Set();
  const bind = (name) => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const element of name.elements ?? []) if (!ts.isOmittedExpression(element)) bind(element.name);
  };
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const { name, namedBindings } = statement.importClause;
      if (name) names.add(name.text);
      if (namedBindings && ts.isNamespaceImport(namedBindings)) names.add(namedBindings.name.text);
      if (namedBindings && ts.isNamedImports(namedBindings)) for (const e of namedBindings.elements) names.add(e.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) bind(d.name);
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/** The first name a factory reads from the suite's own top, which a factory moved out of the suite has not. */
function readsTheSuite(factory, names) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    const named = ts.isIdentifier(node) && names.has(node.text)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node);
    if (named) found = node.text;
    ts.forEachChild(node, visit);
  };
  visit(factory);
  return found;
}

/**
 * The modules the suite mocks (each top-level jest.mock with its factory's text)
 * and the ones it asks for whole (jest.requireActual), or why they cannot be made.
 * A factory is written into a file of its own, loaded before the suite (Metro's
 * import pass puts a suite's requires above its own statements, so a jest.mock
 * left in the suite would come after its imports): one that reads the suite's
 * own names cannot be moved.
 */
function mocksOf(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = topNames(source);
  const mocks = [];
  const actuals = new Set();
  let refused = null;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'jest') {
      const [spec, factory] = node.arguments;
      const call = node.expression.name.text;
      if (call === 'mock') {
        const topLevel = ts.isExpressionStatement(node.parent) && node.parent.parent === source;
        if (!topLevel) refused = refused ?? 'calls jest.mock inside a test (jest\'s module registry)';
        else if (!spec || !ts.isStringLiteral(spec)) refused = refused ?? 'names a jest.mock module by an expression';
        else if (!factory) refused = refused ?? `jest.mock('${spec.text}') without a factory (jest's automock)`;
        else if (node.arguments.length > 2) refused = refused ?? `jest.mock('${spec.text}') with options (a virtual module)`;
        else {
          const read = readsTheSuite(factory, names);
          if (read) refused = refused ?? `jest.mock('${spec.text}')'s factory reads the suite's own ${read}`;
          else mocks.push([spec.text, factory.getText(source)]);
        }
      } else if (call === 'requireActual' || call === 'requireMock') {
        if (!spec || !ts.isStringLiteral(spec)) refused = refused ?? `names a jest.${call} module by an expression`;
        else if (call === 'requireActual') actuals.add(spec.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return refused ? { refused } : { mocks, actuals: [...actuals] };
}

/** Why a suite cannot run on the phone's runtime, read from its own text; null when it can be tried. */
function staticReason(file, text) {
  if (file.endsWith('.tsx') || DRAWS.test(text)) return 'draws a screen';
  const imports = [...text.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const node = imports.find((m) => NODE.has(m));
  if (node) return `uses Node's '${node}'`;
  const nodeText = text.match(NODE_TEXT);
  if (nodeText) return `uses Node's ${nodeText[0]}`;
  const registry = text.match(REGISTRY);
  if (registry) return `uses jest's module registry (${registry[0]})`;
  // The phone's release bundle is built with __DEV__ false, written in as a constant.
  if (/\b__DEV__\b/.test(text)) return 'sets or reads __DEV__, which the release bundle writes in as false';
  return mocksOf(file, text).refused ?? null;
}

async function bundle(out, only = [], bare = false) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const stub = (file, text) => { fs.writeFileSync(path.join(out, file), text); return path.join(out, file); };
  // What jest's own packages read at load: a terminal, a disk, a dynamic import, and
  // util.format for a table's test names; none of it is the app's.
  const STUBS = {
    tty: stub('tty.js', 'module.exports = { isatty: () => false };\n'),
    os: stub('os.js', "module.exports = { release: () => '', platform: () => 'hermes', EOL: '\\n' };\n"),
    util: stub('util.js', [
      "const shown = (v) => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } })());",
      'exports.format = (form, ...args) => {',
      "  let text = String(form).replace(/%([sdifjoO%])/g, (m, k) => (k === '%' ? '%' : !args.length ? m : k === 'd' || k === 'i' ? String(parseInt(args.shift(), 10)) : k === 'f' ? String(parseFloat(args.shift())) : k === 's' ? String(args.shift()) : shown(args.shift())));",
      "  for (const a of args) text += ` ${shown(a)}`;",
      '  return text;',
      '};',
      'exports.inspect = shown;',
      '',
    ].join('\n')),
  };
  const FAST_CHECK = require.resolve('fast-check', { paths: [MOBILE] });
  // jest's globals, for a suite that imports them from @jest/globals: the harness's.
  const GLOBALS = stub('jest-globals.js', [
    "for (const name of ['jest', 'expect', 'describe', 'it', 'test', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {",
    '  Object.defineProperty(exports, name, { enumerable: true, get: () => globalThis[name] });',
    '}',
    '',
  ].join('\n'));
  const JEST_UTIL_STUBS = {
    './isInteractive': stub('isInteractive.js', 'exports.default = false;\n'),
    './requireOrImportModule': stub('requireOrImportModule.js', "exports.default = () => { throw new Error('no dynamic import on Hermes'); };\n"),
  };

  // Every file Metro reads is written before it starts: it sees only what exists then.
  const plan = { bare, run: [], cannot: [] };
  const suites = new Map();
  const named = (f) => !only.length || only.includes(nameOf(f));
  const inFolder = files('appTests', { under: ['src/utils/__tests__'] }).filter((f) => path.resolve(path.dirname(f)) === path.resolve(SUITES));
  for (const file of inFolder.filter((f) => /\.test\.tsx?$/.test(f) && named(path.basename(f))).sort()) {
    const name = nameOf(file);
    const text = fs.readFileSync(file, 'utf8');
    const reason = staticReason(file, text);
    if (reason) { plan.cannot.push({ suite: rel(file), why: reason }); continue; }
    const { mocks, actuals } = mocksOf(file, text);
    // A module the suite names relatively is named from its own folder.
    const fromSuite = (spec) => (spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : spec);
    const proxies = mocks.map(([spec], i) => stub(`${name}.mock.${i}.js`, `module.exports = globalThis.__hermesMocked(${JSON.stringify(spec)});\n`));
    const lifted = stub(`${name}.mocks.ts`, [
      ...actuals.map((spec) => `globalThis.__hermesActualOf(${JSON.stringify(spec)}, () => require(${JSON.stringify(fromSuite(spec))}));`),
      ...mocks.map(([spec, factory]) => `jest.mock(${JSON.stringify(spec)}, ${factory});`),
      '',
    ].join('\n'));
    const entry = stub(`${name}.entry.js`, [
      // Bare, the network polyfills are left out: the run must then fail where they were needed.
      ...(bare ? [GLOBALS_SETUP] : [GLOBALS_SETUP, NETWORK_SETUP]).map((p) => `require(${JSON.stringify(p)});`),
      `require(${JSON.stringify(HARNESS)});`,
      `require(${JSON.stringify(lifted)});`,
      'let loadError = null;',
      `try { require(${JSON.stringify(file)}); } catch (error) { loadError = error; }`,
      `globalThis.__runSuite(${JSON.stringify(name)}, loadError);`,
      '',
    ].join('\n'));
    suites.set(name, { file, entry, mocks, proxies, mocked: null, reachedNode: null });
  }

  const Metro = require(path.join(MOBILE, 'node_modules/metro'));
  const { DEFAULT_BUNDLE_OPTIONS } = require(path.join(MOBILE, 'node_modules/metro/src/Server')).default;
  const config = await Metro.loadConfig({ cwd: MOBILE, config: path.join(MOBILE, 'metro.config.js') });
  // tsconfig's "@/*": ["./*"], which Expo's CLI resolves around Metro, so it is resolved here.
  const metroResolve = config.resolver.resolveRequest;
  const upstream = (context, name, platform) => metroResolve(context, name.startsWith('@/') ? path.join(MOBILE, name.slice(2)) : name, platform);
  const resolveRequest = (context, name, platform) => {
    const from = context.originModulePath;
    const suite = suites.get(context.customResolverOptions?.hermesSuite);
    // Metro's own empty module is asked for outside any suite.
    if (!suite) return upstream(context, name, platform);
    const inPackages = from.includes(`${path.sep}node_modules${path.sep}`);
    if (STUBS[name] && inPackages) return { type: 'sourceFile', filePath: STUBS[name] };
    if (name === 'graceful-fs' && inPackages) return { type: 'empty' };
    if (name === '@jest/globals') return { type: 'sourceFile', filePath: GLOBALS };
    // One fast-check, as under jest (its CommonJS build), so the harness counts every property's assert.
    if (name === 'fast-check') return { type: 'sourceFile', filePath: FAST_CHECK };
    if (JEST_UTIL_STUBS[name] && from.includes(`${path.sep}jest-util${path.sep}`)) return { type: 'sourceFile', filePath: JEST_UTIL_STUBS[name] };
    if (NODE.has(name)) {
      if (!inPackages) suite.reachedNode = suite.reachedNode ?? `reaches Node's '${name}' through ${rel(from)}`;
      return { type: 'empty' };
    }
    // Each mocked module, as the suite names it, is one file: every import of that file gets
    // the mock, but for jest.requireActual's, which asks from the bundle's own folder.
    suite.mocked = suite.mocked ?? new Map(suite.mocks.map(([spec], i) => [upstream({ ...context, originModulePath: suite.file }, spec, platform).filePath, suite.proxies[i]]));
    const ours = from.startsWith(out);
    // What the bundle's own files name, they name as the suite would: a package from its folder.
    const found = upstream(ours ? { ...context, originModulePath: suite.file } : context, name, platform);
    const proxy = found.type === 'sourceFile' && !ours ? suite.mocked.get(found.filePath) : undefined;
    return proxy ? { type: 'sourceFile', filePath: proxy } : found;
  };
  const built = {
    ...config,
    watchFolders: [...config.watchFolders, out],
    resolver: {
      ...config.resolver,
      resolveRequest,
      // The phone's bundle leaves the suites out; these bundles are the suites.
      blockList: [].concat(config.resolver.blockList).map((re) => new RegExp(re.source.replace(/\|[^|()]*__tests__[^|()]*/, ''), re.flags)),
    },
    // InitializeCore asks the phone's native modules; the polyfills are loaded by name instead.
    serializer: { ...config.serializer, getModulesRunBeforeMainModule: () => [] },
  };
  const server = await Metro.runMetro(built, { watch: false });
  try {
    for (const [name, suite] of suites) {
      const { code } = await server.build({
        ...DEFAULT_BUNDLE_OPTIONS,
        entryFile: suite.entry,
        platform: 'android',
        dev: false,
        minify: false,
        // The phone's release bundle: Expo's export for Hermes asks Metro so.
        customTransformOptions: { engine: 'hermes' },
        unstable_transformProfile: 'hermes-stable',
        // Metro keeps each resolution by these: one suite's mocks never reach another's bundle.
        customResolverOptions: { hermesSuite: name },
        createModuleIdFactory: config.serializer.createModuleIdFactory,
      });
      // Server.build keeps every graph it made; a suite's is done with once its bundle is.
      server.getBundler().getDeltaBundler().end();
      if (suite.reachedNode) { plan.cannot.push({ suite: rel(suite.file), why: suite.reachedNode }); continue; }
      fs.writeFileSync(path.join(out, `${name}.js`), code);
      plan.run.push(name);
      console.log(`bundled ${name}`);
    }
  } finally {
    await server.end();
  }
  plan.cannot.sort((a, b) => (a.suite < b.suite ? -1 : 1));
  fs.writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`${plan.run.length} suites bundled; ${plan.cannot.length} cannot run on Hermes:`);
  for (const c of plan.cannot) console.log(`  ${c.suite}: ${c.why}`);
}

/** One suite's bundle, compiled as the phone's release bundle is (hermesc -O, to bytecode) and run by Hermes. */
function runOne(out, name, hermes, hermesc) {
  const js = path.join(out, `${name}.js`);
  const hbc = path.join(out, `${name}.hbc`);
  const compiled = spawnSync(hermesc, ['-O', '-emit-binary', '-out', hbc, js], { encoding: 'utf8' });
  if (compiled.status !== 0) return { fault: `hermesc failed: ${`${compiled.stderr}`.trim().split('\n').slice(0, 5).join(' | ')}` };
  const ran = spawnSync(hermes, [hbc], { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  const lines = `${ran.stdout ?? ''}`.split('\n');
  const said = lines.find((l) => l.startsWith(`SUITE ${name} `))?.match(/passed=(\d+) failed=(\d+) skipped=(\d+)/);
  const exited = ran.error || ran.status !== 0
    ? `Hermes ${ran.error ? ran.error.message : `exited ${ran.status}`}: ${`${ran.stderr ?? ''}`.trim().split('\n').slice(0, 5).join(' | ')}`
    : null;
  return {
    failed: lines.filter((l) => l.startsWith('FAIL ')),
    counts: said ? { passed: Number(said[1]), failed: Number(said[2]), skipped: Number(said[3]) } : null,
    exited,
  };
}

/**
 * The run's own proof: each MUST_RUN suite, bundled without React Native's network
 * polyfills, must fail on Hermes for want of AbortController. So the runtime is
 * truly the phone's bare engine (Node has AbortController), and the polyfills are
 * what make the full run pass.
 */
function runBare(out, hermes, hermesc) {
  if (!hermes || !hermesc) fail('run needs --hermes <bin> and --hermesc <bin>');
  const plan = JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'));
  if (!plan.bare) fail(`${out} was not bundled --bare`);
  const faults = [];
  for (const name of MUST_RUN) {
    if (!plan.run.includes(name)) { faults.push(`${name}: not bundled`); continue; }
    const result = runOne(out, name, hermes, hermesc);
    if (result.fault) { faults.push(`${name}: ${result.fault}`); continue; }
    const lacked = result.failed.filter((l) => /\bAbortController\b/.test(l));
    if (!result.counts) faults.push(`${name}: said no SUITE line${result.exited ? ` (${result.exited})` : ''}`);
    else if (!lacked.length) faults.push(`${name}: passed without the network polyfills, so the runtime is not the bare engine (or the suite no longer reaches AbortController)`);
    else console.log(`ok ${name}: without React Native's network polyfills it fails as it should:\n  ${lacked[0]}`);
  }
  if (faults.length) fail(`\nTHE BARE RUN:\n${faults.map((f) => `  ${f}`).join('\n')}`);
}

function run(out, hermes, hermesc) {
  if (!hermes || !hermesc) fail('run needs --hermes <bin> and --hermesc <bin>');
  const plan = JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'));
  if (plan.bare) fail(`${out} was bundled --bare: run it with --bare`);
  const missing = MUST_RUN.filter((m) => !plan.run.includes(m) || REACHES_NATIVE.includes(m));
  if (missing.length) fail(`not run, so not proven on Hermes: ${missing.join(', ')}`);
  const stale = REACHES_NATIVE.filter((m) => !plan.run.includes(m));
  if (stale.length) fail(`in REACHES_NATIVE but not bundled (renamed, or now refused by its own text): ${stale.join(', ')}`);
  const faults = [];
  let tests = 0;
  let suitesRun = 0;
  for (const name of plan.run) {
    const result = runOne(out, name, hermes, hermesc);
    if (result.fault) { faults.push(`${name}: ${result.fault}`); continue; }
    const native = result.failed.some((l) => l.includes(NATIVE_REFUSAL));
    const listed = REACHES_NATIVE.includes(name);
    if (native || listed) {
      if (native && !listed) faults.push(`${name}: reaches the phone's native modules; list it in REACHES_NATIVE, or keep the suite off them`);
      if (!native && listed) faults.push(`${name}: listed in REACHES_NATIVE, yet reached none: take it off the list`);
      continue;
    }
    suitesRun += 1;
    for (const line of result.failed) console.log(line);
    const { counts } = result;
    if (result.exited) faults.push(`${name}: ${result.exited}`);
    else if (!counts) faults.push(`${name}: said no SUITE line (a promise never settled, or the runner died)`);
    else if (counts.failed > 0) faults.push(`${name}: ${counts.failed} failed`);
    else if (counts.passed === 0) faults.push(`${name}: no test passed`);
    else console.log(`ok ${name}: ${counts.passed} passed${counts.skipped ? `, ${counts.skipped} skipped` : ''}`);
    tests += counts ? counts.passed : 0;
  }
  console.log(`${suitesRun} suites, ${tests} tests passed on Hermes; ${REACHES_NATIVE.length} reach the phone's native modules; ${plan.cannot.length} cannot run there (plan.json says why)`);
  if (faults.length) fail(`\nON HERMES:\n${faults.map((f) => `  ${f}`).join('\n')}`);
}

if (require.main === module) {
  const [command, out, ...rest] = process.argv.slice(2);
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (!out) fail('usage: hermes-suites.cjs bundle <dir> | run <dir> --hermes <bin> --hermesc <bin>');
  const bare = rest.includes('--bare');
  const names = rest.filter((r) => !r.startsWith('--'));
  if (command === 'bundle') bundle(path.resolve(out), bare ? MUST_RUN : names, bare).catch((error) => fail(error.stack ?? String(error)));
  else if (command === 'run' && bare) runBare(path.resolve(out), flag('--hermes'), flag('--hermesc'));
  else if (command === 'run') run(path.resolve(out), flag('--hermes'), flag('--hermesc'));
  else fail(`unknown command ${command}`);
}

module.exports = { staticReason, mocksOf, MUST_RUN, REACHES_NATIVE };
