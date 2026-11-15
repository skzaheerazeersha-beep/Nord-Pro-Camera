# fx-991ES PLUS 2nd edition — Android APK

A real, installable Android app of the scientific calculator clone.
It wraps the exact same offline web app (calc-engine.js back-end +
app.js/style.css front-end) in a native WebView — airplane-mode friendly.

## Build the APK (pick one way)

### A. Android Studio (recommended, ~10 minutes, free)
1. Install Android Studio: https://developer.android.com/studio
2. Open this folder (`fx991es-plus2-android`) with **File > Open**.
3. Let Gradle sync (downloads the Android Gradle Plugin once — needs internet).
4. To run on your phone: enable **Developer options > USB debugging**, plug in,
   press the green **Run** button.
5. To get the APK file:
   - Debug APK: **Build > Build Bundle(s)/APK(s) > Build APK(s)**
     → `app/build/outputs/apk/debug/app-debug.apk`
   - Release APK (signed): **Build > Generate Signed Bundle/APK > APK**,
     create a keystore (keep it safe!) → `app/release/app-release.apk`
   Copy the APK to your phone and tap to install
   (allow "install from unknown sources" when asked).

### B. Command line (if you have the Android SDK)
```
export ANDROID_HOME=$HOME/Android/Sdk        # or ~/Library/Android/sdk on macOS
cd fx991es-plus2-android
gradle wrapper --gradle-version 8.7          # once
./gradlew assembleDebug                      # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                    # unsigned release (sign with apksigner)
```

## What's inside
- `app/src/main/java/com/mooncalc/fx991/MainActivity.java` — WebView shell,
  JavaScript enabled, loads `file:///android_asset/www/index.html`, hardware
  accelerated, back-button history support.
- `app/src/main/assets/www/` — the complete calculator
  (index.html + style.css + calc-engine.js + app.js). Everything runs locally;
  zero runtime network calls.
- Min SDK 21 (Android 5.0) · Target SDK 34 · versionName 1.0

## Notes
- The calculator source project (plain web version) is in `../fx991es-plus2/`
  with `../fx991es-plus2.html` as a single portable file.
- To change the icon, replace `app/src/main/res/mipmap-*/ic_launcher.png`.
- The app needs no permissions at runtime (INTERNET is declared but unused —
  you may delete that line from AndroidManifest.xml for a fully
  permission-free build).
