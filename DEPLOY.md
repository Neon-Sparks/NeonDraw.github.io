# Putting Neon Draw on GitHub Pages

The same upload gives you the **web version** (open the address in any browser) and the **installable version** (Install app button, works offline). There is nothing to build.

## First time

1. Create a new **public** repository on GitHub, for example `neon-draw`. (GitHub Pages on private repositories needs a paid plan.)
2. In **GitHub Desktop**: *File ▸ Clone repository* and pick the new repository.
3. Copy everything from this folder into the cloned folder — including the hidden `.nojekyll`, `.gitattributes` and `.gitignore` files. Keep the folder structure exactly as it is: `index.html` must sit at the top level next to `js/`, `css/` and `icons/`.
4. In GitHub Desktop, write a summary such as `Neon Draw 2.2`, click **Commit to main**, then **Push origin**.
5. On github.com open the repository's **Settings ▸ Pages**. Under *Build and deployment* choose **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, and click **Save**.
6. After a minute or two the page shows your address, for example `https://YOUR-NAME.github.io/neon-draw/`. Open it.

## Installing it as an app

- **Chrome / Edge (Windows, Mac, Linux, Chromebook, Android):** click **Install app** in Neon Draw's top bar, or the install icon at the right of the address bar.
- **Safari on iPhone / iPad:** Share ▸ *Add to Home Screen*.
- **Safari on Mac:** File ▸ *Add to Dock*.
- **Firefox:** desktop Firefox can't install web apps, but the site still works offline in a tab after the first visit.

Once installed it opens in its own window, works without an internet connection, and appears under *Open with* for `.ndraw`, `.psd`, `.ora`, PNG, JPEG and WebP files (Chrome/Edge on desktop).

## Updating

1. Change the version in `package.json` (for example `2.2.1`).
2. Run `python tools/build-pwa.py` so the offline cache picks up the new files.
3. Commit and push in GitHub Desktop.

Anyone with Neon Draw open gets an **Update ready** button in the top bar. Clicking it autosaves their work and reloads into the new version. If you forget step 2, installed copies keep using the old cached files.

## Notes

- Everything runs in the visitor's browser; nothing is uploaded to GitHub or anywhere else. Autosave lives in each browser's own storage.
- Line endings: `.gitattributes` keeps the repository on LF; GitHub Desktop on Windows handles the conversion.
- A custom domain works too (Settings ▸ Pages ▸ Custom domain). Offline use and installing need HTTPS, which GitHub Pages provides.
- `tests/tests.html` will also be online (`…/neon-draw/tests/tests.html`); it's harmless and handy for checking a browser. Delete the `tests` folder from the repository if you'd rather not publish it.
