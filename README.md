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
js/paper.js           paper & canvas types: tints, rendering, and how each kind of brush responds to the tooth
js/harmony.js         colour harmony schemes and the painter's (RYB) colour wheel
js/tips.js            brush tip shapes
js/patterns.js        scatter-pattern sprites and seamless tiling patterns (more in patterns2.js)
js/stamps.js          vector stamp library
js/engine.js          brush engine (dabs, watercolour, bristle, mixer, sketchy, pixel art…)
js/presets.js         built-in brush presets
js/storage.js         .ndraw save/load, autosave, OpenRaster, layered PSD export
js/psd.js             Photoshop .psd/.psb import (layers, groups, masks, blend modes; 8/16-bit; RGB/grey/CMYK)
js/smartsel.js        Quick select, Select subject and Remove background (edge-aware segmentation, no AI)
js/ai.js              AI models: download/storage, pre/post-processing, AI masks & quick select
js/ai-worker.js       runs the AI models off the main thread (ONNX Runtime Web)
vendor/ort-1.30.0/    ONNX Runtime Web 1.30 (MIT) — the AI engine, bundled so it works offline
js/refine.js          Select and Mask maths: edge radius (hair), smooth, feather, contrast, shift edge, decontaminate
js/render.js          gradients, shapes, text, mesh warping
js/app.js             app state, commands, clipboard, files
js/files.js           Open / Save in place / Save as / recent files (File System Access API, with fallbacks)
js/viewport.js        canvas view, pointer input and tool behaviour
js/tools2.js          heal/patch/red-eye/liquify tools, assistants, rulers & guides, quick mask overlay
js/ui/*.js            panels: toolbar, colour, brushes, layers, dialogs, menus, plus popup.js (pop-up palette),
                      command.js (Ctrl+K command palette) and selectmask.js (Select and Mask workspace)
js/main.js            start-up, keyboard shortcuts, drag & drop, paste, autosave
manifest.webmanifest  app name, icons and file types for the installed app
sw.js                 offline cache (generated — edit tools/sw-template.js instead)
icons/                app icons (redraw with python tools/make-icons.py, needs Pillow)
.nojekyll             tells GitHub Pages to serve the files as they are
tests/tests.html      self tests: open in a browser
tools/build-single.py bundles everything into dist/neon-draw.html
tools/build-pwa.py    regenerates sw.js with the current file list and version
tools/run-tests.mjs   runs tests/tests.html in headless Chrome (npm test)
.github/workflows/    GitHub Actions: lint + tests on every push, then publish to GitHub Pages
```

The scripts are plain `<script>` files sharing one global `ND` object, not ES modules. That is deliberate: browsers block modules on `file://`, and this setup is what lets a double-click on `index.html` work.

## Extending it

- **New brush preset:** add a line to `js/presets.js`. Every setting is listed in `DEFAULTS` in `js/engine.js`.
- **New stamp:** add `{ name, cat, draw: (x) => { … } }` to `js/stamps.js`. Draw in a 100×100 box; the helpers `C`, `E`, `P`, `RR`, `STAR`, `HEART` and `LEAF` cover most shapes.
- **New paper:** add to `TYPES` in `js/paper.js` (texture id from `js/textures.js`, roughness, tint, absorbency).
- **New scatter pattern:** add to `SPRITES` in `js/patterns2.js`. `make(rng)` returns a small canvas; `v` is the number of random variants.
- **New tiling pattern:** add to `TILES`. Use `mono: true` for white-on-transparent patterns that take the brush colour. Draw it so it tiles seamlessly.
- **New adjustment layer:** add to `KINDS` in `js/adjust.js`: `params` for sliders, `apply(imageData, params, env)` changes pixels in place. Fill layers use `fill: true` and are drawn in `renderFill`.
- **New layer effect:** add defaults to `js/effects.js` and draw it in `inner()` (on the layer) or `outer()` (behind it).
- **New filter:** add to the list in `js/filters.js`. Use `px(imageData, params, env)` for per-pixel work, or `cv(canvas, params, env)` to return a new canvas.
- **New brush tip or paper texture:** add to `DEFS` in `js/tips.js` or `js/textures.js`.

## AI models

Help ▸ AI models lists three background-removal models. They are not part of this folder: each user downloads the ones they want from Hugging Face the first time (stored in the browser, then offline).

| Model | Best for | Download | Licence |
| --- | --- | --- | --- |
| ISNet (general use) | products, animals, objects, people | 179 MB | Apache 2.0, commercial use OK |
| MODNet | people and portraits, fastest | 26 MB | Apache 2.0, commercial use OK |
| RMBG-1.4 (BRIA) | highest quality | 176 MB | non-commercial use only |

AI needs the web or installed version; browsers block it for a file opened from disk and in the single-file build. With WebGPU (Chrome, Edge) a picture takes about a second, on the CPU 2–40 s depending on the model.

## Releasing a new version

1. Bump `version` in `package.json`.
2. Run `python tools/build-pwa.py` (refreshes the offline file list and cache name in `sw.js`) and, if you ship it, `python tools/build-single.py`.
3. Upload. People who already have it open see an **Update ready** button; clicking it saves their work and switches to the new version.

If you skip step 2, installed copies keep running the old cached files.

## Checking your changes

- Open `tests/tests.html` in a browser. It should report all tests passing.
- Lint (needs Node.js): run `npm install` once, then `npm run lint`.
- Headless tests: `npx playwright install chromium` once, then `npm test`. GitHub runs both on every push if you use the workflow.

## Compatibility

- Opens `.ndraw` projects and the autosave from the earlier single-file version.
- Custom brush presets saved by the old version still load.
- Exports PNG, JPEG, WebP, layered PSD and OpenRaster (`.ora`). OpenRaster opens in Krita, GIMP and MyPaint, and can be imported again.
