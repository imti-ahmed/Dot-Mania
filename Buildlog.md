# Dot Mania — Build Log

Pre-release runs on `0.0.x` (patch bump per entry). `1.0.0` only when the public release is declared.

| Version | Date | Commit | Changes |
|---|---|---|---|
| 0.0.32 | 2026-11-07 | `9d1365f` | Stacking: dividers are now separate lines with space between them and the switch, not a border around it |
| 0.0.31 | 2026-11-07 | `d1cdc93` | Stacking: hint text removed; carved dividers above and below the switch |
| 0.0.30 | 2026-11-07 | `a05a19f` | Stacking switch (On/Off): stack up to 3 animations in click order (first is the base, later ones shape it); shared Speed/Size/Glow, per-animation sliders, order badges, exports and Open HTML support stacks |
| 0.0.29 | 2026-11-07 | `8be1fdc` | Dissolve approved and added to the main animations; Stripes, Blinds, Cross moved behind extraPresets flag; Trying Out group empty (hidden) |
| 0.0.28 | 2026-11-07 | `32bf166` | Equalizer approved and renamed Bars (slider now Width); Blob, Tunnel, Plasma moved behind extraPresets flag; new Trying Out set: Stripes, Dissolve, Blinds, Cross |
| 0.0.27 | 2026-11-07 | `3997886` | New Trying Out group in the panel with 4 trial animations (Blob, Tunnel, Equalizer, Plasma); approved ones move into the main list |
| 0.0.26 | 2026-11-07 | `f51eebe` | Twinkle removed from the list (kept behind extraPresets flag) |
| 0.0.25 | 2026-11-07 | `91236a1` | Blink removed from the list (kept behind extraPresets flag) |
| 0.0.24 | 2026-11-07 | `90b8a33` | Heartbeat renamed Beats; Sweep defaults to horizontal (0 deg); Burst removed from the list (kept behind extraPresets flag) |
| 0.0.23 | 2026-11-07 | `7bda2ec` | 7 new animations (Breathe, Sweep, Burst, Blink, Flicker, Zigzag, Reveal); presets show three rows with a secondary More / Less button |
| 0.0.22 | 2026-11-07 | `d951e3a` | What's New moved to its own user-facing file (js/whatsnew.js), no longer a copy of the build log; version now set in js/site.js; Library, About, What's New and Guide each get their own address (/library, /about, /whats-new, /guide) |
| 0.0.21 | 2026-11-07 | `c907870` | Stars/views cached for 30 min (avoids GitHub rate limit), stale value kept on failure, console logs the reason a fetch fails |
| 0.0.20 | 2026-11-07 | `837d096` | Library cards: divider above buttons, roomier; status bar spread out with filled icons and units (1 Star, 0 Views); exported file names are random funky combos |
| 0.0.19 | 2026-11-07 | `9670b4a` | Removed the /idiot admin page and add-to-Library dialog; templates are added to /library by hand |
| 0.0.18 | 2026-11-07 | `2a5a692` | Admin add now saves the current canvas as the Library template (no file picking); dialog centred |
| 0.0.17 | 2026-11-07 | `f772da5` | Status bar: version (tag), views (eye) and GitHub stars (logo, links to the repo) always shown with icons, dash when unavailable; text centred; divider made visible |
| 0.0.16 | 2026-11-07 | `abbb958` | Admin page at /idiot adds a left-bar button to add a file to the Library (name + upload); Library trimmed to Heartbeats, Snowflake Loader, Cyberpunk |
| 0.0.15 | 2026-11-07 | `0461b53` | Top bar: grid/cell readouts removed; divider moved to line up with the canvas/panel gap; status area shows GitHub stars (views when configured) and doubles as the notification bar (opening, loading, rendering, saving) |
| 0.0.14 | 2026-11-07 | `740fc58` | WebM and MP4 export: records 1-2 whole cycles (not a fixed 10 s) so the clip loops; progress shown on the button |
| 0.0.13 | 2026-11-07 | `9d75cc7` | SVG export removed from the Export tab (kept behind the exportSvg flag) |
| 0.0.12 | 2026-11-07 | `65459e9` | Export tab split into Background, Code (HTML file, Copy for LLM) and Media (GIF, new PNG, new SVG) |
| 0.0.11 | 2026-11-07 | `d4b7a14` | Left bar groups (tools, Invert/Clear, size) separated by the same carved dividers as the right panel |
| 0.0.10 | 2026-11-07 | `b4fbb98` | Right panel split into Edit and Export tabs, separated by a carved divider |
| 0.0.9 | 2026-11-07 | `391e2db` | Right panel divider above Play is full width, grey groove (carved look) |
| 0.0.8 | 2026-11-07 | `36c45e8` | Loading a Library template or HTML file ignores whatever is on the canvas and opens the file exactly as saved |
| 0.0.7 | 2026-11-07 | `230eed8` | Faster Library previews: drawn small from one shared loop, only visible cards animate (iframe fallback when opened as a file) |
| 0.0.6 | 2026-11-07 | `0d4c2f8` | Invert/Clear grouped with tools at top; Diamond preset, image Level and Fit moved behind flags; Background labels Black / Transparent; paint bucket Fill icon; square size keeps full stage with a centred 67x67 grid |
| 0.0.5 | 2026-11-07 | `25f2f21` | Left bar: Pen, Shape, Circle, Fill grouped; Eraser and Line behind a flag; Undo/Redo shortcut-only; icon Clear and Invert; icon-only sizes. Open HTML / Close File beside Play |
| 0.0.4 | 2026-11-07 | `82ca58a` | Library: 8 premade templates in /library, card grid with preview, Load File and Download (HTML) |
| 0.0.3 | 2026-11-07 | `3c3a667` | Top nav (Canvas, Library, About, What's New, Guide); edit buttons moved to left bar; open exported HTML files |
| 0.0.2 | 2026-11-07 | `ef5b29e` | Added CLAUDE.md (project rules) and Buildlog.md |
| 0.0.1 | 2026-11-07 | `b80587e` | Editor, 10 animation presets, drawing tools, image upload, web component + GIF export, feature flags |
| 0.0.0 | 2026-11-06 | `e6dc8a6` | Repo created |
