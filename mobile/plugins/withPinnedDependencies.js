/**
 * No Android build reads a version list from a package host: every dependency asked for by a range is
 * pinned to one version, and a range nobody pinned fails the build by name.
 *
 * A range ("[1.81,1.82)") makes Gradle ask the host for every version it has, each time its cached
 * answer is a day old: expo-updates asks for bcutil-jdk15to18 1.81, whose own file asks for
 * bcprov-jdk15to18 [1.81,1.82), and one blip in Maven Central's version list failed a whole E2E build
 * that had nothing to do with it (Sealed E2E 44541753500). So each project's every configuration
 * takes PINNED's version for a module it names before resolving, and Gradle's failOnDynamicVersions
 * refuses any other range or "+" in the graph, so a new one is pinned here before it can fail a run.
 * Each pin is the version the range resolves to today.
 *
 * Proven by plugins/__tests__/withPinnedDependencies.test.ts on the root build.gradle exactly as
 * prebuild generates it, and by a release build with every range refused.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

/** group:name → the one version a range asks for resolves to. */
const PINNED = {
  'org.bouncycastle:bcprov-jdk15to18': '1.81',
};

const MARK = 'reelhouse: no build reads a version list; every range pinned (plugins/withPinnedDependencies.js)';

const block = () => [
  `// ${MARK}`,
  'allprojects {',
  '  configurations.configureEach {',
  '    resolutionStrategy {',
  '      eachDependency { details ->',
  `        def pinned = [${Object.entries(PINNED).map(([m, v]) => `'${m}': '${v}'`).join(', ')}]`,
  '        def version = pinned["${details.requested.group}:${details.requested.name}"]',
  '        if (version != null) {',
  '          details.useVersion(version)',
  "          details.because('pinned: a range makes Gradle read the version list of the host')",
  '        }',
  '      }',
  '      failOnDynamicVersions()',
  '    }',
  '  }',
  '}',
];

/** The root build.gradle with the block at its end; unchanged if done. */
function addPins(src, language) {
  if (language !== 'groovy') {
    throw new Error(`withPinnedDependencies: the root build file is ${language}, not groovy. Read the generated file and update this plugin.`);
  }
  if (src.includes(MARK)) return src;
  if (!/^allprojects \{/m.test(src)) {
    throw new Error('withPinnedDependencies: the root build.gradle has no allprojects block where every project is set. Read the generated file and update this plugin.');
  }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = src.endsWith(eol) ? src : src + eol;
  return `${body}${eol}${block().join(eol)}${eol}`;
}

function withPinnedDependencies(config) {
  return withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = addPins(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
}

module.exports = withPinnedDependencies;
module.exports.addPins = addPins;
module.exports.block = block;
module.exports.MARK = MARK;
module.exports.PINNED = PINNED;
