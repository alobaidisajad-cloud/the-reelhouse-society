import android.content.res.Configuration;
import android.os.LocaleList;
import java.lang.reflect.Method;

/**
 * The phone's language, read or changed as the Settings app changes it: the system takes the new
 * one while it runs, with nothing restarted, and keeps it (persist.sys.locale). Run by the shell,
 * which may change the system's configuration:
 *
 *   CLASSPATH=/data/local/tmp/house-phone.dex app_process / HouseLocale          prints the languages, as tags
 *   CLASSPATH=/data/local/tmp/house-phone.dex app_process / HouseLocale ar-IQ    makes them ar-IQ
 *
 * The right-to-left variant (e2e/variants.json) sets its language with it; the emulator built for
 * each run compiles it (e2e.yml) and run-flows.sh puts it on the phone.
 */
public final class HouseLocale {
  public static void main(String[] args) throws Exception {
    Object am = Class.forName("android.app.ActivityManager").getMethod("getService").invoke(null);
    Configuration config = (Configuration) am.getClass().getMethod("getConfiguration").invoke(am);
    if (args.length == 0) {
      System.out.println(config.getLocales().toLanguageTags());
      return;
    }
    // Only languages, as tags: Android reads "en-US; reboot" as "en", and would set that.
    if (!args[0].matches("[a-z]{2,3}(-[A-Za-z0-9]{2,8})*(,[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)*")) {
      throw new IllegalArgumentException("not a language: " + args[0]);
    }
    LocaleList asked = LocaleList.forLanguageTags(args[0]);
    config.setLocales(asked);
    // Android 12 and later name who asked; the older call is the same change without the name.
    Method update = null;
    for (Method m : am.getClass().getMethods()) {
      if (m.getName().equals("updatePersistentConfigurationWithAttribution")) update = m;
    }
    if (update != null) update.invoke(am, config, "com.android.shell", null);
    else am.getClass().getMethod("updatePersistentConfiguration", Configuration.class).invoke(am, config);
    System.out.println(asked.toLanguageTags());
  }
}
