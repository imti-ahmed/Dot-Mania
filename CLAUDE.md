# Dot Mania

Animated dot-grid editor. Drawings, shapes or uploaded images become dots that run animation presets. Exports as a dependency-free web component or a looping GIF.

## Stack
- Static app: `index.html`, `css/style.css`, plain `<script>` tags in `js/` (no modules, no build step, no dependencies).
- Script load order matters: `flags` → `presets` → `shapes` → `engine` → `image` → `export` → `gif` → `app`.
- Run: open `index.html`, or `python -m http.server 8000` and visit http://localhost:8000. Add `?flags=all` to enable hidden features.

## Structure
| File | Role |
|---|---|
| `js/app.js` | Editor UI, tools, state |
| `js/engine.js` | Dot-grid rendering and animation |
| `js/presets.js` | Animation presets |
| `js/shapes.js` | Starter shapes and mark shapes |
| `js/image.js` | Image to B&W dot conversion |
| `js/export.js` | Web component export |
| `js/gif.js` | GIF encoder |
| `js/flags.js` | Feature flags (cut features stay here, off by default) |

## Rules

### Testing
- Never open Chrome for testing. Do not call any `mcp__claude-in-chrome__*` tool.
- No simulated or automated tests, and no auto-running of the app, until the user says so. Offer first; run only after the user agrees.

### Commits
- After every necessary update, commit automatically. No need to ask.
- Commit messages end with the `Co-Authored-By` line from the session attribution.

### Build log
- Right after each commit, add an entry to `Buildlog.md`, then commit that too.
- Versioning: stay on `0.0.x` (bump patch per entry). Move to `1.0.0` only when the user declares the public release.
- Keep entries short: one table row with version, date, commit hash and a one-line summary. Newest on top.

### Flags
- Do not delete cut features. Put them behind `js/flags.js`.
