# Dot Mania — Build Log

Pre-release versions are `0.minor.patch`. A new feature, a new page or flow, or a notable redesign bumps the middle number (and resets the last to 0); a fix, tweak, copy change, rename or flag change bumps the last. `1.0.0` only when the public release is declared.

From 0.23.0 on, each release is one commit that includes its own row here, and the Commit column shows the git tag (`v0.23.0`) because a commit cannot contain its own hash.

Entries from 0.17.6 to 0.22.18 were squashed into one commit ("Dot Mania 0.22 ... (squashed)"), so they show `squashed` instead of a hash.

| Version | Date | Commit | Changes |
|---|---|---|---|
| 0.25.2 | 2026-11-08 | `v0.25.2` | Assets tidied: icons/ and previews/ folders, clearer names, unused icon-512.png removed |
| 0.24.1 | 2026-11-08 | `v0.24.1` | Added PR check (GitHub Action): syntax, version match, linked files, build log row, no external scripts, templates in sync, flags unchanged, core files need owner review |
| 0.25.1 | 2026-11-08 | `v0.25.1` | Added PR check (GitHub Action): syntax, version match, linked files, build log row, no external scripts, templates in sync, flags unchanged, core files need owner review |
| 0.25.0 | 2026-11-08 | `v0.25.0` | Helper tools for AI agents: `window.dotMania` (src/js/agent.js) draws, picks animation and colour, plays and exports through the editor's own functions (undoable like a hand edit), also registered as WebMCP tools where the browser offers them. Found via a hidden note and a meta tag; `agentTools` flag, on |
| 0.24.0 | 2026-11-07 | `v0.24.0` | New Select tool (V): drag a rectangle over any dots, then drag inside it to move them (Delete removes, Esc clears). GIF export now covers the whole artboard instead of cropping to the drawing |
| 0.23.8 | 2026-11-07 | `v0.23.8` | Portfolio link corrected to imtiyazahmed.com everywhere (credit, welcome popup, About, home footer) |
| 0.23.7 | 2026-11-07 | `v0.23.7` | Left panel: the credit is centred in the space between the randomizer and the size options, with a divider under the randomizer |
| 0.23.6 | 2026-11-07 | `v0.23.6` | Left panel: vertical "Crafted by Imtiyaz Ahmed" credit above the size options, name linked to the portfolio (hidden on narrow screens where the panel is a row) |
| 0.23.5 | 2026-11-07 | `v0.23.5` | Submit Feedback tab no longer underlined (link styling removed) |
| 0.23.4 | 2026-11-07 | `v0.23.4` | Welcome popup shows on every visit (`welcomeOnce` flag turned off) |
| 0.23.3 | 2026-11-07 | `v0.23.3` | New "Submit Feedback" tab at the end of the top bar; it opens the GitHub new-issue page in a new tab |
| 0.23.2 | 2026-11-07 | `v0.23.2` | Canvas card always fills its parent card on any screen size: the stage follows the card's shape and the artboard is scaled to fit and centred inside it, so a small or tall window gets empty space around the grid (like the square frame) instead of a canvas shorter than its parent |
| 0.23.1 | 2026-11-07 | `v0.23.1` | Social share text simplified: the title is "Dot Mania - Make The Dots Move" with one short line under it ("Draw on a grid, make it move, and export it anywhere."); no link in the text (no og:url), and the same line is the page description |
| 0.23.0 | 2026-11-07 | `v0.23.0` | Social share preview: a 1200x630 image (assets/social-preview.png: one frame of the welcome popup's Rain animation in Glitter colors, drawn with the app's own engine across the whole canvas width, every column of the rain) plus Open Graph and Twitter card tags, so links to the app show a rich preview |
| 0.22.19 | 2026-11-07 | `squashed` | Versions renumbered as 0.minor.patch by kind of change (new feature or notable redesign bumps the middle number, a fix or tweak bumps the last), and the 73 unpushed commits (36 entries, 0.17.6 to 0.22.18) squashed into one; Buildlog.md back at the repo root (docs/ folder removed); the page entry folders gathered into pages/ (addresses are now /pages/about, /pages/library and so on) |
| 0.22.18 | 2026-11-07 | `squashed` | Welcome popup shows on the first visit only and returns 5 hours after it was dismissed (timestamp kept in the browser); ?welcome=1 forces it, ?welcome=0 skips it; welcomeOnce flag turned on |
| 0.22.17 | 2026-11-07 | `squashed` | Closed Beta pill moved from the bottom centre to the bottom left of the popup preview |
| 0.22.16 | 2026-11-07 | `squashed` | Welcome popup: Closed Beta moved off the text into a pill at the bottom of the preview; the preview animation is drawn 2x larger (centre crop, sharper at 960 px) so the dots are no longer tiny |
| 0.22.15 | 2026-11-07 | `squashed` | Welcome popup paragraph shortened again |
| 0.22.14 | 2026-11-07 | `squashed` | Welcome popup: credit words are plain and only the linked name Imtiyaz Ahmed is bold; paragraph trimmed further |
| 0.22.13 | 2026-11-07 | `squashed` | Welcome popup text shortened by a few words, the Designed & Built by Imtiyaz Ahmed credit now runs on in the same paragraph, and the portfolio link has no underline (turns red on hover) |
| 0.22.12 | 2026-11-07 | `squashed` | Canvas pointer finalized as the Square one (6th option); the Pointer picker is hidden behind pointerOptions (off) and a previously saved choice no longer overrides it |
| 0.22.11 | 2026-11-07 | `squashed` | Welcome popup gets a credit line, Designed & Built by Imtiyaz Ahmed, with the name linked to imtiyazhamed.com; same credit on the switched-off About and welcome pages |
| 0.22.10 | 2026-11-07 | `squashed` | About tab disabled (greyed out, Coming soon) behind the aboutPage flag; /about falls back to the studio |
| 0.22.9 | 2026-11-07 | `squashed` | About rebuilt: slim intro bar (no empty top), four separate feature cards each with a non-interactive preview on top, a carved divider and the text below, then a separate live-animation preview card with the three notes under a divider, then the buttons row |
| 0.22.8 | 2026-11-07 | `squashed` | Pointer options: ten canvas cursors (ring, dot, plus, fine cross, target, square, corners, diamond, pencil, classic) chosen from a Pointer group in the Edit tab and remembered; ?cursor= still works; pointerOptions flag hides the group once one is picked |
| 0.22.7 | 2026-11-07 | `squashed` | About: intro card is now name left / sentence right; What it does is a full-width card with four columns, each holding a small non-interactive recreation built from the app's own components (tool keys and a dot canvas, animation keys and the Stacking switch, color grid and swatches, quality and export buttons) |
| 0.22.6 | 2026-11-07 | `squashed` | About: Show welcome removed; Portfolio link added (imtiyazhamed.com); Portfolio, GitHub and Send feedback buttons get filled icons; intro card shortened and the What it does list laid out in two columns so the top cards no longer have empty space |
| 0.22.5 | 2026-11-07 | `squashed` | About remade with only three cards (intro, what it does with red icon boxes, three notes split by dividers) and the buttons moved out into their own row: Show welcome, GitHub and Send feedback as secondary, Start drawing as primary |
| 0.22.4 | 2026-11-07 | `squashed` | About rebuilt: cards sized to their content (no tall fixed rows), all new copy (intro, two number cards, privacy, four features, closed beta, made by, version), icons in red logo-style boxes, red primary buttons |
| 0.22.3 | 2026-11-07 | `squashed` | Eraser tool back in the left bar, first in the Eraser / Invert / Clear group (E shortcut, highlights when active); extraTools flag now only covers the Line tool |
| 0.22.2 | 2026-11-07 | `squashed` | Fixed the About bento sitting on the left: the generic .page > * 760px width cap was applying to it; the grid now spans the full width |
| 0.22.1 | 2026-11-07 | `squashed` | About bento: rows sized from the window width so the grid covers the full width with every cell filled (not stretched to the height); buttons replaced by whole-card links (Made by to GitHub, Version to the welcome) with a corner arrow; flat icons |
| 0.22.0 | 2026-11-07 | `squashed` | Studio opens paused and shows the drawing at full strength (normal state) until Play is pressed; Pause returns to that state; opened files and Randomize still play; PNG/SVG stills match what is on screen; how-to text mentions Play |
| 0.21.1 | 2026-11-07 | `squashed` | About page is a full-width bento grid (header included): a large intro card, four feature cards, a more-info card, made-by card and a version card; the narrow site container now applies only to the switched-off welcome page |
| 0.21.0 | 2026-11-07 | `squashed` | Canvas pointer: custom ring-with-dot cursor replaces the crosshair; ?cursor=dot|plus|crosshair to compare |
| 0.20.6 | 2026-11-07 | `squashed` | Welcome page hidden behind homePage flag: the studio opens straight at / with the closed beta welcome popup (welcomePopup flag, on); the popup uses the Rain preview again and the Bars band moved to assets/home-preview.html |
| 0.20.5 | 2026-11-07 | `squashed` | Welcome page: feature cards removed; preview strip made taller (170-360px) and now shows a neon Bars animation across a wide band of dots (new assets/welcome-preview.html; the Rain one kept as assets/preview-rain.html) |
| 0.20.4 | 2026-11-07 | `squashed` | Fixed a syntax error in whatsnew.js left by the 0.0.69 wording change (an unescaped apostrophe) |
| 0.20.3 | 2026-11-07 | `squashed` | Welcome page: headline Make dots move, short intro, three buttons, four feature cards, preview strip card ending with a divider and the centred copyright; Let's Go shows a logo-only shimmer loader (no backdrop pattern) before the studio opens |
| 0.20.2 | 2026-11-07 | `squashed` | Welcome page: more spacious (text block centred in the free space, bigger headline and gaps), new subtitle plus a short beta note, preview shrunk to a short strip at the bottom |
| 0.20.1 | 2026-11-07 | `squashed` | Welcome page is one screen with no scrolling: centred headline and intro, three buttons, and a card-style live preview filling the remaining height; How to use opens as a card over it; extra sections removed |
| 0.20.0 | 2026-11-07 | `squashed` | Welcome page at / (hero with live preview, Let's Go / How to use / Feedback, five how-to cards, closing call to action) in a site-style container (max 1440px, side gutter clamp(16px,4.4vw,64px), navbar inside it); the tool moves to /canvas and keeps the full width; welcome popup kept behind welcomePopup flag |
| 0.19.4 | 2026-11-07 | `squashed` | How to use card: dividers run edge to edge; five steps rewritten with concrete detail (pen and erase, stacking, tuning, randomize and undo, export and Open HTML) plus a tips line |
| 0.19.3 | 2026-11-07 | `squashed` | About page redesigned: big intro text on the background, four feature cards, a more-info card and a made-by card, version and closed beta footer |
| 0.19.2 | 2026-11-07 | `squashed` | How to use card: instant pop-in (no slide), carved divider under the title, no close button (press How to use again or Esc), steps with a line each and a tip, spread to fill the card |
| 0.19.1 | 2026-11-07 | `squashed` | Welcome popup shows on every visit while testing; welcomeOnce flag limits it to once per session later |
| 0.19.0 | 2026-11-07 | `squashed` | Welcome: How to use is a second card that opens beside it while the welcome glides over, with 5 short steps; Shift + pen draws a straight line; About moved next to Canvas; Guide tab disabled (guidePage flag) |
| 0.18.0 | 2026-11-07 | `squashed` | Closed beta welcome popup (once per visit): live preview from assets/welcome-preview.html, welcome text, Let's Go / How to use / Feedback buttons, and a slide-in How to use panel; Show welcome on About |
| 0.17.7 | 2026-11-07 | `squashed` | Folders reorganized (src/css, src/js/{core,export,data}, assets, templates, docs); apple touch icon renamed assets/icon-180.png; README rewritten; Library and What's New stay in the nav as greyed-out disabled tabs |
| 0.17.6 | 2026-11-07 | `squashed` | About page rewritten (what it does, made by, version); Library and What's New hidden from the nav behind libraryPage / whatsNewPage flags |
| 0.17.5 | 2026-11-07 | `b84ae05` | Candy is back in Color; Holo moved behind holoColor flag |
| 0.17.4 | 2026-11-07 | `4c9202e` | Color swatches: removed the off-white swatch, remaining ones plus the custom picker spread evenly so the last ends flush with the colour buttons above |
| 0.17.3 | 2026-11-07 | `fe1b28d` | Forest moved behind forestColor flag; new Holo gradient (5 colors, two crossing waves) takes its place |
| 0.17.2 | 2026-11-07 | `584c514` | Candy moved behind candyColor flag; new Forest gradient (deep green to lime) takes its place in Color |
| 0.17.1 | 2026-11-07 | `9d99807` | Cache-busting: css/js links carry ?v=<version> and entry pages fetch index.html fresh, so a stale cached file (e.g. old engine.js showing Candy as white) can't linger |
| 0.17.0 | 2026-11-07 | `163d309` | New Candy gradient color; custom color picker is our own popup (saturation square, hue bar, hex field) instead of the browser's; color Randomize button moved behind colorRandom flag |
| 0.16.2 | 2026-11-07 | `2ff089d` | Favicon: the top-left logo (red rounded square with dots) as favicon.svg, favicon.ico, apple-touch-icon.png and a 512 px PNG |
| 0.16.1 | 2026-11-07 | `5d4ee28` | Randomize color now picks only from our own options (7 presets + 8 solid swatches, equally likely) instead of 60% gradients and random hues |
| 0.16.0 | 2026-11-07 | `188363a` | View count backed up to views.json on a stats branch by a scheduled GitHub Action (every 6 h, only ever goes up); app shows the larger of Abacus and the backup |
| 0.15.1 | 2026-11-07 | `ee39a78` | Color: White preset moved behind whiteColor flag; Randomize color button (filled dice icon) is the last option |
| 0.15.0 | 2026-11-07 | `358c210` | Views wired to a free Abacus counter: one count per browser session on the live site only, read-only on localhost/file; shows 0 until the first visit |
| 0.14.1 | 2026-11-07 | `0675630` | Export tab order: Background, Quality, Code, Media |
| 0.14.0 | 2026-11-07 | `c915fc2` | GIF size moved out of Media into its own Quality option (Low / Medium / High), also sets video bitrate |
| 0.13.9 | 2026-11-07 | `1a9a5eb` | Carousel, Streaks, Chess, Swing moved behind extraPresets flag; Trying Out group empty (hidden) |
| 0.13.8 | 2026-11-07 | `e12c5aa` | Fireworks, Tide, Glint, Helix moved behind extraPresets flag; new Trying Out set: Carousel, Streaks, Chess, Swing |
| 0.13.7 | 2026-11-07 | `4fe7bda` | Code File button renamed Download Html File; GIF size option (Small 480 / Medium 960 / Large 1440 px), default raised from a fixed 480 px |
| 0.13.6 | 2026-11-07 | `1752b58` | Four new trial animations in the Trying Out group: Fireworks, Tide, Glint, Helix |
| 0.13.5 | 2026-11-07 | `686b6af` | Randomize also randomizes the canvas size (wide or square) before drawing the art |
| 0.13.4 | 2026-11-07 | `1d9533e` | Top bar: gap between the logo and the bar is now 16px, matching the gap between the panels below |
| 0.13.3 | 2026-11-07 | `92385c2` | Randomize art is now designed patterns (nested rings/squares/diamonds, tiled motifs, stripes, sunburst, checkerboard, mirrored emblems), optionally cut to a shape |
| 0.13.2 | 2026-11-07 | `a241820` | Slider handle redesigned as a round knob with a glowing red centre; Look group renamed Tuning |
| 0.13.1 | 2026-11-07 | `b297837` | Randomize now also picks canvas art (full, starter shape or random art, undoable), a mark shape, then plays |
| 0.13.0 | 2026-11-07 | `61cd4f4` | Randomize: new left bar group with a dice icon that picks new animation(s), sliders and color, leaving the drawing alone |
| 0.12.4 | 2026-11-07 | `6a1d7d9` | Right panel: scrolling content no longer slides right up to the tabs divider, it is clipped a little below it like above Play |
| 0.12.3 | 2026-11-07 | `a0e8613` | Stacking: extra space above the top divider so it matches the gap above the bottom one |
| 0.12.2 | 2026-11-07 | `9d1365f` | Stacking: dividers are now separate lines with space between them and the switch, not a border around it |
| 0.12.1 | 2026-11-07 | `d1cdc93` | Stacking: hint text removed; carved dividers above and below the switch |
| 0.12.0 | 2026-11-07 | `a05a19f` | Stacking switch (On/Off): stack up to 3 animations in click order (first is the base, later ones shape it); shared Speed/Size/Glow, per-animation sliders, order badges, exports and Open HTML support stacks |
| 0.11.2 | 2026-11-07 | `8be1fdc` | Dissolve approved and added to the main animations; Stripes, Blinds, Cross moved behind extraPresets flag; Trying Out group empty (hidden) |
| 0.11.1 | 2026-11-07 | `32bf166` | Equalizer approved and renamed Bars (slider now Width); Blob, Tunnel, Plasma moved behind extraPresets flag; new Trying Out set: Stripes, Dissolve, Blinds, Cross |
| 0.11.0 | 2026-11-07 | `3997886` | New Trying Out group in the panel with 4 trial animations (Blob, Tunnel, Equalizer, Plasma); approved ones move into the main list |
| 0.10.3 | 2026-11-07 | `f51eebe` | Twinkle removed from the list (kept behind extraPresets flag) |
| 0.10.2 | 2026-11-07 | `91236a1` | Blink removed from the list (kept behind extraPresets flag) |
| 0.10.1 | 2026-11-07 | `90b8a33` | Heartbeat renamed Beats; Sweep defaults to horizontal (0 deg); Burst removed from the list (kept behind extraPresets flag) |
| 0.10.0 | 2026-11-07 | `7bda2ec` | 7 new animations (Breathe, Sweep, Burst, Blink, Flicker, Zigzag, Reveal); presets show three rows with a secondary More / Less button |
| 0.9.0 | 2026-11-07 | `d951e3a` | What's New moved to its own user-facing file (js/whatsnew.js), no longer a copy of the build log; version now set in js/site.js; Library, About, What's New and Guide each get their own address (/library, /about, /whats-new, /guide) |
| 0.8.5 | 2026-11-07 | `c907870` | Stars/views cached for 30 min (avoids GitHub rate limit), stale value kept on failure, console logs the reason a fetch fails |
| 0.8.4 | 2026-11-07 | `837d096` | Library cards: divider above buttons, roomier; status bar spread out with filled icons and units (1 Star, 0 Views); exported file names are random funky combos |
| 0.8.3 | 2026-11-07 | `9670b4a` | Removed the /idiot admin page and add-to-Library dialog; templates are added to /library by hand |
| 0.8.2 | 2026-11-07 | `2a5a692` | Admin add now saves the current canvas as the Library template (no file picking); dialog centred |
| 0.8.1 | 2026-11-07 | `f772da5` | Status bar: version (tag), views (eye) and GitHub stars (logo, links to the repo) always shown with icons, dash when unavailable; text centred; divider made visible |
| 0.8.0 | 2026-11-07 | `abbb958` | Admin page at /idiot adds a left-bar button to add a file to the Library (name + upload); Library trimmed to Heartbeats, Snowflake Loader, Cyberpunk |
| 0.7.0 | 2026-11-07 | `0461b53` | Top bar: grid/cell readouts removed; divider moved to line up with the canvas/panel gap; status area shows GitHub stars (views when configured) and doubles as the notification bar (opening, loading, rendering, saving) |
| 0.6.0 | 2026-11-07 | `740fc58` | WebM and MP4 export: records 1-2 whole cycles (not a fixed 10 s) so the clip loops; progress shown on the button |
| 0.5.1 | 2026-11-07 | `9d75cc7` | SVG export removed from the Export tab (kept behind the exportSvg flag) |
| 0.5.0 | 2026-11-07 | `65459e9` | Export tab split into Background, Code (HTML file, Copy for LLM) and Media (GIF, new PNG, new SVG) |
| 0.4.1 | 2026-11-07 | `d4b7a14` | Left bar groups (tools, Invert/Clear, size) separated by the same carved dividers as the right panel |
| 0.4.0 | 2026-11-07 | `b4fbb98` | Right panel split into Edit and Export tabs, separated by a carved divider |
| 0.3.5 | 2026-11-07 | `391e2db` | Right panel divider above Play is full width, grey groove (carved look) |
| 0.3.4 | 2026-11-07 | `36c45e8` | Loading a Library template or HTML file ignores whatever is on the canvas and opens the file exactly as saved |
| 0.3.3 | 2026-11-07 | `230eed8` | Faster Library previews: drawn small from one shared loop, only visible cards animate (iframe fallback when opened as a file) |
| 0.3.2 | 2026-11-07 | `0d4c2f8` | Invert/Clear grouped with tools at top; Diamond preset, image Level and Fit moved behind flags; Background labels Black / Transparent; paint bucket Fill icon; square size keeps full stage with a centred 67x67 grid |
| 0.3.1 | 2026-11-07 | `25f2f21` | Left bar: Pen, Shape, Circle, Fill grouped; Eraser and Line behind a flag; Undo/Redo shortcut-only; icon Clear and Invert; icon-only sizes. Open HTML / Close File beside Play |
| 0.3.0 | 2026-11-07 | `82ca58a` | Library: 8 premade templates in /library, card grid with preview, Load File and Download (HTML) |
| 0.2.0 | 2026-11-07 | `3c3a667` | Top nav (Canvas, Library, About, What's New, Guide); edit buttons moved to left bar; open exported HTML files |
| 0.1.1 | 2026-11-07 | `ef5b29e` | Added CLAUDE.md (project rules) and Buildlog.md |
| 0.1.0 | 2026-11-07 | `b80587e` | Editor, 10 animation presets, drawing tools, image upload, web component + GIF export, feature flags |
| 0.0.0 | 2026-11-06 | `e6dc8a6` | Repo created |
