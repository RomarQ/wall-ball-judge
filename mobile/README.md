# Wall Ball Judge for Android

The judge board as an Android app that runs the pose and ball models on the phone's own CPU and TPU. It judges with the PWA's own code: `app/core.ts` imports the judge, the search and placement rules, the texts and the settings from the repository's `src`, unchanged. The PWA in the repository root stays the main app.

## What it does

The screens follow the PWA's design, in the phone's own font. The home drawing moves by the PWA's `src/demo-scene.ts`; the drawings, icons and colours are ported from the PWA's `index.html` and styles into `app/ui`.

- **Home:** the drawn demo and the rule, the controls that start a set (a phone video, Set up, the settings), whether this device runs the app, and how to position the device.
- **Board:** the camera (front or back) or a video's search frame, with the PWA's overlay. The search finds the plates as the PWA does and places a sure one by itself; a tap picks a candidate or places a plate, and a drag moves a plate, sizes it from its lower right corner, or moves a line. Men or Women picks the target. Start the set begins counting; the board shows each verdict, beeps and says the count. A video plays at its own speed, as on the PWA, with the pose drawn on it, and every frame is judged; a phone too slow for that speed plays it slower. The scoreboard keeps the count, the two kinds of no-rep and the set clock across sets until Reset, as the PWA's does; a tap on a no-rep or on a plate counts one by hand.
- **Settings:** the language and a test of the spoken count, the ball check, its model's input size and the pose confidence, under the PWA's keys, the two phones' roles, and the app's version.
- **Two phones:** one phone judges from the side or behind, and the other stands in front of the athlete as the display. In Settings, **This phone is the display** opens Display mode: the count large, the two kinds of no-rep, the division, the clock and each verdict's banner, and it calls each rep. The display also has Reset, with a second tap to confirm, and the Men and Women divisions: a tap asks the judging phone, which does it as if tapped on its own board and sends the new board back. **This phone judges** finds the displays nearby and links to one. The judging phone owns the count and sends it over Bluetooth Low Energy after every change, `board` and then `score` from the repository's `docs/scoreboard.md`. With no board open, it sends the live board. While a display is linked, it calls the reps and the judging phone stays silent. If the link drops, the judging phone calls again and links again by itself. One phone alone judges as before.

- **Sets:** with **Save sets** on in Settings (off until turned on), each live set that counted anything is kept on the phone when it ends, by Stop, by leaving the board or by the app leaving the screen: when it ran, what it judged, its reps and both kinds of no-rep, and its time from the start of its first rep to its last change. A judged video is never kept as a set. A Reset during a set starts its record over. **All sets**, in the same section of Settings, lists them with each one's video, to replay on the board or open in the phone's player, and Delete, which asks for a second tap. With **Save each live set's video** also on (off until turned on), the camera's video, without the overlay, goes to `Movies/Wall Ball Judge` at 720p, about 24 MB a minute; deleting the set deletes it. A set an adb launch key started is not kept. The rules of a record are the repository's `src/set-record.ts`; the records sit in `sets.json` in the app's private files.

Not in the app yet: iOS.

## Build and run on Android

The build needs the Android SDK (platform 37, NDK 27.1.12297006) and a JDK 17 or later, such as Android Studio's.

```sh
npm ci
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell pm grant app.wallballs android.permission.CAMERA
adb shell am start -n app.wallballs/.MainActivity
```

`android/local.properties` names the SDK folder (`sdk.dir=...`) and stays out of git. The release build holds its own JavaScript bundle, so it needs no Metro server. It builds for arm64 only. The app keeps the screen on while it is open, because React Native stops its timers once the app leaves the screen.

## The models

They sit in `android/app/src/main/assets/models/`, which git ignores:

- `pose_landmarker_full.task` (run `npm run models:fetch` in the repository root first), and `pose-detector.tflite` and `pose-landmarks-full.tflite`, the two models inside it (it is a zip).
- `detector-320.tflite` and `detector-416.tflite`, the ball model at the two input sizes the settings offer, and `detector-640.tflite`, the search model, all put into the repository's `public/models/` by `npm run models:fetch`. The search runs on the CPU (4 threads), which answers as the PWA's search does.
- `detector-320-g6.tflite`, `detector-416-g6.tflite` and `pose-landmarks-full-g6.tflite`, compiled for the Tensor G6: the phone compiles them when Google's LiteRT `benchmark_model` runs on it with `--use_npu=true --compiler_plugin_library_path=<dir> --compiler_cache_path=<dir>`, and the `.tflite` it writes to the cache folder is the compiled file.

At its first start on a system build, and for each ball model size, the app runs the ball model on the CPU (4 threads) and, when the phone has a TPU the compiled model loads on, on the TPU, on the size's probe frame in `android/app/src/main/assets/probe/`, git-ignored: `frame-320.raw` is one window of a frame at the training scale, centred on its plates, as a look draws it, `[1, 3, 320, 320]` float32, and `frame-416.raw` is a whole frame of another clip letterboxed into `[1, 3, 416, 416]`. It keeps the TPU only when the two answers agree as the PWA's agreement check asks. Without a TPU it tries the GPU in half precision the same way, and keeps it when it also runs faster than the CPU; the GPU's compiled programs stay in the app's cache. A unit whose try crashed the app is not tried again. The app never compiles for the TPU itself: LiteRT issue 11251 reports that Android refuses an app's own compile.

The app judges on the phone and sends nothing. MediaPipe, which the search's still pose runs on, opens a usage logger for Google's servers with every task; the manifest unregisters that logger's upload backend, so the logger refuses each report (`Transport backend 'cct' is not registered`). The manifest still holds the INTERNET permission of React Native's template. The app has no permission for the phone's videos: Replay a video opens Android's own picker, and the app reads only the video picked there.

## Checks over adb

Both sides of the link need the Nearby devices permissions, which `adb shell pm grant app.wallballs android.permission.BLUETOOTH_SCAN` (and `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`) grant without the prompt. `--es display 1` opens Display mode, and `--es link first` links the board to the strongest display a scan finds. The judging phone logs a `SEND` line for each change it sends and `LINK` lines for the link's state; the display logs a `CALL` line for each call.

A video in the app's `clips` folder runs through the board without taps: `--es board` names the file, `--es pick` the search's candidate to place (its stacked partner joins it), and `--es required` the target. The app writes the set's verdicts to `set-<video>-<required>.json` in its external files folder and logs `SEARCH` and `SET` lines. A phone's system services can push those lines out of its log buffer within a minute, so read them from a running `adb logcat`, not from `adb logcat -d` afterwards.

```sh
adb push gym-raw-7a.mp4 /sdcard/Android/data/app.wallballs/files/clips/
adb shell am start -S -n app.wallballs/.MainActivity --es board gym-raw-7a.mp4 --es pick 0 --es required upper
adb logcat -s ReactNativeJS | grep -E 'SEARCH|SET'
```

The judging pose is the module's own rebuild of MediaPipe's video-mode pose (`OwnPose.kt`), with its landmark model on the CPU: on the TPU, that model's arithmetic loses the athlete in eval-gym-1's fast first squat. `mobile/app/clip-targets.json` holds each test clip's target and the counts the PWA's board gives it.

## The native module

`modules/wallball-vision` is a Nitro module. After a change to `src/specs/*.nitro.ts`, run `npx nitrogen` in that folder and commit the files under `nitrogen/generated`. Clips and camera frames go through one pipeline (`FramePipeline.kt`): a source gives upright RGBA and a time, and the pose and the ball look follow. Camera frames come as RGBA from the camera library and are copied upright in C++. A clip draws each frame it judges into `ClipView` (`HybridClipView.kt`), a native view the board lays over the frame's place.
