# Erazer

A **bitmap UI screenshot → EVG layout** tool, written in
[Ranger](https://github.com/terotests/Ranger). Ranger's EVG library already has
[`EvgBitmapTracer`](https://github.com/terotests/Ranger/blob/master/lib/evg/EvgBitmapTracer.rgr) for photographs: it follows ink
and emits paths. Erazer looks at the same pixels and asks a different question —
which **widgets** are here, how they nest, and what EVG tree would reconstruct
the screen.

**License: AGPL-3.0-or-later** (see `LICENSE`). The icon recogniser's
weights are trained on [Lucide](https://lucide.dev) (ISC) and Google's
[Material Symbols and Material Icons](https://github.com/google/material-design-icons)
(Apache-2.0); see `ErazerIconWeights.rgr`.

Live page: <https://terotests.github.io/Erazer/>

## Building

The sources expect to sit at `gallery/erazer/` inside a Ranger checkout: they
use Ranger's compiler (`dist/rgrc.js`), `lib/evg`, `lib/image` and the test
harness under `gallery/game_engine/v2/tests/harness/`.

```sh
git clone https://github.com/terotests/Ranger
git clone https://github.com/terotests/Erazer Ranger/gallery/erazer
cd Ranger
node gallery/erazer/web/build.mjs --out _site   # the live page
```

`.github/workflows/pages.yml` does the same on every push to `main`: it takes a
sparse, shallow checkout of Ranger (`compiler/`, `lib/`, `dist/`,
`scripts/`, the test harness — no `npm ci`), places this repository at
`gallery/erazer`, runs the tests and the bundle smoke test, and deploys the page
to GitHub Pages. The Ranger ref is `RANGER_REF` in the workflow (`master`);
a manual run can override it.

## What it looks for

| Kind | How it is guessed |
| --- | --- |
| Nested panels | Connected components of similar colour, then bbox containment. A region grown from a flat seed uses the tight `surfaceTol` (8), so a white card on an off-white page is its own panel; it may drift further (`surfaceDrift`) in small steps over flat pixels, so a blurred or gradient backdrop stays one surface |
| Layers | Where two region boxes cross (neither holds the other), the one holding fewer regions is `backdrop` — a piece of the page's own surface between cards. Backdrop goes into one `underlay` node, the page's first child, drawn under the content; nothing nests inside it |
| Text | Small ink runs clustered onto a baseline; font size from glyph height, colour from the ink. Touching fragments (an anti-aliased letter's core, fringe and counter) are joined first |
| Not text | A run inside a switch, checkbox, slider or icon is part of the control (a knob's shadow crescent) and is dropped. A single tall mark far above the page's median font size, or ink within 24 luma of the pixels just outside it, becomes a `shape`: geometry and colour, no text |
| Corners and fills | Border radius from the four corners' diagonal inset (× 3.41, median of the corners). A big surface whose first and last quarters differ gets a two-stop `gradient-from` / `gradient-to` / `gradient-dir`. A child the colour of its parent (a row on its card) emits no fill of its own |
| Characters | A 5×7 atlas (the same face the tests paint with). On a real screenshot the run, size and colour still land; a reading whose cells match the atlas poorly is dropped rather than shown as noise |
| Button | Compact rectangle, centred label, often an accent fill. Several same-row chips of the same height and fill with one-line labels are promoted together, even when one is too wide or OCR-split to classify alone |
| Text field | Wide light rectangle, left-aligned text or empty interior, optional border |
| Checkbox | Small square, solid or a hollow frame, with nothing beside it that says otherwise. A square with a caption centred under it and none on its right (a tab bar), or centred in a badge twice its size, is an icon — unless it is one flat fill (a chart bar) |
| Switch | A pill about twice as wide as tall with a round knob at one end |
| Slider | Wide thin track with a circular thumb on the bar, or a filled part beside an empty one. A lone thin bar (a home indicator, a divider) is not a slider |
| List rows | Hairlines across most of a card split it into `listitem` rows; bands stacked edge to edge are rows too. The card becomes a `list` |
| Tabs | Three or more sibling labelled bars on one row |
| Menu | Three or more stacked labelled rows |
| Form | A panel that holds two or more fields |
| Image | A box with no text whose pixels are many colours, neither its own nor the background around it (a profile photo, a game's tile): it becomes an EVG `img` with `src` `source#xywh=x,y,w,h` — that window of the analysed screenshot (the JSON writer keeps `src`; it has no field for a view box). OCR read on a photo is dropped |
| Icon | A small non-text mark; vectorized with `EvgBitmapTracer` to SVG / EVG paths. The crop is traced as ink (black) against the colour around the box (white), so a white icon on an orange button is traced as the icon; the EVG node paints no box, border or radius of its own and its paths take the ink colour |

The EVG tree uses `position: absolute` so the reconstruction keeps the
screenshot's geometry. To see the reconstruction, render the result:
`node gallery/pdf_writer/bin/evg_png_tool.js out.evg.json out.png -w W -h H`
(build it once with `npm run agent:render`; the name must end `.evg.json`).
Each node carries `class-name` `erazer-button`,
`erazer-textfield`, `erazer-checkbox`, `erazer-tab`, `erazer-menu`, …
so a later pass can restyle it.

## Text from an outside OCR

The built-in reader knows only the 5×7 test face. For a real screenshot
the live page has **Lue teksti (OCR)**, on by default (a viewer who
turns it off keeps it off): it loads
[Tesseract.js](https://github.com/naptha/tesseract.js) from jsDelivr on
first use (about 5 MB, then cached by the browser), reads the image in the
browser and hands the words to Erazer. The image still does not leave the
machine. On the command line, give Tesseract's own TSV:

```sh
tesseract shot.png words tsv            # writes words.tsv
npm run erazer -- shot.png out.evg.json --words words.tsv --outline
```

Each OCR line, split where a gap is wider than two word heights (the
smaller of the two neighbouring words, and at most 1.5 × the page's usual
word height, so two captions whose boxes both took in the icons above them
stay two), becomes
a label in the smallest box that holds it. The region pass's runs and
letter pieces under it go. A word inside a control (a switch knob read
as "J"), a word mostly on a control (a tab icon read as "a"), a short
word centred in a small badge (a chart glyph read as "all"), a lone tall
character, one character at the image edge (a frame's rounded corner),
and words under `--wordMinConf` (55) are dropped — unless the word is at
least `--wordLowConf` (25) and the region pass found a text run under it
(Tesseract.js reads "Wed" at 38%). A word at 90%+ with three letters or
more is text even where the region pass boxed its letters as a checkbox
or icon; that box goes, and a checkbox under OCR text is never promoted
to a named icon; a word box
that reaches up into a control starts below it. The label's height comes from its ink, and its CSS `font-size`
from that height and the letters it has (ascenders, descenders). Every
label gets a `text-align`: an edge it shares with a sibling label (the
lines of a paragraph), otherwise the side of its container it hugs, or
`center` when both margins match. A label just under a box and centred on
it (an icon's caption) is `center`.

The page draws the EVG tree back as plain DOM under **Rekonstruktio**, so
text, alignment, radii, gradients and traced icons (inline SVG in the ink
colour, the recogniser's name on hover) can be checked against the
screenshot. When Tesseract.js cannot be loaded the run goes on without
words.

The live page is laid out like a design tool:

- **top bar**: pick, photograph or paste (Ctrl/⌘+V) a screenshot, or drop
  it anywhere; OCR on/off and its language; **Lataa EVG JSON**;
- **left, Tasot**: the detected tree (role and text / icon name per row);
  **Näytteet** holds the synthetic and HTML / shadcn samples;
- **centre**: **Tunnistettu** (the image with Erazer's boxes) and **EVG**
  (the tree drawn back as DOM: text, alignment, radii, gradients, traced
  icons in their ink); a floating bar at the bottom zooms (− / % / + /
  **Sovita** / **1:1**, also Ctrl/⌘ + wheel and `+` `-` `0`) and sets the
  image's opacity;
- **right, Design**: the selected element's type, text, X / Y / width /
  height, font size, colour, alignment, background, radius, an icon's name
  and ink colour, all editable; **Poista** or Delete / Backspace removes
  it, **Valitse vanhempi** selects its parent, Esc clears. **Raw** shows the
  outline and the EVG JSON, **Layout** the layout-net lab below.

An element is one selection everywhere: a box in the image, the element in
the EVG view and its row under Tasot share an id (`n12`, the EVG element's
`id` and the overlay box's `data-node`). Edits change the EVG JSON; a
deleted element's box is hidden in the image view too.

The OCR language defaults to **englanti + suomi** in a Finnish browser:
English alone reads "Lisää" as "Lisaa" at 51% and it is dropped.

## Busy pages: card by card

One pass over a whole social feed mixes everything's statistics: the
median line height, the background around a word, what counts as a big
mark. So after the first pass every clearly bounded card — its own fill
against its parent's or a border, two or more texts inside, at most 60% of
the page — is analysed again on its own crop, with the OCR words that fall
in it, at the same scale, and that subtree replaces the card's
(`refineCards`, one level deep).

Siblings are drawn largest first and text last, so a big surface never
hides a smaller element's content. A word box's ink trim keeps at least
40% of the box and measures contrast at the 90th percentile, so a box
that takes in a photo's edge does not become a 3px label; one or two
characters nearly twice the page's line height (a badge read as "Ld") are
dropped; a backdrop has no corner radius.

Two panels of one colour and width stacked with a hairline between them
(an app's body and its tab bar) are one panel, and the page showing
through a rounded frame's corners (small textless boxes touching two of
its edges) is not part of it. One or two characters OCR is not sure of
whose box is mostly solid ink are an icon read as letters ("0" for a
video icon, "as" for two person silhouettes) and are dropped before
words are joined into lines. A card's own analysis replaces any of the
first pass's words that fell inside it, so a word is not there twice.

## Icon names

Each icon (and each "checkbox") is named by a small network in
`ErazerIcons.rgr`: `home`, `settings`, `bell`, `user`, `chart`,
`package`, `clipboard`, … 96 classes, one of them `none` (a bar, a disc,
a swatch). A checkbox the network is at least 85% sure is some other icon, and
at least 14 px on both sides (a letter pair left as a checkbox is not),
becomes an icon. A name is given at 80% or more
(`ErazerOptions.iconMinConf`), and shows up as `name=bell 99%` in the
outline, `icon bell` in the overlay, the class `erazer-icon-bell` in
the EVG tree, and on the live page after the counts line's `icon N`
(`(bell 99%, home 99%, …)`, or `ei tunnistettuja ikoneita` when none is
named). `--nameIcons false` turns it off.

The input is the icon's box as a 24×24 map of how much each cell is the
icon's ink rather than the background around it, fitted into 20×20,
followed by 31 shape features of that map:

| Features | |
| --- | --- |
| 4×4 fill | share of ink in each of 16 cells |
| symmetry | left–right and top–bottom, 0..1 |
| centre of gravity | x, y and the spread around it |
| straight lines | horizontal and vertical runs of 8+ cells; touching rows count once |
| bands | ink separated by empty rows, by empty columns |
| aspect, ink | the source box's w / (w + h) (the fit loses it), total ink |
| pieces, holes | separate pieces of ink; enclosed background (a lock's keyhole) |
| stroke | ink cells per outline cell: an outline icon from a filled one |

Then 607 → 192 (ReLU) → 96 (softmax), weights stored as 12-bit integers.

It is trained by `tools/icons/train.mjs` (not part of the build):

```sh
cd tools/icons && npm install
npm run train                       # a few minutes; writes ../../ErazerIconWeights.rgr
node train.mjs --check shot.png 51,957,25,22,#3762e3     # name boxes of a real screenshot
node parity.mjs ../../web/dist/erazer.js shot.png 51,957,25,22,#3762e3   # Ranger input == JS input
```

Each concept is drawn with resvg from Lucide's outlines (stroke width
varied, a third filled), Material Symbols (outlined, rounded, sharp;
plain and filled; weight varied) and the older Material Icons, at 14–56 px
in random colours, 300 samples a concept. A third of the samples are boxed
around the icon's largest piece only, as Erazer's region pass boxes a bell
without its clapper. Held-out synthetic accuracy is 92.8%. On a phone
screenshot's tab bar and shortcut row, 7 of 8 icons are named right at
98–99%; the eighth (an orders glyph none of the sets has) scores 72% and
stays unnamed.

Lucide alone did not know an app's solid icons: a filled outline has
nothing cut out of it, a Material bell has its clapper cut out of the
fill, and the bell came back "home". The older Material house is wider
than the Symbols one, and without it the tab bar's home came back "star".

## Layout net (geometry, not pixels)

Erazer already has primitive boxes and a widget type. A second, tiny
network ranks **groups** of those boxes:

```
primitives → em / relative features → 2-layer MLP → list | form | toolbar | …
```

Grouping stays heuristic (same edge, regular gap, repeating child
pattern). Candidates only group boxes that share a container, a column
breaks where a gap is wider than three em, and each container's direct
children are one more candidate (a row's label and switch). The net only names a candidate and returns an abstract
structure: axis, item count, alignment, spacing in `em`, member
indices. A guess whose outline cuts through a box it does not hold, or
partly overlaps a stronger guess, is dropped, and so is a column of
titles and subtitles that starts or ends mid-row (a member's neighbour
outside the group is nearer than the members are to each other). A user selection plus a name is one training point; gap,
scale, font-size and leave-one-out jitter expand it to a dozen
samples, with axis-flips as hard negatives.

The live page (**Layout** tab open, where a click on a box picks it
instead of selecting it): click boxes, pick `lista` / `toolbar` / a new concept,
**Opeta valinta**. Or **Rakenna HTML-testsetti**: it renders the known
widgets from `web/components.html`, records DOM boxes, rasterises HTML →
PNG, vectorises with Erazer, and stores labelled samples in IndexedDB.
When at least 8 samples exist, **Kouluta WebGPU:lla** trains the same
tiny 40→32→8 net (CPU fallback if the adapter is missing). **Tallenna
malli** / **Lataa malli** keep weights in IndexedDB, `localStorage`, or a
`.txt` file.

A fine-tune **continues from the weights the page is already predicting
with**, and the eight synthetic archetypes ride along in the corpus. The
HTML fixtures cover six of the eight classes and carry three toolbars
against one of everything else, so a run that starts from random weights
on those alone forgets the rest: a four-label column came back `nav` at
100% and the archetypes fell from 8/8 to 2/8 — saved to IndexedDB, so one
click degraded the page until site data was cleared.

The run is then **scored before it is adopted**, over the archetypes and
every recorded sample. A candidate that loses ground on either is
reported and thrown away; the weights on the page do not move. `npm run
erazer:web:lab` drives that whole path in a real browser.

## Commands

Run from the Ranger checkout root; the scripts are in Ranger's `package.json`.

```sh
npm run erazer:test                 # synthetic UI fixtures (form, tabs, menu, icon)
npm run erazer -- in.png out.evg.json
npm run erazer -- in.png out.evg.json --overlay boxes.svg --outline
npm run erazer -- in.png out.evg.json --words words.tsv   # tesseract in.png words tsv
npm run erazer:web:serve            # live page at http://localhost:8008/
npm run erazer:web:smoke            # the bundle's exports, in Node
npm run erazer:web:lab              # the live page, in a browser: capture + train
npm run erazer:shots                # HTML widgets + live-page PNGs
```

`--ocr false` still reports where the text is and how tall and what colour;
it skips the atlas. `--vectorizeIcons false` leaves icons as labelled boxes.

The live page paints the same fixtures the tests use — a form, tabs, a menu,
a plus icon, a chip row, sliders — and accepts a PNG/JPEG/WebP from the file picker, the camera,
a paste (`Ctrl/⌘+V` or the **Liitä** button) or a drop. Nothing is uploaded.
On a phone **Valitse kuva** opens Kuvat; a screenshot can be pasted after a
long-press. Live on GitHub Pages:

<https://terotests.github.io/Erazer/>

## What it looks like

Live page, synthetic 5×7 form (the same fixture the tests paint):

![Erazer live demo, form](shots/demo-form.png)

Three tabs, labelled File / Edit / View:

![Erazer live demo, tabs](shots/demo-tabs.png)

HTML/CSS widgets (login, settings, tabs, menu, toolbar, dialog, buttons, nav)
with Erazer's overlay on top:

![Erazer on HTML UI components](shots/html-components.png)

A login form screenshot in the live page:

![Erazer live demo, HTML login](shots/demo-html-login.png)

Dark **shadcn/ui**-shaped widgets (zinc cards, pill buttons, nav, bar chart, balance):

![Erazer on shadcn/ui](shots/shadcn-ui.png)

The full dashboard overlay:

![Erazer overlay on a shadcn dashboard](shots/shadcn-dash-overlay.png)

The same dashboard in the live page (`?png=shadcn-dash.png`):

![Erazer live demo, shadcn dashboard](shots/demo-shadcn-dash.png)

## Files

| File | |
| --- | --- |
| `Erazer.rgr` | region grow, nesting, heuristics, EVG emit |
| `ErazerTypes.rgr` | options, regions, the result tree |
| `ErazerLayout.rgr` | em-features, candidate groups, 2-layer MLP |
| `ErazerIcons.rgr` | icon recogniser: input map, shape features, the net |
| `ErazerIconWeights.rgr` | its weights (generated by `tools/icons/train.mjs`) |
| `tools/icons/` | the trainer, `prep.mjs` (the same input in JS), `parity.mjs` |
| `ErazerFont.rgr` | 5×7 face: paint and read |
| `ErazerPaint.rgr` | synthetic UI-library screenshots |
| `erazer_cli.rgr` | PNG/JPEG in, `.evg.json` out |
| `ErazerTest.rgr` | the fixtures, asserted |
| `web/layout-lab.js` | HTML fixtures → boxes → WebGPU/CPU fine-tune, with the adoption gate |
| `web/lab-check.mjs` | the lab driven in a real browser |
| `web/` | the live page |
| `web/layout-lab.js` | HTML test-set capture + WebGPU trainer |
| `web/components.html` | HTML/CSS widgets for `erazer:shots` |
| `web/shadcn.html` | dark zinc shadcn/ui-shaped dashboard |
| `shots/` | captured PNGs the live page can load |

It is a heuristic. A photograph of a Mac settings panel will not come back as
production TSX. The claim the tests make is narrower and checkable: when the
input is a form, the tree has fields, a button, a checkbox and the labels
`Name` / `Email` / `OK`; when the input is three tabs, there are three tabs.
