# The Zambian Economist: Android app

A news reader for [zambianeconomist.com](https://zambianeconomist.com). It reads stories straight from the website's WordPress data feed (`/wp-json/wp/v2`), so anything published on the site appears in the app without an app update.

## What the app does

* **Today**: lead story, top stories and the latest news, with section tabs along the top
* **Sections**: every category on the site, plus links to the Money Tracker, Directory, Events and Podcast
* **Editions**: the Weekly and Monthly Edition PDFs from the media library
* **Saved**: bookmarked articles stored on the phone for offline reading
* **Search**: searches every article on the site
* Pull down to refresh; a "New stories" button appears when something new is published while the app is open; the app refreshes itself when reopened after 15 minutes
* Article links to other ZE stories open inside the app; other links open in the browser
* Text size and light, dark or device appearance in Settings

## Getting the APK

Every push to `main` builds the app on GitHub Actions and publishes `ZambianEconomist.apk` under **Releases**. Open the latest release on the phone, download the APK and open it. The first time, Android asks you to allow installs from your browser or file manager.

New builds install over the old app, keeping saved articles, as long as they are signed with the same key.

## Signing

Release builds are signed with the key stored in three repository secrets: `ZE_KEYSTORE_B64`, `ZE_KEYSTORE_PASSWORD` and `ZE_KEY_ALIAS`. Keep a private copy of the keystore file: the same key is needed to publish updates on Google Play.

## Project layout

* `www/`: the app itself (HTML, CSS, JavaScript; no build step)
* `android/`: the Capacitor Android project
* `scripts/make_icons.py`: builds launcher icons and splash images from the site logo
* `capacitor.config.json`: app ID `com.zambianeconomist.app`, native HTTP enabled so the WordPress API works without CORS changes

## Working on it locally

```
npm ci
npm run fonts
npx cap sync android
cd android && ./gradlew assembleDebug
```

Open `www/index.html` through any local web server to work on the screens in a desktop browser (API calls need the site to allow cross-origin requests when run outside the app).
