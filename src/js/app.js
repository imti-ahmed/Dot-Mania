(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var FLAGS = window.FLAGS;     // feature flags, see flags.js
  var TRIAL = window.TRIAL_PRESETS || [];
  TRIAL.forEach(function (p) { p.trial = true; });
  var PRESETS = window.PRESETS.concat(FLAGS.extraPresets ? window.EXTRA_PRESETS : [], TRIAL);
  var MAIN = PRESETS.filter(function (p) { return !p.trial; });   // the Animations list (trial ones have their own group)
  var COMMON = window.COMMON_PARAMS, SWATCHES = window.SWATCHES;
  var TAU = Math.PI * 2;
  var E = window.DotEngine;

  var CELL = 16;              // grid size in artboard px
  var GRID_VIS = 0.35;        // visibility of the empty grid

  var stage = $('#stage'), area = $('#stageArea'), cv = $('#cv'), ctx = cv.getContext('2d');
  var idle = document.createElement('canvas'), idleCtx = idle.getContext('2d');

  var state = {
    tool: 'pencil',
    playing: true,
    art: { w: 1080, h: 1080 },     // artboard size in px (1080x1080 by default; the wide 1920x1080 is behind the canvasSizes flag)
    dotShape: 'dot',               // mark shape: dot | square | diamond | triangle | star | hash
    preset: PRESETS[0].id,         // the base animation (first of the stack)
    stacking: false,               // Stacking switch: pick up to 3 animations that run together
    stack: [PRESETS[0].id],        // animation ids in the order they were clicked
    interaction: 'auto',           // auto | hover | click
    values: {},
    color: { mode: 'solid', hex: '#ef282d', cycle: 1 },
    brush: 1,                      // pencil / eraser / line size (Draw options flag)
    outline: false                 // rectangle / ellipse drawn as an outline (Draw options flag)
  };
  PRESETS.forEach(function (p) {
    var v = Object.assign({}, p.defaults);
    p.params.forEach(function (q) { v[q.key] = q.def; });
    state.values[p.id] = v;
  });

  var cells = new Set();      // selected cells as "col,row"
  var cellColor = new Map();  // each cell's own colour, fixed when it was drawn: "col,row" -> { mode, hex, cycle }
  var list = [];              // precomputed per-cell data for the animation
  var dirty = true;
  var repaintColor = function () {}, repaintShapes = function () {};   // set once those panels are built
  var cols = 0, rows = 0, ox = 0, oy = 0;
  var hover = null, drag = null, sel = null;   // sel: the Select tool's rectangle {c0,r0,c1,r1}
  var baseCursor = '', hoverPt = null, lastCursor = null;   // the chosen pointer, where it is on the canvas, and what is applied now
  var selMode = 'move';                        // with a selection: 'move' (drag inside) or 'resize' (drag a handle)
  var undoStack = [], redoStack = [];
  var tl = E.makeTimeline('auto');   // what time the animation is at (see engine.js)

  /* ---------- Artboard + grid ---------- */

  // The stage (the canvas card) always fills its parent card, whatever the screen size. Its logical size follows the
  // card's shape, and the artboard (state.art: 1920x1080 or the 1080x1080 square) is scaled to fit entirely inside it and
  // centred. So on a small or tall screen the canvas stays as big as its parent and the grid just has empty space
  // around it, the same as the square frame does.
  var STAGE = { w: 1920, h: 1080 };
  function w() { return STAGE.w; }
  function h() { return STAGE.h; }

  function computeGrid() {
    cols = Math.max(1, Math.floor(state.art.w / CELL));
    rows = Math.max(1, Math.floor(state.art.h / CELL));
    ox = (w() - cols * CELL) / 2;
    oy = (h() - rows * CELL) / 2;
  }

  var canvasSized = false;
  function resizeCanvases() {
    canvasSized = true;
    cv.width = idle.width = w();
    cv.height = idle.height = h();
    computeGrid();
    drawIdle();
    dirty = true;
    updateInfo();
  }

  // Make the stage fill the card, and keep its drawing resolution in step with the card's shape.
  function fitStage(force) {
    var r = area.getBoundingClientRect();
    var availW = r.width - 32, availH = r.height - 32;
    if (availW <= 0 || availH <= 0) { if (!canvasSized) resizeCanvases(); return; }   // card not on screen yet: still give the canvas a size
    var s = Math.min(availW / state.art.w, availH / state.art.h);   // the artboard fits whole
    var nw = Math.max(state.art.w, Math.round(availW / s)), nh = Math.max(state.art.h, Math.round(availH / s));
    stage.style.width = Math.floor(availW) + 'px';
    stage.style.height = Math.floor(availH) + 'px';
    if (force === true || !canvasSized || nw !== STAGE.w || nh !== STAGE.h) {
      STAGE.w = nw; STAGE.h = nh;
      resizeCanvases();
    }
  }

  function layout() { fitStage(true); }

  // Switch artboard size; the drawing stays centred and anything that no longer fits is dropped.
  function setArt(width, height) {
    var oldCols = cols, oldRows = rows;
    state.art = { w: width, h: height };
    computeGrid();
    var dc = Math.floor((cols - oldCols) / 2), dr = Math.floor((rows - oldRows) / 2);
    syncColors();
    function remap(set, colors) {
      var next = new Set(), nextColor = new Map();
      set.forEach(function (k) {
        var p = k.split(','), c = +p[0] + dc, r = +p[1] + dr;
        if (c >= 0 && r >= 0 && c < cols && r < rows) { next.add(c + ',' + r); if (colors.has(k)) nextColor.set(c + ',' + r, colors.get(k)); }
      });
      return { cells: next, colors: nextColor };
    }
    var mine = remap(cells, cellColor);
    cells = mine.cells; cellColor = mine.colors;
    layers.forEach(function (L, i) {                       // the other layers move with the same grid
      if (i === activeLayer) return;
      var m = remap(L.cells, L.colors);
      L.cells = m.cells; L.colors = m.colors; L.list = null; L.undo = []; L.redo = [];
    });
    undoStack = []; redoStack = [];
    hover = null; drag = null;
    layout();
    if (imgSrc) { imgRaster = null; applyImage(); }
    document.querySelectorAll('[data-size]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.size === width + 'x' + height));
    });
  }

  function drawIdle() {
    idleCtx.clearRect(0, 0, w(), h());
    E.drawIdle(idleCtx, cols, rows, geo(), GRID_VIS);
  }

  /* ---------- Selection data, colour and rendering (engine.js, shared with the export) ---------- */

  function geo() { return { ox: ox, oy: oy, cell: CELL, shape: state.dotShape }; }
  // Same grid, positioned inside the artboard (what exports use), not the stage.
  function exportGeo() {
    return { ox: (state.art.w - cols * CELL) / 2, oy: (state.art.h - rows * CELL) / 2, cell: CELL, shape: state.dotShape };
  }
  // A dot keeps the colour that was selected when it was drawn. Changing the colour later only affects new dots.
  var lastSnap = null;
  function colorSnap() {
    var c = state.color, cy = c.cycle === undefined ? 1 : c.cycle;
    if (lastSnap && lastSnap.mode === c.mode && lastSnap.hex === c.hex && lastSnap.cycle === cy) return lastSnap;
    return (lastSnap = { mode: c.mode, hex: c.hex, cycle: cy });
  }
  // Drop colours of dots that are gone, and give any new dot the colour selected right now.
  function syncColors() {
    cellColor.forEach(function (v, k) { if (!cells.has(k)) cellColor.delete(k); });
    var snap = null;
    cells.forEach(function (k) { if (!cellColor.has(k)) cellColor.set(k, snap || (snap = colorSnap())); });
  }
  function cellArray() {
    syncColors();
    var a = [];
    cells.forEach(function (k) { var p = k.split(','); a.push([+p[0], +p[1], cellColor.get(k)]); });
    return a;
  }
  function rebuild() { dirty = false; list = E.buildList(cellArray()); }

  // Eight colour presets with fixed palettes. A swatch or the custom picker switches to 'solid'.
  var COLOR_MODES = [
    { id: 'white', name: 'White', flag: 'whiteColor' },
    { id: 'rainbow', name: 'Rainbow' },
    { id: 'glitter', name: 'Glitter' },
    { id: 'fire', name: 'Fire' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'neon', name: 'Neon' },
    { id: 'aurora', name: 'Aurora' },
    { id: 'candy', name: 'Candy' },
    { id: 'forest', name: 'Forest', flag: 'forestColor' },
    { id: 'ice', name: 'Ice' },
    { id: 'lava', name: 'Lava' },
    { id: 'dusk', name: 'Dusk' },
    { id: 'mint', name: 'Mint' },
    { id: 'gold', name: 'Gold' },
    { id: 'holo', name: 'Holo', flag: 'holoColor' }
  ].filter(function (c) { return !c.flag || FLAGS[c.flag]; });

  // A random pick from the colour options we offer: every colour preset and every solid swatch, equally likely
  // (so solids come up about as often as the gradient-style presets).
  function randomColor() {
    var n = Math.floor(Math.random() * (COLOR_MODES.length + SWATCHES.length));
    if (n < COLOR_MODES.length) state.color.mode = COLOR_MODES[n].id;
    else { state.color.mode = 'solid'; state.color.hex = SWATCHES[n - COLOR_MODES.length]; }
    repaintColor();
  }
  function previewColor() { return state.color.mode === 'solid' ? state.color.hex : '#f6efe3'; }
  /* ---------- Stacking ----------
   * With Stacking on, up to 3 animations run together. The first is the base; each later one shapes it:
   *   v = v * (FLOOR + (1 - FLOOR) * next)
   * so the order matters. Speed, Size and Glow are shared (the base's); each animation keeps its own sliders.
   * To keep the loop seamless, every layer is time-scaled to whole cycles of the longest one.
   */
  var STACK_MAX = 3, STACK_FLOOR = 0.25, stackLayers = [], stackT = 1;
  function presetById(id) { return PRESETS.find(function (p) { return p.id === id; }); }
  function isStacked() { return state.stacking && state.stack.length > 1; }
  function refreshStack() {
    var base = state.values[state.stack[0]], periods = [];
    stackLayers = state.stack.map(function (id, i) {
      var preset = presetById(id), v = Object.assign({}, state.values[id], { speed: base.speed, size: base.size, glow: base.glow });
      periods.push(preset.period(v));
      return { preset: preset, vals: v, k: 1 };
    });
    stackT = Math.max.apply(null, periods);
    stackLayers.forEach(function (l, i) { l.k = Math.max(1, Math.round(stackT / periods[i])) * periods[i] / stackT; });
  }
  function stackSource() {
    refreshStack();
    var meta = stackLayers.map(function (l) { return { id: l.preset.id, v: l.vals, k: l.k }; });
    var out = '/*STACK:' + JSON.stringify(meta) + '*/(function(){';
    stackLayers.forEach(function (l, i) { out += 'var f' + i + '=' + l.preset.fn.toString() + ';var v' + i + '=' + JSON.stringify(l.vals) + ';'; });
    out += 'return function(c,t,p){var v=1,x;';
    stackLayers.forEach(function (l, i) {
      out += 'x=f' + i + '(c,t*' + l.k + ',v' + i + ');x=x<0?0:x>1?1:x;v=' + (i ? 'v*(' + STACK_FLOOR + '+' + (1 - STACK_FLOOR) + '*x)' : 'x') + ';';
    });
    return out + 'return v;};})()';
  }
  var STACK = {
    id: '__stack', defaults: {}, params: [],
    get name() { return state.stack.map(function (id) { return presetById(id).name; }).join(' + '); },
    period: function () { return stackT; },
    fn: function (c, t) {
      var v = 1;
      for (var i = 0; i < stackLayers.length; i++) {
        var l = stackLayers[i], x = l.preset.fn(c, t * l.k, l.vals);
        x = x < 0 ? 0 : x > 1 ? 1 : x;
        v = i ? v * (STACK_FLOOR + (1 - STACK_FLOOR) * x) : x;
      }
      return v;
    },
    get source() { return stackSource(); }
  };
  // The stack's Speed / Size / Glow are the base animation's.
  Object.defineProperty(state.values, STACK.id, { get: function () { return state.values[state.stack[0]]; }, enumerable: false });

  function currentPreset() {
    if (isStacked()) { refreshStack(); return STACK; }
    return presetById(state.preset);
  }
  function activePeriod() { var p = currentPreset(); return p.period(state.values[p.id]); }
  function currentPeriod() { return loopPeriod(); }       // all layers loop together, on the longest one

  // A fresh set of animation values (Speed, Size, Glow and each animation's sliders). Every layer has its own.
  function makeValues() {
    var vals = {};
    PRESETS.forEach(function (p) {
      var v = Object.assign({}, p.defaults);
      p.params.forEach(function (q) { v[q.key] = q.def; });
      vals[p.id] = v;
    });
    Object.defineProperty(vals, STACK.id, { get: function () { return vals[state.stack[0]]; }, enumerable: false });
    return vals;
  }

  function render() {
    if (dirty) rebuild();
    ctx.clearRect(0, 0, w(), h());
    ctx.drawImage(idle, 0, 0);

    var i;
    // While drawing, show every cell at full strength so you can see exactly what you've painted.
    // Paused (the default) shows the drawing as it is, at full strength. Play brings the animation in.
    E.drawLayers(ctx, layerItems(), tl.t, tl.ph, geo(), !!drag || (tl.mode === 'auto' && !state.playing));

    // live preview for line / rect / ellipse
    if (drag && drag.shapeTool) {
      var pv = shapeCells(drag);
      ctx.fillStyle = drag.erase ? '#ffffff' : previewColor();
      ctx.globalAlpha = 0.4;
      for (i = 0; i < pv.length; i++) E.dot(ctx, ox + (pv[i][0] + 0.5) * CELL, oy + (pv[i][1] + 0.5) * CELL, CELL * 0.8, state.dotShape);
      ctx.globalAlpha = 1;
    }

    // Select tool: the rectangle being dragged out, or the chosen one (dashed)
    var box = drag && drag.mode === 'marquee' ? { c0: Math.min(drag.start.col, drag.cur.col), r0: Math.min(drag.start.row, drag.cur.row), c1: Math.max(drag.start.col, drag.cur.col), r1: Math.max(drag.start.row, drag.cur.row) } : sel;
    if (box) {
      var bx = ox + box.c0 * CELL, by = oy + box.r0 * CELL, bw = (box.c1 - box.c0 + 1) * CELL, bh = (box.r1 - box.r0 + 1) * CELL;
      ctx.fillStyle = 'rgba(94,160,255,.14)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(94,160,255,.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.setLineDash([]);
      if (box === sel && selMode === 'resize') {                 // the eight resize handles
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(94,160,255,1)';
        ctx.lineWidth = 2;
        handlePoints(sel).forEach(function (hp) { ctx.fillRect(hp.x - 6, hp.y - 6, 12, 12); ctx.strokeRect(hp.x - 6, hp.y - 6, 12, 12); });
      }
    }
    syncSelectionUI();
    updateCursor();

    // hover marker: the brush footprint for pencil / eraser, a single cell otherwise
    if (hover && state.tool !== 'select' && !(drag && drag.shapeTool)) {
      var f = footprint(hover.col, hover.row, (state.tool === 'pencil' || state.tool === 'eraser') ? state.brush : 1);
      var fw = (f.c1 - f.c0 + 1) * CELL, fh = (f.r1 - f.r0 + 1) * CELL;
      ctx.fillStyle = state.tool === 'eraser' ? '#ffffff' : previewColor();
      ctx.globalAlpha = 0.16;
      ctx.fillRect(ox + f.c0 * CELL, oy + f.r0 * CELL, fw, fh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(246,239,227,.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + f.c0 * CELL + 1, oy + f.r0 * CELL + 1, fw - 2, fh - 2);
    }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (tl.mode !== 'auto' || state.playing) E.tlAdvance(tl, dt, loopPeriod());
    render();
    requestAnimationFrame(frame);
  }

  /* ---------- Layers ----------
   * Each layer is its own set of dots with its own colours, animation, values and mark shape (and its own undo history).
   * The editor works on one layer at a time (the active one): its data lives in the usual variables (cells, state.preset, ...)
   * and is swapped in and out when you pick another layer. All layers are drawn together, each running its own animation.
   */
  var layers = [], activeLayer = 0, LAYER_MAX = 5;

  function layerName() {
    var n = 1, names = layers.map(function (L) { return L.name; });
    while (names.indexOf('Layer ' + n) > -1) n++;
    return 'Layer ' + n;
  }
  function newLayer() {
    return {
      name: layerName(), cells: new Set(), colors: new Map(), list: null,
      preset: PRESETS[0].id, stack: [PRESETS[0].id], stacking: false, values: makeValues(),
      dotShape: state.dotShape, color: { mode: state.color.mode, hex: state.color.hex, cycle: state.color.cycle === undefined ? 1 : state.color.cycle },
      undo: [], redo: []
    };
  }
  // The very first layer is whatever is on the canvas right now.
  function initLayers() {
    layers = [];
    var L = newLayer();
    L.values = state.values;
    layers.push(L);
    activeLayer = 0;
    saveActive();
  }
  function saveActive() {
    var L = layers[activeLayer];
    if (!L) return;
    syncColors();
    if (dirty) rebuild();
    L.cells = cells; L.colors = cellColor; L.list = list;
    L.preset = state.preset; L.stack = state.stack; L.stacking = state.stacking; L.values = state.values;
    L.dotShape = state.dotShape; L.color = Object.assign({}, state.color); L.undo = undoStack; L.redo = redoStack;
  }
  function loadLayer(i) {
    activeLayer = i;
    var L = layers[i];
    cells = L.cells; cellColor = L.colors; list = L.list || []; dirty = !L.list;
    state.preset = L.preset; state.stack = L.stack; state.stacking = L.stacking; state.values = L.values;
    state.dotShape = L.dotShape; Object.assign(state.color, L.color);
    undoStack = L.undo; redoStack = L.redo;
    sel = null; drag = null; hover = null;
    if (imgSrc) { imgSrc = null; imgRaster = null; if (imgUI.opts) setImageActive(false); }
    refreshLayerUI();
  }
  // Everything that shows the active layer's properties.
  function refreshLayerUI() {
    if (stackRow) stackRow.repaint();
    refreshPresets();
    buildControls();
    repaintColor(); repaintShapes();
    updateInfo();
    buildLayerPanel();
  }
  function selectLayer(i) {
    if (i === activeLayer || !layers[i]) return;
    saveActive();
    loadLayer(i);
  }
  function addLayer() {
    if (layers.length >= LAYER_MAX) { notify('Up to ' + LAYER_MAX + ' layers'); return; }
    saveActive();
    layers.push(newLayer());
    loadLayer(layers.length - 1);
  }
  function removeLayer(i) {
    if (layers.length < 2) return;
    saveActive();
    layers.splice(i, 1);
    loadLayer(Math.min(i < activeLayer ? activeLayer - 1 : (i === activeLayer ? i : activeLayer), layers.length - 1));
  }
  function anyCells() {
    return layers.some(function (L, i) { return (i === activeLayer ? cells : L.cells).size > 0; });
  }
  function arrayOf(set, colors, fallback) {
    var a = [], fb = { mode: fallback.mode, hex: fallback.hex, cycle: fallback.cycle === undefined ? 1 : fallback.cycle };
    set.forEach(function (k) { var p = k.split(','); a.push([+p[0], +p[1], colors.get(k) || fb]); });
    return a;
  }
  function layerPeriod(L, live) {
    if (live) return activePeriod();
    var p = presetById(L.preset);
    return p.period(L.values[p.id]);
  }
  // The loop length: the longest animation among the layers that have dots.
  function loopPeriod() {
    var T = 0, any = false;
    layers.forEach(function (L, i) {
      var live = i === activeLayer;
      if (!(live ? cells.size : L.cells.size)) return;
      any = true;
      T = Math.max(T, layerPeriod(L, live));
    });
    return any ? T : activePeriod();
  }
  // What to draw, one entry per layer that has dots (hidden-by-emptiness layers cost nothing).
  function layerItems() {
    var T = loopPeriod(), out = [];
    layers.forEach(function (L, i) {
      var live = i === activeLayer;
      if (!(live ? cells.size : L.cells.size)) return;
      var preset = live ? currentPreset() : presetById(L.preset), vals = (live ? state.values : L.values)[preset.id];
      var per = preset.period(vals), color = live ? state.color : L.color;
      color.steps = Math.max(2, Math.round(per * 6));
      var lst = live ? list : (L.list || (L.list = E.buildList(arrayOf(L.cells, L.colors, L.color))));
      out.push({
        list: lst, fn: preset.fn, p: vals, color: color, shape: live ? state.dotShape : L.dotShape,
        k: Math.max(1, Math.round(T / per)) * per / T, period: per, preset: preset, layer: L, live: live
      });
    });
    return out;
  }
  // The same, as fresh copies for the exports (own dot lists, nothing shared with the editor).
  function exportLayers() {
    return layerItems().map(function (it) {
      var arr = it.live ? cellArray() : arrayOf(it.layer.cells, it.layer.colors, it.layer.color);
      return {
        cells: arr, list: E.buildList(arr), preset: it.preset, fn: it.fn, p: Object.assign({}, it.p),
        color: Object.assign({}, it.color), shape: it.shape, k: it.k, period: it.period, name: it.layer.name
      };
    });
  }
  // Does any dot in the exports use a gradient colour (so a GIF needs a richer palette)?
  function layersAreRich(items) {
    return items.some(function (it) {
      return it.cells.some(function (c) { var m = (c[2] || it.color).mode; return m !== 'solid' && m !== 'white'; });
    });
  }

  /* ---------- History ---------- */

  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    var same = true;
    a.forEach(function (k) { if (!b.has(k)) same = false; });
    return same;
  }
  function beginEdit() { syncColors(); var s = new Set(cells); s.colors = new Map(cellColor); return s; }
  function restoreEdit(s) { cells = new Set(s); cellColor = new Map(s.colors || []); }
  function sameColors(a, b) {          // colours of the same dots (a: Map from a snapshot, b: the live Map)
    var same = true;
    b.forEach(function (c, k) {
      var o = a && a.get(k);
      if (!o || o.mode !== c.mode || o.hex !== c.hex || o.cycle !== c.cycle) same = false;
    });
    return same;
  }
  // The Select tool: choosing a colour while a rectangle is selected recolours the dots inside it (one undoable step).
  function recolorSelection() {
    if (!sel || drag || !cells.size) return;
    var before = beginEdit(), snap = colorSnap(), n = 0;
    cells.forEach(function (k) {
      var q = k.split(','), c = +q[0], r = +q[1];
      if (c >= sel.c0 && c <= sel.c1 && r >= sel.r0 && r <= sel.r1) { cellColor.set(k, snap); n++; }
    });
    if (!n) return;
    dirty = true;
    endEdit(before);
  }
  function endEdit(before) {
    if (sameSet(before, cells) && sameColors(before.colors, cellColor)) return;
    undoStack.push(before);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(beginEdit());
    restoreEdit(undoStack.pop()); sel = null;
    dirty = true; updateInfo();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(beginEdit());
    restoreEdit(redoStack.pop()); sel = null;
    dirty = true; updateInfo();
  }
  /* ---------- Drawing ---------- */

  // Pointer position -> grid cell, accounting for the artboard being scaled to fit.
  function cellAt(e) {
    var r = cv.getBoundingClientRect();
    var x = (e.clientX - r.left) * (w() / r.width), y = (e.clientY - r.top) * (h() / r.height);
    var c = Math.floor((x - ox) / CELL), q = Math.floor((y - oy) / CELL);
    return { col: Math.max(0, Math.min(cols - 1, c)), row: Math.max(0, Math.min(rows - 1, q)) };
  }

  function setCell(c, r, add) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    if (add) cells.add(c + ',' + r); else cells.delete(c + ',' + r);
    dirty = true;
  }

  // n x n square brush with the cursor cell near its centre.
  function footprint(col, row, n) {
    var lo = -Math.floor((n - 1) / 2), hi = Math.ceil((n - 1) / 2);
    return { c0: col + lo, c1: col + hi, r0: row + lo, r1: row + hi };
  }
  function stamp(col, row, add) {
    var f = footprint(col, row, state.brush);
    for (var r = f.r0; r <= f.r1; r++) for (var c = f.c0; c <= f.c1; c++) setCell(c, r, add);
  }
  // Thicken a list of cells to the brush size (lines and outlines).
  function expand(arr, n) {
    if (n <= 1) return arr;
    var seen = {}, out = [];
    arr.forEach(function (p) {
      var f = footprint(p[0], p[1], n);
      for (var r = f.r0; r <= f.r1; r++) for (var c = f.c0; c <= f.c1; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        var k = c + ',' + r;
        if (!seen[k]) { seen[k] = 1; out.push([c, r]); }
      }
    });
    return out;
  }

  function lineCells(a, b) {
    var out = [], x0 = a.col, y0 = a.row, x1 = b.col, y1 = b.row;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
      out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  // Cells covered by the line / rectangle / ellipse currently being dragged.
  // The box a shape fills. Normally corner to corner; with Shift (circle) or Alt (shape, circle) it grows outward from where
  // you pressed, so the press point is the centre.
  function shapeBounds(d) {
    var a = d.start, b = d.cur;
    if (d.fromCentre) {
      var dc = Math.abs(b.col - a.col), dr = Math.abs(b.row - a.row);
      if (d.equal) dc = dr = Math.max(dc, dr);
      return { c0: a.col - dc, c1: a.col + dc, r0: a.row - dr, r1: a.row + dr };
    }
    return { c0: Math.min(a.col, b.col), c1: Math.max(a.col, b.col), r0: Math.min(a.row, b.row), r1: Math.max(a.row, b.row) };
  }
  function shapeCells(d) {
    var a = d.start, b = d.cur, out = [], r, c;
    if (d.tool === 'line') return expand(lineCells(a, b), state.brush);
    var bb = shapeBounds(d), c0 = bb.c0, c1 = bb.c1, r0 = bb.r0, r1 = bb.r1;
    if (d.tool === 'rect') {
      for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) {
        if (!state.outline || r === r0 || r === r1 || c === c0 || c === c1) out.push([c, r]);
      }
    } else {
      var cx = (c0 + c1) / 2, cy = (r0 + r1) / 2, rx = (c1 - c0) / 2 + 0.5, ry = (r1 - r0) / 2 + 0.5;
      var inside = function (x, y, ax, ay) { return ax > 0 && ay > 0 && Math.pow((x - cx) / ax, 2) + Math.pow((y - cy) / ay, 2) <= 1; };
      for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) {
        if (!inside(c, r, rx, ry)) continue;
        if (state.outline && inside(c, r, rx - 1, ry - 1)) continue;
        out.push([c, r]);
      }
    }
    return state.outline ? expand(out, state.brush) : out;
  }

  function floodFill(p, erase) {
    var occ = new Uint8Array(cols * rows);
    cells.forEach(function (k) { var q = k.split(','); occ[+q[1] * cols + +q[0]] = 1; });
    var target = occ[p.row * cols + p.col], fill = erase ? 0 : 1;
    if (target === fill) return;
    var stack = [[p.col, p.row]];
    while (stack.length) {
      var s = stack.pop(), c = s[0], r = s[1];
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      var i = r * cols + c;
      if (occ[i] !== target) continue;
      occ[i] = fill;
      setCell(c, r, !erase);
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
  }

  // A straight line from where the stroke began to the pointer, snapped to flat, upright or 45 degrees.
  function snapLine(a, p) {
    var dx = p.col - a.col, dy = p.row - a.row, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx > 2 * ady) dy = 0;
    else if (ady > 2 * adx) dx = 0;
    else { var m = Math.max(adx, ady); dx = Math.sign(dx) * m; dy = Math.sign(dy) * m; }
    return {
      col: Math.max(0, Math.min(cols - 1, a.col + dx)),
      row: Math.max(0, Math.min(rows - 1, a.row + dy))
    };
  }

  // Shift held: lines snap to 45deg steps, rectangles / ellipses stay square.
  function constrain(d, p, shift) {
    if (!shift) return p;
    var dx = p.col - d.start.col, dy = p.row - d.start.row, adx = Math.abs(dx), ady = Math.abs(dy);
    if (d.tool === 'line') {
      if (adx > 2 * ady) dy = 0;
      else if (ady > 2 * adx) dx = 0;
      else { var m = Math.max(adx, ady); dx = Math.sign(dx) * m; dy = Math.sign(dy) * m; }
    } else {
      var s = Math.max(adx, ady); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s;
    }
    return {
      col: Math.max(0, Math.min(cols - 1, d.start.col + dx)),
      row: Math.max(0, Math.min(rows - 1, d.start.row + dy))
    };
  }

  // The pointer over the canvas: the square one is final. The others stay available with the pointerOptions flag (a picker in the Edit tab) or ?cursor=<id>.
  function outlined(shape) {       // white line with a soft dark outline so it shows on any colour
    return '<g fill="none" stroke="#000" stroke-opacity=".65" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' + shape + '</g>' +
           '<g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + shape + '</g>';
  }
  var CDOT = '<circle cx="16" cy="16" r="2.4" fill="#000" fill-opacity=".65"/><circle cx="16" cy="16" r="1.6" fill="#fff"/>';
  var CURSOR_LIST = [
    { id: 'ring',    label: 'Ring',          hx: 16, hy: 16, svg: outlined('<circle cx="16" cy="16" r="9"/>') + CDOT },
    { id: 'dot',     label: 'Dot',           hx: 16, hy: 16, svg: '<circle cx="16" cy="16" r="5" fill="#000" fill-opacity=".65"/><circle cx="16" cy="16" r="3.6" fill="#fff"/><circle cx="16" cy="16" r="1.4" fill="#ef282d"/>' },
    { id: 'plus',    label: 'Plus',          hx: 16, hy: 16, svg: outlined('<path d="M16 5v7M16 20v7M5 16h7M20 16h7"/>') },
    { id: 'fine',    label: 'Fine cross',    hx: 16, hy: 16, svg: outlined('<path d="M16 3v10M16 19v10M3 16h10M19 16h10"/>') + CDOT },
    { id: 'target',  label: 'Target',        hx: 16, hy: 16, svg: outlined('<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5"/>') + CDOT },
    { id: 'square',  label: 'Square',        hx: 16, hy: 16, svg: outlined('<rect x="8" y="8" width="16" height="16" rx="2"/>') + CDOT },
    { id: 'frame',   label: 'Corners',       hx: 16, hy: 16, svg: outlined('<path d="M6 12V6h6M20 6h6v6M26 20v6h-6M12 26H6v-6"/>') + CDOT },
    { id: 'diamond', label: 'Diamond',       hx: 16, hy: 16, svg: outlined('<path d="M16 5l11 11-11 11L5 16z"/>') + CDOT },
    { id: 'pen',     label: 'Pencil',        hx: 5,  hy: 27, svg: '<path d="M5 27l1.6-5.6 14-14a2.2 2.2 0 013.1 0l1.9 1.9a2.2 2.2 0 010 3.1l-14 14z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 27l1.6-5.6 4 4z" fill="#ef282d" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>' },
    { id: 'crosshair', label: 'Classic',     hx: 16, hy: 16, svg: outlined('<path d="M16 4v24M4 16h24"/>'), native: true }
  ];
  function setCursor(id, remember) {
    var c = CURSOR_LIST.find(function (x) { return x.id === id; }) || CURSOR_LIST[0];
    if (c.native) cv.style.cursor = '';                                    // the browser's own crosshair
    else {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + c.svg + '</svg>';
      cv.style.cursor = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + c.hx + ' ' + c.hy + ', crosshair';
    }
    baseCursor = cv.style.cursor; lastCursor = null;
    document.querySelectorAll('#pointerControls .key').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cursor === c.id)); });
    if (remember) { try { localStorage.setItem('dm-cursor', c.id); } catch (e) {} }
    return c.id;
  }
  function currentCursorId() {
    var fromUrl = new URLSearchParams(location.search).get('cursor'), saved = null;
    try { saved = localStorage.getItem('dm-cursor'); } catch (e) {}
    if (!FLAGS.pointerOptions) return fromUrl || 'square';      // final choice: the square pointer (?cursor= still lets you try another)
    return fromUrl || saved || 'square';
  }
  setCursor(currentCursorId(), false);
  function buildPointer() {
    var grid = document.createElement('div');
    grid.className = 'keygrid';
    CURSOR_LIST.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'key'; b.dataset.cursor = c.id; b.title = c.label; b.setAttribute('aria-label', c.label + ' pointer');
      b.innerHTML = '<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">' + c.svg + '</svg>';
      b.addEventListener('click', function () { setCursor(c.id, true); });
      grid.appendChild(b);
    });
    $('#pointerControls').appendChild(grid);
    setCursor(currentCursorId(), false);                                   // sets the pressed one
  }

  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId);
    var p = cellAt(e), erase = state.tool === 'eraser' || e.button === 2;
    var before = beginEdit();
    if (state.tool === 'select') {
      var cpt = canvasPoint(e), grip = sel && selMode === 'resize' ? handleAt(cpt.x, cpt.y) : null;
      if (grip) {
        // grab a handle: the picked dots are stretched or squeezed to the new box as you drag
        var pm = new Map(), bcol = before.colors || new Map();
        before.forEach(function (k) {
          var q = k.split(','), c = +q[0], r = +q[1];
          if (c >= sel.c0 && c <= sel.c1 && r >= sel.r0 && r <= sel.r1) pm.set(k, bcol.get(k));
        });
        drag = { tool: 'select', mode: 'resize', handle: grip, start: p, cur: p, before: before, base: { c0: sel.c0, r0: sel.r0, c1: sel.c1, r1: sel.r1 }, picked: pm };
      } else if (sel && p.col >= sel.c0 && p.col <= sel.c1 && p.row >= sel.r0 && p.row <= sel.r1) {
        // grab the chosen rectangle: its dots move together
        var picked = [];
        before.forEach(function (k) {
          var q = k.split(','), c = +q[0], r = +q[1];
          if (c >= sel.c0 && c <= sel.c1 && r >= sel.r0 && r <= sel.r1) picked.push([c, r]);
        });
        drag = { tool: 'select', mode: 'move', start: p, cur: p, before: before, base: { c0: sel.c0, r0: sel.r0, c1: sel.c1, r1: sel.r1 }, picked: picked };
      } else {
        sel = null;
        drag = { tool: 'select', mode: 'marquee', start: p, cur: p, before: before };
      }
      return;
    }
    if (state.tool === 'fill') {
      floodFill(p, erase);
      endEdit(before);
      updateInfo();
      return;
    }
    var shapeTool = state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse';
    drag = { tool: state.tool, shapeTool: shapeTool, erase: erase, start: p, cur: p, last: p, before: before };
    if (!shapeTool) stamp(p.col, p.row, !erase);
    updateInfo();
  });

  cv.addEventListener('pointermove', function (e) {
    var p = cellAt(e);
    hover = p; hoverPt = canvasPoint(e);
    if (!drag) return;
    if (drag.mode === 'marquee') { drag.cur = p; return; }
    if (drag.mode === 'resize') { resizeSelection(p, e.shiftKey, e.altKey); return; }
    if (drag.mode === 'move') {
      var b = drag.base;
      var dc = Math.max(-b.c0, Math.min(cols - 1 - b.c1, p.col - drag.start.col));
      var dr = Math.max(-b.r0, Math.min(rows - 1 - b.r1, p.row - drag.start.row));
      var next = new Set();
      drag.before.forEach(function (k) {
        var q = k.split(','), c = +q[0], r = +q[1];
        if (!(c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1)) next.add(k);
      });
      var nextColor = new Map(), bc = drag.before.colors || new Map();
      next.forEach(function (k) { if (bc.has(k)) nextColor.set(k, bc.get(k)); });
      drag.picked.forEach(function (q) { var nk = (q[0] + dc) + ',' + (q[1] + dr); next.add(nk); nextColor.set(nk, bc.get(q[0] + ',' + q[1])); });
      cells = next; cellColor = nextColor;
      sel = { c0: b.c0 + dc, r0: b.r0 + dr, c1: b.c1 + dc, r1: b.r1 + dr };
      dirty = true; updateInfo();
      return;
    }
    if (drag.shapeTool) {
      // Circle + Shift: a circle growing outward from the centre. Shape / Circle + Alt: grow outward from the centre.
      // Shape + Shift: a square (corner to corner). Shape + Shift + Alt: a square from the centre.
      drag.fromCentre = (drag.tool === 'ellipse' && e.shiftKey) || (e.altKey && drag.tool !== 'line');
      drag.equal = (drag.tool === 'ellipse' && e.shiftKey) || (drag.tool === 'rect' && e.shiftKey && e.altKey);
      drag.cur = drag.fromCentre ? p : constrain(drag, p, e.shiftKey);
      return;
    }
    if (e.shiftKey) {
      // Shift: the stroke so far becomes one straight line from where it began (move the pointer to aim it)
      var end = snapLine(drag.start, p);
      restoreEdit(drag.before);
      lineCells(drag.start, end).forEach(function (q) { stamp(q[0], q[1], !drag.erase); });
      dirty = true;
      drag.last = end;
      updateInfo();
      return;
    }
    lineCells(drag.last, p).forEach(function (q) { stamp(q[0], q[1], !drag.erase); });
    drag.last = p;
    updateInfo();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.mode === 'marquee') {
      var m = { c0: Math.min(drag.start.col, drag.cur.col), r0: Math.min(drag.start.row, drag.cur.row), c1: Math.max(drag.start.col, drag.cur.col), r1: Math.max(drag.start.row, drag.cur.row) };
      var any = false;
      cells.forEach(function (k) {
        var q = k.split(','), c = +q[0], r = +q[1];
        if (c >= m.c0 && c <= m.c1 && r >= m.r0 && r <= m.r1) any = true;
      });
      sel = any ? m : null;                       // an empty rectangle selects nothing
      if (any) selMode = 'move';
    }
    if (drag.shapeTool) shapeCells(drag).forEach(function (q) { setCell(q[0], q[1], !drag.erase); });
    endEdit(drag.before);
    drag = null;
    updateInfo();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { hover = null; hoverPt = null; });

  /* ---------- Select: resize, delete and the options that replace Eraser / Invert / Clear ---------- */

  function canvasPoint(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (w() / r.width), y: (e.clientY - r.top) * (h() / r.height) };
  }
  // The eight handles of a rectangle, in canvas pixels. id says which edge(s) it moves.
  function handlePoints(b) {
    var x0 = ox + b.c0 * CELL, y0 = oy + b.r0 * CELL, x1 = ox + (b.c1 + 1) * CELL, y1 = oy + (b.r1 + 1) * CELL, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return [
      { id: 'nw', x: x0, y: y0 }, { id: 'n', x: mx, y: y0 }, { id: 'ne', x: x1, y: y0 }, { id: 'e', x: x1, y: my },
      { id: 'se', x: x1, y: y1 }, { id: 's', x: mx, y: y1 }, { id: 'sw', x: x0, y: y1 }, { id: 'w', x: x0, y: my }
    ];
  }
  function handleAt(x, y) {
    var reach = Math.max(10, CELL * 0.8), best = null, bestD = Infinity;
    handlePoints(sel).forEach(function (hp) {
      var d = Math.max(Math.abs(hp.x - x), Math.abs(hp.y - y));
      if (d <= reach && d < bestD) { best = hp.id; bestD = d; }
    });
    return best;
  }
  // Drag a handle: Shift keeps the proportions, Alt resizes from the centre. The dots are re-sampled into the new box.
  function resizeSelection(p, shift, alt) {
    var b = drag.base, hd = drag.handle;
    var L = b.c0, R = b.c1 + 1, T = b.r0, B = b.r1 + 1, bw = R - L, bh = B - T, nL = L, nR = R, nT = T, nB = B;
    if (hd.indexOf('e') > -1) nR = Math.max(L + 1, p.col + 1);
    if (hd.indexOf('w') > -1) nL = Math.min(R - 1, p.col);
    if (hd.indexOf('s') > -1) nB = Math.max(T + 1, p.row + 1);
    if (hd.indexOf('n') > -1) nT = Math.min(B - 1, p.row);
    if (alt) {                                   // from the centre: the opposite side moves the other way
      if (hd.indexOf('e') > -1) nL = Math.min(nR - 1, L - (nR - R));
      if (hd.indexOf('w') > -1) nR = Math.max(nL + 1, R + (L - nL));
      if (hd.indexOf('s') > -1) nT = Math.min(nB - 1, T - (nB - B));
      if (hd.indexOf('n') > -1) nB = Math.max(nT + 1, B + (T - nT));
    }
    if (shift) {                                 // proportional: one scale for both sides
      var sx = (nR - nL) / bw, sy = (nB - nT) / bh, s;
      var horiz = hd.indexOf('e') > -1 || hd.indexOf('w') > -1, vert = hd.indexOf('n') > -1 || hd.indexOf('s') > -1;
      s = horiz && vert ? Math.max(sx, sy) : horiz ? sx : sy;
      var tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));
      var cxm = (L + R) / 2, cym = (T + B) / 2;
      if (alt) { nL = Math.round(cxm - tw / 2); nR = nL + tw; nT = Math.round(cym - th / 2); nB = nT + th; }
      else {
        if (hd.indexOf('w') > -1) { nR = R; nL = R - tw; } else if (hd.indexOf('e') > -1) { nL = L; nR = L + tw; } else { nL = Math.round(cxm - tw / 2); nR = nL + tw; }
        if (hd.indexOf('n') > -1) { nB = B; nT = B - th; } else if (hd.indexOf('s') > -1) { nT = T; nB = T + th; } else { nT = Math.round(cym - th / 2); nB = nT + th; }
      }
    }
    // stay on the grid
    var gw = nR - nL, gh = nB - nT;
    if (nL < 0) { nL = 0; nR = Math.min(cols, nL + gw); }
    if (nT < 0) { nT = 0; nB = Math.min(rows, nT + gh); }
    if (nR > cols) { nR = cols; nL = Math.max(0, nR - gw); }
    if (nB > rows) { nB = rows; nT = Math.max(0, nB - gh); }
    var nw = Math.max(1, nR - nL), nh = Math.max(1, nB - nT);

    var next = new Set(), nextColor = new Map(), bc = drag.before.colors || new Map();
    drag.before.forEach(function (k) {
      var q = k.split(','), c = +q[0], r = +q[1];
      if (!(c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1)) { next.add(k); if (bc.has(k)) nextColor.set(k, bc.get(k)); }
    });
    for (var r = nT; r < nT + nh; r++) {
      for (var c = nL; c < nL + nw; c++) {
        var sk = (b.c0 + Math.floor((c - nL) * bw / nw)) + ',' + (b.r0 + Math.floor((r - nT) * bh / nh));
        if (drag.picked.has(sk)) { next.add(c + ',' + r); if (drag.picked.get(sk)) nextColor.set(c + ',' + r, drag.picked.get(sk)); }
      }
    }
    cells = next; cellColor = nextColor;
    sel = { c0: nL, r0: nT, c1: nL + nw - 1, r1: nT + nh - 1 };
    dirty = true; updateInfo();
  }
  // The pointer tells you what a drag will do: a resize arrow on a handle, a move cross inside the selection
  // (a closed hand while you drag it), otherwise the chosen drawing pointer.
  var RESIZE_CURSOR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
  function updateCursor() {
    var want = baseCursor;
    if (state.tool === 'select') {
      if (drag && drag.mode === 'move') want = 'grabbing';
      else if (drag && drag.mode === 'resize') want = RESIZE_CURSOR[drag.handle];
      else if (sel && hoverPt && !drag) {
        var g = selMode === 'resize' ? handleAt(hoverPt.x, hoverPt.y) : null;
        if (g) want = RESIZE_CURSOR[g];
        else if (hoverPt.x >= ox + sel.c0 * CELL && hoverPt.x <= ox + (sel.c1 + 1) * CELL && hoverPt.y >= oy + sel.r0 * CELL && hoverPt.y <= oy + (sel.r1 + 1) * CELL) want = 'move';
      }
    }
    if (want !== lastCursor) { lastCursor = want; cv.style.cursor = want; }
  }
  function deleteSelection() {
    if (!sel) return;
    var before = beginEdit();
    Array.from(cells).forEach(function (k) {
      var q = k.split(','), c = +q[0], r = +q[1];
      if (c >= sel.c0 && c <= sel.c1 && r >= sel.r0 && r <= sel.r1) cells.delete(k);
    });
    sel = null; dirty = true;
    endEdit(before);
    updateInfo();
  }
  // With something selected the left panel offers Move / Resize / Delete instead of Eraser / Invert / Clear.
  var lastHasSel = null, lastSelMode = null;
  function syncSelectionUI() {
    var has = !!sel;
    if (has === lastHasSel && selMode === lastSelMode) return;
    lastHasSel = has; lastSelMode = selMode;
    var a = $('#editActions'), s = $('#selActions');
    if (a) a.hidden = has;
    if (s) s.hidden = !has;
    var mv = $('#selMove'), rs = $('#selResize');
    if (mv) mv.setAttribute('aria-pressed', String(selMode === 'move'));
    if (rs) rs.setAttribute('aria-pressed', String(selMode === 'resize'));
  }

  /* ---------- Tools ---------- */

  var ICON = function (d) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  };
  var TOOLS = [
    { id: 'pencil',  name: 'Draw',   key: 'p', icon: ICON('<path d="M2.5 13.5l.8-3.2 7.2-7.2 2.4 2.4-7.2 7.2z"/><path d="M9.2 4.4l2.4 2.4"/>') },
    { id: 'eraser',  group: 'edit', name: 'Eraser', key: 'e', icon: ICON('<path d="M8.6 3.4l4 4-5 5H4.4L2.6 10.4l6-7z"/><path d="M5.8 6.2l4 4"/><path d="M7.4 12.4H13.4"/>') },
    { sep: true, extra: true },
    { id: 'line',    extra: true, name: 'Line', key: 'l', icon: ICON('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="3" r="1" fill="currentColor"/>') },
    { id: 'rect',    name: 'Shape', key: 'r', icon: ICON('<rect x="2.8" y="4" width="10.4" height="8" rx="1"/>') },
    { id: 'select',  name: 'Select', key: 'v', icon: ICON('<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2.2 2"/><path d="M8 5.5v5M5.5 8h5"/>') },
    { id: 'ellipse', name: 'Circle',   key: 'o', icon: ICON('<ellipse cx="8" cy="8" rx="5.5" ry="4"/>') },
    { sep: true, extra: true },
    { id: 'fill',    name: 'Fill',      key: 'f', icon: ICON('<g transform="scale(.6667)" stroke-width="2.25"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></g>') }
  ];

  function buildTools() {
    var el = $('#toolstrip');
    TOOLS.forEach(function (t) {
      if (t.group === 'edit') return;                // the eraser lives in the Clear group, not in the tool strip
      if (t.extra && !FLAGS.extraTools) return;
      if (t.sep) { var s = document.createElement('div'); s.className = 'sep'; el.appendChild(s); return; }
      var b = document.createElement('button');
      b.className = 'key'; b.dataset.tool = t.id; b.innerHTML = t.icon + '<span class="lbl">' + t.name + '</span>';
      b.title = t.name + ' (' + t.key.toUpperCase() + ')';
      b.setAttribute('aria-label', t.name);
      b.addEventListener('click', function () { setTool(t.id); });
      el.appendChild(b);
    });
  }
  function setTool(id) {
    state.tool = id;
    if (id !== 'select') sel = null;
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    });
    updateInfo();
  }

  /* ---------- Controls ---------- */

  function sliderRow(o) {
    var row = document.createElement('div');
    row.className = 'row';
    var id = 'ctl-' + Math.random().toString(36).slice(2, 8);
    row.innerHTML =
      '<label for="' + id + '">' + o.label + '</label>' +
      '<div class="slider"><span class="fill"></span><span class="thumb"></span><input id="' + id + '" type="range"></div>' +
      '<span class="out"></span>';
    var input = row.querySelector('input'), out = row.querySelector('.out'), box = row.querySelector('.slider');
    input.min = o.min; input.max = o.max; input.step = o.step; input.value = o.value;
    function sync() {
      var v = parseFloat(input.value);
      box.style.setProperty('--p', (v - o.min) / (o.max - o.min));
      out.textContent = o.fmt(v);
      return v;
    }
    input.addEventListener('input', function () { o.onChange(sync()); });
    if (o.onCommit) input.addEventListener('change', o.onCommit);
    sync();
    return row;
  }

  function segRow(label, items, get, set) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = (label ? '<span class="lbl">' + label + '</span>' : '') + '<div class="seg wide"></div>';
    if (!label) row.classList.add('nolabel');
    var box = row.querySelector('.seg');
    function paint() {
      box.querySelectorAll('.key').forEach(function (k) { k.setAttribute('aria-pressed', String(k.dataset.v === String(get()))); });
    }
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'key'; b.dataset.v = it.v; b.textContent = it.label;
      b.addEventListener('click', function () { set(it.v); paint(); });
      box.appendChild(b);
    });
    paint();
    row.repaint = paint;
    return row;
  }

  /* ---------- Colour picker (our own, instead of the browser's native popup) ---------- */

  var picker = (function () {
    var el = null, sv, svKnob, hueBar, hueKnob, chip, hexIn, anchor = null, onPick = null, h = 0, s = 1, v = 1;
    function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function toHex() {
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), mm = v - c, r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
      return '#' + [r + mm, g + mm, b + mm].map(function (n) { return Math.round(n * 255).toString(16).padStart(2, '0'); }).join('');
    }
    function fromHex(hex) {
      var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d > 0) h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);   // grey keeps the old hue
      s = max ? d / max : 0; v = max;
    }
    function show(editingHex) {
      var hex = toHex();
      sv.style.setProperty('--h', h);
      svKnob.style.left = s * 100 + '%'; svKnob.style.top = (1 - v) * 100 + '%';
      hueKnob.style.left = h / 360 * 100 + '%';
      chip.style.background = hex;
      if (!editingHex) hexIn.value = hex;
    }
    function emit() { show(false); if (onPick) onPick(toHex()); }
    function drag(node, move) {
      node.addEventListener('pointerdown', function (e) {
        node.setPointerCapture(e.pointerId); move(e);
        var go = function (ev) { move(ev); }, stop = function () { node.removeEventListener('pointermove', go); node.removeEventListener('pointerup', stop); };
        node.addEventListener('pointermove', go); node.addEventListener('pointerup', stop);
      });
    }
    function build() {
      el = document.createElement('div');
      el.className = 'cpicker'; el.hidden = true;
      el.innerHTML = '<div class="cp-sv"><i class="cp-knob"></i></div><div class="cp-hue"><i class="cp-knob"></i></div>' +
        '<div class="cp-row"><span class="cp-chip"></span><input class="cp-hex" maxlength="7" spellcheck="false" aria-label="Hex color"></div>';
      document.body.appendChild(el);
      sv = el.querySelector('.cp-sv'); svKnob = sv.querySelector('i');
      hueBar = el.querySelector('.cp-hue'); hueKnob = hueBar.querySelector('i');
      chip = el.querySelector('.cp-chip'); hexIn = el.querySelector('.cp-hex');
      drag(sv, function (e) { var r = sv.getBoundingClientRect(); s = clamp((e.clientX - r.left) / r.width); v = 1 - clamp((e.clientY - r.top) / r.height); emit(); });
      drag(hueBar, function (e) { var r = hueBar.getBoundingClientRect(); h = clamp((e.clientX - r.left) / r.width) * 359.999; emit(); });
      hexIn.addEventListener('input', function () {
        var t = hexIn.value.trim(); if (t[0] !== '#') t = '#' + t;
        if (/^#[0-9a-f]{6}$/i.test(t)) { fromHex(t.toLowerCase()); show(true); if (onPick) onPick(toHex()); }
      });
      hexIn.addEventListener('blur', function () { show(false); });
      document.addEventListener('pointerdown', function (e) { if (!el.hidden && !el.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }, true);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) close(); });
      window.addEventListener('resize', close);
      document.addEventListener('scroll', close, true);
    }
    function close() { if (el) el.hidden = true; anchor = null; }
    function toggle(node, hex, cb) {
      if (!el) build();
      if (!el.hidden && anchor === node) { close(); return; }
      anchor = node; onPick = cb;
      fromHex(hex);
      el.hidden = false;
      show(false);
      var r = node.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
      var top = r.bottom + 10 + ht > window.innerHeight - 8 ? r.top - ht - 10 : r.bottom + 10;
      el.style.left = left + 'px'; el.style.top = Math.max(8, top) + 'px';
    }
    return { toggle: toggle };
  })();

  // Preview background for a colour style circle: its gradient, sampled from the real colour function.
  function modePreview(id) {
    var rgb = function (c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }, st, i, n;
    if (id === 'white') return '#ffffff';
    if (id === 'glitter') {
      // confetti: little dots of different colours (and a white one) on a dark base, like the real glitter look
      var dots = function (c, x, y) { return 'radial-gradient(circle, ' + c + ' 1.6px, transparent 2.2px) ' + x + 'px ' + y + 'px / 11px 11px'; };
      return [dots('#ffffff', 2, 3), dots('#ff5fa2', 7, 8), dots('#2de2e6', 1, 8), dots('#ffd23f', 8, 2), '#1c1b22'].join(',');
    }
    if (id === 'rainbow') {
      st = [];
      for (i = 0; i <= 6; i++) st.push('hsl(' + (i * 60) + ',90%,60%)');
      return 'linear-gradient(90deg,' + st.join(',') + ')';
    }
    var S = E.STOPS[id];
    if (!S) return '#888';
    // a fluid blend: the palette as a soft diagonal sweep, with the first and last colours bleeding in as glows
    n = S.length;
    st = S.map(rgb);
    return 'radial-gradient(circle at 25% 78%, ' + st[0] + ', transparent 58%), ' +
           'radial-gradient(circle at 78% 22%, ' + st[n - 1] + ', transparent 55%), ' +
           'radial-gradient(circle at 70% 78%, ' + st[Math.floor(n / 2)] + ', transparent 60%), ' +
           'linear-gradient(135deg,' + st.join(',') + ')';
  }
  // The colour spectrum card: left to right is the hue, top is light, middle is pure, bottom is dark.
  function spectrumHex(x, y) {
    var h = x * 360, l = 1 - y, a = Math.min(l, 1 - l), f = function (n) {
      var k = (n + h / 30) % 12, v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  function hexToSpectrum(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, bl = (n & 255) / 255;
    var max = Math.max(r, g, bl), min = Math.min(r, g, bl), d = max - min, h = 0;
    if (d > 0) h = 60 * (max === r ? ((g - bl) / d + 6) % 6 : max === g ? (bl - r) / d + 2 : (r - g) / d + 4);
    return { x: h / 360, y: 1 - (max + min) / 2 };
  }

  function buildColor() {
    var el = $('#colorControls'), m = state.color;
    // One grid of circles, one per colour style; any single colour comes from the spectrum card.
    var grid = document.createElement('div');
    grid.className = 'swatch-grid';
    COLOR_MODES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch'; b.style.background = modePreview(c.id); b.dataset.mode = c.id;
      b.title = c.name; b.setAttribute('aria-label', c.name + ' colour');
      b.addEventListener('click', function () { m.mode = c.id; paint(); recolorSelection(); });
      grid.appendChild(b);
    });
    el.appendChild(grid);
    if (FLAGS.colorRandom) {
      var rb = document.createElement('button');
      rb.className = 'key'; rb.textContent = 'Random'; rb.title = 'Randomize color';
      rb.addEventListener('click', randomColor);
      el.appendChild(rb);
    }

    // Spectrum card with a small circle: drag it to make any colour.
    var spec = document.createElement('div');
    spec.className = 'spectrum'; spec.title = 'Drag to pick any color';
    spec.innerHTML = '<i class="spectrum-knob"></i>';
    var knob = spec.firstChild, last = null;
    function pick(e) {
      var r = spec.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      last = { x: x, y: y, hex: spectrumHex(x, y) };
      m.mode = 'solid'; m.hex = last.hex;
      paint();
    }
    spec.addEventListener('pointerdown', function (e) {
      spec.setPointerCapture(e.pointerId); pick(e);
      var stop = function () {
        spec.removeEventListener('pointermove', pick); spec.removeEventListener('pointerup', stop);
        recolorSelection();                       // one undo step for the whole drag
      };
      spec.addEventListener('pointermove', pick); spec.addEventListener('pointerup', stop);
    });
    el.appendChild(spec);

    // Cycle (flag): how many times the colours loop per animation loop. Whole numbers, so exports still loop seamlessly.
    var cycleRow = null, CYCLING = ['rainbow', 'glitter', 'ocean', 'sunset', 'neon', 'aurora', 'candy', 'forest', 'ice', 'lava', 'dusk', 'mint', 'gold', 'holo'];
    if (FLAGS.colorCycle) {
      cycleRow = sliderRow({
        label: 'Cycle', min: 0, max: 4, step: 1, value: m.cycle,
        fmt: function (v) { return v + '\u00d7'; }, onChange: function (v) { m.cycle = v; }
      });
      el.appendChild(cycleRow);
    }

    function paint() {
      var solid = m.mode === 'solid';
      grid.querySelectorAll('.swatch[data-mode]').forEach(function (k) { k.setAttribute('aria-pressed', String(k.dataset.mode === m.mode)); });
      grid.querySelectorAll('.swatch[data-color]').forEach(function (s) {
        s.setAttribute('aria-pressed', String(solid && s.dataset.color === m.hex));
      });
      var isCustom = solid && SWATCHES.indexOf(m.hex) === -1;
      knob.hidden = !isCustom;
      if (isCustom) {
        var pos = last && last.hex === m.hex ? last : hexToSpectrum(m.hex);
        knob.style.left = pos.x * 100 + '%'; knob.style.top = pos.y * 100 + '%';
        knob.style.setProperty('--c', m.hex);
      }
      if (cycleRow) cycleRow.hidden = CYCLING.indexOf(m.mode) === -1;
    }
    paint();
    repaintColor = paint;
  }

  function buildControls() {
    var el = $('#controls');
    el.innerHTML = '';
    var stackPresets = state.stack.map(presetById), base = state.values[stackPresets[0].id];
    function common(key) {
      var c = COMMON[key];
      el.appendChild(sliderRow({
        label: c.label, min: c.min, max: c.max, step: c.step, fmt: c.fmt,
        value: base[key], onChange: function (v) { base[key] = v; }
      }));
    }
    common('speed');
    common('size');
    stackPresets.forEach(function (preset) {
      var vals = state.values[preset.id];
      if (stackPresets.length > 1) {
        var sub = document.createElement('div');
        sub.className = 'sub-label'; sub.textContent = preset.name;
        el.appendChild(sub);
      }
      preset.params.forEach(function (q) {
        el.appendChild(sliderRow({
          label: q.label, min: q.min, max: q.max, step: q.step, fmt: q.fmt,
          value: vals[q.key], onChange: function (v) { vals[q.key] = v; }
        }));
      });
    });
    common('glow');
  }

  // Three rows of four. When there are more presets than fit, the last slot is a quiet "More" button
  // that reveals the rest (and turns into "Less").
  var PRESET_SLOTS = 12, presetsOpen = false, presetMore = null;
  function renderPresets() {
    var keys = $('#presets').querySelectorAll('.key[data-id]'), fits = MAIN.length <= PRESET_SLOTS;
    keys.forEach(function (b, i) { b.hidden = !fits && !presetsOpen && i >= PRESET_SLOTS - 1; });
    if (presetMore) {
      presetMore.hidden = fits;
      presetMore.textContent = presetsOpen ? 'Less' : 'More';
      presetMore.setAttribute('aria-expanded', String(presetsOpen));
    }
  }
  function buildPresets() {
    var el = $('#presets');
    function make(p, i, into) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = p.name; b.dataset.id = p.id;
      b.title = p.name + (i < 9 && !p.trial ? ' (' + (i + 1) + ')' : '');
      b.addEventListener('click', function () { onPresetClick(p.id); });
      into.appendChild(b);
    }
    MAIN.forEach(function (p, i) { make(p, i, el); });
    if (TRIAL.length) {
      var tg = $('#trialPresets');
      TRIAL.forEach(function (p, i) { make(p, i, tg); });
      tg.hidden = false; $('#trialLabel').hidden = false;
    }
    presetMore = document.createElement('button');
    presetMore.className = 'key secondary';
    presetMore.title = 'Show or hide the other animations';
    presetMore.addEventListener('click', function () { presetsOpen = !presetsOpen; renderPresets(); });
    el.appendChild(presetMore);
    renderPresets();
  }

  function refreshPresets() {
    document.querySelectorAll('#presets .key[data-id], #trialPresets .key').forEach(function (b) {
      var i = state.stack.indexOf(b.dataset.id);
      b.setAttribute('aria-pressed', String(i > -1));
      if (state.stacking && i > -1) b.dataset.order = String(i + 1); else delete b.dataset.order;
    });
  }

  // Choose one animation (this also ends any stack).
  function selectPreset(id) {
    state.preset = id;
    state.stack = [id];
    state.stacking = false;
    if (stackRow) stackRow.repaint();
    if (MAIN.length > PRESET_SLOTS && MAIN.findIndex(function (p) { return p.id === id; }) >= PRESET_SLOTS - 1 && !presetsOpen) {
      presetsOpen = true; renderPresets();      // never leave the chosen animation hidden
    }
    refreshPresets();
    buildControls();
  }

  // A click on an animation: picks it, or with Stacking on adds it to / removes it from the stack.
  function onPresetClick(id) {
    if (!state.stacking || !FLAGS.stackingSwitch) { selectPreset(id); return; }
    var i = state.stack.indexOf(id);
    if (i > -1) {
      if (state.stack.length === 1) return;
      state.stack.splice(i, 1);
    } else if (state.stack.length < STACK_MAX) {
      state.stack.push(id);
    } else {
      notify('Stacking holds up to ' + STACK_MAX + ' animations');
      return;
    }
    state.preset = state.stack[0];
    refreshPresets();
    buildControls();
  }

  // Random art that looks designed: one clear pattern, optionally cut to a shape.
  //   concentric  nested rings / squares / diamonds      tiles     a repeating motif (dots, squares, diamonds, plus signs)
  //   stripes     horizontal, vertical, diagonal, chevron or wavy bands
  //   sunburst    rays from the centre                   checker   a big checkerboard
  //   emblem      a few shapes mirrored four ways around the centre
  function randomArtCells() {
    var cx = (cols - 1) / 2, cy = (rows - 1) / 2, side = Math.min(cols, rows), R = side * 0.47;
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function between(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
    function mod(v, m) { return ((v % m) + m) % m; }
    function dist(kind, x, y) {
      return kind === 'circle' ? Math.sqrt(x * x + y * y) : kind === 'square' ? Math.max(Math.abs(x), Math.abs(y)) : Math.abs(x) + Math.abs(y);
    }
    // is (x, y) inside a motif of size h centred on the origin?
    function motif(kind, x, y, h) {
      var ax = Math.abs(x), ay = Math.abs(y);
      return kind === 'circle' ? x * x + y * y <= h * h
        : kind === 'square' ? Math.max(ax, ay) <= h
        : kind === 'diamond' ? ax + ay <= h * 1.25
        : kind === 'ring' ? Math.abs(Math.sqrt(x * x + y * y) - h) <= Math.max(1, h * 0.28)
        : Math.min(ax, ay) <= Math.max(1, h * 0.3) && Math.max(ax, ay) <= h * 1.1;     // plus
    }

    var out = new Set();
    for (var attempt = 0; attempt < 4 && out.size < 30; attempt++) {
      out = new Set();
      var kind = pick(['concentric', 'tiles', 'stripes', 'sunburst', 'checker', 'emblem']);
      var maskKind = pick(['none', 'circle', 'square', 'diamond']), maskR = R * (maskKind === 'diamond' ? 1.15 : maskKind === 'square' ? 0.9 : 1);
      var test;

      if (kind === 'concentric') {
        var shape = pick(['circle', 'square', 'diamond']), w = between(3, 6);
        maskKind = shape; maskR = R * (shape === 'diamond' ? 1.15 : shape === 'square' ? 0.9 : 1);
        test = function (x, y) { return Math.floor(dist(shape, x, y) / w) % 2 === 0; };
      } else if (kind === 'tiles') {
        var s = between(8, 14), m = pick(['circle', 'square', 'diamond', 'plus']), h = s * 0.32, brick = Math.random() < 0.5;
        test = function (x, y, c, r) {
          var off = brick && Math.floor(r / s) % 2 ? s / 2 : 0;
          return motif(m, mod(c + off, s) - (s - 1) / 2, mod(r, s) - (s - 1) / 2, h);
        };
      } else if (kind === 'stripes') {
        var t = pick(['horizontal', 'vertical', 'diagonal', 'chevron', 'waves']), sw = between(3, 6);
        test = function (x, y) {
          var u = t === 'horizontal' ? y : t === 'vertical' ? x : t === 'diagonal' ? x + y
            : t === 'chevron' ? y + Math.abs(x) * 0.6 : y + 5 * Math.sin(x * 0.15);
          return mod(Math.floor(u / sw), 2) === 0;
        };
      } else if (kind === 'sunburst') {
        var rays = between(6, 14) * 2;
        test = function (x, y) {
          var d = Math.sqrt(x * x + y * y), idx = Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI * 2) * rays);
          return d <= side * 0.04 || (idx % 2 === 0 && d > side * 0.07);
        };
      } else if (kind === 'checker') {
        var cs = between(4, 9);
        test = function (x, y) { return mod(Math.floor(x / cs) + Math.floor(y / cs), 2) === 0; };
      } else {
        var parts = [], np = between(2, 3), centre = Math.random() < 0.6;
        for (var i = 0; i < np; i++) {
          parts.push({ k: pick(['circle', 'ring', 'square', 'diamond', 'plus']), px: between(2, Math.round(side * 0.3)), py: between(2, Math.round(side * 0.3)), h: between(3, Math.max(4, Math.round(side * 0.13))) });
        }
        var ck = pick(['circle', 'ring', 'square', 'diamond', 'plus']), ch = Math.round(side * 0.1);
        test = function (x, y) {
          var ax = Math.abs(x), ay = Math.abs(y);
          if (centre && motif(ck, ax, ay, ch)) return true;
          return parts.some(function (q) { return motif(q.k, ax - q.px, ay - q.py, q.h); });
        };
        maskKind = 'none';
      }

      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = c - cx, y = r - cy;
          if (maskKind !== 'none' && dist(maskKind, x, y) > maskR) continue;
          if (test(x, y, c, r)) out.add(c + ',' + r);
        }
      }
    }
    return out;
  }

  // Randomize (left bar): a whole new piece. It picks a fresh canvas (everything filled, a starter shape or random
  // art), a mark shape, new animation(s) with random sliders, and a color, then plays it.
  // With Stacking on it fills the stack with the same number of different animations.
  function randomize() {
    function rnd(min, max, step) { return +(min + Math.round(Math.random() * (max - min) / step) * step).toFixed(4); }

    // canvas size first (the art below is made for it). Changing size clears the undo history, as it does by hand.
    imgSrc = null; imgRaster = null;
    if (imgUI.opts) setImageActive(false);
    var size = FLAGS.canvasSizes && Math.random() < 0.5 ? [1920, 1080] : [1080, 1080];
    if (size[0] !== state.art.w || size[1] !== state.art.h) setArt(size[0], size[1]);

    // canvas art (undoable)
    var before = beginEdit(), roll = Math.random(), next = new Set(), shapes = window.SHAPES || [];
    if (roll < 0.25) {
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) next.add(c + ',' + r);
    } else if (roll < 0.65 && shapes.length) {
      var starters = shapes.filter(function (s) { return s.id !== 'full'; });
      var sh = starters[Math.floor(Math.random() * starters.length)];
      sh.gen(cols, rows, 0.55 + Math.random() * 0.35).forEach(function (q) { next.add(q[0] + ',' + q[1]); });
    } else {
      next = randomArtCells();
    }
    if (!next.size) next = randomArtCells();
    cells = next; cellColor = new Map(); dirty = true;     // all new dots: they take the new colour
    endEdit(before);
    updateInfo();

    // mark shape
    state.dotShape = DOT_SHAPES[Math.floor(Math.random() * DOT_SHAPES.length)].id;
    repaintShapes();
    drawIdle();

    var pool = PRESETS.slice(), ids = [];
    for (var n = state.stacking ? state.stack.length : 1; n > 0; n--) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);

    ids.forEach(function (id) {
      var v = state.values[id];
      presetById(id).params.forEach(function (q) { v[q.key] = rnd(q.min, q.max, q.step); });
    });
    var base = state.values[ids[0]];            // Speed, Size and Glow are the base animation's
    base.speed = rnd(0.6, 1.6, 0.05); base.size = rnd(0.5, 1, 0.01); base.glow = rnd(0.2, 0.9, 0.01);

    randomColor();

    state.stack = ids; state.preset = ids[0];
    if (MAIN.length > PRESET_SLOTS && !presetsOpen && ids.some(function (id) { return MAIN.findIndex(function (p) { return p.id === id; }) >= PRESET_SLOTS - 1; })) {
      presetsOpen = true; renderPresets();      // never leave a chosen animation hidden
    }
    refreshPresets();
    buildControls();
    setPlaying(true);
    notify('Randomized');
  }

  // The Layers list in the Topend panel: pick a layer to edit it, remove one, or add a new one.
  function buildLayerPanel() {
    var list = $('#layerList'), add = $('#addLayerBtn');
    if (!list) return;
    list.innerHTML = '';
    layers.forEach(function (L, i) {
      var row = document.createElement('div');
      row.className = 'layer-row';
      var pick = document.createElement('button');
      pick.className = 'key layer-pick'; pick.textContent = L.name;
      pick.title = 'Edit ' + L.name + ' (its animation and properties show in the Prop panel)';
      pick.setAttribute('aria-pressed', String(i === activeLayer));
      pick.addEventListener('click', function () { selectLayer(i); });
      row.appendChild(pick);
      var del = document.createElement('button');
      del.className = 'key layer-del'; del.textContent = '\u00d7'; del.title = 'Delete ' + L.name; del.setAttribute('aria-label', 'Delete ' + L.name);
      del.disabled = layers.length < 2;
      del.addEventListener('click', function () { removeLayer(i); });
      row.appendChild(del);
      list.appendChild(row);
    });
    if (add) add.disabled = layers.length >= LAYER_MAX;
  }

  var stackRow = null;
  function setStacking(on) {
    state.stacking = on;
    if (!on) { state.stack = [state.stack[0]]; state.preset = state.stack[0]; }
    if (stackRow) stackRow.repaint();
    refreshPresets();
    buildControls();
  }
  function buildStacking() {
    stackRow = segRow('Stacking', [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }],
      function () { return state.stacking ? 'on' : 'off'; }, function (v) { setStacking(v === 'on'); });
    $('#stackControls').appendChild(stackRow);
  }

  // The shape of every mark on the grid.
  var DOT_SHAPES = [
    { id: 'dot', name: 'Dot' },
    { id: 'square', name: 'Square' },
    { id: 'diamond', name: 'Diamond' },
    { id: 'triangle', name: 'Triangle' },
    { id: 'star', name: 'Star' },
    { id: 'hash', name: 'Hash' }
  ];
  function buildDotShapes() {
    var grid = document.createElement('div');
    grid.className = 'keygrid';
    function paint() {
      grid.querySelectorAll('.key').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === state.dotShape)); });
    }
    DOT_SHAPES.forEach(function (sh) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = sh.name; b.dataset.shape = sh.id;
      b.addEventListener('click', function () { state.dotShape = sh.id; paint(); drawIdle(); });
      grid.appendChild(b);
    });
    paint();
    repaintShapes = paint;
    $('#shapeControls').appendChild(grid);
  }

  // Starters (flag): whole drawings to begin from. Clicking one replaces what is on the canvas.
  function buildStarters() {
    var shapes = window.SHAPES || [], grid = document.createElement('div');
    grid.className = 'keygrid';
    shapes.forEach(function (sh) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = sh.name;
      b.addEventListener('click', function () {
        var before = beginEdit();
        cells = new Set(); cellColor = new Map();
        sh.gen(cols, rows, 0.8).forEach(function (q) { cells.add(q[0] + ',' + q[1]); });
        dirty = true;
        endEdit(before);
        updateInfo();
      });
      grid.appendChild(b);
    });
    $('#starterControls').appendChild(grid);
  }

  // Draw options (flag): brush size, and filled / outline rectangles and ellipses.
  function buildDraw() {
    var el = $('#drawControls');
    el.appendChild(sliderRow({
      label: 'Brush', min: 1, max: 6, step: 1, value: state.brush,
      fmt: function (v) { return v + '\u00d7' + v; }, onChange: function (v) { state.brush = v; }
    }));
    el.appendChild(segRow('Rect/oval', [{ v: 'filled', label: 'Filled' }, { v: 'outline', label: 'Outline' }],
      function () { return state.outline ? 'outline' : 'filled'; }, function (v) { state.outline = v === 'outline'; }));
  }

  // Grid panel (flag): grid size and how visible the empty grid is.
  // While the size slider is held, the drawing is re-sampled from how it looked when you grabbed it,
  // so dragging back and forth doesn't degrade it.
  var sizeBase = null;
  function setCellSize(n) {
    if (imgSrc) { CELL = n; computeGrid(); imgRaster = null; drawIdle(); applyImage(); return; }   // pictures just re-fit
    if (!sizeBase) sizeBase = { cells: new Set(cells), cell: CELL, ox: ox, oy: oy };
    var b = sizeBase, next = new Set();
    CELL = n;
    computeGrid();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = ox + (c + 0.5) * n, py = oy + (r + 0.5) * n;
        var oc = Math.floor((px - b.ox) / b.cell), orow = Math.floor((py - b.oy) / b.cell);
        if (b.cells.has(oc + ',' + orow)) next.add(c + ',' + r);
      }
    }
    cells = next;
    drawIdle();
    dirty = true;
    updateInfo();
  }
  function commitCellSize() {
    sizeBase = null;
    undoStack = []; redoStack = [];   // older snapshots belong to the previous grid
  }
  function buildGrid() {
    var el = $('#gridControls');
    el.appendChild(sliderRow({
      label: 'Grid size', min: 8, max: 48, step: 2, value: CELL,
      fmt: function (v) { return v + 'px'; }, onChange: setCellSize, onCommit: commitCellSize
    }));
    el.appendChild(sliderRow({
      label: 'Visibility', min: 0, max: 1, step: 0.01, value: GRID_VIS,
      fmt: function (v) { return Math.round(v * 100) + '%'; },
      onChange: function (v) { GRID_VIS = v; drawIdle(); }
    }));
  }

  /* ---------- Header, status, shortcuts ---------- */

  function updateInfo() {
    var n = anyCells();
    $('#hint').classList.toggle('hidden', n || !!drag);
    setExportEnabled(n);
  }

  var ICON_PAUSE = '<path d="M5.5 3.5v9M10.5 3.5v9"/>';
  var ICON_PLAY = '<path d="M5 3.5l7 4.5-7 4.5z"/>';
  function updatePlayButton() {
    var auto = state.interaction === 'auto', pausing = auto && state.playing;
    $('#playLabel').textContent = pausing ? 'Pause' : 'Play';
    $('#playIcon').innerHTML = pausing ? ICON_PAUSE : ICON_PLAY;
    $('#playBtn').title = auto ? 'Play / pause (Space)' : 'Play one cycle (Space)';
    var st = $('#status');                       // only visible with the statusHeader flag
    if (st) st.textContent = auto ? (state.playing ? 'Looping' : 'Paused') : 'Waiting';
  }
  function setPlaying(on) { state.playing = on; updatePlayButton(); }
  // Auto: pause / resume. Hover and Click: preview one cycle.
  function playPressed() {
    if (state.interaction === 'auto') setPlaying(!state.playing);
    else E.tlTrigger(tl, currentPeriod());
  }
  $('#playBtn').addEventListener('click', playPressed);

  // Hover mode previews on the canvas itself: plays while hovered, stops the moment the pointer leaves.
  stage.addEventListener('pointerenter', function () { if (tl.mode === 'hover') E.tlStart(tl); });
  stage.addEventListener('pointerleave', function () { if (tl.mode === 'hover') E.tlStop(tl); });

  $('#eraserBtn').addEventListener('click', function () { setTool('eraser'); });
  $('#randomBtn').addEventListener('click', randomize);
  $('#clearBtn').addEventListener('click', function () {
    var before = beginEdit(); cells.clear(); dirty = true; endEdit(before); updateInfo();
  });
  $('#invertBtn').addEventListener('click', function () {
    var before = beginEdit(), next = new Set();
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { var k = c + ',' + r; if (!cells.has(k)) next.add(k); }
    cells = next; dirty = true; endEdit(before); updateInfo();
  });
  document.querySelectorAll('[data-size]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.dataset.size.split('x');
      setArt(+p[0], +p[1]);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || view !== 'canvas' || welcomeOpen) return;
    if (e.ctrlKey || e.metaKey) {
      var k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      return;
    }
    if (e.altKey) return;
    if (sel && e.key === 'Escape') { sel = null; return; }
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); playPressed(); return; }
    if (/^[1-9]$/.test(e.key) && PRESETS[+e.key - 1]) { onPresetClick(PRESETS[+e.key - 1].id); return; }
    var t = TOOLS.find(function (x) { return x.key === e.key.toLowerCase(); });
    if (t && (FLAGS.extraTools || !t.extra)) setTool(t.id);
  });

  /* ---------- Image: upload -> black & white -> cells (conversion lives in image.js) ---------- */

  var imgSrc = null;          // { el, w, h } the uploaded picture
  var imgRaster = null;       // that picture drawn at one pixel per grid cell (cached)
  var imgOpts = { style: 'threshold', level: 0.5, on: 'dark', fit: 'fit' };
  var imgUI = {};

  // Halve repeatedly until close to the target size; one big jump would alias badly.
  function shrink(el, w, h, tw, th) {
    var cur = el, cw = w, ch = h;
    while (cw > tw * 2 || ch > th * 2) {
      var nw = Math.max(tw, Math.ceil(cw / 2)), nh = Math.max(th, Math.ceil(ch / 2));
      var c = document.createElement('canvas');
      c.width = nw; c.height = nh;
      var x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, nw, nh);
      cur = c; cw = nw; ch = nh;
    }
    return cur;
  }

  function getRaster() {
    if (imgRaster) return imgRaster;
    var iw = imgSrc.w, ih = imgSrc.h;
    var sc = imgOpts.fit === 'fill' ? Math.max(cols / iw, rows / ih) : Math.min(cols / iw, rows / ih);
    var dw = Math.max(1, iw * sc), dh = Math.max(1, ih * sc);
    var c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(shrink(imgSrc.el, iw, ih, Math.ceil(dw), Math.ceil(dh)), (cols - dw) / 2, (rows - dh) / 2, dw, dh);
    imgRaster = x.getImageData(0, 0, cols, rows).data;
    return imgRaster;
  }

  // The picture becomes the drawing: every animation then runs on it.
  function applyImage() {
    if (!imgSrc) return;
    var arr = window.DotImage.toCells(getRaster(), cols, rows, imgOpts), next = new Set();
    for (var i = 0; i < arr.length; i++) next.add(arr[i][0] + ',' + arr[i][1]);
    cells = next; cellColor = new Map();
    dirty = true;
    updateInfo();
  }

  function setImageActive(on) {
    imgUI.opts.classList.toggle('is-empty', !on);
    imgUI.remove.disabled = !on;
  }

  function loadImageFile(file) {
    if (!file || !FLAGS.imageUpload || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), el = new Image();
    el.onload = function () {
      URL.revokeObjectURL(url);
      imgSrc = { el: el, w: el.naturalWidth || 512, h: el.naturalHeight || 512 };   // SVGs may report 0
      imgRaster = null;
      var before = beginEdit();
      imgOpts.on = window.DotImage.suggestOn(getRaster());                           // dots on the minority tone
      imgUI.onRow.repaint();
      applyImage();
      endEdit(before);
      setImageActive(true);
    };
    el.onerror = function () { URL.revokeObjectURL(url); };
    el.src = url;
  }

  function buildImage() {
    var el = $('#imageControls');

    var pair = document.createElement('div');
    pair.className = 'pair';
    pair.innerHTML =
      '<button class="key" id="imgUpload" title="Upload a picture (or drop one on the canvas)"><span>Upload image</span></button>' +
      '<button class="key" id="imgRemove" title="Stop using the picture (the dots stay)" disabled><span>Remove</span></button>';
    el.appendChild(pair);

    var opts = document.createElement('div');
    opts.className = 'img-opts is-empty';
    var styleRow = segRow('Style', [{ v: 'threshold', label: 'Threshold' }, { v: 'dither', label: 'Dither' }],
      function () { return imgOpts.style; }, function (v) { imgOpts.style = v; applyImage(); });
    var levelRow = sliderRow({
      label: 'Level', min: 0.05, max: 0.95, step: 0.01, value: imgOpts.level,
      fmt: function (v) { return Math.round(v * 100) + '%'; }, onChange: function (v) { imgOpts.level = v; applyImage(); }
    });
    var onRow = segRow('Dots on', [{ v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }],
      function () { return imgOpts.on; }, function (v) { imgOpts.on = v; applyImage(); });
    var fitRow = segRow('Fit', [{ v: 'fit', label: 'Fit' }, { v: 'fill', label: 'Fill' }],
      function () { return imgOpts.fit; }, function (v) { imgOpts.fit = v; imgRaster = null; applyImage(); });
    var rowsToShow = FLAGS.imageAdvanced ? [styleRow, levelRow, onRow, fitRow] : [styleRow, onRow];
    rowsToShow.forEach(function (r) { opts.appendChild(r); });
    el.appendChild(opts);

    imgUI = { opts: opts, onRow: onRow, remove: pair.querySelector('#imgRemove') };

    var input = $('#imageFile');
    $('#imgUpload').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { loadImageFile(input.files[0]); input.value = ''; });
    imgUI.remove.addEventListener('click', function () { imgSrc = null; imgRaster = null; setImageActive(false); });
  }

  /* ---------- Open an exported HTML file ---------- */

  // Status bar: shows views and stars by default, and doubles as the notification area.
  // notify(text)                     shows text for a few seconds, then goes back to views / stars
  // notify(text, { busy: true })     stays (with a pulsing light) until the next notify() or notifyDone()
  var statusTimer = 0;
  function notify(msg, o) {
    o = o || {};
    clearTimeout(statusTimer);
    $('#statusText').textContent = msg;
    $('#statusMsg').classList.toggle('busy', !!o.busy);
    $('#statusMsg').hidden = false;
    $('#statusIdle').hidden = true;
    if (!o.busy) statusTimer = setTimeout(notifyDone, o.ms || 3200);
  }
  function notifyDone() {
    clearTimeout(statusTimer);
    $('#statusMsg').hidden = true;
    $('#statusIdle').hidden = false;
  }

  // Version, views and GitHub stars. A value that is not available (no counter set up, offline)
  // shows a dash.
  function buildStatus() {
    var site = window.SITE || {};
    // n = 1 reads "1 Star" / "1 View"
    function put(id, text, n) {
      var el = $(id), unit = el.querySelector('.unit');
      el.querySelector('b').textContent = text;
      if (unit) unit.textContent = ' ' + unit.dataset.word + (n === 1 ? '' : 's');
    }
    document.querySelectorAll('.stat .unit').forEach(function (u) { u.dataset.word = u.textContent.replace(/s$/, ''); });
    put('#statVersion', site.version ? 'v' + site.version : '-');
    put('#statViews', '-', 0);
    put('#statStars', '-', 0);
    if (site.repo) $('#statStars').href = 'https://github.com/' + site.repo;
    // Counts are cached in localStorage for 30 minutes: GitHub's API allows only 60 anonymous requests an hour
    // per IP, which reloading while developing can use up. A stale value is shown if a fetch fails.
    var TTL = 30 * 60 * 1000;
    function cached(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
    function remember(key, n) { try { localStorage.setItem(key, JSON.stringify({ n: n, t: Date.now() })); } catch (e) {} }
    function load(id, key, url, pick) {
      var c = cached(key), have = c && typeof c.n === 'number';
      if (have) put(id, c.n.toLocaleString(), c.n);
      if (have && Date.now() - c.t < TTL) return;
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        var n = pick(d);
        if (typeof n !== 'number') throw new Error('no number in response');
        remember(key, n); put(id, n.toLocaleString(), n);
      }).catch(function (err) { console.warn('[status] could not load ' + key + ':', err.message); });
    }
    if (site.repo) load('#statStars', 'dm-stars', 'https://api.github.com/repos/' + site.repo, function (d) { return d.stargazers_count; });
    if (site.views && site.views.namespace) {
      // Count this visit once per session, only on the live site; otherwise just read the number.
      var path = '/' + encodeURIComponent(site.views.namespace) + '/' + encodeURIComponent(site.views.key || 'views');
      var live = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      var counted = false;
      try { counted = !!sessionStorage.getItem('dm-counted'); } catch (e) {}
      var hit = live && !counted;
      // Abacus is the live counter. A copy of the count is saved to the repo's `stats` branch by a scheduled
      // GitHub Action (.github/workflows/views-backup.yml), so if Abacus is down or resets we still show a real number.
      var live_count = fetch('https://abacus.jasoncameron.dev/' + (hit ? 'hit' : 'get') + path).then(function (r) {
        if (r.status === 404) return 0;                      // no visits recorded yet
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function (d) {
          if (typeof d.value !== 'number') throw new Error('no number in response');
          if (hit) { try { sessionStorage.setItem('dm-counted', '1'); } catch (e) {} }
          return d.value;
        });
      }).catch(function (err) { console.warn('[status] live view count unavailable:', err.message); return null; });
      var backup = !site.repo ? Promise.resolve(null)
        : fetch('https://raw.githubusercontent.com/' + site.repo + '/stats/views.json').then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { return d && typeof d.value === 'number' ? d.value : null; }).catch(function () { return null; });
      Promise.all([live_count, backup]).then(function (v) {
        var n = Math.max(v[0] === null ? -1 : v[0], v[1] === null ? -1 : v[1]);   // never show less than the backup
        if (n >= 0) put('#statViews', n.toLocaleString(), n);
      });
    }
  }

  // The exported file holds `var DATA={...};` (drawing, values, colour) and `var presetFn=...;` (the animation).
  function parseExport(text) {
    var at = text.indexOf('var DATA=');
    if (at < 0) return null;
    var i = text.indexOf('{', at), depth = 0, inStr = false, j;
    for (j = i; j < text.length; j++) {
      var ch = text[j];
      if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    var data;
    try { data = JSON.parse(text.slice(i, j + 1)); } catch (err) { return null; }
    if (!data || !(data.runs || data.layers) || !data.w || !data.h) return null;

    var squash = function (str) { return str.replace(/\s+/g, ''); };
    var fa = text.indexOf('var presetFn='), fb = text.indexOf(';\nvar DATA=', fa), preset = null, stack = null;
    if (fa > -1 && fb > fa) {
      var raw = text.slice(fa + 13, fb);
      if (raw.indexOf('/*STACK:') === 0) {
        // a stacked export: the layers are listed in the leading comment
        try {
          var meta = JSON.parse(raw.slice(8, raw.indexOf('*/')));
          if (meta.every(function (l) { return presetById(l.id); })) stack = meta;
        } catch (err) { stack = null; }
      } else {
        var fn = squash(raw);
        preset = PRESETS.find(function (p) { return squash(p.fn.toString()) === fn; }) || null;
      }
    }
    // Normalise: every file is a list of layers (older single-animation files are one layer).
    var found = data.layers
      ? data.layers.map(function (l) { return { runs: l.runs, palette: l.palette, p: l.p, color: l.color, shape: l.shape, preset: presetById(l.id) || null, stack: null }; })
      : [{ runs: data.runs, palette: data.palette, p: data.p, color: data.color, shape: data.geo && data.geo.shape, preset: preset, stack: stack }];
    return { data: data, layers: found, preset: found[0].preset, stack: found[0].stack };
  }

  function importHtml(text, name) {
    var parsed = parseExport(text);
    if (!parsed) { notify('Not a Dot Mania file'); return; }
    var d = parsed.data;

    resetSession();                         // nothing from the current canvas carries over
    setPlaying(true);                       // an opened file plays, so you see it as it was made
    if (d.geo && d.geo.cell) CELL = d.geo.cell;
    setArt(d.w, d.h);                       // also clears the canvas and history

    parsed.layers.forEach(function (l, i) {
      if (i > 0) addLayer();
      state.dotShape = l.shape || 'dot';
      l.runs.forEach(function (row) {
        row[1].forEach(function (run) {
          var pc = l.palette && l.palette[run[2] || 0];
          var own = pc ? { mode: pc.mode, hex: pc.hex, cycle: pc.cycle === undefined ? 1 : pc.cycle } : null;
          for (var n = 0; n < run[1]; n++) {
            setCell(run[0] + n, row[0], true);
            if (own) cellColor.set((run[0] + n) + ',' + row[0], own);
          }
        });
      });
      if (l.color) {
        Object.assign(state.color, { mode: l.color.mode, hex: l.color.hex });
        if (l.color.cycle !== undefined) state.color.cycle = l.color.cycle;
      }
      if (l.stack) {
        l.stack.forEach(function (s) { Object.assign(state.values[s.id], s.v); });
        state.stack = l.stack.map(function (s) { return s.id; });
        state.preset = state.stack[0];
        state.stacking = state.stack.length > 1;
      } else if (l.preset) {
        Object.assign(state.values[l.preset.id], l.p);
        state.preset = l.preset.id; state.stack = [l.preset.id]; state.stacking = false;
      }
    });
    saveActive();
    if (layers.length > 1) { loadLayer(0); } else { refreshLayerUI(); }
    if (FLAGS.interaction && d.mode) setInteraction(d.mode);
    drawIdle();
    dirty = true;
    updateInfo();
    setFileLoaded(true);
    var first = parsed.layers[0];
    notify(first.preset || first.stack ? 'Opened ' + (name || (first.preset ? first.preset.name : 'stack')) : 'Opened drawing (animation not recognised)');
  }

  var FILE_OPEN = '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>', FILE_CLOSE = '<path d="M4 4l8 8M12 4l-8 8"/>';
  var fileLoaded = false;
  function setFileLoaded(on) {
    fileLoaded = on;
    $('#fileLabel').textContent = on ? 'Close File' : 'Open HTML';
    $('#fileIcon').innerHTML = on ? FILE_CLOSE : FILE_OPEN;
    $('#importBtn').title = on ? 'Close this file and start a fresh session' : 'Open an HTML file exported from Dot Mania (or drop it on the canvas)';
  }

  // Back to a blank first-launch session: empty canvas, default animation, look and size.
  function resetSession() {
    state.values = makeValues();
    Object.assign(state.color, { mode: 'solid', hex: '#ef282d', cycle: 1 });
    state.dotShape = 'dot';
    state.stack = [PRESETS[0].id]; state.preset = PRESETS[0].id; state.stacking = false;
    undoStack = []; redoStack = [];
    CELL = 16;
    imgSrc = null; imgRaster = null;
    if (imgUI.opts) setImageActive(false);
    if (FLAGS.interaction) setInteraction('auto');
    setPlaying(false);                      // a fresh session starts paused
    cells = new Set(); cellColor = new Map();
    setArt(1080, 1080);                     // also clears history
    repaintShapes(); repaintColor();
    setStacking(false);
    selectPreset(PRESETS[0].id);
    drawIdle();
    dirty = true;
    initLayers();                           // back to one empty layer
    refreshLayerUI();
  }
  function closeFile() {
    resetSession();
    setFileLoaded(false);
    notify('Fresh session');
  }

  function loadHtmlFile(file) {
    notify('Opening ' + file.name + '…', { busy: true });
    var reader = new FileReader();
    reader.onload = function () { importHtml(String(reader.result), file.name); };
    reader.onerror = function () { notify('Could not read that file'); };
    reader.readAsText(file);
  }

  function setupFiles() {
    var input = $('#htmlFile');
    setFileLoaded(false);
    $('#importBtn').addEventListener('click', function () { if (fileLoaded) closeFile(); else input.click(); });
    input.addEventListener('change', function () { if (input.files[0]) loadHtmlFile(input.files[0]); input.value = ''; });

    // drop a picture or an exported HTML file straight onto the canvas
    stage.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') > -1) {
        e.preventDefault(); stage.classList.add('drop-target');
      }
    });
    stage.addEventListener('dragleave', function () { stage.classList.remove('drop-target'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault(); stage.classList.remove('drop-target');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (/\.html?$/i.test(f.name) || f.type === 'text/html') loadHtmlFile(f); else loadImageFile(f);
    });
  }

  /* ---------- Pages (top nav) ---------- */

  var view = 'canvas';
  var VIEWS = ['home', 'canvas', 'about', 'library', 'updates', 'guide'];
  var VIEW_FLAG = { home: 'homePage', about: 'aboutPage', library: 'libraryPage', updates: 'whatsNewPage', guide: 'guidePage' };      // pages that can be switched off
  function viewOn(id) { return !VIEW_FLAG[id] || FLAGS[VIEW_FLAG[id]]; }
  // With the welcome page off (the default) the tool is the front door at /, and /tabs/canvas still works too.
  var HOME_ON = !!FLAGS.homePage, DEFAULT_VIEW = HOME_ON ? 'home' : 'canvas';
  // The page entry folders live together in /tabs, so the addresses are /tabs/about, /tabs/library and so on.
  var SLUGS = { home: HOME_ON ? '' : 'tabs/home', canvas: HOME_ON ? 'tabs/canvas' : '', about: 'tabs/about', library: 'tabs/library', updates: 'tabs/whats-new', guide: 'tabs/guide' };
  // Where the app lives (works at the site root or in a sub-folder, and from the /tabs/about etc. entry pages).
  var ROOT = new URL('.', document.baseURI).pathname;
  function viewFromPath() {
    var slug = location.pathname.slice(ROOT.length).replace(/index\.html$/, '').replace(/\/+$/, '');
    var v = VIEWS.find(function (x) { return SLUGS[x] === slug; }) || (slug === 'tabs/canvas' ? 'canvas' : null);
    if (v && !viewOn(v)) { try { history.replaceState(null, '', ROOT); } catch (e) {} return DEFAULT_VIEW; }   // a disabled page: back to the front door
    return v || DEFAULT_VIEW;
  }
  function goTo(id) {
    if (!viewOn(id)) id = DEFAULT_VIEW;
    var url = ROOT + SLUGS[id];
    if (location.pathname !== url) { try { history.pushState(null, '', url); } catch (e) {} }
    showView(id);
  }
  // The live animation at the end of the About page (loaded the first time the page is opened).
  var aboutPreviewLoaded = false;
  function loadAboutPreview() {
    var box = $('#aboutPreview'), url = ROOT + 'assets/previews/home.html';
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) { libPreview(box, text, url, 'Preview', welcomeItems, 1280); })
      .catch(function () { libIframe(box, url, 'Preview'); });
  }

  function showView(id) {
    if (VIEWS.indexOf(id) < 0 || !viewOn(id)) id = DEFAULT_VIEW;
    view = id;
    document.body.dataset.view = id;           // the tool is full width, every other page sits in the narrower site container
    document.querySelectorAll('[data-page]').forEach(function (el) { el.hidden = el.dataset.page !== id; });
    document.querySelectorAll('#tabs button.navbtn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === id)); });
    if (id === 'canvas') fitStage();
    if (id === 'about' && !aboutPreviewLoaded) { aboutPreviewLoaded = true; loadAboutPreview(); }
    if (id === 'library' || id === 'home' || id === 'about') libStart();
  }
  // Library: a grid of templates. Previews are drawn here, small and from one shared loop that only
  // animates cards on screen (eight full-size components at once was far too heavy). If a template can't be
  // fetched (page opened as a file) the card falls back to showing the template itself in an iframe.
  var PREVIEW_W = 640;
  var libItems = [], libRaf = 0, libLast = 0;
  var welcomeItems = [], welcomeOpen = false;      // the welcome popup's preview uses the same loop

  function libFrame(now) {
    libRaf = 0;
    if (view !== 'library' && view !== 'home' && view !== 'about' && !welcomeOpen) return;
    var dt = Math.min((now - libLast) / 1000, 0.1);
    libLast = now;
    libItems.concat(welcomeItems).forEach(function (it) {
      if (!it.visible) return;
      E.tlAdvance(it.tl, dt, it.T);
      var c = it.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#0b0b0a';
      c.fillRect(0, 0, it.cv.width, it.cv.height);
      c.drawImage(it.idle, 0, 0);
      c.setTransform(it.s, 0, 0, it.s, it.ox || 0, it.oy || 0);
      E.drawLayers(c, it.layers, it.tl.t, it.tl.ph, it.geo, false);
    });
    libRaf = requestAnimationFrame(libFrame);
  }
  function libStart() {
    if (libRaf || !(libItems.length || welcomeItems.length)) return;
    libLast = performance.now();
    libRaf = requestAnimationFrame(libFrame);
  }

  function libPreview(box, text, url, name, list, width, zoom) {
    var parsed = parseExport(text);
    var d = parsed && parsed.data, T = d && d.period || 1, items = [];
    if (parsed) parsed.layers.forEach(function (l) {
      if (!l.preset) return;
      var cells = [];
      l.runs.forEach(function (row) {
        row[1].forEach(function (run) { for (var n = 0; n < run[1]; n++) cells.push([run[0] + n, row[0], l.palette ? l.palette[run[2] || 0] : undefined]); });
      });
      var per = l.preset.period(l.p);
      items.push({ list: E.buildList(cells), fn: l.preset.fn, p: l.p, color: l.color || d.color, shape: l.shape || (d.geo && d.geo.shape),
        k: Math.max(1, Math.round(T / per)) * per / T });
    });
    if (!parsed || !items.length) { libIframe(box, url, name); return; }
    // zoom > 1 shows the middle of the animation bigger (the dots grow), instead of the whole canvas shrunk
    var pw = width || PREVIEW_W, base = pw / d.w, s = base * (zoom || 1), cv = document.createElement('canvas');
    cv.width = pw; cv.height = Math.round(d.h * base);
    var ox = (cv.width - d.w * s) / 2, oy = (cv.height - d.h * s) / 2;
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', name + ' preview');
    var idle = document.createElement('canvas');
    idle.width = cv.width; idle.height = cv.height;
    var ic = idle.getContext('2d');
    ic.setTransform(s, 0, 0, s, ox, oy);
    E.drawIdle(ic, d.gridCols, d.gridRows, d.geo, d.gridVis === undefined ? GRID_VIS : d.gridVis);
    var it = {
      cv: cv, ctx: cv.getContext('2d'), idle: idle, s: s, ox: ox, oy: oy, geo: d.geo, layers: items,
      T: d.period, tl: E.makeTimeline('auto'), visible: false
    };
    it.tl.t = d.still || 0;                 // start on a pleasant frame, so a card is never blank
    box.innerHTML = '';
    box.appendChild(cv);
    (list || libItems).push(it);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        it.visible = entries[entries.length - 1].isIntersecting;
        if (it.visible) libStart();
      }).observe(cv);
    } else { it.visible = true; }
    if (view === 'library' || view === 'home' || view === 'about' || welcomeOpen) libStart();
  }

  function libIframe(box, url, name) {
    box.innerHTML = '<iframe loading="lazy" tabindex="-1" sandbox="allow-scripts"></iframe>';
    var f = box.querySelector('iframe');
    f.title = name + ' preview';
    f.src = url;
  }

  function buildLibrary() {
    var grid = $('#libGrid');
    grid.innerHTML = '';
    libItems = [];
    (window.LIBRARY || []).forEach(function (t) {
      var url = ROOT + 'templates/' + t.file, card = document.createElement('article');
      card.className = 'lib-card';
      card.innerHTML =
        '<div class="lib-preview"></div>' +
        '<div class="lib-name"></div>' +
        '<div class="lib-actions">' +
          '<button class="key" data-act="load">Load File</button>' +
          '<a class="key" data-act="download" download>Download</a>' +
        '</div>';
      card.querySelector('.lib-name').textContent = t.name;
      var dl = card.querySelector('[data-act="download"]');
      dl.href = url; dl.download = t.file;
      var box = card.querySelector('.lib-preview');
      fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (text) { libPreview(box, text, url, t.name); })
        .catch(function () { libIframe(box, url, t.name); });
      card.querySelector('[data-act="load"]').addEventListener('click', function () {
        notify('Loading ' + t.name + '…', { busy: true });
        fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (text) {
          goTo('canvas');
          importHtml(text, t.name);
        }).catch(function () { notify('Could not load. Open the app from a local server'); });
      });
      grid.appendChild(card);
    });
  }
  // Right panel tabs: Edit (look, color, image...) and Export (room for more export options).
  function setupPanelTabs() {
    var tabs = document.querySelectorAll('#panelTabs .key');
    function show(id) {
      tabs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ptab === id)); });
      document.querySelectorAll('[data-ptab-body]').forEach(function (el) { el.hidden = el.dataset.ptabBody !== id; });
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.ptab); }); });
  }
  function buildPages() {
    setupPanelTabs();
    $('#aboutStart').addEventListener('click', function () { goTo('canvas'); });
    if (FLAGS.libraryPage) buildLibrary();
    var U = window.WHATS_NEW || [], site = window.SITE || {};
    $('#aboutVersion').textContent = (site.version ? 'v' + site.version + ' \u00b7 ' : '') + 'Closed beta';
    $('#aboutCount').textContent = MAIN.length;
    $('#updatesTable').innerHTML = '<tr><th>Version</th><th>Date</th><th>Changes</th></tr>' + U.map(function (u) {
      var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      return '<tr><td>' + esc(u.v) + '</td><td>' + esc(u.date) + '</td><td><ul>' + u.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></td></tr>';
    }).join('');
    document.querySelectorAll('#tabs button.navbtn').forEach(function (b) {
      b.addEventListener('click', function () { goTo(b.dataset.view); });
    });
    window.addEventListener('popstate', function () { showView(viewFromPath()); });
  }

  /* ---------- Interaction ---------- */

  var INTERACTIONS = [
    { id: 'auto', name: 'Auto', hint: 'Loops continuously' },
    { id: 'hover', name: 'Hover', hint: 'Plays while the pointer is over it' },
    { id: 'click', name: 'Click', hint: 'Plays one cycle per click' }
  ];
  function buildInteraction() {
    var grid = document.createElement('div');
    grid.className = 'keygrid cols3';
    INTERACTIONS.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = it.name; b.dataset.mode = it.id; b.title = it.hint;
      b.addEventListener('click', function () { setInteraction(it.id); });
      grid.appendChild(b);
    });
    $('#interactionControls').appendChild(grid);
  }
  function setInteraction(mode) {
    state.interaction = mode;
    E.tlSetMode(tl, mode);
    document.querySelectorAll('#interactionControls .key').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    updatePlayButton();
  }

  /* ---------- Export (lives in the right panel) ---------- */

  var exportOpts = { bg: 'dark', grid: true, quality: 'medium' };
  // Quality: the GIF's longest side in px, and the video bitrate. Higher looks sharper but makes heavier files and takes longer.
  var GIF_SIDE = { low: 480, medium: 960, high: 1440 }, VIDEO_BPS = { low: 5000000, medium: 12000000, high: 20000000 };
  // GIF tuning: 30 fps, small tolerance (a bigger one makes fades step instead of glide), and a palette sized
  // to the content: single-colour looks need few colours, multi-colour modes need more.
  var GIF_MAX_SECONDS = 8, GIF_FPS = 30, GIF_TOLERANCE = 12, GIF_COLORS_SIMPLE = 31, GIF_COLORS_RICH = 63;
  var gifBusy = false, videoBusy = false;

  function buildExport() {
    var T = loopPeriod();
    return window.DotExport.build({
      layers: exportLayers().map(function (it) {
        return { cells: it.cells, preset: it.preset, values: it.p, color: it.color, shape: it.shape, k: it.k, name: it.name };
      }),
      art: state.art, cols: cols, rows: rows, geo: exportGeo(),
      interaction: state.interaction, period: T, gridVis: GRID_VIS
    }, exportOpts);
  }

  // Saved files get a random, silly name instead of "dot-mania": e.g. grumpy-waffle-42.gif
  var NAME_A = ['wobbly', 'sneaky', 'cosmic', 'grumpy', 'fuzzy', 'turbo', 'soggy', 'electric', 'jolly', 'spicy', 'mellow', 'cranky',
    'bouncy', 'sleepy', 'funky', 'zesty', 'giddy', 'moody', 'glitchy', 'velvet', 'plasma', 'pocket', 'rowdy', 'dizzy'];
  var NAME_B = ['waffle', 'pickle', 'noodle', 'comet', 'walrus', 'pixel', 'muffin', 'robot', 'taco', 'badger', 'goblin', 'biscuit',
    'octopus', 'meteor', 'pancake', 'llama', 'jellybean', 'wizard', 'cactus', 'burrito', 'moth', 'toaster', 'yeti', 'dumpling'];
  function choice(a) { return a[Math.floor(Math.random() * a.length)]; }
  function funkyName(ext) { return choice(NAME_A) + '-' + choice(NAME_B) + '-' + Math.floor(10 + Math.random() * 90) + '.' + ext; }

  function download(name, data, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    notify('Saved ' + name);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function setExportEnabled(on) {
    document.querySelectorAll('[data-export]').forEach(function (b) {
      b.disabled = !on || (gifBusy && b.id === 'exportGif') || (videoBusy && !!b.dataset.video) || !!b.dataset.unsupported;
    });
  }

  function copyText(text, labelEl, original) {
    var done = function () { notify('Copied to clipboard'); labelEl.textContent = 'Copied'; setTimeout(function () { labelEl.textContent = original; }, 1600); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // One seamless cycle of the animation, looping forever, covering the whole artboard.
  // Clear background gives a transparent GIF (1-bit transparency); Dark gives the dark editor look.
  function exportGif() {
    if (gifBusy || !anyCells()) return;
    var items = exportLayers(), T = loopPeriod();

    gifBusy = true;
    notify('Rendering GIF…', { busy: true });
    setExportEnabled(true);
    window.DotGif.encodeAnimation({
      E: E, layers: items, T: T, secs: Math.min(T, GIF_MAX_SECONDS),
      art: state.art, geo: exportGeo(), cols: cols, rows: rows, gridVis: GRID_VIS, grid: exportOpts.grid,
      transparent: exportOpts.bg === 'transparent', bg: '#0b0b0a',
      maxSide: GIF_SIDE[exportOpts.quality], fps: GIF_FPS, tolerance: GIF_TOLERANCE,
      colors: layersAreRich(items) ? GIF_COLORS_RICH : GIF_COLORS_SIMPLE
    }).then(function (blob) {
      download(funkyName('gif'), blob, 'image/gif');
    }).catch(function (err) {
      console.error('GIF export failed', err);
      notify('GIF export failed');
    }).then(function () {
      gifBusy = false;
      setExportEnabled(anyCells());
    });
  }

  // Video (WebM and MP4): records the animation on a canvas as it plays, so it takes as long as the clip.
  // The clip covers whole cycles only (1, or 2 when one cycle is under 3 s) so it loops seamlessly.
  // Always a dark background: the browser recorder can't keep transparency.
  var VIDEO_KINDS = {
    webm: { label: 'Webm', types: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] },
    mp4: { label: 'Mp4', types: ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'] }
  };
  function videoMime(kind) {
    return window.MediaRecorder && VIDEO_KINDS[kind].types.find(function (t) { return MediaRecorder.isTypeSupported(t); });
  }
  function recordVideo(kind) {
    if (videoBusy || !anyCells()) return;
    var mime = videoMime(kind);
    if (!mime) { notify('This browser cannot record ' + kind.toUpperCase()); return; }

    var items = exportLayers(), T = loopPeriod();
    var dur = T * (T < 3 ? 2 : 1), g = exportGeo();

    var vc = document.createElement('canvas');
    vc.width = state.art.w; vc.height = state.art.h;
    var vx = vc.getContext('2d'), layer = null;
    if (exportOpts.grid) {
      layer = document.createElement('canvas');
      layer.width = state.art.w; layer.height = state.art.h;
      E.drawIdle(layer.getContext('2d'), cols, rows, g, GRID_VIS);
    }

    var labelEl = $('#export' + VIDEO_KINDS[kind].label + ' span'), original = labelEl.textContent;
    var rec = new MediaRecorder(vc.captureStream(30), { mimeType: mime, videoBitsPerSecond: VIDEO_BPS[exportOpts.quality] });
    var chunks = [], t0;
    function draw(t) {
      vx.fillStyle = '#0b0b0a';
      vx.fillRect(0, 0, state.art.w, state.art.h);
      if (layer) vx.drawImage(layer, 0, 0);
      E.drawLayers(vx, items, t, t / T, g, false);
    }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      videoBusy = false;
      labelEl.textContent = original;
      setExportEnabled(anyCells());
      download(funkyName(kind), new Blob(chunks, { type: mime.split(';')[0] }), mime);
    };
    function step(now) {
      var t = (now - t0) / 1000;
      if (t >= dur) { rec.stop(); return; }
      draw(t);
      var pct = Math.round(t / dur * 100);
      labelEl.textContent = pct + '%';
      notify('Recording ' + kind.toUpperCase() + ' ' + pct + '%', { busy: true });
      requestAnimationFrame(step);
    }
    videoBusy = true;
    notify('Recording ' + kind.toUpperCase() + ' 0%', { busy: true });
    setExportEnabled(true);
    draw(0);
    rec.start();
    t0 = performance.now();
    requestAnimationFrame(step);
  }

  // The animation as it is on screen right now, for the still-image exports.
  function currentFrame() { return { layers: exportLayers() }; }

  // PNG: the frame on screen, full artboard size. Honours the Background choice (Transparent = alpha).
  function exportPng() {
    if (!anyCells()) return;
    notify('Rendering PNG…', { busy: true });
    var f = currentFrame(), g = exportGeo(), c = document.createElement('canvas');
    c.width = state.art.w; c.height = state.art.h;
    var x = c.getContext('2d');
    if (exportOpts.bg === 'dark') { x.fillStyle = '#0b0b0a'; x.fillRect(0, 0, c.width, c.height); }
    if (exportOpts.grid) E.drawIdle(x, cols, rows, g, GRID_VIS);
    E.drawLayers(x, f.layers, tl.t, tl.ph, g, !state.playing);
    c.toBlob(function (blob) { if (blob) download(funkyName('png'), blob, 'image/png'); else notify('PNG export failed'); }, 'image/png');
  }

  // SVG: the same frame as scalable vector (marks mirror engine.dot). Small, sharp at any size.
  function svgMark(x, y, s, shape, fill, op) {
    var h = s / 2, r;
    function n(v) { return Math.round(v * 10) / 10; }
    function pts(a) { return a.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' '); }
    var attrs = ' fill="' + fill + '"' + (op < 1 ? ' fill-opacity="' + op.toFixed(3) + '"' : '') + '/>';
    if (shape === 'square') return '<rect x="' + n(x - h) + '" y="' + n(y - h) + '" width="' + n(s) + '" height="' + n(s) + '"' + attrs;
    if (shape === 'diamond') { r = h * 1.25; return '<polygon points="' + pts([[x, y - r], [x + r, y], [x, y + r], [x - r, y]]) + '"' + attrs; }
    if (shape === 'star') {
      r = h * 1.45;
      var sp = [];
      for (var q = 0; q < 10; q++) { var an = -Math.PI / 2 + q * Math.PI / 5, rd = q % 2 ? r * 0.45 : r; sp.push([x + Math.cos(an) * rd, y + Math.sin(an) * rd]); }
      return '<polygon points="' + pts(sp) + '"' + attrs;
    }
    if (shape === 'hash') {
      var hl = h * 1.15, hb = h * 0.4, th = Math.max(1, s * 0.22);
      return [[x - hb - th / 2, y - hl, th, hl * 2], [x + hb - th / 2, y - hl, th, hl * 2], [x - hl, y - hb - th / 2, hl * 2, th], [x - hl, y + hb - th / 2, hl * 2, th]]
        .map(function (b) { return 'M' + n(b[0]) + ' ' + n(b[1]) + 'h' + n(b[2]) + 'v' + n(b[3]) + 'h' + n(-b[2]) + 'z'; })
        .reduce(function (d, part) { return d + part; }, '<path d="') + '"' + attrs;
    }
    if (shape === 'triangle') { r = h * 1.4; return '<polygon points="' + pts([[x, y - r * 0.85], [x + r * 0.9, y + r * 0.85], [x - r * 0.9, y + r * 0.85]]) + '"' + attrs; }
    return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(h) + '"' + attrs;
  }
  function buildSvg() {
    var f = currentFrame(), g = exportGeo(), W = state.art.w, H = state.art.h, out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
    if (exportOpts.bg === 'dark') out.push('<rect width="' + W + '" height="' + H + '" fill="#0b0b0a"/>');
    if (exportOpts.grid) {
      var vis = (0.03 + 0.3 * GRID_VIS).toFixed(3), m = svgMark(g.cell / 2, g.cell / 2, g.cell * 0.3, g.shape, '#f6efe3', +vis);
      out.push('<defs><pattern id="grid" x="' + g.ox + '" y="' + g.oy + '" width="' + g.cell + '" height="' + g.cell + '" patternUnits="userSpaceOnUse">' + m + '</pattern></defs>');
      out.push('<rect x="' + g.ox + '" y="' + g.oy + '" width="' + cols * g.cell + '" height="' + rows * g.cell + '" fill="url(#grid)"/>');
    }
    f.layers.forEach(function (L) {
      var p = L.p;
      L.list.forEach(function (c) {
        var v = 1;                                   // a plain still: every dot as drawn, not animated
        var x = g.ox + (c.col + 0.5) * g.cell, y = g.oy + (c.row + 0.5) * g.cell, sz = g.cell * p.size * (0.4 + 0.6 * v);
        var fill = E.colorFor(c.color ? Object.assign({}, c.color, { steps: L.color.steps }) : L.color, c, v, 0);
        if (p.glow > 0.01 && v > 0.05) out.push(svgMark(x, y, sz * 1.9, L.shape, fill, 0.2 * p.glow * v));
        out.push(svgMark(x, y, sz, L.shape, fill, 0.18 + 0.82 * v));
      });
    });
    out.push('</svg>');
    return out.join('\n');
  }

  function buildExportUI() {
    function on(sel, fn) { var b = $(sel); if (b) b.addEventListener('click', fn); }
    function key(id, label, title) { return '<button class="key" id="' + id + '" data-export title="' + title + '"><span>' + label + '</span></button>'; }

    // Background (plus the grid option when its flag is on)
    var bg = $('#exportBg');
    bg.appendChild(segRow('', [{ v: 'dark', label: 'Black' }, { v: 'transparent', label: 'Transparent' }],
      function () { return exportOpts.bg; }, function (v) { exportOpts.bg = v; }));
    if (FLAGS.exportGridOption) {
      bg.appendChild(segRow('Grid', [{ v: 'show', label: 'Visible' }, { v: 'hide', label: 'Hidden' }],
        function () { return exportOpts.grid ? 'show' : 'hide'; }, function (v) { exportOpts.grid = v === 'show'; }));
    }

    // Code: an HTML file, or text to paste into an AI assistant
    var code = [];
    if (FLAGS.exportCodeFile) code.push(key('exportCode', 'HTML File', 'Download a ready-to-open HTML file with the component'));
    if (FLAGS.exportCopyForLlm) code.push(key('exportLlm', 'Copy LLM', 'Copy instructions plus the code, ready to paste into an AI assistant'));
    if (FLAGS.exportCopyEmbed) code.push(key('exportEmbed', 'Copy embed code', 'Copy just the component snippet'));
    if (FLAGS.exportDownloadJs) code.push(key('exportJs', 'Download .js', 'Download the component script on its own'));
    $('#exportCodeGroup').innerHTML = '<div class="pair">' + code.join('') + '</div>';

    // Media: animated and still images
    var media = [];
    if (FLAGS.exportGif) media.push(key('exportGif', 'GIF', 'Download one seamless loop as an animated GIF'));
    if (FLAGS.exportPng) media.push(key('exportPng', 'PNG', 'Download the frame on screen as a PNG'));
    if (FLAGS.exportSvg) media.push(key('exportSvg', 'SVG', 'Download the drawing as a still SVG (plain, not animated)'));
    var mel = $('#exportMedia');
    // Quality: its own option, applies to GIF size and video bitrate
    var q = segRow('', [{ v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }],
      function () { return exportOpts.quality; }, function (v) { exportOpts.quality = v; });
    q.classList.add('three');
    q.title = 'GIF: Low 480 px, Medium 960 px, High 1440 px on the longest side. Video: bitrate. Higher is sharper but makes a heavier file and takes longer.';
    $('#exportQuality').appendChild(q);

    var mhtml = '<div class="pair" style="grid-template-columns:repeat(' + Math.max(1, media.length) + ',1fr)">' + media.join('') + '</div>';
    var vids = [];
    if (FLAGS.exportWebm) vids.push(key('exportWebm', 'WebM', 'Download a video of the full loop (1-2 cycles, dark background)').replace('data-export', 'data-export data-video="webm"'));
    if (FLAGS.exportMp4) vids.push(key('exportMp4', 'MP4', 'Download a video of the full loop (1-2 cycles, dark background)').replace('data-export', 'data-export data-video="mp4"'));
    if (vids.length) mhtml += '<div class="pair" style="grid-template-columns:repeat(' + vids.length + ',1fr);margin-top:6px">' + vids.join('') + '</div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = mhtml;
    while (wrap.firstChild) mel.appendChild(wrap.firstChild);

    on('#exportCode', function () { notify('Building code file…', { busy: true }); download(funkyName('html'), buildExport().html, 'text/html'); });
    on('#exportGif', exportGif);
    on('#exportPng', exportPng);
    on('#exportSvg', function () { if (anyCells()) { notify('Rendering SVG…', { busy: true }); download(funkyName('svg'), buildSvg(), 'image/svg+xml'); } });
    on('#exportLlm', function () { copyText(buildExport().llm, $('#exportLlm span'), 'Copy LLM'); });
    on('#exportEmbed', function () { copyText(buildExport().snippet, $('#exportEmbed span'), 'Copy embed code'); });
    on('#exportJs', function () { download(funkyName('js'), buildExport().script, 'text/javascript'); });
    on('#exportWebm', function () { recordVideo('webm'); });
    on('#exportMp4', function () { recordVideo('mp4'); });
    ['webm', 'mp4'].forEach(function (k) {
      var b = $('#export' + VIDEO_KINDS[k].label);
      if (b && !videoMime(k)) { b.dataset.unsupported = '1'; b.title = 'This browser cannot record ' + k.toUpperCase(); }
    });
    setExportEnabled(cells.size > 0);
  }

  /* ---------- Welcome popup (closed beta) ---------- */

  // Shown on the first visit, then again after 5 hours (the welcomeOnce flag; off = every visit). The preview is assets/previews/welcome.html drawn with the same light renderer as the
  // Library previews. "How to use" pops a second card in beside the welcome (press it again, or Esc, to close it).
  var WELCOME_TTL = 5 * 60 * 60 * 1000;           // how long before the welcome popup comes back (5 hours)
  function setupWelcome() {
    if (!FLAGS.welcomePopup) return;
    var el = $('#welcome'), drawer = $('#howDrawer'), box = $('#welcomePreview'), loaded = false;
    var site = window.SITE || {};
    if (site.repo) $('#welcomeFeedback').href = 'https://github.com/' + site.repo + '/issues/new';

    function setDrawer(on) {
      drawer.classList.toggle('open', on);
      drawer.setAttribute('aria-hidden', String(!on));
      $('#welcomeHow').setAttribute('aria-expanded', String(on));
    }
    function open() {
      el.hidden = false; welcomeOpen = true;
      if (!loaded) {
        loaded = true;
        var url = ROOT + 'assets/previews/welcome.html';
        fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
          .then(function (text) { libPreview(box, text, url, 'Welcome', welcomeItems, 960, 2); })
          .catch(function () { libIframe(box, url, 'Welcome'); });
      }
      libStart();
      $('#welcomeGo').focus();
    }
    function close() {
      setDrawer(false);
      el.hidden = true; welcomeOpen = false;
      try { localStorage.setItem('dm-welcome-at', String(Date.now())); } catch (e) {}      // the session starts now: no popup for 5 hours
    }
    $('#welcomeGo').addEventListener('click', close);
    $('#welcomeHow').addEventListener('click', function () { setDrawer(!drawer.classList.contains('open')); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || el.hidden) return;
      if (drawer.classList.contains('open')) setDrawer(false); else close();
    });

    // First visit: show it. After that it stays away until 5 hours have passed since it was dismissed, then it shows again.
    // (?welcome=1 forces it, ?welcome=0 skips it, and the welcomeOnce flag off makes it show on every visit.)
    var seen = false;
    if (FLAGS.welcomeOnce) {
      try { var at = +localStorage.getItem('dm-welcome-at'); seen = !!at && Date.now() - at < WELCOME_TTL; } catch (e) {}
    }
    if (/[?&]welcome=1/.test(location.search) || (!seen && !/[?&]welcome=0/.test(location.search))) open();
  }

  /* ---------- Welcome page (the entry at /) ---------- */

  function setupHome() {
    if (!HOME_ON) return;                      // the welcome page is switched off
    var site = window.SITE || {}, box = $('#homePreview'), url = ROOT + 'assets/previews/home.html';
    var modal = $('#howModal');
    if (site.repo) $('#homeFeedback').href = 'https://github.com/' + site.repo + '/issues/new';
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) { libPreview(box, text, url, 'Welcome', welcomeItems, 1280); })
      .catch(function () { libIframe(box, url, 'Welcome'); });
    $('#homeYear').textContent = new Date().getFullYear();

    // Let's Go: the logo shimmers on a plain screen for a moment, then the studio opens
    var entering = false;
    $('#homeGo').addEventListener('click', function () {
      if (entering) return;
      entering = true;
      var el = $('#loader');
      el.hidden = false;
      void el.offsetWidth;                    // let the fade-in start from transparent
      el.classList.remove('out'); el.classList.add('in');
      setTimeout(function () {
        goTo('canvas');
        el.classList.remove('in'); el.classList.add('out');
        setTimeout(function () { el.hidden = true; el.classList.remove('out'); entering = false; }, 450);
      }, 1100);
    });

    // How to use: a card over the page. Esc, a click outside it, or the button again closes it.
    function setHow(on) { modal.hidden = !on; }
    $('#homeHow').addEventListener('click', function () { setHow(modal.hidden); });
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) setHow(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) setHow(false); });

    // the logo and name take you back to the welcome page
    [$('.logo'), $('.wordmark')].forEach(function (el) { el.addEventListener('click', function () { goTo('home'); }); });
  }

  /* ---------- For AI agents (src/js/agent.js) ---------- */

  // agent.js gives AI agents that visit the page a small set of helper tools (window.dotMania). They work through
  // the editor's own functions below, so the panels, the canvas and undo stay in step as if the change was made by
  // hand. Switched off with the agentTools flag.
  if (FLAGS.agentTools) window.DotApp = {
    state: state, presets: PRESETS, colorModes: COLOR_MODES, dotShapes: DOT_SHAPES, interactions: INTERACTIONS,
    stackMax: STACK_MAX, exportOpts: exportOpts,
    grid: function () { return { cols: cols, rows: rows, cell: CELL }; },
    anyCells: anyCells,
    cells: function () { return cellArray().map(function (c) { return [c[0], c[1]]; }); },   // [col, row] pairs only (colours stay internal)
    history: function () { return { undo: undoStack.length, redo: redoStack.length }; },
    busy: function () { return { gif: gifBusy, video: videoBusy }; },
    view: function () { return { view: view, welcomeOpen: welcomeOpen }; },
    // One undoable change, like a hand stroke: fn changes the drawing with setCell / clearCells / floodFill.
    edit: function (fn) { var before = beginEdit(); fn(); sel = null; dirty = true; endEdit(before); updateInfo(); },
    setCell: setCell, clearCells: function () { cells.clear(); }, floodFill: floodFill, lineCells: lineCells, shapeCells: shapeCells,
    undo: undo, redo: redo, randomize: randomize, setArt: setArt,
    selectPreset: selectPreset, onPresetClick: onPresetClick, setStacking: setStacking,
    repaintColor: function () { repaintColor(); }, repaintShapes: function () { repaintShapes(); }, drawIdle: drawIdle,
    setInteraction: setInteraction, setPlaying: setPlaying, playPressed: playPressed,
    buildExport: buildExport, download: download, funkyName: funkyName, notify: notify,
    exportGif: exportGif, exportPng: exportPng, recordVideo: recordVideo, videoMime: videoMime
  };

  /* ---------- Boot ---------- */

  // Show or hide everything a flag controls (flags.js), then build only what is switched on.
  document.querySelectorAll('[data-flag]').forEach(function (el) { el.hidden = !FLAGS[el.dataset.flag]; });
  // Pages that are switched off stay in the nav, greyed out and unclickable.
  document.querySelectorAll('[data-enable]').forEach(function (el) {
    var on = !!FLAGS[el.dataset.enable];
    el.disabled = !on;
    if (!on) el.title = 'Coming soon';
  });

  buildTools();
  buildPresets();
  buildStacking();
  buildColor();
  if (FLAGS.interaction) buildInteraction();
  if (FLAGS.dotShapes) buildDotShapes();
  if (FLAGS.starterShapes) buildStarters();
  if (FLAGS.imageUpload) buildImage();
  if (FLAGS.drawOptions) buildDraw();
  if (FLAGS.gridPanel) buildGrid();
  buildExportUI();
  buildPointer();
  buildStatus();
  setupFiles();
  buildPages();
  initLayers();
  $('#addLayerBtn').addEventListener('click', addLayer);
  $('#selMove').addEventListener('click', function () { selMode = 'move'; });
  $('#selResize').addEventListener('click', function () { selMode = 'resize'; });
  $('#selDelete').addEventListener('click', deleteSelection);
  selectPreset(state.preset);
  buildLayerPanel();
  setTool(state.tool);
  setInteraction(FLAGS.interaction ? state.interaction : 'auto');
  setPlaying(false);                        // opens paused: what you draw shows as drawn until you press Play
  new ResizeObserver(function () { fitStage(); }).observe(area);
  layout();
  setupHome();
  showView(viewFromPath());
  setupWelcome();
  requestAnimationFrame(frame);
})();
