# Putting Neon Sparks Draw on GitHub Pages

The same upload gives you the **web version** (open the address in any browser) and the **installable version** (Install app button, works offline). There is nothing to build.

## First time

1. Create a new **public** repository on GitHub, for example `neon-sparks-draw`. (GitHub Pages on private repositories needs a paid plan.)
2. In **GitHub Desktop**: *File ▸ Clone repository* and pick the new repository.
3. Copy everything from this folder into the cloned folder — including the hidden `.nojekyll`, `.gitattributes` and `.gitignore` files, and the `vendor` folder (the AI engine, about 29 MB). Keep the folder structure exactly as it is: `index.html` must sit at the top level next to `js/`, `css/`, `icons/` and `vendor/`.
4. On github.com open the repository's **Settings ▸ Pages**. Under *Build and deployment* choose **Source: GitHub Actions** (recommended, see *Updating* below). Or, without the automatic checks, choose **Deploy from a branch**, **Branch: main**, folder **/ (root)**, and delete the `.github` folder.
5. In GitHub Desktop, write a summary such as `Neon Sparks Draw 2.3`, click **Commit to main**, then **Push origin**.
6. After a minute or two the page shows your address, for example `https://YOUR-NAME.github.io/neon-sparks-draw/`. Open it.

## Already published under another name (e.g. `neon-draw`)?

You don't need to rename the repository: the app's name comes from its files, so uploading this version is enough — the app, the browser tab and an installed copy will say **Neon Sparks Draw**.

If you do rename the repository (GitHub: *Settings ▸ General ▸ Repository name*), the web address changes, and GitHub does not forward the old Pages address. Browsers keep the autosave, settings, your own brushes, palettes and downloaded AI models **per address**, so the new address starts empty and an installed app has to be installed again from the new address. Before renaming: save your work as `.ndraw` files (File ▸ Download a copy), export your brushes, then import them again at the new address.

## Installing it as an app

- **Chrome / Edge (Windows, Mac, Linux, Chromebook, Android):** click **Install app** in Neon Sparks Draw's top bar, or the install icon at the right of the address bar.
- **Safari on iPhone / iPad:** Share ▸ *Add to Home Screen*.
- **Safari on Mac:** File ▸ *Add to Dock*.
- **Firefox:** desktop Firefox can't install web apps, but the site still works offline in a tab after the first visit.

Once installed it opens in its own window, works without an internet connection, and appears under *Open with* for `.ndraw`, `.psd`, `.ora`, PNG, JPEG and WebP files (Chrome/Edge on desktop).

## Updating

There are two ways to publish. Pick one.

### Option A — automatic (recommended): GitHub Actions

The repository includes `.github/workflows/deploy.yml`. With it, every push is checked (lint + all self tests in a headless Chrome) and, if everything passes, published. It also refreshes the offline cache for you, so there is no build step to remember.

1. On github.com: **Settings ▸ Pages ▸ Build and deployment ▸ Source: GitHub Actions**.
2. Commit and push in GitHub Desktop as usual.
3. Watch the **Actions** tab: a green tick means it's live; a red cross means a check failed and the old version stays online. Click the run to see which test failed.

You never need to run `build-pwa.py` yourself with this option. Bump the version in `package.json` when you want to; every deploy already gets a fresh cache name.

### Option B — manual: deploy from a branch

1. Keep **Source: Deploy from a branch** (main, / root).
2. Before each push, change the version in `package.json` (for example `2.3.1`) and run `python tools/build-pwa.py` so the offline cache picks up the new files.
3. Commit and push.

The workflow file is written for option A. If you use option B, delete the `.github` folder, otherwise its publish step will show a red cross on every push.

Either way, anyone with Neon Sparks Draw open gets an **Update ready** button in the top bar. Clicking it autosaves their work and reloads into the new version.

## Notes

- Everything runs in the visitor's browser; nothing is uploaded to GitHub or anywhere else. Autosave lives in each browser's own storage.
- Line endings: `.gitattributes` keeps the repository on LF; GitHub Desktop on Windows handles the conversion.
- A custom domain works too (Settings ▸ Pages ▸ Custom domain). Offline use and installing need HTTPS, which GitHub Pages provides.
- `tests/tests.html` will also be online (`…/YOUR-REPOSITORY/tests/tests.html`); it's harmless and handy for checking a browser. Delete the `tests` folder from the repository if you'd rather not publish it.
