/*
 * Rendering engine shared by the editor and the exported web component.
 *
 * geo = { ox, oy, cell, shape } where shape is 'dot' | 'square' | 'diamond' | 'triangle' | 'star' | 'hash'.
 *
 * IMPORTANT: the functions below are serialised with Function.prototype.toString()
 * and pasted into exported code, so they must stay self-contained: they may only use
 * each other (by these exact names), TAU, STOPS and built-ins. No outer state.
 */
(function () {
  var TAU = Math.PI * 2;

  var STOPS = {
    fire:   [[90, 8, 12], [239, 40, 45], [255, 138, 31], [255, 210, 63], [255, 246, 214]],
    ocean:  [[10, 58, 138], [45, 226, 230], [123, 255, 217]],
    sunset: [[143, 43, 255], [255, 95, 162], [255, 138, 31], [255, 210, 63]],
    neon:   [[45, 226, 230], [143, 123, 255], [255, 47, 214]],
    aurora: [[30, 200, 120], [45, 226, 230], [143, 123, 255]],
    candy:  [[255, 105, 180], [186, 140, 255], [120, 220, 255], [140, 255, 200]],
    forest: [[8, 92, 52], [34, 197, 94], [190, 242, 60]],
    holo:   [[0, 255, 200], [0, 170, 255], [130, 90, 255], [255, 80, 200], [255, 190, 120]]
  };

  function hash(a, b) {
    var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function gradient(stops, x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    var pos = x * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(pos)), f = pos - i;
    var a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  // m: { mode, hex, steps }. c: per-cell data from buildList. v: intensity 0..1.
  // ph: colour phase in cycles (1 = one full loop of the animation), so colours loop seamlessly too.
  function colorFor(m, c, v, ph) {
    ph = ph * (m.cycle === undefined ? 1 : m.cycle);        // whole numbers keep exports looping seamlessly
    switch (m.mode) {
      case 'solid': return m.hex;
      case 'white': return '#ffffff';
      case 'rainbow': return 'hsl(' + ((((c.d * 280 + c.ux * 30 + ph * 360) % 360) + 360) % 360 | 0) + ',90%,60%)';
      case 'glitter':
        var n = m.steps || 12;
        var g = hash(Math.floor(ph * n + c.rnd * 10) % n, c.rnd * 500);
        return g > 0.8 ? '#ffffff' : 'hsl(' + ((c.rnd * 360) | 0) + ',85%,' + ((55 + g * 20) | 0) + '%)';
      case 'fire': return gradient(STOPS.fire, v);
      case 'ocean': return gradient(STOPS.ocean, 0.5 + 0.5 * Math.sin((c.ux * 0.9 + c.uy * 0.5) * Math.PI - ph * TAU));
      case 'sunset': return gradient(STOPS.sunset, 0.5 + c.uy * 0.5 + 0.15 * Math.sin(ph * TAU + c.ux * 2));
      case 'neon': return gradient(STOPS.neon, 0.5 + 0.5 * Math.sin(c.d * TAU * 0.8 - ph * TAU));
      case 'aurora': return gradient(STOPS.aurora, 0.5 + 0.5 * Math.sin(c.ux * 2.2 + c.uy * 0.8 - ph * TAU));
      case 'candy': return gradient(STOPS.candy, 0.5 + 0.5 * Math.sin((c.ux - c.uy) * Math.PI * 0.6 - ph * TAU));
      case 'forest': return gradient(STOPS.forest, 0.5 + 0.5 * Math.sin((c.uy + c.ux * 0.4) * Math.PI - ph * TAU));
      case 'holo': return gradient(STOPS.holo, 0.5 + 0.25 * Math.sin((c.ux * 1.6 + c.uy * 0.8) * Math.PI - ph * TAU) + 0.25 * Math.sin((c.uy * 2.2 - c.ux * 0.6) * Math.PI + ph * TAU * 2));
    }
    return '#fff';
  }

  // cells: array of [col, row]. Precomputes what the presets need for each cell.
  function buildList(cells) {
    var list = [];
    if (!cells.length) return list;
    var sx = 0, sy = 0, minR = Infinity, maxR = -Infinity, i;
    for (i = 0; i < cells.length; i++) {
      sx += cells[i][0]; sy += cells[i][1];
      if (cells[i][1] < minR) minR = cells[i][1];
      if (cells[i][1] > maxR) maxR = cells[i][1];
    }
    var cx = sx / cells.length, cy = sy / cells.length, R = 0.5;
    for (i = 0; i < cells.length; i++) {
      var dd = Math.hypot(cells[i][0] - cx, cells[i][1] - cy);
      if (dd > R) R = dd;
    }
    var spanR = Math.max(1, maxR - minR);
    for (i = 0; i < cells.length; i++) {
      var c = cells[i][0], r = cells[i][1], dx = c - cx, dy = r - cy;
      list.push({
        col: c, row: r, color: cells[i][2],      // color: this dot's own colour (undefined = the shared one)
        d: Math.hypot(dx, dy) / R,
        a: Math.atan2(dy, dx),
        ux: dx / R, uy: dy / R,
        vy: (r - minR) / spanR,
        rnd: hash(c, r), rnd2: hash(c + 17, r + 3), colRnd: hash(c, 99)
      });
    }
    return list;
  }

  // One mark of the grid, centred on x,y. s is its size (the diameter, for a dot).
  // Sizes are tuned so every shape carries about the same visual weight as a dot.
  function dot(ctx, x, y, s, shape) {
    var h = s / 2, r;
    if (shape === 'square') { ctx.fillRect(x - h, y - h, s, s); return; }
    if (shape === 'hash') {                          // # : two upright and two flat bars
      var hl = h * 1.15, hb = h * 0.4, th = Math.max(1, s * 0.22);
      ctx.beginPath();                               // one path, so the crossings are not drawn twice (no darker spots)
      ctx.rect(x - hb - th / 2, y - hl, th, hl * 2); ctx.rect(x + hb - th / 2, y - hl, th, hl * 2);
      ctx.rect(x - hl, y - hb - th / 2, hl * 2, th); ctx.rect(x - hl, y + hb - th / 2, hl * 2, th);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    if (shape === 'diamond') {
      r = h * 1.25;
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (shape === 'star') {                  // a five-point star, point up
      r = h * 1.45;
      for (var n = 0; n < 10; n++) {
        var ang = -Math.PI / 2 + n * Math.PI / 5, rad = n % 2 ? r * 0.45 : r;
        if (n) ctx.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad); else ctx.moveTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
      }
      ctx.closePath();
    } else if (shape === 'triangle') {
      r = h * 1.4;                                   // pointing up, centred on its bounding box
      ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x + r * 0.9, y + r * 0.85); ctx.lineTo(x - r * 0.9, y + r * 0.85);
      ctx.closePath();
    } else {
      ctx.arc(x, y, h, 0, TAU);
    }
    ctx.fill();
  }

  // Draw every selected cell. time: seconds, phase: colour phase in cycles (see colorFor).
  // geo: { ox, oy, cell }. full: draw at full strength (no animation).
  function drawCells(ctx, list, fn, p, mode, time, phase, geo, full) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var v = full ? 1 : fn(c, time, p);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      var x = geo.ox + (c.col + 0.5) * geo.cell, y = geo.oy + (c.row + 0.5) * geo.cell;
      var s = geo.cell * p.size * (0.4 + 0.6 * v);
      var cm = c.color ? (c.color.steps = mode.steps, c.color) : mode;
      ctx.fillStyle = colorFor(cm, c, v, phase);
      if (p.glow > 0.01 && v > 0.05) {
        ctx.globalAlpha = 0.2 * p.glow * v;
        dot(ctx, x, y, s * 1.9, geo.shape);
      }
      ctx.globalAlpha = 0.18 + 0.82 * v;
      dot(ctx, x, y, s, geo.shape);
    }
    ctx.globalAlpha = 1;
  }

  // Draw every layer on one canvas. layers: [{ list, fn, p, color, shape, k }]; each layer has its own dots, animation and
  // look, and runs at its own speed (k scales time so every layer finishes whole cycles when the longest one loops).
  function drawLayers(ctx, layers, time, phase, geo, full) {
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      drawCells(ctx, l.list, l.fn, l.p, l.color, time * l.k, phase, { ox: geo.ox, oy: geo.oy, cell: geo.cell, shape: l.shape || geo.shape }, full);
    }
  }

  // The faint empty grid, in the same mark shape. vis: 0..1.
  function drawIdle(ctx, cols, rows, geo, vis) {
    ctx.fillStyle = 'rgba(246,239,227,' + (0.03 + 0.3 * vis).toFixed(3) + ')';
    var size = geo.cell * 0.3;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        dot(ctx, geo.ox + (c + 0.5) * geo.cell, geo.oy + (r + 0.5) * geo.cell, size, geo.shape);
      }
    }
  }

  /*
   * Timeline: decides what time to draw for Auto / Hover / Click.
   *   auto  - loops forever
   *   hover - loops while hovered, stops immediately when the pointer leaves and returns to rest
   *   click - plays one cycle per trigger, then rests
   * At rest the animation sits at t = 0. T is the loop length in seconds.
   */
  function makeTimeline(mode) {
    return { mode: mode, t: 0, ph: 0, running: mode === 'auto', stopAt: null };
  }
  function tlSetMode(tl, mode) {
    tl.mode = mode; tl.t = 0; tl.ph = 0; tl.stopAt = null; tl.running = mode === 'auto';
  }
  function tlAdvance(tl, dt, T) {
    if (!tl.running) return;
    tl.t += dt; tl.ph += dt / T;
    if (tl.stopAt !== null && tl.t >= tl.stopAt) { tl.running = false; tl.t = 0; tl.ph = 0; tl.stopAt = null; }
  }
  function tlStart(tl) { tl.running = true; tl.stopAt = null; }
  function tlStop(tl) {
    if (tl.mode !== 'auto') { tl.running = false; tl.t = 0; tl.ph = 0; tl.stopAt = null; }
  }
  function tlTrigger(tl, T) { tl.running = true; tl.t = 0; tl.ph = 0; tl.stopAt = T; }

  window.DotEngine = {
    STOPS: STOPS, hash: hash, gradient: gradient, colorFor: colorFor,
    buildList: buildList, dot: dot, drawCells: drawCells, drawLayers: drawLayers, drawIdle: drawIdle,
    makeTimeline: makeTimeline, tlSetMode: tlSetMode, tlAdvance: tlAdvance,
    tlStart: tlStart, tlStop: tlStop, tlTrigger: tlTrigger
  };
})();
