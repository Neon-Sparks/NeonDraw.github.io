# Neon Sparks Draw

A layered painting and photo-editing app that runs entirely in the browser: no server, no build step, nothing uploaded anywhere.

One folder gives you three ways to run it:

- **On your PC:** double-click `index.html`.
- **On the web:** upload the folder to GitHub Pages or any web host (see [DEPLOY.md](DEPLOY.md)) and open the address.
- **As an installed app:** open the web version in Chrome, Edge or Safari and click **Install app** in the top bar (or Help ▸ Install). It gets its own window and Start-menu/Dock icon, works offline, and can open `.ndraw`, `.psd`, `.ora` and image files directly.
- **Single file:** `dist/neon-sparks-draw.html` is the same app bundled into one file (no offline install). Rebuild it with `python tools/build-single.py`.

## Folder layout

```
index.html            page shell, loads the scripts in order
css/app.css           all styling (colours are CSS variables at the top)
js/util.js            helpers (canvas, colour maths, noise, tiny DOM builder)
js/icons.js           SVG tool and UI icons
js/blend.js           blend modes (per-pixel maths)
js/gpu.js             WebGL2 blending for the special blend modes (falls back to blend.js)
js/gpufx.js           WebGL2 layer styles (shadow, glow, stroke, bevel…) and Gaussian blurs, with a speed check
js/document.js        document model: layer tree, masks, compositor, undo history, strokes
js/effects.js         non-destructive layer styles (shadow, glow, stroke, inner shadow, bevel, overlay)
js/adjust.js          adjustment & fill layers, curves/levels maths, histogram, Develop panel maths
js/heal.js            spot healing / patch / content-aware fill, red-eye, Liquify
js/selection.js       selection masks: wand, grow/shrink/border/feather, marching ants
js/filters.js         filters (adjust, blur, enhance, edge, artistic, distort, render)
js/fworker.js         runs filters in a background worker (filter-worker.js) when the browser allows it
js/pigment.js         paint-like colour mixing (Kubelka-Munk): blue + yellow = green
js/paths.js           Bézier paths and vector shape layers (geometry, drawing, sampling)
js/colourise.js       Colourise line art (lazy brush): flats from colour scribbles
js/anim.js            frame-by-frame animation: keyframes, motion tweening, onion skins, GIF encoder
js/smart.js           smart objects: original + placement (matrix or warp mesh), edit contents, rasterize
js/brushimport.js     reads Photoshop .abr, Krita .kpp / .bundle and GIMP .gbr / .gih brushes
js/formats.js         TIFF open/save, PDF save, Krita .kra open/save, editable text & adjustments in PSD export
js/colour.js          colour management: ICC profiles, CMYK print preview, gamut warning, sRGB tagging
js/channels.js        channels: paint on / view only some colour channels; alpha channels (saved selections)
js/deep.js            16-bit documents: float16 canvases, lossless storage, 16-bit PNG, adjustments & filters at 16-bit
js/lang.js            menu languages (English + 10 translations, same order as the English list)
js/lang-ui.js         interface text (panels, tooltips, hints, dialogs) in the same 10 languages, same order as UI_EN
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
                      command.js (Ctrl+K command palette), selectmask.js (Select and Mask workspace),
                      pen.js (Pen tool & Paths panel), colourise.js (Colourise bar), timeline.js (animation)
                      tabs.js (document tabs), airemove.js (AI remove tool) and options.js (Options menu,
                      workspaces, graphics card status), aiextend.js (AI canvas extension, content-aware move),
                      panels2.js (Gradients and Retouch panels), actions.js (record / play / batch actions)
                      i18n.js (translates the interface live into the chosen language) and channels.js (Channels tab)
js/main.js            start-up, keyboard shortcuts, drag & drop, paste, autosave
manifest.webmanifest  app name, icons and file types for the installed app
sw.js                 offline cache (generated — edit tools/sw-template.js instead)
icons/                app icons (redraw with python tools/make-icons.py, needs Pillow)
.nojekyll             tells GitHub Pages to serve the files as they are
tests/tests.html      self tests: open in a browser
tools/build-single.py bundles everything into dist/neon-sparks-draw.html
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
- **New interface text:** write it in English as usual. To translate it, add the English to the end of `UI_EN` in `js/lang-ui.js` and the translation to the end of each language's list (all lists must stay the same length — the self tests check this). Menu labels go in `js/lang.js` the same way. Text that changes (numbers, names) can use a sentence template in `UI_TPL` with `{slots}`. Names people type (layers, paths, documents) are never translated.

## AI models

Help ▸ AI models lists three background-removal models and two upscalers (Image ▸ Enlarge with AI). They are not part of this folder: each user downloads the ones they want from Hugging Face the first time (stored in the browser, then offline).

| Model | Best for | Download | Licence |
| --- | --- | --- | --- |
| ISNet (general use) | products, animals, objects, people | 179 MB | Apache 2.0, commercial use OK |
| MODNet | people and portraits, fastest | 26 MB | Apache 2.0, commercial use OK |
| RMBG-1.4 (BRIA) | highest quality | 176 MB | non-commercial use only |
| Swin2SR ×2 (lightweight) | enlarging 2×, fast | 8 MB | Apache 2.0, commercial use OK |
| Swin2SR ×4 (real-world photos) | enlarging photos 4×, removes blur and JPEG blocks | 53 MB | Apache 2.0, commercial use OK |
| MI-GAN | AI remove tool, fast | 28 MB | MIT, commercial use OK |
| LaMa | AI remove tool, best quality | 208 MB | Apache 2.0, commercial use OK |

AI needs the web or installed version; browsers block it for a file opened from disk and in the single-file build. With WebGPU (Chrome, Edge) a picture takes about a second, on the CPU 2–40 s depending on the model.

## Colour and bit depth

Documents can be 8 or 16 bits per channel (File ▸ New, or Image ▸ Mode). 16-bit documents use the browser's 16-bit floating-point canvases (Chrome / Edge; other browsers fall back to 8-bit): painting, blending, opacity, masks, gradients, transforms and layer compositing keep smooth tones, projects and autosave store the pixels losslessly, and 16-bit TIFF / PNG can be opened and saved. Adjustment layers and filters work at 16-bit precision too, and 16-bit Photoshop and Krita files open and save with all 16 bits. The working colour space is sRGB; colour management covers RGB profiles on open, sRGB-tagged exports, a CMYK print preview / gamut warning with your printer's ICC profile, and CMYK TIFF export.

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
