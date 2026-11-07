/*
 * Data for the "What's New" page. Keep in sync with Buildlog.md (newest first).
 * `commit` is a short hash, or '' for the entry that is still being written.
 */
window.UPDATES = [
  { v: '0.0.15', date: '2026-11-07', commit: '0461b53', note: 'Top bar: grid/cell readouts removed; divider moved to line up with the canvas/panel gap; status area shows GitHub stars (views when configured) and doubles as the notification bar (opening, loading, rendering, saving)' },
  { v: '0.0.14', date: '2026-11-07', commit: '740fc58', note: 'WebM and MP4 export: records 1-2 whole cycles (not a fixed 10 s) so the clip loops; progress shown on the button' },
  { v: '0.0.13', date: '2026-11-07', commit: '9d75cc7', note: 'SVG export removed from the Export tab (kept behind the exportSvg flag)' },
  { v: '0.0.12', date: '2026-11-07', commit: '65459e9', note: 'Export tab split into Background, Code (HTML file, Copy for LLM) and Media (GIF, new PNG, new SVG)' },
  { v: '0.0.11', date: '2026-11-07', commit: 'd4b7a14', note: 'Left bar groups (tools, Invert/Clear, size) separated by the same carved dividers as the right panel' },
  { v: '0.0.10', date: '2026-11-07', commit: 'b4fbb98', note: 'Right panel split into Edit and Export tabs, separated by a carved divider' },
  { v: '0.0.9', date: '2026-11-07', commit: '391e2db', note: 'Right panel divider above Play is full width, grey groove (carved look)' },
  { v: '0.0.8', date: '2026-11-07', commit: '36c45e8', note: 'Loading a Library template or HTML file ignores whatever is on the canvas and opens the file exactly as saved' },
  { v: '0.0.7', date: '2026-11-07', commit: '230eed8', note: 'Faster Library previews: drawn small from one shared loop, only visible cards animate (iframe fallback when opened as a file)' },
  { v: '0.0.6', date: '2026-11-07', commit: '0d4c2f8', note: 'Invert/Clear grouped with tools at top; Diamond preset, image Level and Fit moved behind flags; Background labels Black / Transparent; paint bucket Fill icon; square size keeps full stage with a centred 67x67 grid' },
  { v: '0.0.5', date: '2026-11-07', commit: '25f2f21', note: 'Left bar: Pen, Shape, Circle, Fill grouped; Eraser and Line behind a flag; Undo/Redo shortcut-only; icon Clear and Invert; icon-only sizes. Open HTML / Close File beside Play' },
  { v: '0.0.4', date: '2026-11-07', commit: '82ca58a', note: 'Library: 8 premade templates in /library, card grid with preview, Load File and Download (HTML)' },
  { v: '0.0.3', date: '2026-11-07', commit: '3c3a667', note: 'Top nav (Canvas, Library, About, What\'s New, Guide); edit buttons moved to the left bar; open exported HTML files' },
  { v: '0.0.2', date: '2026-11-07', commit: 'ef5b29e', note: 'Added CLAUDE.md (project rules) and Buildlog.md' },
  { v: '0.0.1', date: '2026-11-07', commit: 'b80587e', note: 'Editor, 10 animation presets, drawing tools, image upload, web component + GIF export, feature flags' },
  { v: '0.0.0', date: '2026-11-06', commit: 'e6dc8a6', note: 'Repo created' }
];
