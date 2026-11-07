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
    art: { w: 1920, h: 1080 },     // artboard size in px (1920x1080 or 1080x1080)
    dotShape: 'dot',               // mark shape: dot | square | diamond | triangle
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
  var list = [];              // precomputed per-cell data for the animation
  var dirty = true;
  var repaintColor = function () {}, repaintShapes = function () {};   // set once those panels are built
  var cols = 0, rows = 0, ox = 0, oy = 0;
  var hover = null, drag = null;
  var undoStack = [], redoStack = [];
  var tl = E.makeTimeline('auto');   // what time the animation is at (see engine.js)

  /* ---------- Artboard + grid ---------- */

  // The editor stage is always 1920x1080. The artboard (state.art) is the part of it that holds dots:
  // all of it, or a 1080x1080 square (67x67 cells) centred in the stage.
  var STAGE = { w: 1920, h: 1080 };
  function w() { return STAGE.w; }
  function h() { return STAGE.h; }

  function computeGrid() {
    cols = Math.max(1, Math.floor(state.art.w / CELL));
    rows = Math.max(1, Math.floor(state.art.h / CELL));
    ox = (w() - cols * CELL) / 2;
    oy = (h() - rows * CELL) / 2;
  }

  // Scale the artboard down to fit the available space, keeping its aspect ratio.
  function fitStage() {
    var r = area.getBoundingClientRect();
    var availW = r.width - 32, availH = r.height - 32;
    if (availW <= 0 || availH <= 0) return;
    var s = Math.min(availW / w(), availH / h());
    stage.style.width = Math.floor(w() * s) + 'px';
    stage.style.height = Math.floor(h() * s) + 'px';
  }

  function layout() {
    cv.width = idle.width = w();
    cv.height = idle.height = h();
    computeGrid();
    drawIdle();
    fitStage();
    dirty = true;
    updateInfo();
  }

  // Switch artboard size; the drawing stays centred and anything that no longer fits is dropped.
  function setArt(width, height) {
    var oldCols = cols, oldRows = rows;
    state.art = { w: width, h: height };
    computeGrid();
    var dc = Math.floor((cols - oldCols) / 2), dr = Math.floor((rows - oldRows) / 2), next = new Set();
    cells.forEach(function (k) {
      var p = k.split(','), c = +p[0] + dc, r = +p[1] + dr;
      if (c >= 0 && r >= 0 && c < cols && r < rows) next.add(c + ',' + r);
    });
    cells = next;
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
  function cellArray() {
    var a = [];
    cells.forEach(function (k) { var p = k.split(','); a.push([+p[0], +p[1]]); });
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
  function currentPeriod() { var p = currentPreset(); return p.period(state.values[p.id]); }

  function render() {
    if (dirty) rebuild();
    ctx.clearRect(0, 0, w(), h());
    ctx.drawImage(idle, 0, 0);

    var preset = currentPreset(), i;
    // While drawing, show every cell at full strength so you can see exactly what you've painted.
    var vals = state.values[preset.id];
    state.color.steps = Math.max(2, Math.round(preset.period(vals) * 6));
    E.drawCells(ctx, list, preset.fn, vals, state.color, tl.t, tl.ph, geo(), !!drag);

    // live preview for line / rect / ellipse
    if (drag && drag.shapeTool) {
      var pv = shapeCells(drag);
      ctx.fillStyle = drag.erase ? '#ffffff' : previewColor();
      ctx.globalAlpha = 0.4;
      for (i = 0; i < pv.length; i++) E.dot(ctx, ox + (pv[i][0] + 0.5) * CELL, oy + (pv[i][1] + 0.5) * CELL, CELL * 0.8, state.dotShape);
      ctx.globalAlpha = 1;
    }

    // hover marker: the brush footprint for pencil / eraser, a single cell otherwise
    if (hover && !(drag && drag.shapeTool)) {
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
    if (tl.mode !== 'auto' || state.playing) E.tlAdvance(tl, dt, currentPeriod());
    render();
    requestAnimationFrame(frame);
  }

  /* ---------- History ---------- */

  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    var same = true;
    a.forEach(function (k) { if (!b.has(k)) same = false; });
    return same;
  }
  function beginEdit() { return new Set(cells); }
  function endEdit(before) {
    if (sameSet(before, cells)) return;
    undoStack.push(before);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(new Set(cells));
    cells = undoStack.pop();
    dirty = true; updateInfo();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(new Set(cells));
    cells = redoStack.pop();
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
  function shapeCells(d) {
    var a = d.start, b = d.cur, out = [], r, c;
    if (d.tool === 'line') return expand(lineCells(a, b), state.brush);
    var c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
    var r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
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

  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId);
    var p = cellAt(e), erase = state.tool === 'eraser' || e.button === 2;
    var before = beginEdit();
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
    hover = p;
    if (!drag) return;
    if (drag.shapeTool) { drag.cur = constrain(drag, p, e.shiftKey); return; }
    lineCells(drag.last, p).forEach(function (q) { stamp(q[0], q[1], !drag.erase); });
    drag.last = p;
    updateInfo();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.shapeTool) shapeCells(drag).forEach(function (q) { setCell(q[0], q[1], !drag.erase); });
    endEdit(drag.before);
    drag = null;
    updateInfo();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { hover = null; });

  /* ---------- Tools ---------- */

  var ICON = function (d) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  };
  var TOOLS = [
    { id: 'pencil',  name: 'Pen',    key: 'p', icon: ICON('<path d="M2.5 13.5l.8-3.2 7.2-7.2 2.4 2.4-7.2 7.2z"/><path d="M9.2 4.4l2.4 2.4"/>') },
    { id: 'eraser',  extra: true, name: 'Eraser', key: 'e', icon: ICON('<path d="M8.6 3.4l4 4-5 5H4.4L2.6 10.4l6-7z"/><path d="M5.8 6.2l4 4"/><path d="M7.4 12.4H13.4"/>') },
    { sep: true, extra: true },
    { id: 'line',    extra: true, name: 'Line', key: 'l', icon: ICON('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="3" r="1" fill="currentColor"/>') },
    { id: 'rect',    name: 'Shape', key: 'r', icon: ICON('<rect x="2.8" y="4" width="10.4" height="8" rx="1"/>') },
    { id: 'ellipse', name: 'Circle',   key: 'o', icon: ICON('<ellipse cx="8" cy="8" rx="5.5" ry="4"/>') },
    { sep: true, extra: true },
    { id: 'fill',    name: 'Fill',      key: 'f', icon: ICON('<g transform="scale(.6667)" stroke-width="2.25"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></g>') }
  ];

  function buildTools() {
    var el = $('#toolstrip');
    TOOLS.forEach(function (t) {
      if (t.extra && !FLAGS.extraTools) return;
      if (t.sep) { var s = document.createElement('div'); s.className = 'sep'; el.appendChild(s); return; }
      var b = document.createElement('button');
      b.className = 'key'; b.dataset.tool = t.id; b.innerHTML = t.icon;
      b.title = t.name + ' (' + t.key.toUpperCase() + ')';
      b.setAttribute('aria-label', t.name);
      b.addEventListener('click', function () { setTool(t.id); });
      el.appendChild(b);
    });
  }
  function setTool(id) {
    state.tool = id;
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

  function buildColor() {
    var el = $('#colorControls'), m = state.color;
    var grid = document.createElement('div');
    grid.className = 'keygrid';
    COLOR_MODES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = c.name; b.dataset.mode = c.id;
      b.addEventListener('click', function () { m.mode = c.id; paint(); });
      grid.appendChild(b);
    });
    if (FLAGS.colorRandom) {
      var rb = document.createElement('button');
      rb.className = 'key'; rb.title = 'Randomize color'; rb.setAttribute('aria-label', 'Randomize color');
      rb.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4 1.5h8A2.5 2.5 0 0 1 14.5 4v8a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 12V4A2.5 2.5 0 0 1 4 1.5zM5 4a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM8 7a1 1 0 100 2 1 1 0 000-2zm-3 3a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z"/></svg>';
      rb.addEventListener('click', randomColor);
      grid.appendChild(rb);
    }
    el.appendChild(grid);

    var row = document.createElement('div');
    row.className = 'row color-row';
    row.innerHTML = '<span class="lbl">Color</span><div class="swatches wide"></div>';
    var box = row.querySelector('.swatches');
    SWATCHES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch'; b.style.setProperty('--c', c); b.dataset.color = c;
      b.setAttribute('aria-label', 'Color ' + c);
      b.addEventListener('click', function () { m.mode = 'solid'; m.hex = c; paint(); });
      box.appendChild(b);
    });
    var custom = document.createElement('button');
    custom.className = 'swatch custom';
    custom.setAttribute('aria-label', 'Custom color');
    custom.title = 'Pick any color';
    custom.addEventListener('click', function () {
      picker.toggle(custom, state.color.hex, function (hex) { m.mode = 'solid'; m.hex = hex; paint(); });
    });
    box.appendChild(custom);
    el.appendChild(row);

    // Cycle (flag): how many times the colours loop per animation loop. Whole numbers, so exports still loop seamlessly.
    var cycleRow = null, CYCLING = ['rainbow', 'glitter', 'ocean', 'sunset', 'neon', 'aurora', 'candy', 'forest', 'holo'];
    if (FLAGS.colorCycle) {
      cycleRow = sliderRow({
        label: 'Cycle', min: 0, max: 4, step: 1, value: m.cycle,
        fmt: function (v) { return v + '\u00d7'; }, onChange: function (v) { m.cycle = v; }
      });
      el.appendChild(cycleRow);
    }

    function paint() {
      var solid = m.mode === 'solid';
      grid.querySelectorAll('.key[data-mode]').forEach(function (k) { k.setAttribute('aria-pressed', String(k.dataset.mode === m.mode)); });
      box.querySelectorAll('.swatch:not(.custom)').forEach(function (s) {
        s.setAttribute('aria-pressed', String(solid && s.dataset.color === m.hex));
      });
      var isCustom = solid && SWATCHES.indexOf(m.hex) === -1;
      custom.classList.toggle('set', isCustom);
      custom.setAttribute('aria-pressed', String(isCustom));
      if (isCustom) custom.style.setProperty('--c', m.hex);
      if (cycleRow) cycleRow.hidden = CYCLING.indexOf(m.mode) === -1;
    }
    paint();
    repaintColor = paint;
  }

  function buildControls() {
    var el = $('#controls');
    el.innerHTML = '';
    var layers = state.stack.map(presetById), base = state.values[layers[0].id];
    function common(key) {
      var c = COMMON[key];
      el.appendChild(sliderRow({
        label: c.label, min: c.min, max: c.max, step: c.step, fmt: c.fmt,
        value: base[key], onChange: function (v) { base[key] = v; }
      }));
    }
    common('speed');
    common('size');
    layers.forEach(function (preset) {
      var vals = state.values[preset.id];
      if (layers.length > 1) {
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
    if (MAIN.length > PRESET_SLOTS && MAIN.findIndex(function (p) { return p.id === id; }) >= PRESET_SLOTS - 1 && !presetsOpen) {
      presetsOpen = true; renderPresets();      // never leave the chosen animation hidden
    }
    refreshPresets();
    buildControls();
  }

  // A click on an animation: picks it, or with Stacking on adds it to / removes it from the stack.
  function onPresetClick(id) {
    if (!state.stacking) { selectPreset(id); return; }
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
    var size = Math.random() < 0.5 ? [1920, 1080] : [1080, 1080];
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
    cells = next; dirty = true;
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
    { id: 'triangle', name: 'Triangle' }
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
        cells = new Set();
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
    var n = cells.size;
    $('#hint').classList.toggle('hidden', n > 0 || !!drag);
    setExportEnabled(n > 0);
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
    if (e.target.tagName === 'INPUT' || view !== 'canvas') return;
    if (e.ctrlKey || e.metaKey) {
      var k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      return;
    }
    if (e.altKey) return;
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
    cells = next;
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
    if (!data || !data.runs || !data.w || !data.h) return null;

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
    return { data: data, preset: preset, stack: stack };
  }

  function importHtml(text, name) {
    var parsed = parseExport(text);
    if (!parsed) { notify('Not a Dot Mania file'); return; }
    var d = parsed.data;

    resetSession();                         // nothing from the current canvas carries over
    if (d.geo && d.geo.cell) CELL = d.geo.cell;
    state.dotShape = (d.geo && d.geo.shape) || 'dot';
    repaintShapes();
    setArt(d.w, d.h);                       // also clears the canvas and history

    d.runs.forEach(function (row) {
      row[1].forEach(function (run) {
        for (var n = 0; n < run[1]; n++) setCell(run[0] + n, row[0], true);
      });
    });

    if (d.color) {
      Object.assign(state.color, { mode: d.color.mode, hex: d.color.hex });
      if (d.color.cycle !== undefined) state.color.cycle = d.color.cycle;
      repaintColor();
    }
    if (parsed.stack) {
      parsed.stack.forEach(function (l) { Object.assign(state.values[l.id], l.v); });
      state.stack = parsed.stack.map(function (l) { return l.id; });
      state.preset = state.stack[0];
      state.stacking = state.stack.length > 1;
      stackRow.repaint();
      refreshPresets(); buildControls();
    } else if (parsed.preset) {
      Object.assign(state.values[parsed.preset.id], d.p);
      selectPreset(parsed.preset.id);
    }
    if (FLAGS.interaction && d.mode) setInteraction(d.mode);
    drawIdle();
    dirty = true;
    updateInfo();
    setFileLoaded(true);
    notify(parsed.preset || parsed.stack ? 'Opened ' + (name || (parsed.preset ? parsed.preset.name : 'stack')) : 'Opened drawing (animation not recognised)');
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
    PRESETS.forEach(function (p) {
      var v = Object.assign({}, p.defaults);
      p.params.forEach(function (q) { v[q.key] = q.def; });
      state.values[p.id] = v;
    });
    Object.assign(state.color, { mode: 'solid', hex: '#ef282d', cycle: 1 });
    state.dotShape = 'dot';
    CELL = 16;
    imgSrc = null; imgRaster = null;
    if (imgUI.opts) setImageActive(false);
    if (FLAGS.interaction) setInteraction('auto');
    setPlaying(true);
    cells = new Set();
    setArt(1920, 1080);                     // also clears history
    repaintShapes(); repaintColor();
    setStacking(false);
    selectPreset(PRESETS[0].id);
    drawIdle();
    dirty = true;
    updateInfo();
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
  var VIEWS = ['canvas', 'library', 'about', 'updates', 'guide'];
  var SLUGS = { canvas: '', library: 'library', about: 'about', updates: 'whats-new', guide: 'guide' };
  // Where the app lives (works at the site root or in a sub-folder, and from the /about etc. entry pages).
  var ROOT = new URL('.', document.baseURI).pathname;
  function viewFromPath() {
    var slug = location.pathname.slice(ROOT.length).replace(/index\.html$/, '').replace(/\/+$/, '');
    return VIEWS.find(function (v) { return SLUGS[v] === slug; }) || 'canvas';
  }
  function goTo(id) {
    var url = ROOT + SLUGS[id];
    if (location.pathname !== url) { try { history.pushState(null, '', url); } catch (e) {} }
    showView(id);
  }
  function showView(id) {
    if (VIEWS.indexOf(id) < 0) id = 'canvas';
    view = id;
    document.querySelectorAll('[data-page]').forEach(function (el) { el.hidden = el.dataset.page !== id; });
    document.querySelectorAll('#tabs .navbtn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === id)); });
    if (id === 'canvas') fitStage();
    if (id === 'library') libStart();
  }
  // Library: a grid of templates. Previews are drawn here, small and from one shared loop that only
  // animates cards on screen (eight full-size components at once was far too heavy). If a template can't be
  // fetched (page opened as a file) the card falls back to showing the template itself in an iframe.
  var PREVIEW_W = 640;
  var libItems = [], libRaf = 0, libLast = 0;

  function libFrame(now) {
    libRaf = 0;
    if (view !== 'library') return;
    var dt = Math.min((now - libLast) / 1000, 0.1);
    libLast = now;
    libItems.forEach(function (it) {
      if (!it.visible) return;
      E.tlAdvance(it.tl, dt, it.T);
      var c = it.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#0b0b0a';
      c.fillRect(0, 0, it.cv.width, it.cv.height);
      c.drawImage(it.idle, 0, 0);
      c.setTransform(it.s, 0, 0, it.s, 0, 0);
      E.drawCells(c, it.list, it.fn, it.vals, it.color, it.tl.t, it.tl.ph, it.geo, false);
    });
    libRaf = requestAnimationFrame(libFrame);
  }
  function libStart() {
    if (libRaf || !libItems.length) return;
    libLast = performance.now();
    libRaf = requestAnimationFrame(libFrame);
  }

  function libPreview(box, text, url, name) {
    var parsed = parseExport(text);
    if (!parsed || !parsed.preset) { libIframe(box, url, name); return; }
    var d = parsed.data, cells = [];
    d.runs.forEach(function (row) {
      row[1].forEach(function (run) { for (var n = 0; n < run[1]; n++) cells.push([run[0] + n, row[0]]); });
    });
    var s = PREVIEW_W / d.w, cv = document.createElement('canvas');
    cv.width = PREVIEW_W; cv.height = Math.round(d.h * s);
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', name + ' preview');
    var idle = document.createElement('canvas');
    idle.width = cv.width; idle.height = cv.height;
    var ic = idle.getContext('2d');
    ic.scale(s, s);
    E.drawIdle(ic, d.gridCols, d.gridRows, d.geo, d.gridVis === undefined ? GRID_VIS : d.gridVis);
    var it = {
      cv: cv, ctx: cv.getContext('2d'), idle: idle, s: s, geo: d.geo, list: E.buildList(cells),
      fn: parsed.preset.fn, vals: d.p, color: d.color, T: d.period, tl: E.makeTimeline('auto'), visible: false
    };
    it.tl.t = d.still || 0;                 // start on a pleasant frame, so a card is never blank
    box.innerHTML = '';
    box.appendChild(cv);
    libItems.push(it);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        it.visible = entries[entries.length - 1].isIntersecting;
        if (it.visible) libStart();
      }).observe(cv);
    } else { it.visible = true; }
    if (view === 'library') libStart();
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
      var url = ROOT + 'library/' + t.file, card = document.createElement('article');
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
    buildLibrary();
    var U = window.WHATS_NEW || [], site = window.SITE || {};
    $('#aboutVersion').textContent = site.version ? 'Version ' + site.version : '';
    $('#updatesTable').innerHTML = '<tr><th>Version</th><th>Date</th><th>Changes</th></tr>' + U.map(function (u) {
      var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      return '<tr><td>' + esc(u.v) + '</td><td>' + esc(u.date) + '</td><td><ul>' + u.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></td></tr>';
    }).join('');
    document.querySelectorAll('#tabs .navbtn').forEach(function (b) {
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
    var preset = currentPreset(), vals = state.values[preset.id], T = preset.period(vals);
    return window.DotExport.build({
      cells: cellArray(), art: state.art, cols: cols, rows: rows, geo: exportGeo(),
      preset: preset, values: vals,
      color: Object.assign({}, state.color, { steps: Math.max(2, Math.round(T * 6)) }),
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

  // One seamless cycle of the animation, looping forever, cropped to the drawing.
  // Clear background gives a transparent GIF (1-bit transparency); Dark gives the dark editor look.
  function exportGif() {
    if (gifBusy || !cells.size) return;
    var preset = currentPreset(), vals = Object.assign({}, state.values[preset.id]), color = Object.assign({}, state.color);
    var T = preset.period(vals);
    color.steps = Math.max(2, Math.round(T * 6));

    gifBusy = true;
    notify('Rendering GIF…', { busy: true });
    setExportEnabled(true);
    window.DotGif.encodeAnimation({
      E: E, list: E.buildList(cellArray()), preset: preset, vals: vals, color: color, T: T, secs: Math.min(T, GIF_MAX_SECONDS),
      art: state.art, geo: exportGeo(), cols: cols, rows: rows, gridVis: GRID_VIS, grid: exportOpts.grid,
      transparent: exportOpts.bg === 'transparent', bg: '#0b0b0a',
      maxSide: GIF_SIDE[exportOpts.quality], fps: GIF_FPS, tolerance: GIF_TOLERANCE,
      colors: color.mode === 'solid' || color.mode === 'white' ? GIF_COLORS_SIMPLE : GIF_COLORS_RICH
    }).then(function (blob) {
      download(funkyName('gif'), blob, 'image/gif');
    }).catch(function (err) {
      console.error('GIF export failed', err);
      notify('GIF export failed');
    }).then(function () {
      gifBusy = false;
      setExportEnabled(cells.size > 0);
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
    if (videoBusy || !cells.size) return;
    var mime = videoMime(kind);
    if (!mime) { notify('This browser cannot record ' + kind.toUpperCase()); return; }

    var preset = currentPreset(), p = Object.assign({}, state.values[preset.id]), color = Object.assign({}, state.color), T = preset.period(p);
    color.steps = Math.max(2, Math.round(T * 6));
    var dur = T * (T < 3 ? 2 : 1), g = exportGeo(), vlist = E.buildList(cellArray());

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
      E.drawCells(vx, vlist, preset.fn, p, color, t, t / T, g, false);
    }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      videoBusy = false;
      labelEl.textContent = original;
      setExportEnabled(cells.size > 0);
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
  function currentFrame() {
    var preset = currentPreset(), vals = state.values[preset.id], T = preset.period(vals);
    return { preset: preset, vals: vals, color: Object.assign({}, state.color, { steps: Math.max(2, Math.round(T * 6)) }) };
  }

  // PNG: the frame on screen, full artboard size. Honours the Background choice (Transparent = alpha).
  function exportPng() {
    if (!cells.size) return;
    notify('Rendering PNG…', { busy: true });
    var f = currentFrame(), g = exportGeo(), c = document.createElement('canvas');
    c.width = state.art.w; c.height = state.art.h;
    var x = c.getContext('2d');
    if (exportOpts.bg === 'dark') { x.fillStyle = '#0b0b0a'; x.fillRect(0, 0, c.width, c.height); }
    if (exportOpts.grid) E.drawIdle(x, cols, rows, g, GRID_VIS);
    E.drawCells(x, E.buildList(cellArray()), f.preset.fn, f.vals, f.color, tl.t, tl.ph, g, false);
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
    if (shape === 'triangle') { r = h * 1.4; return '<polygon points="' + pts([[x, y - r * 0.85], [x + r * 0.9, y + r * 0.85], [x - r * 0.9, y + r * 0.85]]) + '"' + attrs; }
    return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(h) + '"' + attrs;
  }
  function buildSvg() {
    var f = currentFrame(), g = exportGeo(), W = state.art.w, H = state.art.h, p = f.vals, out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
    if (exportOpts.bg === 'dark') out.push('<rect width="' + W + '" height="' + H + '" fill="#0b0b0a"/>');
    if (exportOpts.grid) {
      var vis = (0.03 + 0.3 * GRID_VIS).toFixed(3), m = svgMark(g.cell / 2, g.cell / 2, g.cell * 0.3, g.shape, '#f6efe3', +vis);
      out.push('<defs><pattern id="grid" x="' + g.ox + '" y="' + g.oy + '" width="' + g.cell + '" height="' + g.cell + '" patternUnits="userSpaceOnUse">' + m + '</pattern></defs>');
      out.push('<rect x="' + g.ox + '" y="' + g.oy + '" width="' + cols * g.cell + '" height="' + rows * g.cell + '" fill="url(#grid)"/>');
    }
    E.buildList(cellArray()).forEach(function (c) {
      var v = f.preset.fn(c, tl.t, p);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      var x = g.ox + (c.col + 0.5) * g.cell, y = g.oy + (c.row + 0.5) * g.cell, sz = g.cell * p.size * (0.4 + 0.6 * v);
      var fill = E.colorFor(f.color, c, v, tl.ph);
      if (p.glow > 0.01 && v > 0.05) out.push(svgMark(x, y, sz * 1.9, g.shape, fill, 0.2 * p.glow * v));
      out.push(svgMark(x, y, sz, g.shape, fill, 0.18 + 0.82 * v));
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
    if (FLAGS.exportCodeFile) code.push(key('exportCode', 'Download Html File', 'Download a ready-to-open HTML file with the component'));
    if (FLAGS.exportCopyForLlm) code.push(key('exportLlm', 'Copy for LLM', 'Copy instructions plus the code, ready to paste into an AI assistant'));
    if (FLAGS.exportCopyEmbed) code.push(key('exportEmbed', 'Copy embed code', 'Copy just the component snippet'));
    if (FLAGS.exportDownloadJs) code.push(key('exportJs', 'Download .js', 'Download the component script on its own'));
    $('#exportCodeGroup').innerHTML = '<div class="stack">' + code.join('') + '</div>';

    // Media: animated and still images
    var media = [];
    if (FLAGS.exportGif) media.push(key('exportGif', 'GIF', 'Download one seamless loop as an animated GIF'));
    if (FLAGS.exportPng) media.push(key('exportPng', 'PNG', 'Download the frame on screen as a PNG'));
    if (FLAGS.exportSvg) media.push(key('exportSvg', 'SVG', 'Download the frame on screen as a scalable vector'));
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
    on('#exportSvg', function () { if (cells.size) { notify('Rendering SVG…', { busy: true }); download(funkyName('svg'), buildSvg(), 'image/svg+xml'); } });
    on('#exportLlm', function () { copyText(buildExport().llm, $('#exportLlm span'), 'Copy for LLM'); });
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

  /* ---------- Boot ---------- */

  // Show or hide everything a flag controls (flags.js), then build only what is switched on.
  document.querySelectorAll('[data-flag]').forEach(function (el) { el.hidden = !FLAGS[el.dataset.flag]; });

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
  buildStatus();
  setupFiles();
  buildPages();
  selectPreset(state.preset);
  setTool(state.tool);
  setInteraction(FLAGS.interaction ? state.interaction : 'auto');
  setPlaying(true);
  new ResizeObserver(fitStage).observe(area);
  layout();
  showView(viewFromPath());
  requestAnimationFrame(frame);
})();
