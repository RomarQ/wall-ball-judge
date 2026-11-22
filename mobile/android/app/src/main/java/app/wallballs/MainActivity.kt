package app.wallballs

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "WallBallJudge"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // React Native stops its timers once the app leaves the screen, which would stop a set or a replay.
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle = launchOptions(intent)
      }
}

/** The intent's string extras that App.tsx reads as its props; App.tsx says what each does. */
private val LAUNCH_KEYS = listOf("clip", "pose", "ball", "frames", "target", "board", "pick", "required", "display", "link")

private fun launchOptions(intent: Intent?): Bundle =
    Bundle().apply {
      for (key in LAUNCH_KEYS) intent?.getStringExtra(key)?.let { putString(key, it) }
    }
