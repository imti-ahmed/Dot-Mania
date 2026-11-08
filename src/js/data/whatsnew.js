/*
 * The What's New page. This is NOT the build log (Buildlog.md): it is written for people using the app,
 * one entry per release worth mentioning, plain language, newest first.
 *   v      version shown for the release
 *   date   YYYY-MM-DD
 *   items  short sentences, one per visible change
 */
window.WHATS_NEW = [
  { v: '0.36.1', date: '2026-11-08', items: [
    'The Hash shape is now ASCII: every dot becomes a text character such as @, #, % or *.'
  ] },
  { v: '0.36.0', date: '2026-11-08', items: [
    'Image upload has a third style, Outline, which keeps only the edge of the picture as dots.'
  ] },
  { v: '0.33.0', date: '2026-11-08', items: [
    'Select now shows Move, Resize and Delete in the left panel while something is selected.',
    'Resize: drag a handle to stretch the selected dots. Hold Shift to keep the proportions and Alt to resize from the centre.',
    'Circle: hold Shift to draw it from the centre outward (Alt does the same for Circle and Shape).',
    'Colour and Image settings in the Properties panel are more compact, with options side by side.'
  ] },
  { v: '0.32.0', date: '2026-11-08', items: [
    'Two new dot shapes: Star and Hash (#).'
  ] },
  { v: '0.31.0', date: '2026-11-08', items: [
    'Layers are limited to 5.',
    'Play and Open HTML moved to the left panel.'
  ] },
  { v: '0.30.0', date: '2026-11-08', items: [
    'The Pen tool is now called Draw.',
    'Select can now recolour: drag a rectangle over dots, then pick a colour to change just those dots.'
  ] },
  { v: '0.29.2', date: '2026-11-08', items: [
    'Export has an SVG button instead of PNG: a plain, still picture of your drawing that stays sharp at any size.'
  ] },
  { v: '0.29.0', date: '2026-11-08', items: [
    'Layers: add up to 5. Each layer has its own drawing, colours and animation, and they all play together on one canvas.',
    'Pick a layer to edit it: the Properties panel then shows only the animation and settings of that layer.',
    'The tabs are gone: Properties, Layers and Export are now three separate panels on the right.'
  ] },
  { v: '0.28.0', date: '2026-11-08', items: [
    'Use more than one colour on the same canvas: every dot keeps the colour it was drawn with.',
    'Changing the colour only affects what you draw next, not what is already on the canvas.',
    'The right side is now two panels. The second one (a top and a bottom card) is empty for now.'
  ] },
  { v: '0.27.0', date: '2026-11-08', items: [
    'The right panel now has three tabs: Animate, Layers and Export.',
    'New Layers tab: stack up to 3 animations, add or remove layers, change their order and tune each one on its own.',
    'Animation buttons keep an even size, adding columns on a wide panel instead of stretching.'
  ] },
  { v: '0.26.0', date: '2026-11-08', items: [
    'The canvas card is now a square that fits your screen, with wider side panels around it.',
    'The left panel shows a name next to every tool icon.'
  ] },
  { v: '0.25.4', date: '2026-11-08', items: [
    'The canvas is now a 1080 x 1080 square by default, and the long wide frame is gone.'
  ] },
  { v: '0.24.0', date: '2026-11-07', items: [
    'New Select tool: drag a rectangle over any dots, then drag inside it to move them around.',
    'GIF export now includes the whole grid, not just the part you drew on.'
  ] },
  { v: '0.23.4', date: '2026-11-07', items: [
    'The welcome popup now shows every time you open Dot Mania.'
  ] },
  { v: '0.23.3', date: '2026-11-07', items: [
    'New Submit Feedback tab in the top bar takes you straight to the GitHub feedback page.'
  ] },
  { v: '0.22.9', date: '2026-11-07', items: [
    'About now has a card for each feature, with a preview on top, and a live animation card at the end.'
  ] },
  { v: '0.22.8', date: '2026-11-07', items: [
    'A new square pointer over the canvas, in place of the plain crosshair.'
  ] },
  { v: '0.22.7', date: '2026-11-07', items: [
    'The About page now shows small, non-interactive copies of the tools, animations, colors and export options.'
  ] },
  { v: '0.22.3', date: '2026-11-07', items: [
    'The eraser is back, next to Invert and Clear.'
  ] },
  { v: '0.22.0', date: '2026-11-07', items: [
    'The studio opens paused: what you draw shows exactly as drawn until you press Play.'
  ] },
  { v: '0.21.1', date: '2026-11-07', items: [
    'The About page has been rebuilt: three cards, red icon boxes, and a row of buttons underneath.'
  ] },
  { v: '0.21.0', date: '2026-11-07', items: [
    'A new pointer over the canvas: a small ring with a dot, in place of the plain crosshair.'
  ] },
  { v: '0.20.6', date: '2026-11-07', items: [
    'Closed beta: the studio opens straight away, with a welcome popup that has a live preview and a How to use card.'
  ] },
  { v: '0.19.3', date: '2026-11-07', items: [
    'The About page has a new layout: an introduction up top, then cards for what Dot Mania does.'
  ] },
  { v: '0.19.0', date: '2026-11-07', items: [
    'Hold Shift while drawing with the pen to get a straight line.'
  ] },
  { v: '0.18.0', date: '2026-11-07', items: [
    'Closed beta welcome: a live preview, a short intro, and a How to use panel.'
  ] },
  { v: '0.17.6', date: '2026-11-07', items: [
    'The About page has been rewritten.'
  ] },
  { v: '0.17.5', date: '2026-11-07', items: [
    'New Candy color: a soft pink, lilac, sky and mint gradient.'
  ] },
  { v: '0.17.0', date: '2026-11-07', items: [
    'The custom color picker now matches the rest of the app.'
  ] },
  { v: '0.15.1', date: '2026-11-07', items: [
    'Color has its own Randomize button, and the White preset has been retired.'
  ] },
  { v: '0.15.0', date: '2026-11-07', items: [
    'The status bar now shows a real view count.'
  ] },
  { v: '0.14.0', date: '2026-11-07', items: [
    'Quality is now its own option in Export, and it also sets video quality.'
  ] },
  { v: '0.13.7', date: '2026-11-07', items: [
    'GIF exports are bigger and sharper, and a new Quality option (Low, Medium, High) in Export sets GIF size and video quality. Medium is the default.',
    'The Code File button is now called Download Html File.'
  ] },
  { v: '0.13.5', date: '2026-11-07', items: [
    'Randomize can also switch the canvas size between wide and square.'
  ] },
  { v: '0.13.3', date: '2026-11-07', items: [
    'Randomize now draws designed patterns: nested rings, tiled shapes, stripes, sunbursts, checkerboards and mirrored emblems.'
  ] },
  { v: '0.13.2', date: '2026-11-07', items: [
    'Sliders have a new round knob with a glowing centre.',
    'The Look section is now called Tuning.'
  ] },
  { v: '0.13.1', date: '2026-11-07', items: [
    'Randomize now makes a whole new piece: a full canvas, a ready-made shape or random art, with a new mark shape, animation and color, and plays it. You can undo it.'
  ] },
  { v: '0.13.0', date: '2026-11-07', items: [
    'New Randomize button in the left bar: a fresh animation, sliders and color in one click.'
  ] },
  { v: '0.12.0', date: '2026-11-07', items: [
    'New Stacking switch: turn it on to run up to 3 animations together. The first one you click is the base, and each next one shapes it.'
  ] },
  { v: '0.11.2', date: '2026-11-07', items: [
    'New animation: Dissolve, dots fade in and out in random order.'
  ] },
  { v: '0.11.1', date: '2026-11-07', items: [
    'New animation: Bars, columns that rise and fall like an audio meter.'
  ] },
  { v: '0.10.3', date: '2026-11-07', items: [
    'The Twinkle animation has been retired.'
  ] },
  { v: '0.10.1', date: '2026-11-07', items: [
    'Sweep now runs left to right by default.'
  ] },
  { v: '0.10.0', date: '2026-11-07', items: [
    'Five new animations: Breathe, Sweep, Flicker, Zigzag and Reveal. The Heartbeat animation is now called Beats.',
    'Animations show in three rows. Tap More to see the rest.'
  ] },
  { v: '0.9.0', date: '2026-11-07', items: [
    'Every tab has its own address: /tabs/library, /tabs/about, /tabs/whats-new and /tabs/guide.',
    'What\'s New is now written in plain language, separate from the developer log.'
  ] },
  { v: '0.8.4', date: '2026-11-07', items: [
    'Exported files get random, funky names, like grumpy-waffle-42.gif.',
    'Library cards are roomier, with a divider above the buttons.',
    'The status bar spreads out version, views and GitHub stars.'
  ] },
  { v: '0.7.0', date: '2026-11-07', items: [
    'The top bar now tells you what is happening: opening, loading, rendering and saving files.'
  ] },
  { v: '0.6.0', date: '2026-11-07', items: [
    'Export videos as WebM or MP4. They cover one or two full loops, so they repeat cleanly.'
  ] },
  { v: '0.5.0', date: '2026-11-07', items: [
    'The Export tab is split into Background, Code and Media.',
    'New PNG export of the frame you see on screen.'
  ] },
  { v: '0.4.0', date: '2026-11-07', items: [
    'The right panel has Edit and Export tabs.'
  ] },
  { v: '0.3.3', date: '2026-11-07', items: [
    'Library previews run much smoother.'
  ] },
  { v: '0.3.0', date: '2026-11-07', items: [
    'New Library of ready-made templates. Load one into the editor or download the HTML.'
  ] },
  { v: '0.2.0', date: '2026-11-07', items: [
    'New top navigation: Canvas, Library, About, What\'s New and Guide.',
    'Open an exported HTML file to keep editing it.'
  ] },
  { v: '0.1.0', date: '2026-11-07', items: [
    'First version: draw on the dot grid, pick from 10 animations, upload an image, and export a GIF or a web component.'
  ] }
];
