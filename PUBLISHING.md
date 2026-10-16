# Publishing Little Lanes (for the owner)

Little Lanes is a web app (PWA). It needs to live at one web address; every device installs it from there, and updates reach every device automatically.

## 1. Put it online once (free, ~10 minutes)
Easiest: **GitHub Pages**
1. Make a free account at github.com.
2. Create a new repository named `little-lanes` (Public).
3. Click **Add file → Upload files**, drag in everything from this folder (index.html, sw.js, manifest.json, the three icon PNGs), and click **Commit**.
4. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and Save.
5. After a minute your game is at `https://YOUR-NAME.github.io/little-lanes/`.

(Netlify Drop also works: go to app.netlify.com/drop and drag the folder in.)

## 2. Install it on each device
Open the address above, then:
- **iPhone / iPad (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).
- **Windows / Chromebook / Linux (Chrome or Edge):** install icon at the right end of the address bar, or ⋮ → **Install Little Lanes**.
- **Mac:** Chrome/Edge as above, or Safari → **File → Add to Dock**.
The game's Settings also has an **Install app** button that does this or shows these steps.

It opens full screen and works offline after the first visit.

## 3. Updating
Only update the website: upload the new files to the same repository (replace the old ones) and commit.
Every installed copy checks for a new version when it opens or comes back to the front, and shows **"A new version of Little Lanes is ready · Update"**. Tapping Update saves the game and switches over. No re-downloading.
Each new package already has its version number bumped in `sw.js`; that's what tells devices there's an update.

Saves and progress stay on each device (they don't sync between devices).
