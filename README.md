# Klondike Solitaire

Classic Klondike, built as an installable web app. It is meant for an iPhone home screen, works offline after the first load, and has no ads, accounts, or network calls beyond its own files.

The rules live in `src/game` and do not touch the DOM, so the same engine can later sit inside a native wrapper such as Capacitor. Saving and settings go through `src/storage.ts` (localStorage today).

## Play it

```bash
npm install
npm run dev
```

Open the URL Vite prints. The dev server in this project is set to port **4738**.

```bash
npm test
npm run build
npm run preview
```

`npm run build` typechecks, then writes a static site to `dist/`. `npm run preview` serves that folder. Host `dist/` on any static host.

The asset prefix is `BASE_PATH` (default `/`, for a domain root or the iOS app). Manifest `start_url` and `scope`, and the service worker scope, stay relative (`./`) so they follow that folder.

### GitHub Pages

For [thomasaitest.github.io/solitaire](https://thomasaitest.github.io/solitaire/):

```bash
BASE_PATH=/solitaire/ npm run build
```

Publish the contents of `dist/`. The site must be served over HTTPS for “Add to Home Screen” and the service worker. Opening `index.html` from the filesystem will not install the app.

## Install on an iPhone

1. Open the hosted site in Safari (the service worker needs a first online visit).
2. Tap the Share button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open **Solitaire** from the home screen. It runs full screen, without Safari’s toolbar, and keeps working in airplane mode.

On a later visit Safari updates the cached copy in the background. The game itself never contacts a server.

## How to play

- **Draw 3** (default) or **Draw 1**, from the menu. Changing mode deals a new game.
- Tap the stock to draw. When it is empty, tap it again to turn the waste over. Draw three shows three cards; only the top one plays.
- Tap a card to move it to the best legal pile. Double-tap to send that card to its foundation. You can also drag a card or a face-up run.
- Foundations build up from ace to king in one suit (spades, hearts, diamonds, clubs). The tableau builds down, alternating colors. Only a king fills an empty column.
- When the stock is empty, every tableau card is face up, and the rest can be sent home in order, the layout finishes itself.
- Undo is unlimited. **Restart this deal** replays the same shuffle. The menu also shows games played, games won, and best time for each draw mode.
- Closing the app saves the current game. The next launch resumes it.

Keyboard, when you have one: Space draws, N deals a new game, U or Ctrl/Cmd+Z undoes, Escape closes a panel.

### Score

This is standard scoring. Sending a card to a foundation is 10. Playing from the waste, or turning a tableau card face up, is 5. Moving a card from a foundation back to the tableau costs 15. Recycling the waste costs 20 in draw three and 100 in draw one. The clock removes 2 points every 10 seconds. A win adds 700,000 divided by the number of seconds. The number on screen never goes below zero.

## Layout

```
src/game     rules, scoring, stats (no DOM)
src/ui       cards, layout, and the screen
src/storage.ts
public       icons, including the Apple touch icon
```

Theme follows the system the first time, then stays on Felt or Night, whichever you pick. Both are stored on the device only.

## iOS app

Capacitor wraps `dist/` as an iPhone app. The Xcode project is `ios/`. The bundle id `io.techbok.solitaire` and the home-screen name Solitaire live in `capacitor.config.ts`.

```bash
npm run ios:sync
```

That builds the site and copies it into the Xcode project. Open `ios/App/App.xcodeproj` on a Mac. TestFlight, the API-key secrets, and App Store submission are in [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md). The native app does not show the Safari “Add to Home Screen” hint.
