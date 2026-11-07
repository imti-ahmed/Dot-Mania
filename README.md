# Dot Mania

An animated dot-grid editor. Draw on a grid of dots (or turn a picture into dots), choose how they move, give them a color, and export the result as a GIF, PNG, video, or a small web component you can drop into any website.

## Features

- **Draw** on a 16px grid with the pen, shape, circle and fill tools. Hold `Shift` with the pen for a straight line. The eraser (`E`) or right-click drag erases. Undo with `Ctrl+Z`.
- **Pictures:** upload an image and it becomes black-and-white dots.
- **Paused by default:** the studio opens paused, so what you draw shows exactly as drawn. Press **Play** (or `Space`) to run the animation; Pause goes back to the drawing as it is.
- **Animations:** 15 presets (Shimmer, Pulse, Ripple, Wave, Spiral, Scan, Rain, Beats, Breathe, Sweep, Flicker, Zigzag, Reveal, Bars, Dissolve). Turn on **Stacking** to run up to 3 together; the first one you click is the base and each next one shapes it.
- **Color:** gradient palettes, solid colors, and a custom color picker.
- **Canvas sizes:** wide (1920x1080) or square (1080x1080, a 67x67 grid).
- **Randomize** a whole new piece in one click.
- **Export:** GIF, PNG, WebM, MP4, or a dependency-free HTML file. A **Quality** option sets GIF size and video quality. Exported HTML files can be reopened with **Open HTML** to keep editing.

## Closed beta

Visitors land straight in the editor, with a welcome popup over it: a live preview, a short intro, and the buttons **Let's Go**, **How to use** and **Feedback**. It shows on the first visit, then not again until 5 hours after it was dismissed (kept in the browser). Add `?welcome=0` to the address to skip it, or `?welcome=1` to see it again. Turning the `welcomeOnce` flag off makes it show on every visit.

A separate welcome page that sits in front of the editor is built but switched off (the `homePage` flag).

## Run it

It is a static site: no build step, no dependencies.

```
python -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly also works, but the page addresses and some features need a server.)

The pointer over the canvas is a small square with a dot. The other pointer styles are still in the code: add `?flags=pointerOptions` to get a picker in the Edit tab, or `?cursor=ring` (also `dot`, `plus`, `fine`, `target`, `frame`, `diamond`, `pen`, `crosshair`).

Add `?flags=all` to the address to switch on features that are currently hidden, for example `http://localhost:8000/?flags=all`. See `src/js/core/flags.js` for the full list.

## Pages

| Address | Page |
|---|---|
| `/` | The editor, opening with the closed beta welcome popup |
| `/pages/canvas` | The editor (same thing) |
| `/pages/about` | About (switched off for now) |
| `/pages/guide` | Guide and shortcuts (switched off for now) |
| `/pages/library` | Ready-made templates (switched off for now) |
| `/pages/whats-new` | What's New (switched off for now) |

## Project structure

```
index.html                     the app (entry)
pages/                         one small entry folder per page address (about, canvas, guide, library, whats-new), each loads the one real app
src/
  css/style.css
  js/
    app.js                     editor UI, tools, state
    core/                      engine, animations (presets), shapes, image conversion, feature flags
    export/                    HTML component export, GIF encoder
    data/                      site settings, template list, What's New content
templates/                     Library templates
assets/                        logo and app icons, welcome-preview.html (the popup animation), home-preview.html (the switched-off welcome page animation)
Buildlog.md                    the build log
.github/workflows/             backs up the view count to a `stats` branch
```

## Status

Pre-release: versions are `0.minor.patch` (a new feature or notable redesign bumps the middle number, a fix or tweak bumps the last) until the public release, which will be `1.0.0`. The build log in [`Buildlog.md`](Buildlog.md) lists every change.

## Credits

Built by [imti-ahmed](https://github.com/imti-ahmed).
