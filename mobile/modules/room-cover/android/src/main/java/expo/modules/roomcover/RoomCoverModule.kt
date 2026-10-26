package expo.modules.roomcover

import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * An opened locked room kept out of Recents while it is open (modules/room-cover/index.ts says why).
 * Android 13 and later: Recents keeps no picture, and the member's own screenshots still work.
 * Below Android 13, the secure-window flag, which also refuses screenshots, is all there is.
 */
class RoomCoverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RoomCover")

    AsyncFunction("setCovered") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        activity.setRecentsScreenshotEnabled(!on)
      } else if (on) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
