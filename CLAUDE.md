# Dot Mania

Animated dot-grid editor. Drawings, shapes or uploaded images become dots that run animation presets. Exports as a dependency-free web component or a looping GIF.

## Stack
- Static app: `index.html`, plain `<script>` tags (no modules, no build step, no dependencies).
- Script load order matters (see the tags in `index.html`): core, then export, then data, then `app.js`, then `agent.js`.
- The tool is the front door: `/` opens the editor with the closed beta welcome popup (`welcomePopup` flag; `welcomeOnce`: first visit only, back after 5 hours). A separate welcome page exists behind the `homePage` flag (the only view in the site-style narrow layout like theladybug.app: max-width 1440px, side gutter clamp(16px, 4.4vw, 64px)); with it on, the tool moves to `/tabs/canvas`. Every other view, including About, is full width. Other tabs live at /tabs/about, /tabs/library, /tabs/whats-new, /tabs/guide (small entry folders inside tabs/), so use a server for those. Page addresses need a server.

## Structure
```
index.html                     the app (entry)
tabs/                          one small entry folder per page address (about, canvas, guide, library, whats-new): /tabs/about etc., each loads the one real app
src/
  css/style.css
  js/
    app.js                     editor UI, tools, state
    agent.js                   helper tools for AI agents (window.dotMania, WebMCP), through window.DotApp at the end of app.js
    core/                      engine.js (rendering), presets.js (animations), shapes.js, image.js, flags.js (feature flags)
    export/                    export.js (HTML component), gif.js (GIF encoder)
    data/                      site.js (version, repo, views), library.js (template list), whatsnew.js (What's New content)
templates/                     Library templates, each one a Dot Mania HTML export
assets/                        icons/ (favicon.svg, favicon.ico, apple-touch-icon.png) and previews/ (welcome.html: the popup animation, home.html: the switched-off welcome page animation, social.png: the link share image)
Buildlog.md                    the build log
.github/workflows/             views-backup.yml (saves the view count to a `stats` branch every 6 hours), pr-check.yml (checks on every PR, script in .github/scripts/)
```
- `js/data/whatsnew.js` is plain language for users, NOT a copy of the build log.
- Disabled pages (About, Library, What's New, Guide) stay in the nav greyed out; the `aboutPage`, `libraryPage`, `whatsNewPage` and `guidePage` flags turn them on.

## Rules

### Testing
- Never open Chrome for testing. Do not call any `mcp__claude-in-chrome__*` tool.
- No simulated or automated tests, and no auto-running of the app, until the user says so. Offer first; run only after the user agrees.

### Commits
- After every necessary update, commit automatically. No need to ask.
- Commit messages end with the `Co-Authored-By` line from the session attribution.

### Build log
- One commit per update, and that same commit includes its row in `Buildlog.md` (no separate "Log" commit: there are too many commits otherwise). The row's Commit column shows the release tag `v<version>`; create that git tag right after committing.
- Versioning is `0.minor.patch` until the public release: a new feature, a new page or flow, or a notable redesign bumps the middle number (and resets the last to 0); a fix, tweak, copy change, rename or flag change bumps the last. Move to `1.0.0` only when the user declares the public release. Pick the bump from the kind of change, not just +1 on the last number.
- Keep entries short: one table row with version, date, commit hash and a one-line summary. Newest on top.
- Bump `version` in `src/js/data/site.js` with every entry (status bar and About show it).
- Set the same version as `?v=<version>` on every css/js link in `index.html` (cache-busting: browsers keep old files otherwise, which shows up as new features missing or looking broken).
- `src/js/data/whatsnew.js` is separate: add an entry only for changes users can see, in plain language. Do not mirror the build log.

### Flags
- Do not delete cut features. Put them behind `src/js/core/flags.js`.
- New animations go in `window.TRIAL_PRESETS` (src/js/core/presets.js): they show in the "Trying Out" group. When the user approves one, move its block into `window.PRESETS`.
