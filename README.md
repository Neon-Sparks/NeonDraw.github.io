# Neon Draw

A layered painting and photo-editing app that runs entirely in the browser: no server, no build step, nothing uploaded anywhere.

One folder gives you three ways to run it:

- **On your PC:** double-click `index.html`.
- **On the web:** upload the folder to GitHub Pages or any web host (see [DEPLOY.md](DEPLOY.md)) and open the address.
- **As an installed app:** open the web version in Chrome, Edge or Safari and click **Install app** in the top bar (or Help ▸ Install). It gets its own window and Start-menu/Dock icon, works offline, and can open `.ndraw`, `.psd`, `.ora` and image files directly.
- **Single file:** `dist/neon-draw.html` is the same app bundled into one file (no offline install). Rebuild it with `python tools/build-single.py`.

## Folder layout

```
index.html            page shell, loads the scripts in order
css/app.css           all styling (colours are CSS variables at the top)
js/util.js            helpers (canvas, colour maths, noise, tiny DOM builder)
js/icons.js           SVG tool and UI icons
js/blend.js           blend modes (GPU path + per-pixel fallback)
js/document.js        document model: layer tree, masks, compositor, undo history, strokes
js/effects.js         non-destructive layer styles (shadow, glow, stroke, inner shadow, bevel, overlay)
js/adjust.js          adjustment & fill layers, curves/levels maths, histogram, Develop panel maths
js/heal.js            spot healing / patch / content-aware fill, red-eye, Liquify
js/selection.js       selection masks: wand, grow/shrink/border/feather, marching ants
js/filters.js         filters (adjust, blur, enhance, edge, artistic, distort, render)
js/textures.js        paper grain textures used by textured brushes
js/tips.js            brush tip shapes
js/patterns.js        scatter-pattern sprites and seamless tiling patterns
js/stamps.js          vector stamp library
js/engine.js          brush engine (dabs, watercolour, bristle, mixer, sketchy, pixel art…)
js/presets.js         built-in brush presets
js/storage.js         .ndraw save/load, autosave, OpenRaster, layered PSD export
js/psd.js             Photoshop .psd/.psb import (layers, groups, masks, blend modes; 8/16-bit; RGB/grey/CMYK)
js/smartsel.js        Quick select, Select subject and Remove background (edge-aware segmentation)
js/render.js          gradients, shapes, text, mesh warping
js/app.js             app state, commands, clipboard, files
js/viewport.js        canvas view, pointer input and tool behaviour
js/tools2.js          heal/patch/red-eye/liquify tools, assistants, rulers & guides, quick mask overlay
js/ui/*.js            panels: toolbar, colour, brushes, layers, dialogs, menus
js/main.js            start-up, keyboard shortcuts, drag & drop, paste, autosave
manifest.webmanifest  app name, icons and file types for the installed app
sw.js                 offline cache (generated — edit tools/sw-template.js instead)
icons/                app icons (redraw with python tools/make-icons.py, needs Pillow)
.nojekyll             tells GitHub Pages to serve the files as they are
tests/tests.html      self tests: open in a browser
tools/build-single.py bundles everything into dist/neon-draw.html
tools/build-pwa.py    regenerates sw.js with the current file list and version
```

The scripts are plain `<script>` files sharing one global `ND` object, not ES modules. That is deliberate: browsers block modules on `file://`, and this setup is what lets a double-click on `index.html` work.

## Extending it

- **New brush preset:** add a line to `js/presets.js`. Every setting is listed in `DEFAULTS` in `js/engine.js`.
- **New stamp:** add `{ name, cat, draw: (x) => { … } }` to `js/stamps.js`. Draw in a 100×100 box; the helpers `C`, `E`, `P`, `RR`, `STAR`, `HEART` and `LEAF` cover most shapes.
- **New scatter pattern:** add to `SPRITES` in `js/patterns.js`. `make(rng)` returns a small canvas; `v` is the number of random variants.
- **New tiling pattern:** add to `TILES`. Use `mono: true` for white-on-transparent patterns that take the brush colour. Draw it so it tiles seamlessly.
- **New adjustment layer:** add to `KINDS` in `js/adjust.js`: `params` for sliders, `apply(imageData, params, env)` changes pixels in place. Fill layers use `fill: true` and are drawn in `renderFill`.
- **New layer effect:** add defaults to `js/effects.js` and draw it in `inner()` (on the layer) or `outer()` (behind it).
- **New filter:** add to the list in `js/filters.js`. Use `px(imageData, params, env)` for per-pixel work, or `cv(canvas, params, env)` to return a new canvas.
- **New brush tip or paper texture:** add to `DEFS` in `js/tips.js` or `js/textures.js`.

## Releasing a new version

1. Bump `version` in `package.json`.
2. Run `python tools/build-pwa.py` (refreshes the offline file list and cache name in `sw.js`) and, if you ship it, `python tools/build-single.py`.
3. Upload. People who already have it open see an **Update ready** button; clicking it saves their work and switches to the new version.

If you skip step 2, installed copies keep running the old cached files.

## Checking your changes

- Open `tests/tests.html` in a browser. It should report all tests passing.
- Lint (needs Node.js): run `npm install` once, then `npm run lint`.

## Compatibility

- Opens `.ndraw` projects and the autosave from the earlier single-file version.
- Custom brush presets saved by the old version still load.
- Exports PNG, JPEG, WebP, layered PSD and OpenRaster (`.ora`). OpenRaster opens in Krita, GIMP and MyPaint, and can be imported again.
