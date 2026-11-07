(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var FLAGS = window.FLAGS;     // feature flags, see flags.js
  var PRESETS = window.PRESETS.concat(FLAGS.extraPresets ? window.EXTRA_PRESETS : []);
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
    preset: PRESETS[0].id,
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
    { id: 'white', name: 'White' },
    { id: 'rainbow', name: 'Rainbow' },
    { id: 'glitter', name: 'Glitter' },
    { id: 'fire', name: 'Fire' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'neon', name: 'Neon' },
    { id: 'aurora', name: 'Aurora' }
  ];
  function previewColor() { return state.color.mode === 'solid' ? state.color.hex : '#f6efe3'; }
  function currentPreset() { return PRESETS.find(function (p) { return p.id === state.preset; }); }
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
    row.innerHTML = '<span class="lbl">' + label + '</span><div class="seg wide"></div>';
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
    el.appendChild(grid);

    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="lbl">Color</span><div class="swatches wide"></div>';
    var box = row.querySelector('.swatches');
    SWATCHES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch'; b.style.setProperty('--c', c); b.dataset.color = c;
      b.setAttribute('aria-label', 'Color ' + c);
      b.addEventListener('click', function () { m.mode = 'solid'; m.hex = c; paint(); });
      box.appendChild(b);
    });
    var custom = document.createElement('label');
    custom.className = 'swatch custom';
    custom.setAttribute('aria-label', 'Custom color');
    custom.innerHTML = '<input type="color">';
    var inp = custom.querySelector('input');
    inp.value = m.hex;
    inp.addEventListener('input', function (e) { m.mode = 'solid'; m.hex = e.target.value; paint(); });
    box.appendChild(custom);
    el.appendChild(row);

    // Cycle (flag): how many times the colours loop per animation loop. Whole numbers, so exports still loop seamlessly.
    var cycleRow = null, CYCLING = ['rainbow', 'glitter', 'ocean', 'sunset', 'neon', 'aurora'];
    if (FLAGS.colorCycle) {
      cycleRow = sliderRow({
        label: 'Cycle', min: 0, max: 4, step: 1, value: m.cycle,
        fmt: function (v) { return v + '\u00d7'; }, onChange: function (v) { m.cycle = v; }
      });
      el.appendChild(cycleRow);
    }

    function paint() {
      var solid = m.mode === 'solid';
      grid.querySelectorAll('.key').forEach(function (k) { k.setAttribute('aria-pressed', String(k.dataset.mode === m.mode)); });
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
    var preset = PRESETS.find(function (p) { return p.id === state.preset; });
    var vals = state.values[preset.id], el = $('#controls');
    el.innerHTML = '';
    function common(key) {
      var c = COMMON[key];
      el.appendChild(sliderRow({
        label: c.label, min: c.min, max: c.max, step: c.step, fmt: c.fmt,
        value: vals[key], onChange: function (v) { vals[key] = v; }
      }));
    }
    common('speed');
    common('size');
    preset.params.forEach(function (q) {
      el.appendChild(sliderRow({
        label: q.label, min: q.min, max: q.max, step: q.step, fmt: q.fmt,
        value: vals[q.key], onChange: function (v) { vals[q.key] = v; }
      }));
    });
    common('glow');
  }

  function buildPresets() {
    var el = $('#presets');
    PRESETS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.className = 'key'; b.textContent = p.name; b.dataset.id = p.id;
      b.title = p.name + (i < 9 ? ' (' + (i + 1) + ')' : '');
      b.addEventListener('click', function () { selectPreset(p.id); });
      el.appendChild(b);
    });
  }

  function selectPreset(id) {
    state.preset = id;
    $('#presets').querySelectorAll('.key').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.id === id));
    });
    buildControls();
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
    $('#cellCount').textContent = n + (n === 1 ? ' cell' : ' cells');
    $('#gridInfo').textContent = cols + ' × ' + rows + ' grid';
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
    if (/^[1-9]$/.test(e.key) && PRESETS[+e.key - 1]) { selectPreset(PRESETS[+e.key - 1].id); return; }
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

  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
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
    var fa = text.indexOf('var presetFn='), fb = text.indexOf(';\nvar DATA=', fa), preset = null;
    if (fa > -1 && fb > fa) {
      var fn = squash(text.slice(fa + 13, fb));
      preset = PRESETS.find(function (p) { return squash(p.fn.toString()) === fn; }) || null;
    }
    return { data: data, preset: preset };
  }

  function importHtml(text) {
    var parsed = parseExport(text);
    if (!parsed) { toast('Not a Dot Mania file'); return; }
    var d = parsed.data;

    imgSrc = null; imgRaster = null;
    if (imgUI.opts) setImageActive(false);
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
    if (parsed.preset) {
      Object.assign(state.values[parsed.preset.id], d.p);
      selectPreset(parsed.preset.id);
    }
    if (FLAGS.interaction && d.mode) setInteraction(d.mode);
    drawIdle();
    dirty = true;
    updateInfo();
    setFileLoaded(true);
    toast(parsed.preset ? 'Opened ' + parsed.preset.name : 'Opened drawing (animation not recognised)');
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
  function closeFile() {
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
    cells = new Set();
    setArt(1920, 1080);                     // also clears history
    repaintShapes(); repaintColor();
    selectPreset(PRESETS[0].id);
    drawIdle();
    dirty = true;
    updateInfo();
    setFileLoaded(false);
    toast('Fresh session');
  }

  function loadHtmlFile(file) {
    var reader = new FileReader();
    reader.onload = function () { importHtml(String(reader.result)); };
    reader.onerror = function () { toast('Could not read that file'); };
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
  function showView(id) {
    if (VIEWS.indexOf(id) < 0) id = 'canvas';
    view = id;
    document.querySelectorAll('[data-page]').forEach(function (el) { el.hidden = el.dataset.page !== id; });
    document.querySelectorAll('#tabs .navbtn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === id)); });
    $('#canvasReadouts').hidden = id !== 'canvas';
    if (id === 'canvas') fitStage();
  }
  // Library: a grid of templates. Preview is the template file itself in an iframe; Load fetches it into the editor.
  function buildLibrary() {
    var grid = $('#libGrid');
    (window.LIBRARY || []).forEach(function (t) {
      var url = 'library/' + t.file, card = document.createElement('article');
      card.className = 'lib-card';
      card.innerHTML =
        '<div class="lib-preview"><iframe loading="lazy" tabindex="-1" sandbox="allow-scripts" title="' + t.name + ' preview"></iframe></div>' +
        '<div class="lib-name"></div>' +
        '<div class="lib-actions">' +
          '<button class="key" data-act="load">Load File</button>' +
          '<a class="key" data-act="download" download>Download</a>' +
        '</div>';
      card.querySelector('iframe').src = url;
      card.querySelector('.lib-name').textContent = t.name;
      var dl = card.querySelector('[data-act="download"]');
      dl.href = url; dl.download = t.file;
      card.querySelector('[data-act="load"]').addEventListener('click', function () {
        fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (text) {
          showView('canvas');
          importHtml(text);
        }).catch(function () { toast('Could not load. Open the app from a local server'); });
      });
      grid.appendChild(card);
    });
  }
  function buildPages() {
    buildLibrary();
    var U = window.UPDATES || [];
    $('#aboutVersion').textContent = U.length ? 'Version ' + U[0].v : '';
    $('#updatesTable').innerHTML = '<tr><th>Version</th><th>Date</th><th>Changes</th></tr>' + U.map(function (u) {
      return '<tr><td>' + u.v + '</td><td>' + u.date + '</td><td>' + u.note.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td></tr>';
    }).join('');
    document.querySelectorAll('#tabs .navbtn').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });
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

  var exportOpts = { bg: 'dark', grid: true, seconds: 10 };
  // GIF tuning: 30 fps, small tolerance (a bigger one makes fades step instead of glide), and a palette sized
  // to the content: single-colour looks need few colours, multi-colour modes need more.
  var GIF_MAX_SECONDS = 8, GIF_MAX_SIDE = 480, GIF_FPS = 30, GIF_TOLERANCE = 12, GIF_COLORS_SIMPLE = 31, GIF_COLORS_RICH = 63;
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

  function download(name, data, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function setExportEnabled(on) {
    document.querySelectorAll('[data-export]').forEach(function (b) {
      b.disabled = !on || (gifBusy && b.id === 'exportGif') || (videoBusy && b.id === 'exportVideo');
    });
  }

  function copyText(text, labelEl, original) {
    var done = function () { labelEl.textContent = 'Copied'; setTimeout(function () { labelEl.textContent = original; }, 1600); };
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
    setExportEnabled(true);
    window.DotGif.encodeAnimation({
      E: E, list: E.buildList(cellArray()), preset: preset, vals: vals, color: color, T: T, secs: Math.min(T, GIF_MAX_SECONDS),
      art: state.art, geo: exportGeo(), cols: cols, rows: rows, gridVis: GRID_VIS, grid: exportOpts.grid,
      transparent: exportOpts.bg === 'transparent', bg: '#0b0b0a',
      maxSide: GIF_MAX_SIDE, fps: GIF_FPS, tolerance: GIF_TOLERANCE,
      colors: color.mode === 'solid' || color.mode === 'white' ? GIF_COLORS_SIMPLE : GIF_COLORS_RICH
    }).then(function (blob) {
      download('dot-mania.gif', blob, 'image/gif');
    }).catch(function (err) {
      console.error('GIF export failed', err);
    }).then(function () {
      gifBusy = false;
      setExportEnabled(cells.size > 0);
    });
  }

  // Video (flag): records the animation in real time to .mp4 (or .webm where mp4 isn't supported). Always a dark background.
  var VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  function recordVideo() {
    if (videoBusy || !cells.size) return;
    var mime = window.MediaRecorder && VIDEO_TYPES.find(function (t) { return MediaRecorder.isTypeSupported(t); });
    if (!mime) { console.warn('This browser cannot record video.'); return; }

    var vc = document.createElement('canvas');
    vc.width = state.art.w; vc.height = state.art.h;
    var vx = vc.getContext('2d'), g = exportGeo(), secs = exportOpts.seconds, layer = null;
    if (exportOpts.grid) {
      layer = document.createElement('canvas');
      layer.width = state.art.w; layer.height = state.art.h;
      E.drawIdle(layer.getContext('2d'), cols, rows, g, GRID_VIS);
    }
    var preset = currentPreset(), vlist = E.buildList(cellArray());
    var p = Object.assign({}, state.values[preset.id]), color = Object.assign({}, state.color), T = preset.period(p);
    color.steps = Math.max(2, Math.round(T * 6));

    var rec = new MediaRecorder(vc.captureStream(30), { mimeType: mime, videoBitsPerSecond: 12000000 });
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
      setExportEnabled(cells.size > 0);
      download('dot-mania.' + (mime.indexOf('mp4') > -1 ? 'mp4' : 'webm'), new Blob(chunks, { type: mime.split(';')[0] }), mime);
    };
    function step(now) {
      var t = (now - t0) / 1000;
      if (t >= secs) { rec.stop(); return; }
      draw(t);
      requestAnimationFrame(step);
    }
    videoBusy = true;
    setExportEnabled(true);
    draw(0);
    rec.start();
    t0 = performance.now();
    requestAnimationFrame(step);
  }

  function buildExportUI() {
    var el = $('#exportControls');
    el.appendChild(segRow('Background', [{ v: 'dark', label: 'Black' }, { v: 'transparent', label: 'Transparent' }],
      function () { return exportOpts.bg; }, function (v) { exportOpts.bg = v; }));
    if (FLAGS.exportGridOption) {
      el.appendChild(segRow('Grid', [{ v: 'show', label: 'Visible' }, { v: 'hide', label: 'Hidden' }],
        function () { return exportOpts.grid ? 'show' : 'hide'; }, function (v) { exportOpts.grid = v === 'show'; }));
    }
    if (FLAGS.videoExport) {
      el.appendChild(sliderRow({
        label: 'Length', min: 3, max: 30, step: 1, value: exportOpts.seconds,
        fmt: function (v) { return v + 's'; }, onChange: function (v) { exportOpts.seconds = v; }
      }));
    }

    var top = [], html = '';
    if (FLAGS.exportCodeFile) top.push('<button class="key" id="exportCode" data-export title="Download a ready-to-open HTML file with the component"><span>Code File</span></button>');
    if (FLAGS.exportGif) top.push('<button class="key" id="exportGif" data-export title="Download one seamless loop as an animated GIF"><span>GIF</span></button>');
    if (top.length) html += '<div class="pair" style="grid-template-columns:repeat(' + top.length + ',1fr)">' + top.join('') + '</div>';
    if (FLAGS.exportCopyForLlm) html += '<button class="key" id="exportLlm" data-export title="Copy instructions plus the code, ready to paste into an AI assistant"><span>Copy for LLM</span></button>';
    if (FLAGS.exportCopyEmbed) html += '<button class="key" id="exportEmbed" data-export title="Copy just the component snippet"><span>Copy embed code</span></button>';
    if (FLAGS.exportDownloadJs) html += '<button class="key" id="exportJs" data-export title="Download the component script on its own"><span>Download .js</span></button>';
    if (FLAGS.videoExport) html += '<button class="key" id="exportVideo" data-export title="Record the animation to a video (real time)"><span>Record video (.mp4)</span></button>';
    if (html) {
      var stack = document.createElement('div');
      stack.className = 'stack';
      stack.innerHTML = html;
      el.appendChild(stack);
    }

    function on(sel, fn) { var b = $(sel); if (b) b.addEventListener('click', fn); }
    on('#exportCode', function () { download('dot-mania.html', buildExport().html, 'text/html'); });
    on('#exportGif', exportGif);
    on('#exportLlm', function () { copyText(buildExport().llm, $('#exportLlm span'), 'Copy for LLM'); });
    on('#exportEmbed', function () { copyText(buildExport().snippet, $('#exportEmbed span'), 'Copy embed code'); });
    on('#exportJs', function () { download('dot-mania.js', buildExport().script, 'text/javascript'); });
    on('#exportVideo', recordVideo);
    setExportEnabled(cells.size > 0);
  }

  /* ---------- Boot ---------- */

  // Show or hide everything a flag controls (flags.js), then build only what is switched on.
  document.querySelectorAll('[data-flag]').forEach(function (el) { el.hidden = !FLAGS[el.dataset.flag]; });

  buildTools();
  buildPresets();
  buildColor();
  if (FLAGS.interaction) buildInteraction();
  if (FLAGS.dotShapes) buildDotShapes();
  if (FLAGS.starterShapes) buildStarters();
  if (FLAGS.imageUpload) buildImage();
  if (FLAGS.drawOptions) buildDraw();
  if (FLAGS.gridPanel) buildGrid();
  buildExportUI();
  setupFiles();
  buildPages();
  selectPreset(state.preset);
  setTool(state.tool);
  setInteraction(FLAGS.interaction ? state.interaction : 'auto');
  setPlaying(true);
  new ResizeObserver(fitStage).observe(area);
  layout();
  showView(location.hash.slice(1));
  requestAnimationFrame(frame);
})();
