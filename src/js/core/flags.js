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
    welcomePopup: true,         // Closed beta: a welcome popup (preview, intro, Let's Go / How to use / Feedback) over the tool
    dotShapes: true,            // Shapes group: Dot / Square / Diamond / Triangle marks
    imageUpload: true,          // Image group: upload a picture (or drop one on the canvas) and animate it
    exportCodeFile: true,       // Export: "Code File" (ready-to-open .html with the component)
    exportPng: true,            // Export > Media: "PNG" (the frame on screen, at full size)
    exportWebm: true,           // Export > Media: "WebM" video of the full loop (1-2 cycles, loops seamlessly)
    exportMp4: true,            // Export > Media: "MP4" video of the full loop (needs a browser that can record MP4)
    exportGif: true,            // Export: "GIF" (one seamless loop, 30 fps)
    exportCopyForLlm: true,     // Export: "Copy for LLM" (instructions + code)
    agentTools: true,           // Helper tools for AI agents visiting the page: window.dotMania (src/js/agent.js), also as WebMCP tools

    /* ---- OFF: removed from the product, kept behind a flag so it can be tested later ---- */

    exportSvg: false,           // Export > Media: "SVG" (the frame on screen as scalable vector)
    colorRandom: false,         // Color group: a Randomize button in the colour grid (the left bar Randomize still picks a colour)
    forestColor: false,         // Color group: the "Forest" green gradient
    homePage: false,            // A welcome page at / in front of the tool (off: the tool opens straight away at /)
    aboutPage: false,           // Top nav: the About page (/tabs/about)
    guidePage: false,           // Top nav: the Guide page (/tabs/guide)
    libraryPage: false,         // Top nav: the Library page of ready-made templates (/tabs/library)
    whatsNewPage: false,        // Top nav: the What's New page (/tabs/whats-new)
    holoColor: false,           // Color group: the "Holo" multi-colour gradient
    whiteColor: false,          // Color group: the "White" preset
    extraTools: false,          // Left bar: the Line tool (the Eraser is always in the Clear group)
    imageAdvanced: false,       // Image group: "Level" slider and "Fit / Fill" (default is 50% level, fit)
    interaction: false,         // Interaction group: Auto / Hover / Click playback (exported component too)
    extraPresets: false,        // 24 more animations: Diamond, Burst, Blink, Twinkle, Blob, Tunnel, Plasma, Stripes, Blinds, Cross, Fireworks, Tide, Glint, Helix, Carousel, Streaks, Chess, Swing, Bounce, Strobe, Glitch, Checker, Orbit, Radar
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
