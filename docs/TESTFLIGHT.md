# TestFlight and the App Store

The iOS app is the same game, wrapped with Capacitor. Nothing in this repo uploads a build on its own. You run the upload, either from Xcode on a Mac or from the **TestFlight** GitHub Action.

The bundle id is `io.techbok.solitaire`. The name on the home screen is **Solitaire**. Change the id in `capacitor.config.ts`, then run `npm run ios:sync`, and create the App Store Connect record with the same id.

## 1. Join the Apple Developer Program

1. Sign in at [developer.apple.com/programs](https://developer.apple.com/programs) with the Apple ID you want on the store.
2. Enroll in the Apple Developer Program (paid). Approval can take a day or two.
3. Open [developer.apple.com/account](https://developer.apple.com/account) and copy the **Team ID**. It is 10 characters. That value is the `APPLE_TEAM_ID` secret.

## 2. Create the app in App Store Connect

1. Open [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
2. Platform: iOS. Name: `Solitaire`. Primary language: your choice. Bundle ID: register `io.techbok.solitaire` if it is not listed, then select it. SKU: any private id, such as `solitaire-ios`.
3. User Access: Full Access.

The app record has to exist before TestFlight will accept a build.

## 3. Create the App Store Connect API key

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**.
2. Generate a key with **Admin** access. Admin is required because the GitHub Action creates an Apple Distribution certificate. App Manager can upload a build, but it cannot create that certificate.
3. Download the `AuthKey_XXXXXXXXXX.p8` file once. Apple will not show it again. Store it somewhere private.
4. Copy the **Key ID** and the **Issuer ID**.

## 4. Add the GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | The key id, such as `AB12CD34EF` |
| `ASC_ISSUER_ID` | The issuer UUID at the top of the API keys page |
| `ASC_KEY_P8` | The whole `.p8` file, including the `BEGIN PRIVATE KEY` and `END PRIVATE KEY` lines. A base64 encoding of that file also works. |
| `APPLE_TEAM_ID` | The 10-character Team ID from the developer account |

The workflow is manual. A push does not upload anything.

The first successful Action run creates one Apple Distribution certificate and keeps its private key in this repository’s Actions cache (`fastlane/certs`), not in git. Apple allows only a few of those certificates. If a later run says the maximum number has been reached, revoke unused **Apple Distribution** certificates at [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates) and run the workflow again. Do not commit `fastlane/certs/`.

## 5a. Upload from Xcode on a Mac

1. Install Xcode from the Mac App Store and open it once so it finishes installing the command-line tools.
2. In the repo: `npm ci`, `npm test`, `npm run ios:sync`.
3. Open `ios/App/App.xcodeproj` (or `App.xcworkspace` if that file is present).
4. Select the **App** target → **Signing & Capabilities**. Check **Automatically manage signing**, and choose your team. Xcode uses your Apple ID for this path. The API key is only needed for the GitHub Action.
5. Choose **Any iOS Device (arm64)** as the run destination. A simulator cannot archive.
6. **Product → Archive**. When the Organizer opens: **Distribute App → App Store Connect → Upload**. Leave the defaults (bitcode is obsolete; symbols can stay on).
7. Wait until App Store Connect shows the build under TestFlight. Processing often takes 10–30 minutes. The project sets `ITSAppUsesNonExemptEncryption` to false, so the encryption question should not block the build.

## 5b. Upload from GitHub Actions

1. Finish sections 1–4.
2. **Actions → TestFlight → Run workflow**.
3. The job tests, builds the web app, syncs Capacitor, signs with the API key, and uploads. It does not wait for Apple to finish processing.
4. Watch the build appear in App Store Connect → TestFlight. The build number is the GitHub Actions run number. The version is `1.0.0` until you change `MARKETING_VERSION` in the Xcode project.

## 6. Install it on your iPhone

1. On the iPhone, install Apple’s **TestFlight** app from the App Store.
2. App Store Connect → your app → **TestFlight** → **Internal Testing**.
3. Create a group if asked, and add yourself. Internal testers must be users on the App Store Connect team. You already are, if you created the app.
4. Open the email or the TestFlight notification on the phone and accept the build.

Internal testing does not need a Beta App Review. External testers do.

## 7. Submit to the App Store

When the TestFlight build is the one you want to ship:

1. App Store Connect → the app → **Distribution** (or the iOS version page) → create version **1.0**.
2. Fill in the description, keywords, support URL, and **Privacy Policy URL**. The privacy URL has to be a public https page. The game does not collect data; this text is enough to host:

   > Solitaire stores the current game, stats, and settings on your device only. It does not collect, share, or track any data. It does not use accounts, ads, or analytics, and it does not contact a server while you play.

3. **App Privacy** → Get Started → **No**, you do not collect data from this app. Publish the label. It should read **Data Not Collected**. There is no tracking.
4. Age rating: no unrestricted web, no gambling, no user content. Answer the questionnaire to match that.
5. Screenshots, portrait, at least one set. App Store Connect lists the exact sizes it wants that day. For a new iPhone app that is usually:
   - 6.9-inch (iPhone 16 Pro Max class): **1320 × 2868**
   - 6.5-inch, if still requested: **1284 × 2778** or **1242 × 2688**
   - Three to ten screenshots per size. The app is iPhone only, so iPad screenshots are not required.
6. Select the processed build, set the price to free, and add the review contact.
7. Submit. Review is Apple’s step, not this repo’s.

To ship a newer build later, raise the version in Xcode (`MARKETING_VERSION`) when the user-facing version changes. Each upload already gets a new build number from the workflow run.
