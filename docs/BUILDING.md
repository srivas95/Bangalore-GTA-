# Building the Windows and Android apps

The game is a static web app (`npm run build` → `dist/`). The desktop and Android apps wrap that
build. They need no server or network connection, and saves stay on the device.

| App | Wrapper | Output |
| --- | --- | --- |
| Windows | [Electron](https://www.electronjs.org/) + electron-builder (`apps/desktop`) | `NammaBengaluru-Setup-<version>.exe` (installer), `NammaBengaluru-Portable-<version>.exe` (no install) |
| Android | [Capacitor](https://capacitorjs.com/) (`apps/mobile`) | `NammaBengaluru.apk` |
| Browser | — | `dist/`; installable from the browser menu ("Install app" / "Add to Home screen") and works offline |

## Getting the builds from GitHub Actions (easiest)

`.github/workflows/build-apps.yml` builds everything on every push:

1. Open the repository's **Actions** tab and pick the latest **Build apps** run.
2. Download the **windows-exe** and **android-apk** artifacts at the bottom of the run page.
   GitHub delivers them as zip files.

To publish a release with the files attached, push a tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Building on your own machine

You need Node.js 20+.

**Windows installer.** Build on Windows (electron-builder can also cross-build from macOS or Linux
with Wine installed):

```bash
npm run app:windows      # → apps/desktop/release/*.exe
npm run app:desktop      # or just run the desktop app without packaging
```

**Android APK.** You need JDK 17 and the Android SDK (installing Android Studio gives you both).
Set `ANDROID_HOME`, then:

```bash
npm run app:android      # → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

You can also open `apps/mobile/android` in Android Studio after `npm --prefix apps/mobile run sync`.

## Installing

- **Windows.** Run the setup exe. The app isn't code-signed, so Windows SmartScreen may show
  "Windows protected your PC". Click **More info → Run anyway**. The portable exe runs without
  installing.
- **Android.** Copy the APK to the phone and open it. Allow "Install unknown apps" for your file
  manager or browser when Android asks. The game runs in landscape with touch controls and starts
  on the Low graphics preset; you can raise it in Settings on a fast phone.

## Signed Android releases (optional)

Without a keystore, CI builds a **debug-signed** APK. It installs fine by sideloading, but every
build has a different signature on different machines, and the Play Store won't accept it.
For a stable signature (needed for updates and for the Play Store):

1. Create a keystore once and keep it safe:
   `keytool -genkey -v -keystore release.keystore -alias namma -keyalg RSA -keysize 2048 -validity 10000`
2. Add these repository secrets (Settings → Secrets and variables → Actions):
   `ANDROID_KEYSTORE_BASE64` (the output of `base64 -w0 release.keystore`), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

CI then builds a signed `assembleRelease` APK instead.

## Notes

- Electron loads `apps/desktop/web` (a copy of `dist/`). In the desktop app, **F11** toggles full
  screen and **F12** opens the developer tools.
- The Android app keeps the screen on and hides the system bars. Swipe from an edge to bring them
  back briefly.
- Version numbers live in `package.json`, `apps/desktop/package.json` and
  `apps/mobile/android/app/build.gradle` (`versionCode` / `versionName`).
