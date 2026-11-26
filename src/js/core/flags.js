/*
 * Feature flags.
 *
 * Edit the values below, or override them from the address bar without touching code:
 *
 *   index.html?flags=interaction,gridPanel     turn those on
 *   index.html?flags=all                       turn on everything that is currently off
 *   index.html?off=imageUpload,exportGif       turn those off
 *
 * Flags only show or hide features. Nothing is deleted, so anything that is off can be switched
 * back on to test it.
 */
(function () {
  var FLAGS = {

    /* ---- ON: what ships today (switch off to hide it) ---- */

    pointerOptions: false,      // Edit tab: a Pointer group to try the other canvas pointers (the Square one is the final choice)
    welcomeOnce: false,         // Welcome popup: first visit only, then again after 5 hours (off = it shows on every visit, for testing)
    welcomePopup: false,        // Closed beta: a welcome popup (preview, intro, Let's Go / How to use / Feedback) over the tool
    dotShapes: true,            // Shapes group: Dot / Square / Diamond / Triangle marks
    imageUpload: true,          // Image group: upload a picture (or drop one on the canvas) and animate it
    exportCodeFile: true,       // Export: "Code File" (ready-to-open .html with the component)
    exportWebm: true,           // Export > Media: "WebM" video of the full loop (1-2 cycles, loops seamlessly)
    exportMp4: true,            // Export > Media: "MP4" video of the full loop (needs a browser that can record MP4)
    exportSvg: true,            // Export > Media: "SVG" (a plain still of the drawing, not animated, as scalable vector)
    exportGif: true,            // Export: "GIF" (one seamless loop, 30 fps)
    exportCopyForLlm: true,     // Export: "Copy for LLM" (instructions + code)
    fitScreen: true,            // Windows smaller than 1600 x 732 (or browser zoom): draw the page at 1600 x 732 and scale it down to fit (src/js/layout/scale.js); 1600 x 732 and bigger is left alone; off = never scaled
    agentTools: true,          // Helper tools for AI agents visiting the page: window.dotMania (src/js/agent.js), also as WebMCP tools

    layersPanel: false,         // Second right panel: the Layers card (Add layer + layer list)
    gridSizePicker: true,       // Properties: a Size group, 16 x 16 / 32 x 32 / 64 x 64 dots (the picker that used to sit beside the canvas)
    collapseTitles: true,       // Normal layout: a caret at the end of every functionality title folds what is under it (src/js/layout/collapse.js)
    craftedBy: false,           // Left bar: the "Crafted By Imtiyaz Ahmed" credit at the bottom

    /* ---- OFF: removed from the product, kept behind a flag so it can be tested later ---- */

    exportPng: false,           // Export > Media: "PNG" (the frame on screen, at full size; replaced by SVG)
    colorRandom: false,         // Color group: a Randomize button in the colour grid (the left bar Randomize still picks a colour)
    forestColor: true,          // Color group: the "Forest" green gradient
    homePage: false,            // A welcome page at / in front of the tool (off: the tool opens straight away at /)
    aboutPage: false,           // Top nav: the About page (/tabs/about)
    guidePage: false,           // Top nav: the Guide page (/tabs/guide)
    libraryPage: true,          // Top nav: the Library page of ready-made templates (/tabs/library)
    whatsNewPage: false,        // Top nav: the What's New page (/tabs/whats-new)
    holoColor: true,            // Color group: the "Holo" multi-colour gradient
    whiteColor: false,          // Color group: the "White" preset
    extraTools: false,          // Left bar: the Line tool (the Eraser is always in the Clear group)
    imageDither: false,         // Image group: the "Dither" style (Threshold and Outline stay)
    imageTuning: true,          // Image card: a Tuning group under the picture: Spread, Tone, Smooth (sliders)
    imageOptions: false,        // Image group: the Style (Threshold / Outline) and Dots on options (they stay at their defaults while off)
    imageAdvanced: false,       // Image group: "Level" slider and "Fit / Fill" (default is 50% level, fit)
    interaction: false,         // Interaction group: Auto / Hover / Click playback (exported component too)
    starterShapes: false,       // Starters group: whole drawings (Full, Checkers, Disc, Ring, Diamond, Star, Heart, Snowflake)
    drawOptions: false,         // Draw group: brush size, and filled / outline rectangles and ellipses
    gridPanel: false,           // Grid group: grid size (8-48 px) and grid visibility
    colorCycle: false,          // Color group: "Cycle" slider (how many times colours loop per animation loop)
    exportGridOption: false,    // Export: show / hide the empty grid
    exportCopyEmbed: false,     // Export: "Copy embed code" (just the component snippet, no instructions)
    exportDownloadJs: false,    // Export: "Download .js" (the component script on its own)
    stackingSwitch: false,      // Animate tab: the Stacking Off / On switch (Layers tab now does the stacking: add, reorder, remove)
    canvasSizes: false,         // Left bar: the canvas size buttons and the wide 1920x1080 canvas (off: always the 1080x1080 square)
    statusHeader: false         // the "Preset / Looping" title bar above the panel
  };

  var q = new URLSearchParams(window.location.search);
  function names(key) { return (q.get(key) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  var on = names('flags'), off = names('off');

  if (on.indexOf('all') > -1) Object.keys(FLAGS).forEach(function (k) { FLAGS[k] = true; });
  on.forEach(function (k) {
    if (k === 'all') return;
    if (k in FLAGS) FLAGS[k] = true; else console.warn('[flags] unknown flag:', k);
  });
  off.forEach(function (k) {
    if (k in FLAGS) FLAGS[k] = false; else console.warn('[flags] unknown flag:', k);
  });

  window.FLAGS = FLAGS;
})();
