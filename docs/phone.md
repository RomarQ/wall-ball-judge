# The phone

Getting the app onto a phone, keeping it updated, and running it with no network.

## Serving it to a phone

The camera needs a secure context. A phone reaching your laptop over `http://192.168.x.x:5173` is not one: Chrome hides `navigator.mediaDevices` there, whatever permissions you grant. Three ways out.

**The published copy.** The site at `https://wallballs.app/` is HTTPS, so it just works. [pages.md](pages.md) says how it is served.

**Reach the laptop as localhost over USB.** With USB debugging on and the phone plugged in, run the dev server or the preview on the laptop and map its port onto the phone:

```sh
npm run dev
adb reverse tcp:5173 tcp:5173
```

Then open `http://localhost:5173/` on the phone. It reaches the laptop's server, and `localhost` is always a secure context. `npm run preview` serves the production build the same way, on port 4173.

**Tell Chrome to treat the address as secure.** On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://192.168.x.x:5173` with your laptop's address and port, set it to Enabled, and relaunch Chrome. That one origin then counts as secure. It is a per-phone development setting, and the origin must match exactly, port included.

## Installing it as an app

The app installs as a web app, which opens full screen from the home screen. Inside the web app, the home view's **Installed** row says **Yes**. A browser tab cannot tell whether the phone has the web app: Brave adds it to the home screen as a shortcut and then offers the install again in every tab. So in a tab the row is **Install the web app**, and it never says yes or no. Where the browser offers the install to the page, as Chrome and Brave on Android do, the row shows an **Install** button. Elsewhere a line under the row gives the browser's own steps, as [Google's help on web apps](https://support.google.com/chrome/answer/9658361) gives them: on an iPhone, tap **Share**, then **Add to Home Screen**; on Android, open the menu with the three dots, then tap **Install and create shortcut**, then **Install**; on a computer, select **Install** in the address bar. After an install from the tab, the line says to open the web app from its icon.

## Updating

For the runbook that puts a build from this machine onto the phone over USB, and what to do when the phone keeps running the old one, see [docs/updating-the-phone.md](updating-the-phone.md).

The service worker precaches the app shell by content hash, so a new build replaces the old one whole. An installed app checks for a new build every time it opens and installs it in the background. The page then takes it with one reload, on the home view or the settings, never on the judge board ([updating-the-phone.md](updating-the-phone.md)). The version beside the logo shows the build the phone runs, whatever the server holds.

## Offline

The service worker precaches the shell when the app opens. It caches the WASM runtimes and the models on first use, so opening the app does not make a phone ready for a gym with no network.

**Check this device**, under "This device" on the home view, does. It loads everything a set needs on this phone, about 45 MB from a server that compresses the WASM files: the pose model, the ball detector, the target detector and the runtime files that each of them asks for. The home view shows each step of the download. Then the **Ready for offline use** row reads "Yes", and the app opens and judges with the laptop off and no signal.

The download creates each model through the loader that a set uses, then closes it. The requests are thus the ones this phone makes in a set. A fixed list of files cannot do this, because MediaPipe and ONNX Runtime each pick their runtime files for the device.

A set caches what it loads, but it does not load everything. The target detector loads on **Find the target** only. Use the download, not a set, to get a phone ready.

A browser may clear stored files when the phone runs low on space. Safari also clears them after seven days of use with no visit to the site, unless the app is on the home screen. So the check, and an install, ask the browser to keep them. Chrome grants that with no prompt to an installed app. Until the browser agrees, a line under the "Yes" says that the browser may clear the models when the phone needs space, and, before an install, that installing the app keeps them.

The home view reads the ready state from the worker's caches on each visit. The phone is ready when the model cache holds every model file and the runtime cache holds every runtime file of the last download. A new revision in [models/manifest.json](../models/manifest.json), or a new version of a runtime package, gives the worker a new cache and drops the old one. The row then reads "Not yet", and the next check fills the new cache. While the first worker of a visit starts, the row reads "Checking". The dev server runs no service worker, so there it reads "Not on the dev server". A browser that runs no service workers reads "Not in this browser", and the app cannot work there with no network.

## What the device can run

The **Can this device run the app?** row on the home view sums up the check. It reads **Yes** when the camera is there, the pose runs at 15 frames a second or more, a look of the ball check takes 90 ms or less, and the target finder loads. It reads **Maybe** when the ball check or the finder runs slower or not at all: the board still judges the squat, and the target is placed by a tap. It reads **No** without the camera or the pose. Before the check it reads "Not checked", and while the check runs, "Checking…". The check finds no time for the pose, so until a set has run on the device the row reads "Not known yet", and the first live set measures the pose model's speed.

The check also decides where each model runs. The detector's worker runs the model on the GPU, through WebGPU, when the model loads there and computes the same numbers as on the CPU; otherwise it runs the model on the CPU, see [src/litert-worker.ts](../src/litert-worker.ts). The check times each model on both units, and a set runs each one on the faster. On the CPU a look takes about a quarter of a second, so the app sees the ball less often and can miss a fast throw. The board's footer names the unit each model runs on.

The **Last set** row shows the pose frame rate of the last set on this device, once a set has run.

The detectors come from the Hugging Face Hub and the pose models from Google's storage, so the download needs a network that reaches both. A build with `VITE_MODELS=local` serves them all itself, as [docs/models.md](models.md) describes.

## Reading a phone from the laptop

With USB debugging on, `adb forward tcp:9222 localabstract:chrome_devtools_remote` exposes the phone browser's DevTools protocol, and `http://localhost:9222/json` lists its tabs. Three things must be true at once for it to answer: the cable is in, the phone is unlocked, and the browser is in the foreground. A page behind the lock screen is frozen, so a request to it waits instead of failing, and a phone that dozes off mid-answer looks exactly like a page that has hung. A screen recording from the phone's own recorder is the most useful thing to attach to a bug report: with its details on (a tap on it turns them on), the status line under the camera view shows the frame rate, the model, the depth reading and the rep state at every moment.
