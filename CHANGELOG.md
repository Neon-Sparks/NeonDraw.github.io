# Changelog

## 2.7.0 — tabs, smart objects, print colours, animation extras, more file types

- **Several documents at once.** Every new or opened file gets a tab at the top. Click to switch (each keeps its own zoom and position), double-click to rename, × or middle-click to close, drag to reorder, + for a new one. File ▸ Close document (Ctrl+Alt+W), Next / Previous document (Alt+PgDn / Alt+PgUp). Autosave keeps all open tabs.
- **Smart objects.** Layer ▸ Convert to smart object, or File ▸ Place image as smart object. Transform (scale, rotate, warp, distort) as often as you like — it is always redrawn from the original, so it never gets blurry. Whole-image scale, crop, rotate, flip and canvas size do the same. Double-click it (or Layer ▸ Edit smart object contents) to open the original in its own tab; Ctrl+S or closing that tab updates the layer. Filters on a smart object become editable filter layers. Painting on it, or Layer ▸ Rasterize, turns it into a normal layer (undoable). Saved in projects with its contents.
- **Print colours.** View ▸ Print preview (CMYK proof, Ctrl+Alt+Y) shows how the picture will look printed; Gamut warning (Ctrl+Alt+Shift+Y) greys out colours the press can't reach. Load your printer's or print shop's .icc profile (View ▸ Load printer profile) — it's remembered — or use the built-in approximate coated-press profile. File ▸ Export CMYK TIFF (for print) separates with the same profile.
  - Colour profiles: TIFFs with Adobe RGB / ProPhoto / other RGB profiles are converted to sRGB when opened; exported PNG, JPEG and TIFF files are tagged as sRGB so other apps show the right colours.
  - The picture is still edited at 8 bits per channel in sRGB (see the notes in the README).
- **Animation extras.**
  - **Motion (tweening):** the timeline's Motion button shows Move X / Y, Scale, Rotate and Opacity for the selected layer on this frame. Change a value to set a motion key (orange diamond); frames in between move and fade smoothly (ease in/out or linear). Works on still layers too.
  - **Sound track:** Sound… adds an audio file that plays with the animation, can start later (Starts at), and goes into WebM video export. Saved in the project.
  - **Per-layer onion skin:** the ◐ button on each layer row cycles "when active / always / never"; right-click it for that layer's before/after counts, strength and colours.
- **More file types.**
  - **TIFF**: open (8 / 16-bit, RGB, grey, palette, CMYK, uncompressed / LZW / Deflate / PackBits, strips or tiles) and save (RGBA with Deflate, or CMYK for print).
  - **PDF**: File ▸ Export PDF… at 72–600 dpi, JPEG or lossless, optionally one page per animation frame.
  - **Krita .kra**: open and save, with layers, groups, blend modes, opacity, visibility, locks and layer masks.
  - **Photoshop .psd export** now keeps **text layers editable** (text, font, size, colour, alignment) and **adjustment layers editable** (Brightness/Contrast, Levels, Curves, Hue/Saturation, Colour Balance, Exposure, Invert, Threshold, Posterize, Solid Colour fill), including their masks. Kinds Photoshop has no equivalent for are listed when you export.
- **Smoothing** now catches up with the pen as you slow down or hold still, and simply stops where the line is when you lift the pen (no straight line to the pen).
- **Perspective guides:** "Show perspective guides" now really hides them even while the Edit perspective tool is active (it switches back to the brush), and picking the edit tool shows them again.

## 2.6.1 — fixes

- **Colourise line art fills only the areas you scribble in.** Before, an area without a scribble took the colour of its neighbour, so one scribble could fill the whole picture. Now each scribble fills its own area up to the lines (and just under them, so there are no white halos) and never crosses a line; everything else stays empty. A scribble that slips over a line no longer spills into the next area.
  - If the layer you start from has no lines on it (for example an empty layer was selected), all visible layers are used as the line art. The new **Lines** button on the Colourise bar switches between "this layer" and "all layers".
- **Smoothing is much stronger and goes to 100%.** It now works like a pulled string: the line follows the pen at a distance and eases after it, measured on screen, so it feels the same on fast and slow computers and at any zoom. A faint dashed line shows the string while you draw; the stroke still ends exactly where you lift the pen.
- **View ▸ Show perspective guides** now adds a 2-point perspective when the picture has none (before, it silently did nothing), and its tick only shows when there are guides to show.
- **Rulers are on by default.**
- **Predict pen movement is off by default** (View menu to turn it on).
- Existing settings get the new ruler and pen-prediction defaults once.

## 2.6.0 — pen & vectors, colourise, animation, AI enlarge

- **Pen tool (P) and paths.** Click to place points, drag to make curves, click the first point to close, Enter to finish.
  - Edit by dragging points and handles. Alt+click a point switches corner/smooth, click a segment to add a point, Ctrl+drag moves the whole path, Backspace deletes a point.
  - Turn a path into a **selection**, **fill** it, **stroke** it with the current brush (with a pen-like pressure taper), or make a **vector shape layer**.
  - New **Paths** tab next to Layers. Paths are saved in the project.
  - The colour sampler shortcut is now **I**.
- **Vector shape layers** stay editable: change points, fill colour, stroke colour and width any time. Painting pixels on one turns it into a normal layer (undo brings the vector back).
- **Paint-like colour mixing.** Mixer, watercolour and bristle brushes mix like real pigment (blue + yellow = green). A "Colour mixing" setting switches back to plain RGB.
  - **Wet-in-wet watercolour:** strokes made while earlier ones are still wet bleed into them. Set how long paint stays wet with "Stays wet".
  - The Colour panel shows a **Paint mix** row from foreground to background colour.
- **Colourise line art (lazy brush).** Layer ▸ Colourise line art adds a Colour hints layer and a Flats layer. Scribble a little colour inside each area and the flats fill in up to your lines, under them (no white halos), closing small gaps. Updates after every scribble; white scribbles mean "leave empty". Done keeps the flats as an ordinary layer.
- **Smart filters.** Filters can stay editable as a filter layer clipped to the layer below ("Keep editable" in the filter window, or Filter ▸ New filter layer).
- **Text.** Drag sideways with the Text tool for a **paragraph box** that wraps (left, centre, right or justify). Click on a path to type **along the path**, with start position and lift sliders.
- **Animation.** View ▸ Animation timeline.
  - Draw on any frame; a drawing holds until the next one. Painting on an empty frame starts a new drawing (or copies the last one — your choice).
  - Onion skins (earlier drawings red, later ones green), play / loop, frames per second, length, drag drawings to other frames, , and . step frames.
  - File ▸ Export animation: **GIF**, **video (WebM)** or **PNG frames** (.zip). Animations are saved in .ndraw projects.
- **AI enlarge.** Image ▸ Enlarge with AI makes the picture 2× (fast, 8 MB model) or 4× (for photos, 53 MB) bigger with real detail. Both models are Apache 2.0. Works in tiles with progress and Cancel; one undo puts it back.
- **Faster.**
  - Special blend modes (Linear Burn, Vivid Light, Pin Light, Divide…) are blended on the graphics card when WebGL2 is available.
  - Filter previews run in a background worker so sliders stay smooth on big pictures, and Apply reuses the preview instead of working it out again.
  - Predicted pen points (Chrome): a thin preview line closes the gap between the pen and the stroke. Toggle in View.
- Fixes: path edits now appear in undo; text on a path is only picked up close to its curve; the timeline no longer breaks start-up when left open.

## 2.5.4 — drag panels between columns

- **Rearrange the right-hand panels by dragging their title bars.**
  - Move Colour, Brush presets, Brush settings, Adjustments or Properties up and down a column, or across to the other column. A blue line shows where the panel will land, and long columns scroll as you drag near their top or bottom.
  - In two-column mode the **Layers** panel has a grip (⋮⋮) in its tab bar: drag it to either column and it sits at the bottom there.
  - A plain click on a title still collapses or expands the panel.
  - An empty column shows "Drag panels here".
  - Your arrangement is remembered. View ▸ Right panels ▸ **Reset panel arrangement** restores the default.
- With one column, panels can be reordered the same way.

## 2.5.3 — right-hand panels in two columns

- **View ▸ Right panels ▸ 2 columns** puts Colour, Brush presets and Brush settings in one column and Adjustments, Properties and Layers in the other. The Layers panel gets more height and there's far less scrolling.
- Dragging the panel edge resizes both columns together. The choice is remembered.
- On windows narrower than 1000 px the panels go back to one column automatically and return to two when there's room.

## 2.5.2 — ISNet fix

- **Fixed: ISNet stopped with "ceil_mode … not yet implemented in the WebGPU MaxPool kernel".** One of ISNet's layers (pooling with "ceil mode") isn't supported by the graphics-card (WebGPU) engine yet, so ISNet now always runs on the CPU, which supports it. Expect about 10–40 seconds per picture; the model card says so.
- **Safety net for every model:** if a model hits anything the graphics-card engine can't run, Neon Draw re-runs it on the CPU straight away instead of showing an error, and remembers to use the CPU for that model from then on.

## 2.5.1 — tool panel layout, Hide panels fix

- **Tool panel in 1, 2 or 3 columns.**
  - Use the number button at the top of the panel, or View ▸ Tool panel.
  - **Automatic** (the default) picks the fewest columns that fit without scrolling.
  - With several columns the group names turn into thin dividers, and the colour swatches sit beside the quick-mask button, to save height.
- **Dock it left, dock it right, or let it float.**
  - Drag the panel by its top bar to move it anywhere over the canvas. It snaps to the top and bottom edges.
  - Drop it near the left edge, or next to the right-hand panels, to dock it there; a blue outline shows where it will snap.
  - The pin button switches between floating and docked.
  - The layout is remembered.
- **Fixed: Hide panels (Tab) hid the canvas too.** The canvas area now fills the whole window. A small "Show panels" button appears at the top right, and Tab still works.

## 2.5 — AI background removal and AI masking

### AI models (Help ▸ AI models)
- Download and manage three background-removal models. Each is downloaded once from Hugging Face, stored in your browser, and then works offline. Images are processed on your own computer and never uploaded.
  - **ISNet** (general objects, 179 MB): products, animals, objects and people. Apache 2.0, so free for commercial use.
  - **MODNet** (people & portraits, 26 MB): smallest and fastest. Apache 2.0, so free for commercial use.
  - **RMBG-1.4** (highest quality, 176 MB): usually the cleanest edges. **Non-commercial use only** under BRIA's licence, and the app says so wherever you pick it.
- Uses your graphics card through WebGPU where available (about a second per picture). Otherwise it runs on the CPU (2–40 s), in the background so the app never freezes. If a graphics driver returns a blank result, it automatically switches to the CPU.
- Downloads show progress, can be cancelled, and resume automatically if the connection drops.

### Using the AI
- **Layer ▸ Remove background with AI…** asks which model to use (with an option to stop asking), downloads it if needed, and hides the background with a layer mask. By default it also **refines and cleans the edges**: the edge is re-judged from colour so leftover background pixels drop out, and the old background's colour fringe is removed from hair and edges.
- **AI masks** on any layer, group or adjustment layer: **Layer ▸ AI mask: hide the background…** and **…hide the subject…**. For example, add a Curves layer and give it a subject mask to brighten only the person.
- **Select ▸ Select subject with AI…** and **Select background with AI…**.
- **Quick select tool ▸ AI objects**: each stroke selects the whole object the AI finds under it. Alt+stroke removes an object.
- **Select and Mask ▸ AI subject…** starts the workspace from an AI selection, ready for hair refinement.
- **Layer ▸ Refine & clean edges** works on any layer that has a mask.
- The quick non-AI Remove background and Select subject are still there, named "quick, no AI".

### Under the hood
- Bundles ONNX Runtime Web 1.30 (MIT licence) in `vendor/ort-1.30.0/`, so the AI engine doesn't depend on outside servers. It is cached together with the models for offline use.

## 2.4 — paper, colour harmony, more brushes, fixes

### Fixed
- **Sliders stopping mid-drag.** Dragging a layer's opacity slider, or a slider on an adjustment layer, recorded an undo step, which made the panel rebuild itself and delete the slider you were holding. Panels now wait until you let go before refreshing, so every slider drags smoothly from start to finish.
- **Oil Bristle and Dry Bristle stopped painting** after a short distance because each bristle ran completely out of paint. Bristles now thin out to a streaky dry-brush level but never stop. Long segments are drawn in small pieces, so dry-brush breaks look natural instead of blocky. Bristle brushes have a new **Dryness** setting.

### Paper and canvas
- **Choose a paper when you create a document**, or later with Image ▸ Paper & texture….
  - 17 surfaces: smooth Bristol, cartridge, sketchbook, newsprint, hot-press, cold-press and rough watercolour, laid charcoal paper, toned pastel paper, sanded pastel card, kraft, toned grey, black card, primed canvas, linen and gessoed board.
  - 16 paper tints, or pick your own colour.
  - **Roughness**, **Texture visible** and **Grain size** sliders.
- **The paper changes how each kind of brush behaves:**
  - Pencils, charcoal, pastels and crayons catch only the tooth of the paper, more so on rough paper and at light pressure.
  - Watercolour granulates into the paper's valleys, spreads and feathers further on absorbent paper, and keeps crisper edges on hard-sized paper.
  - Oil and acrylic bristles skip the valleys of the canvas weave.
  - Inks, airbrush and pattern or scatter brushes barely notice it.
  - Each brush has a **Paper response** setting (automatic by default) if you want more or less.
- **Erasing on the paper layer brings back the paper texture**, not a flat colour.
- The paper is saved in .ndraw projects.

### Colour harmony wheel
- New **Harmony** tab in the Colour panel.
  - Schemes: complementary, analogous, triadic, split complementary, rectangle, square, monochromatic, and shades & tints.
  - Drag any marker to rotate the whole scheme. Adjust **Spread** and **Value**.
  - Click a swatch to paint with it (Alt+click sets the background colour). **Save as palette** keeps the scheme.
- **Painter's wheel (RYB)** option, on by default: complements match paint mixing (blue ↔ orange, red ↔ green, yellow ↔ violet) instead of the screen's RGB wheel.

### More brushes and patterns
- **78 new brush presets (190 in total):**
  - Pencils: mechanical, 2H, 4B, graphite stick, graphite powder, blue sketch.
  - Pens: ballpoint, gel pen, fountain pen, dip pen, Sumi brush, stippling pen, comic inker.
  - Bristle and paint: round, hog, filbert, fan blender, acrylic flat, oil blender, glazing and gouache flat.
  - Watercolour: wet-in-wet, dry-brush watercolour, sable round, flat wash, splash wash.
  - Dry media: pastel side, pastel pencil, vine and compressed charcoal, sanguine, wax pencil, crayon scribble.
  - Airbrush: XL soft, grainy and hard airbrushes.
  - Texture: foliage, pine needles, rock, stipple shader, linen.
  - Pattern and scatter brushes, plus new FX glazes.
- **6 new brush tips:** filbert, fan, pastel side, stipple, scratchy vine charcoal, pine needles.
- **24 new scatter sprites:** rose petals, wildflowers, lavender, tulips, reeds, pine trees, tree canopy, seaweed, coral, raindrops, fireflies, glitter, galaxy stars, hatch marks, cross marks, hair strands, stitches, chain, rope, footprints, ink blots, candy, balloons and leaf litter.
- **23 new seamless patterns:** quatrefoil, trellis, seigaiha waves, scallops, houndstooth, hexagons, dotted grid, fishnet, rain, small leaves, knit, tumbling blocks, parquet, wood planks, terrazzo, marble, bathroom tiles, burlap, bamboo, carbon fibre, blue plaid, confetti dots and sand ripples.

## 2.3 — pop-up palette, Select and Mask, save in place, command palette

### New
- **Pop-up palette:** right-click the canvas (or press the pen's side button) for a ring of favourite brushes, your recent colours and a colour wheel right under the cursor.
  - Star (☆) any preset in the Brushes panel to add it. Right-click a slot to remove it, or click an empty slot to add the current brush. It holds up to 12.
  - Alt+right-click still picks a colour. View ▸ *Right-click opens the pop-up palette* switches back to the old behaviour.
- **Select and Mask (Select ▸ Select and Mask…, Ctrl+Alt+R, or the Quick select tool's button):** a full-screen workspace with a live preview.
  - **Edge detection radius** re-analyses the edge to pick up hair and fur. **Smooth**, **Feather**, **Contrast** and **Shift edge** refine the outline.
  - **Decontaminate colours** removes the background colour fringe from edge pixels.
  - Views: overlay, on black, on white, transparent, black & white (F cycles them). Click the picture for 100%, drag to look around.
  - Output to a selection, a layer mask, a new cut-out layer, or a new layer with a mask. With no selection it starts from Select subject.
- **Save in place (Chrome, Edge and the installed app):** Ctrl+S writes back to the same .ndraw file; the first save asks where.
  - **Save as** (Ctrl+Alt+S) picks a new file; *Download a copy* keeps the old download behaviour.
  - A ● in the title shows unsaved changes.
  - Files opened from File ▸ Open, drag and drop, or *Open with* remember their location, even after a restart (via autosave).
  - Other browsers download the file as before.
- **Open recent** in the File menu, up to 8 files. The browser may ask once for permission after a restart.
- **Command palette (Ctrl+K):** type to run any menu command, tool, brush, filter, adjustment, or jump to a layer.
  - Matches word starts and letters in order (e.g. "gblr" finds Gaussian Blur).
  - Shows your recent commands first.

### For developers
- **GitHub Actions** (`.github/workflows/deploy.yml`): lint and all self tests in headless Chrome on every push and pull request, then publish to GitHub Pages from main with a fresh offline-cache name each time. See DEPLOY.md.
- `npm test` runs the self tests headless (`tools/run-tests.mjs`). `tools/build-pwa.py --stamp` adds a build id to the cache name.

## 2.2 — install, PSD import, smart selection, speed

### Fixes you asked for
- **Patch tool:** just drag around the spot to select it, then drag the selection onto clean texture to patch. No need to switch to a selection tool first. Dragging inside an existing selection still patches straight away.
- **Perspective guides from the View menu** now show immediately (the Assistant tool is selected so you can drag the handles). A floating bar at the top right of the canvas has **Edit**, **Snap**, **Hide/Show** and **Remove**; the View menu has the same commands, and the assistant tool's button is now called *Remove all*.

### New
- **Open Photoshop files (.psd / .psb):** layers, groups (open and collapsed), layer masks, blend modes, opacity, visibility and clipping masks. 8- and 16-bit RGB, greyscale and CMYK; raw, RLE and ZIP compression. Flat files load from the merged image. Adjustment layers without pixels are skipped and the open message tells you how many. Works from File ▸ Open, drag and drop, and *Open with* in the installed app.
- **Quick select tool (A):** paint over an object and the selection snaps to its outline; keep painting to add, hold Alt (or pick *Subtract*) to remove. Sample the active layer or all layers.
- **Select ▸ Select subject:** finds the main object in one click.
- **Layer ▸ Remove background (as mask):** hides the background of the active layer with a layer mask, so nothing is lost. Paint white on the mask to bring parts back and black to hide more.
- **Installable app (PWA):** an **Install app** button, its own window and icon, works offline, opens `.ndraw`/`.psd`/`.ora`/image files from the desktop, and shows an **Update ready** button when a new version is uploaded (your work is autosaved first). Help ▸ *Install Neon Draw as an app* explains how on each browser.
- New app icon.

### Faster on big canvases
- Brushes that paint directly (smudge, mixer, clone, dodge/burn and similar) now back up only the tiles they touch instead of copying the whole layer when a stroke starts. Undo stores just the changed area.
- Stroke buffers clear only the area that was painted.
- **Liquify** works on 128-pixel tiles, loaded lazily, and commits just the changed region.
- Spot heal, red eye and content-aware fill read and store only the area around the fix.
- Selection bounds and marching ants scan a reduced copy first, then just the selected area (a 5000×3000 mask now takes about 10 ms).
- **Autosave** runs only when something changed, encodes layers in the background and stores them as compact image blobs. Older autosaves still load.
- **Save project** encodes in the background with a "Saving…" message instead of freezing the page.

### Fixed
- Clone tool in non-merged mode no longer copies the whole layer every stroke.

## 2.1 — photo editing, retouching and better brushes

### Layer masks and adjustment layers
- **Layer masks** on layers, groups and adjustment layers. Paint black to hide and white to reveal; you can blur and filter masks too. Add a mask from the selection; invert, apply, disable (Shift+click), turn a mask into a selection (Alt+click), and switch between layer and mask with `\`.
- **Adjustment layers** stay editable and maskable: Brightness/Contrast, Levels, Curves, Exposure, Hue/Saturation (with colorize), Vibrance, Colour Balance, Black & White (with tint), Photo Filter, Gradient Map, Selective Colour, Invert, Threshold, Posterize.
- **Fill layers:** Solid Colour and Gradient Fill.
- **Develop (photo) adjustment:** temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, clarity, dehaze, vibrance, saturation, sharpen, vignette, grain, plus **Auto tone**.
- **Adjustments & Properties panel** in the dock.
  - Curves editor: drag points on a live histogram, per-channel curves, presets.
  - Levels: histogram and Auto.
  - Colour balance by tone range, selective colour by range.
- **Layer styles (non-destructive):** drop shadow, outer glow, stroke (outside/centre/inside), inner shadow, bevel & emboss, colour overlay. An `fx` tag on the layer opens them.
- **Quick mask (Q):** paint a selection with any brush.

### Retouching
- **Spot healing brush (J):** paint over a blemish, and it's replaced with matching texture from nearby, blended seamlessly.
- **Patch tool:** drag a selection onto good texture. **Content-aware fill** (Shift+Backspace).
- **Red-eye removal.**
- **Liquify:** push, bloat, pinch, twirl both ways, smooth, restore. Apply / Reset / Cancel.

### Brushes
- **Taper out:** strokes thin out as you lift the pen (G-Pen, Brush Pen and the new Tapered Liner use it).
- **Oil bristle** rewritten: bristles carry their own paint, pick up and drag wet colour, splay under pressure, wobble and break up when dry. The beaded pattern is gone.
- **Watercolour** dries into a smooth, organic outline (no more scalloped dabs), with pigment pooling and granulation.
- **Colour mixer** carries a paint load that runs out, then smears what it picked up.
- **Dual brush:** a second tip breaks up the edge of the brush, as in Photoshop.
- **Pressure curve editor** with a draggable graph and presets (soft, firm, S-curve, inking).
- **Test pad** for trying a brush without touching the picture.
- **Custom brush tips** from a selection or an imported image.
- New presets: Tapered Liner, Dry Ink, Palette Knife, Scumble, Grainy Charcoal.
- **Gap-closing fill:** fill line art that has small gaps without leaking.

### Drawing aids
- **Rulers (Ctrl+R) and guides:** drag guides out of the rulers, move them with the Move tool, drag them back to delete. Shapes, selections, crops and gradients snap to guides, canvas edges and the grid.
- **Perspective assistants:** 1-, 2- and 3-point presets, vanishing points, parallel lines and straight rulers. Brush strokes snap to the nearest direction.
- **Editable text:** click a text layer with the Text tool to change its words and style.
- **Gradient editor** with custom colour and opacity stops, saved for reuse in the gradient tool, Gradient Map and Gradient Fill.

### Files
- `.ndraw` projects save masks, adjustment layers, layer styles, editable text, guides and assistants.
- PSD and ORA exports bake masks and layer styles into the layers. Adjustment layers can't be stored in those formats; the app tells you when this happens.


## 2.0 — multi-file rewrite

Rebuilt from the single bundled React file as readable plain-JavaScript modules that need no build step. All earlier features are kept, and old `.ndraw` files, autosaves and custom presets still open.

### Brushes
- 17 brush engines: pixel, airbrush (builds up while held still), spray, **watercolour** (even washes that dry with pooled wet edges, paper granulation, colour bleed and glazing), **bristle/oil**, **colour mixer** (picks up paint under the brush), **calligraphy nib**, **glow/neon**, **sketchy/harmony** (sketchy, shaded, web, fur), **hatching**, **pixel art** (aliased, pixel-perfect), smudge, **blur**, clone (aligned or merged), dodge, burn, eraser.
- **107 presets** in 12 searchable categories, each with a live stroke preview. Includes crayon, wax crayon, oil pastel, soft pastel, chalk, charcoal stick, conté, HB/6B/coloured pencils, G-pen, brush pen, felt tip, highlighter, gouache, sponge, cloud, smoke and rake.
- **21 tip shapes** (chalk, charcoal, bristle, flat, sponge, splatter, hair, dry brush, watercolour blob…) and **12 seamless paper textures**. Light pressure catches only the tooth of the paper.
- Dynamics: pressure curve, minimum size, taper-in, speed thinning, size/opacity/angle jitter, hue/saturation/value jitter, rotation that follows the stroke, random rotation, or pen tilt.
- Pattern fill: paint any tiling pattern through the brush, aligned to the canvas.
- **48 scatter patterns**, up from 5 (autumn leaves, ivy, fern, bushes, moss, sakura, daisies, confetti, bubbles, bokeh, snowflakes, rain, clouds, smoke, embers, flames, lightning, fur, feathers, butterflies, birds, fish, ladybirds, paw prints, coins, gems, shells, rubble, gravel…), with optional tinting.
- **49 tiling patterns**, up from 8 (honeycomb, scales, herringbone, basketweave, cobblestones, tartan, argyle, denim, camouflage, leopard, zebra, giraffe, greek key, circuit, stone wall, red bricks, water, grass…). You can also define your own from a selection.
- Symmetry: vertical, horizontal, quad, **radial (2–24)** and **kaleidoscope**, with on-canvas guides.
- Each brush has its own blend mode. The eraser mode remembers its own size. Shift+click draws a straight line, Alt+wheel resizes the brush, and the stabiliser catches up to the pen at the end of a stroke.
- Save, import and export your own presets.

### Stamps
- **93 vector stamps**, up from 8, in categories: nature, sky, animals, food, objects, celebration, symbols, shapes. They stay crisp at any size.
- Stamp library with search. Click to place, or drag to set size and rotation. Paint-with-stamps trail mode.
- Colour modes: original, tinted with the foreground colour, or a solid silhouette.
- Make your own stamps from a selection or an imported image (saved in the browser).

### Tools
- New: polygon/star shape, polygon lasso, colour selection (wand with Contiguous off).
- Shapes: fill and/or outline, line width, rounded corners.
- Line tool can draw with the current brush, so curves can be watercolour, crayon and so on.
- Fill: sample all layers, grow 0–8 px to hide anti-aliased halos, fill with background colour or pattern (scalable).
- Gradients: linear, radial, angle, diamond and reflected; 10 colour presets; repeat/mirror; dithering against banding.
- Text: multi-line, alignment, bold/italic, letter spacing, outline, shadow, arc/wave warp. Placed on its own layer by default.
- Transform: edge handles, drag outside the box to rotate (Shift snaps), flip, rotate 90°, fit to canvas, smoother **warp**, new **distort** (four-corner) mode. The selection moves with its pixels.
- Crop: editable crop box with handles, rule-of-thirds guides, aspect presets, trim transparent, crop to selection.
- Move tool moves only the selected pixels when there is a selection. Arrow keys nudge.
- Colour sampler: sample all layers or the current layer, average area. Right-click samples from any tool.

### Layers
- Proper group tree: drag & drop to reorder or move into groups; collapsible groups.
- **Clipping masks**, solo visibility (Alt+click the eye), rename by double-click, right-click menu.
- Layer via copy/cut, merge visible, flatten, a new-group button, and visible flags for blend mode and opacity.

### Selection
- Add, subtract and intersect with modifier keys; feather on create; anti-aliasing.
- Proper marching ants on every selection; reselect; stroke selection.
- Grow, shrink, border and feather open a small dialog instead of a browser prompt.

### Editing & files
- Cut, copy, copy merged, paste and paste in place, including images from other apps and screenshots.
- Drag & drop images (added as layers) or projects (opened).
- Export a **layered PSD** (was flattened only), **OpenRaster .ora** (export and import), WebP, the active layer, or the selection.
- Canvas size with anchor, scale by %, rotate 180°, flip.
- Autosave also runs when the tab is hidden; a "Welcome back" dialog lets you start fresh.

### Filters (20 → 44)
- Every filter dialog now has a **live preview**. Ctrl+F repeats the last filter.
- New: levels, hue/saturation/lightness (with colorize), temperature/tint, vibrance, exposure, solarize, gradient map, colour-to-alpha, box/zoom/spin blur, median, clarity, ink lines, film grain, oil paint (Kuwahara), halftone, glow/bloom, chromatic aberration, retro dither, wave, twirl, pinch/bulge, offset (for seamless tiles), render clouds, outline, drop shadow.

### Interface
- Consistent SVG icon set. A context-sensitive options bar for every tool.
- Sliders have typeable values that you can also drag to scrub.
- Collapsible, resizable dock.
- Colour panel: square, **wheel** and **HSV/RGB sliders**; screen eyedropper; recent colours.
- **Palettes**: 10 built in (PICO-8, Game Boy, watercolour pigments, skin tones…), your own palettes, extract a palette from the image, and GIMP `.gpl` import/export.
- Navigator with draggable view box, zoom and rotation sliders.
- History panel with memory usage; undo memory is now capped by size, not only by step count.
- Reference image window: pick colours from it, zoom, pan, opacity.
- Pixel grid at high zoom, configurable grid, wrap-around mode, hide panels (Tab), full screen.
- Status bar: editable zoom, rotation and mirror toggles.
- Touch: pinch zoom, two-finger tap to undo, palm-friendly "touch pans once a pen is used" mode.

### Performance
- Normal blend modes composite on the GPU.
- Only changed areas are re-uploaded to the screen each frame.
- Drawing stops when nothing changes.
- Scratch canvases avoid a costly full-image copy that made big documents sluggish.

### Fixes
- `W` now selects the wand, as the help screen always said. Wrap-around moved to Shift+W.
- Mouse strokes are no longer drawn at half size.
- Collapsed groups now hide their own contents, not the layers below them.
- Tiling patterns used as brush tips no longer smear; they are painted as aligned fills.
- Selections now mask live stroke previews, smudge, dodge and burn.
