/**
 * A link that reaches the app while it is still starting is the link it opens.
 *
 * Android hands a running activity a new link as a new intent. React Native passes it to the app
 * only once React is up; before that it drops it ("Tried to access onNewIntent while context is
 * not ready", ReactHostImpl.onNewIntent), and the activity's own intent stays the one that
 * launched it, which `Linking.getInitialURL` reads. So a link tapped in the moment the app starts
 * was lost: the Sealed E2E relaunched the app and opened the Tribunal 118 ms later, before
 * JavaScript ran, and the app stayed on the Lobby, then reopened the member's last tab (run
 * 39642840944). Here MainActivity takes each new intent as its own (setIntent, as Android's
 * documentation says a new intent is kept), so the app's first read of its link is the latest.
 * A link that comes once React is up is still passed on as before.
 *
 * Proven by plugins/__tests__/withLinkDuringLaunch.test.ts on the real generated MainActivity,
 * and on the emulator by .maestro/admin_second_key.yaml's relaunch.
 */
const { withMainActivity } = require('expo/config-plugins');

const MARK = 'reelhouse: a link that comes as the app starts is the link it opens (plugins/withLinkDuringLaunch.js)';
// The class's opening line, whatever ends it (a prebuild on Windows writes CRLF).
const CLASS_KT = /^class MainActivity : ReactActivity\(\) \{[ \t]*(?=\r?$)/gm;
const CLASS_JAVA = /^public class MainActivity extends ReactActivity \{[ \t]*(?=\r?$)/gm;

/** MainActivity's source with onNewIntent keeping each new intent; unchanged if done. */
function addLinkDuringLaunch(src, language) {
  if (src.includes(MARK)) return src;
  if (/\bonNewIntent\s*\(/.test(src)) {
    throw new Error('withLinkDuringLaunch: MainActivity already has an onNewIntent. Read the generated MainActivity and update this plugin.');
  }
  const java = language === 'java';
  const found = [...src.matchAll(java ? CLASS_JAVA : CLASS_KT)];
  if (found.length !== 1) {
    throw new Error(
      `withLinkDuringLaunch: MainActivity has ${found.length} class lines it can read, not one, ` +
      'so onNewIntent cannot be added. Read the generated MainActivity and update this plugin.'
    );
  }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = java
    ? ['  @Override', '  public void onNewIntent(android.content.Intent intent) {', '    setIntent(intent);', '    super.onNewIntent(intent);', '  }']
    : ['  override fun onNewIntent(intent: android.content.Intent) {', '    setIntent(intent)', '    super.onNewIntent(intent)', '  }'];
  const at = found[0].index + found[0][0].length;
  return `${src.slice(0, at)}${eol}  // ${MARK}${eol}${body.join(eol)}${eol}${src.slice(at)}`;
}

function withLinkDuringLaunch(config) {
  return withMainActivity(config, (mod) => {
    mod.modResults.contents = addLinkDuringLaunch(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
}

module.exports = withLinkDuringLaunch;
module.exports.addLinkDuringLaunch = addLinkDuringLaunch;
module.exports.MARK = MARK;
