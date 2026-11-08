/*
 * Helper tools for AI agents that visit the page (for example Claude in Chrome, which can run JavaScript here).
 *
 *   window.dotMania.help()      a plain-text guide to every function below
 *
 * Every call goes through the editor's own functions (window.DotApp, opened near the end of app.js), so the panels,
 * the canvas and undo stay in step exactly as if the change was made by hand: a drawing call is undone with Ctrl+Z.
 * Every call except help() returns plain JSON: { ok: true, ... } or { ok: false, error: '...', valid: [...] }.
 * If the browser offers WebMCP (document.modelContext), the same functions are also registered as tools there.
 * Switch it all off with the agentTools flag (flags.js).
 */
(function () {
  var FLAGS = window.FLAGS || {}, A = window.DotApp;
  if (!FLAGS.agentTools || !A) {
    var meta = document.querySelector('meta[name="ai-agent-tools"]');
    if (meta) meta.remove();
    return;
  }

  var COMMON = window.COMMON_PARAMS, SWATCHES = window.SWATCHES, SHAPES = window.SHAPES || [];
  var MODES = ['add', 'remove', 'replace'];
  var SIZES = window.FLAGS && window.FLAGS.canvasSizes ? { wide: [1920, 1080], square: [1080, 1080] } : { square: [1080, 1080] };   // wide only with the canvasSizes flag
  var EXPORTS = { html: 'exportCodeFile', gif: 'exportGif', png: 'exportPng', webm: 'exportWebm', mp4: 'exportMp4' };
  var DRAG_TOOL = { rectangle: 'rect', ellipse: 'ellipse', line: 'line' };
  var SHAPE_TYPES = ['rectangle', 'ellipse', 'line', 'polygon', 'fill'];

  function ok(o) { return Object.assign({ ok: true }, o); }
  function fail(error, valid) { var o = { ok: false, error: error }; if (valid) o.valid = valid; return o; }
  function ids(list) { return list.map(function (x) { return x.id; }); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function exportKinds() { return Object.keys(EXPORTS).filter(function (k) { return FLAGS[EXPORTS[k]]; }); }

  // A cell is [col, row], whole numbers, on the grid.
  function isCell(p) {
    var g = A.grid();
    return Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
      p[0] >= 0 && p[1] >= 0 && p[0] < g.cols && p[1] < g.rows;
  }
  function badCell(p) {
    var g = A.grid();
    return fail('Not a cell on the grid: ' + JSON.stringify(p) + '. A cell is [col, row] in whole numbers',
      ['col 0..' + (g.cols - 1), 'row 0..' + (g.rows - 1)]);
  }

  // Put a list of cells on (or off) the canvas as one undoable edit, like one hand stroke.
  function apply(list, mode) {
    mode = mode || 'add';
    if (MODES.indexOf(mode) < 0) return fail('Unknown mode: ' + mode, MODES);
    A.edit(function () {
      if (mode === 'replace') A.clearCells();
      list.forEach(function (p) { A.setCell(p[0], p[1], mode !== 'remove'); });
    });
    return ok({ cells: list.length, dotsOn: A.cells().length });
  }

  function inPoly(x, y, pts) {                 // even-odd rule, same as shapes.js
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function polygonEdge(pts) {
    var out = [];
    pts.forEach(function (p, i) {
      var q = pts[(i + 1) % pts.length];
      out = out.concat(A.lineCells({ col: p[0], row: p[1] }, { col: q[0], row: q[1] }));
    });
    return out;
  }
  function polygonFill(pts) {
    var out = polygonEdge(pts), cs = pts.map(function (p) { return p[0]; }), rs = pts.map(function (p) { return p[1]; });
    for (var r = Math.min.apply(null, rs); r <= Math.max.apply(null, rs); r++) {
      for (var c = Math.min.apply(null, cs); c <= Math.max.apply(null, cs); c++) if (inPoly(c, r, pts)) out.push([c, r]);
    }
    return out;
  }

  /* ---------- Reading ---------- */

  function animationInfo(p) {
    var params = ['speed', 'size', 'glow'].map(function (k) {
      var c = COMMON[k];
      return { key: k, label: c.label, min: c.min, max: c.max, step: c.step, default: p.defaults[k], shared: true };
    }).concat(p.params.map(function (q) { return { key: q.key, label: q.label, min: q.min, max: q.max, step: q.step, default: q.def }; }));
    return { id: p.id, name: p.name, trial: !!p.trial, params: params };
  }

  function options() {
    var cell = A.grid().cell;
    return ok({
      animations: A.presets.map(animationInfo),
      stackMax: A.stackMax,
      colors: {
        modes: A.colorModes.map(function (c) { return { id: c.id, name: c.name }; }).concat([{ id: 'solid', name: 'Solid (any hex)' }]),
        swatches: SWATCHES
      },
      dotShapes: FLAGS.dotShapes ? ids(A.dotShapes) : [],
      canvasSizes: Object.keys(SIZES).map(function (k) {
        return { id: k, w: SIZES[k][0], h: SIZES[k][1], cols: Math.floor(SIZES[k][0] / cell), rows: Math.floor(SIZES[k][1] / cell) };
      }),
      interactions: FLAGS.interaction ? ids(A.interactions) : [],
      shapes: SHAPES.map(function (s) { return { id: s.id, name: s.name }; }),
      drawShapeTypes: SHAPE_TYPES,
      exports: exportKinds()
    });
  }

  function state() {
    var s = A.state, g = A.grid(), values = {};
    s.stack.forEach(function (id) { values[id] = copy(s.values[id]); });
    return ok({
      canvas: s.art.w === s.art.h ? 'square' : 'wide', size: { w: s.art.w, h: s.art.h },
      cols: g.cols, rows: g.rows, cellPx: g.cell, dotsOn: A.cells().length,
      animation: s.stack.slice(), stacking: s.stacking, values: values,
      color: { mode: s.color.mode, hex: s.color.hex }, dotShape: s.dotShape,
      interaction: s.interaction, playing: s.playing,
      history: A.history(), exporting: A.busy(), view: A.view()
    });
  }

  function getDots() { return ok({ cells: A.cells() }); }

  /* ---------- Drawing ---------- */

  function clear() { return apply([], 'replace'); }

  function setCanvas(size) {
    if (!SIZES[size]) return fail('Unknown canvas size: ' + size, Object.keys(SIZES));
    var s = SIZES[size];
    if (A.state.art.w !== s[0] || A.state.art.h !== s[1]) A.setArt(s[0], s[1]);   // like the size buttons: clears undo
    return state();
  }

  function setDots(cells, o) {
    o = o || {};
    if (!Array.isArray(cells)) return fail('cells must be an array of [col, row] pairs, e.g. [[0,0],[1,0]]');
    for (var i = 0; i < cells.length; i++) if (!isCell(cells[i])) return badCell(cells[i]);
    return apply(cells, o.mode);
  }

  function drawShape(o) {
    o = o || {};
    var list;
    if (o.mode && MODES.indexOf(o.mode) < 0) return fail('Unknown mode: ' + o.mode, MODES);
    if (o.type === 'fill') {
      // the Fill tool: floods the empty (or, with mode 'remove', the filled) area around one cell
      if (!isCell(o.at)) return badCell(o.at);
      if (o.mode === 'replace') return fail('fill takes mode add or remove', ['add', 'remove']);
      A.edit(function () { A.floodFill({ col: o.at[0], row: o.at[1] }, o.mode === 'remove'); });
      return ok({ dotsOn: A.cells().length });
    }
    if (o.type === 'polygon') {
      if (!Array.isArray(o.points) || o.points.length < 3) return fail('A polygon needs points: at least 3 [col, row] corners');
      for (var i = 0; i < o.points.length; i++) if (!isCell(o.points[i])) return badCell(o.points[i]);
      list = o.outline ? polygonEdge(o.points) : polygonFill(o.points);
    } else if (DRAG_TOOL[o.type]) {
      // the Shape, Circle and Line tools, as if dragged from `from` to `to`
      if (!isCell(o.from)) return badCell(o.from);
      if (!isCell(o.to)) return badCell(o.to);
      var keep = A.state.outline;
      A.state.outline = !!o.outline;
      list = A.shapeCells({ tool: DRAG_TOOL[o.type], start: { col: o.from[0], row: o.from[1] }, cur: { col: o.to[0], row: o.to[1] } });
      A.state.outline = keep;
    } else {
      return fail('Unknown shape type: ' + o.type, SHAPE_TYPES);
    }
    return apply(list, o.mode);
  }

  function useShape(id, o) {
    o = o || {};
    var sh = SHAPES.find(function (s) { return s.id === id; });
    if (!sh) return fail('Unknown shape: ' + id, ids(SHAPES));
    var scale = o.scale === undefined ? 0.8 : o.scale;                 // 0.8: what the Starters buttons use
    if (typeof scale !== 'number' || !(scale >= 0.1 && scale <= 1)) return fail('scale must be a number from 0.1 to 1', [0.1, 1]);
    var g = A.grid();
    return apply(sh.gen(g.cols, g.rows, scale), o.mode || 'replace');
  }

  function randomize() { A.randomize(); return state(); }

  function undo() { A.undo(); return ok({ dotsOn: A.cells().length, history: A.history() }); }
  function redo() { A.redo(); return ok({ dotsOn: A.cells().length, history: A.history() }); }

  /* ---------- Look ---------- */

  // The keys one animation accepts, with their ranges. Speed, Size and Glow belong to the first (base) animation.
  function paramRanges(p, isBase) {
    var r = {};
    if (isBase) ['speed', 'size', 'glow'].forEach(function (k) { r[k] = COMMON[k]; });
    p.params.forEach(function (q) { r[q.key] = q; });
    return r;
  }

  function setAnimation(which, values) {
    var list = Array.isArray(which) ? which : [which], all = ids(A.presets), i;
    if (!list.length || list.length > A.stackMax) return fail('Give one animation id, or an array of up to ' + A.stackMax + ' to stack', all);
    for (i = 0; i < list.length; i++) {
      if (all.indexOf(list[i]) < 0) return fail('Unknown animation: ' + list[i], all);
      if (list.indexOf(list[i]) !== i) return fail('An animation can only be in the stack once: ' + list[i]);
    }
    values = values || {};
    if (typeof values !== 'object' || Array.isArray(values)) return fail('values must be an object, e.g. { speed: 1.2, trail: 0.5 }');

    // Check every value first, so a bad one changes nothing. A flat key goes to the first animation that has it;
    // { <id>: { ... } } targets one animation of the stack.
    var layers = list.map(function (id, n) { return { id: id, ranges: paramRanges(A.presets.find(function (p) { return p.id === id; }), n === 0) }; });
    var plan = [];
    function check(layer, key, v) {
      var q = layer.ranges[key];
      if (typeof v !== 'number' || !isFinite(v) || v < q.min || v > q.max) return fail(key + ' must be a number from ' + q.min + ' to ' + q.max, [q.min, q.max]);
      plan.push([layer.id, key, v]);
    }
    var keys = Object.keys(values);
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], v = values[k], err = null, layer;
      if (list.indexOf(k) > -1 && v && typeof v === 'object') {
        layer = layers[list.indexOf(k)];
        var sub = Object.keys(v);
        for (var j = 0; j < sub.length && !err; j++) {
          if (!layer.ranges[sub[j]]) return fail('Unknown setting for ' + k + ': ' + sub[j], Object.keys(layer.ranges));
          err = check(layer, sub[j], v[sub[j]]);
        }
      } else {
        layer = layers.find(function (l) { return l.ranges[k]; });
        if (!layer) {
          return fail('Unknown setting: ' + k, layers.reduce(function (a, l) { return a.concat(Object.keys(l.ranges)); }, []));
        }
        err = check(layer, k, v);
      }
      if (err) return err;
    }

    plan.forEach(function (p) { A.state.values[p[0]][p[1]] = p[2]; });
    A.setStacking(list.length > 1);
    A.selectPreset(list[0]);                                           // also rebuilds the sliders
    list.slice(1).forEach(function (id) { A.onPresetClick(id); });     // stacked on, as if clicked in order
    return state();
  }

  function setColor(o) {
    o = o || {};
    var modes = ids(A.colorModes).concat(['solid']), mode = o.mode || (o.hex ? 'solid' : null);
    if (modes.indexOf(mode) < 0) return fail('Unknown color mode: ' + mode, modes);
    if (o.hex !== undefined && !/^#[0-9a-f]{6}$/i.test(o.hex)) return fail('hex must look like #ef282d', SWATCHES);
    A.state.color.mode = mode;
    if (o.hex) A.state.color.hex = o.hex.toLowerCase();
    A.repaintColor();
    return ok({ color: { mode: A.state.color.mode, hex: A.state.color.hex } });
  }

  function setDotShape(shape) {
    if (!FLAGS.dotShapes) return fail('Dot shapes are switched off in this build (the dotShapes flag)');
    var all = ids(A.dotShapes);
    if (all.indexOf(shape) < 0) return fail('Unknown dot shape: ' + shape, all);
    A.state.dotShape = shape;
    A.repaintShapes();
    A.drawIdle();
    return ok({ dotShape: shape });
  }

  function setInteraction(mode) {
    if (!FLAGS.interaction) return fail('Interaction modes are switched off in this build (the interaction flag), so it is always auto', ['auto']);
    var all = ids(A.interactions);
    if (all.indexOf(mode) < 0) return fail('Unknown interaction: ' + mode, all);
    A.setInteraction(mode);
    return ok({ interaction: mode });
  }

  // Auto: Play / Pause like the button. Hover and Click: play() previews one cycle, like the button does.
  function play() { if (A.state.interaction === 'auto') A.setPlaying(true); else A.playPressed(); return ok({ playing: A.state.playing }); }
  function pause() { A.setPlaying(false); return ok({ playing: false }); }

  /* ---------- Output ---------- */

  // Export choices for one call only, then back to what the panel shows (so the panel never shows a stale choice).
  function withExportOpts(o, run) {
    o = o || {};
    var BG = ['dark', 'transparent'], Q = ['low', 'medium', 'high'];
    if (o.background !== undefined && BG.indexOf(o.background) < 0) return fail('Unknown background: ' + o.background, BG);
    if (o.quality !== undefined && Q.indexOf(o.quality) < 0) return fail('Unknown quality: ' + o.quality, Q);
    var keep = Object.assign({}, A.exportOpts);
    if (o.background) A.exportOpts.bg = o.background;
    if (o.quality) A.exportOpts.quality = o.quality;
    try { return run(); } finally { Object.assign(A.exportOpts, keep); }
  }

  function exportFile(kind, o) {
    var kinds = exportKinds(), video = kind === 'webm' || kind === 'mp4', busy = A.busy();
    if (kinds.indexOf(kind) < 0) return fail('Unknown or switched-off export: ' + kind, kinds);
    if (!A.anyCells()) return fail('The canvas is empty: draw something first (the Export buttons are disabled too)');
    if ((kind === 'gif' && busy.gif) || (video && busy.video)) return fail('A ' + kind + ' export is still running; check state().exporting');
    if (video && !A.videoMime(kind)) return fail('This browser cannot record ' + kind.toUpperCase(), kinds.filter(function (k) { return k !== kind; }));
    return withExportOpts(o, function () {
      if (kind === 'html') {
        var name = A.funkyName('html');
        A.notify('Building code file…', { busy: true });
        A.download(name, A.buildExport().html, 'text/html');
        return ok({ kind: kind, file: name, done: true });
      }
      if (kind === 'gif') A.exportGif();
      else if (kind === 'png') A.exportPng();
      else A.recordVideo(kind);
      return ok({ kind: kind, done: false, note: 'Started. The file downloads when it is ready (GIF: a few seconds; video: as long as the clip). The status bar says "Saved <name>"; state().exporting turns false.' });
    });
  }

  function getDesignHtml(o) {
    if (!A.anyCells()) return fail('The canvas is empty: draw something first');
    return withExportOpts(o, function () { return ok({ html: A.buildExport().html }); });
  }

  /* ---------- The tool list (help() and WebMCP are both built from it) ---------- */

  var CELL = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: '[col, row]' };
  var MODE = { type: 'string', enum: MODES, description: 'add (default), remove, or replace the whole drawing' };
  var EXPORT_OPTS = {
    background: { type: 'string', enum: ['dark', 'transparent'] },
    quality: { type: 'string', enum: ['low', 'medium', 'high'] }
  };
  function schema(props, required) { return { type: 'object', properties: props || {}, required: required || [] }; }

  var TOOLS = [
    { name: 'help', sig: 'help()', read: true, does: 'This guide, as plain text.', input: schema(), fn: help },
    { name: 'options', sig: 'options()', read: true, does: 'Everything you can pick: animations (with each setting\'s key, min, max, default), colour modes and swatches, dot shapes, canvas sizes, interactions, built-in shapes, export kinds.', input: schema(), fn: options },
    { name: 'state', sig: 'state()', read: true, does: 'What is on screen now: canvas size, cols x rows, dots on, animation(s) and their values, colour, dot shape, interaction, playing, undo history.', input: schema(), fn: state },
    { name: 'getDots', sig: 'getDots()', read: true, does: 'The drawing as [[col,row],...].', input: schema(), fn: getDots },
    { name: 'clear', sig: 'clear()', does: 'Remove every dot (undoable).', input: schema(), fn: clear },
    { name: 'setCanvas', sig: "setCanvas('square')", does: 'Canvas size: square 1080x1080 (a wide 1920x1080 only exists when the canvasSizes flag is on). The drawing stays centred; like the size buttons, this clears undo.',
      input: schema({ size: { type: 'string', enum: Object.keys(SIZES) } }, ['size']), fn: setCanvas, run: function (i) { return setCanvas(i.size); } },
    { name: 'setDots', sig: "setDots([[col,row],...], { mode: 'add'|'remove'|'replace' })", does: 'Turn exact cells on or off.',
      input: schema({ cells: { type: 'array', items: CELL }, mode: MODE }, ['cells']), fn: setDots, run: function (i) { return setDots(i.cells, i); } },
    { name: 'drawShape', sig: 'drawShape({ type, ... })',
      does: "Draw like the tools do. rectangle / ellipse / line: { from: [c,r], to: [c,r] } (corners of the box, or the line's ends). polygon: { points: [[c,r],...] } (3 or more corners). fill: { at: [c,r] } floods the empty area around that cell (mode 'remove' empties a filled area). outline: true draws only the edge (rectangle, ellipse, polygon). mode: add (default), remove, replace.",
      input: schema({ type: { type: 'string', enum: SHAPE_TYPES }, from: CELL, to: CELL, at: CELL, points: { type: 'array', items: CELL }, outline: { type: 'boolean' }, mode: MODE }, ['type']),
      fn: drawShape },
    { name: 'useShape', sig: "useShape(id, { scale: 0.1..1, mode })", does: "A built-in shape (see options().shapes), centred. Replaces the drawing unless mode is 'add' or 'remove'. Default scale 0.8.",
      input: schema({ id: { type: 'string', enum: ids(SHAPES) }, scale: { type: 'number', minimum: 0.1, maximum: 1 }, mode: MODE }, ['id']), fn: useShape, run: function (i) { return useShape(i.id, i); } },
    { name: 'randomize', sig: 'randomize()', does: 'A whole random piece, like the Randomize button: canvas, dots, animation, colour. It plays.', input: schema(), fn: randomize },
    { name: 'undo', sig: 'undo()', does: 'Undo the last drawing change (same as Ctrl+Z).', input: schema(), fn: undo },
    { name: 'redo', sig: 'redo()', does: 'Redo (same as Ctrl+Shift+Z).', input: schema(), fn: redo },
    { name: 'setAnimation', sig: "setAnimation(id | [id, id, id], values)",
      does: "Pick an animation, or up to 3 to stack (the first is the base; each next one shapes it). values sets sliders, e.g. { speed: 1.4, trail: 0.6 }; with a stack, { ripple: { rings: 3 } } targets one layer. speed, size and glow belong to the first animation.",
      input: schema({ animation: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, maxItems: 3 }], description: 'an id from options().animations, or an array of up to 3' }, values: { type: 'object' } }, ['animation']),
      fn: setAnimation, run: function (i) { return setAnimation(i.animation, i.values); } },
    { name: 'setColor', sig: "setColor({ mode, hex })", does: "A colour mode (see options().colors), or { hex: '#ef282d' } for one solid colour.",
      input: schema({ mode: { type: 'string' }, hex: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }), fn: setColor },
    { name: 'setDotShape', sig: "setDotShape('dot'|'square'|'diamond'|'triangle')", does: 'The shape of every mark.',
      input: schema({ shape: { type: 'string', enum: ids(A.dotShapes) } }, ['shape']), fn: setDotShape, run: function (i) { return setDotShape(i.shape); } },
    { name: 'setInteraction', sig: "setInteraction('auto'|'hover'|'click')", does: 'How the exported animation plays (only when the interaction flag is on).',
      input: schema({ mode: { type: 'string', enum: ids(A.interactions) } }, ['mode']), fn: setInteraction, run: function (i) { return setInteraction(i.mode); } },
    { name: 'play', sig: 'play()', does: 'Run the animation on the canvas (it opens paused, showing the drawing as drawn).', input: schema(), fn: play },
    { name: 'pause', sig: 'pause()', does: 'Stop, back to the drawing as drawn.', input: schema(), fn: pause },
    { name: 'exportFile', sig: "exportFile('html'|'gif'|'png'|'webm'|'mp4', { background: 'dark'|'transparent', quality: 'low'|'medium'|'high' })",
      does: "Download a file through the editor's own export. html finishes at once; the others download when rendered. PNG is the frame on screen.",
      input: schema(Object.assign({ kind: { type: 'string', enum: Object.keys(EXPORTS) } }, EXPORT_OPTS), ['kind']), fn: exportFile, run: function (i) { return exportFile(i.kind, i); } },
    { name: 'getDesignHtml', sig: "getDesignHtml({ background })", read: true, does: 'The exported HTML file (a dependency-free web component) as a string, without downloading.',
      input: schema(EXPORT_OPTS), fn: getDesignHtml }
  ];

  function help() {
    var g = A.grid(), s = A.state.art;
    return [
      'DOT MANIA HELPER TOOLS (window.dotMania)',
      '',
      'Make animated dot designs by calling these functions. They work exactly like the buttons: the panels update,',
      'and drawing changes are undoable (undo() or Ctrl+Z). Every function except help() returns JSON:',
      '{ ok: true, ... } or { ok: false, error, valid } where valid lists what would have worked.',
      '',
      'THE GRID',
      'The canvas is a grid of cells, ' + g.cell + ' px each. A cell is [col, row]: [0, 0] is the top-left cell,',
      'col grows to the right, row grows downwards. Each cell is one dot, on or off.',
      'Now: ' + s.w + 'x' + s.h + ' canvas = ' + g.cols + ' cols x ' + g.rows + ' rows (cols 0..' + (g.cols - 1) + ', rows 0..' + (g.rows - 1) + ').',
      (SIZES.wide ? 'Wide is 1920x1080 (' + Math.floor(1920 / g.cell) + 'x' + Math.floor(1080 / g.cell) + ' cells), square is 1080x1080 (' + Math.floor(1080 / g.cell) + 'x' + Math.floor(1080 / g.cell) + ').' : 'The canvas is always the 1080x1080 square.'),
      'The canvas opens paused, showing the drawing as drawn: call play() to see it move. To check your work,',
      'take a screenshot. If a welcome popup covers the canvas, click "Let\'s Go" (or press Escape) first.',
      '',
      'FUNCTIONS'
    ].concat(TOOLS.map(function (t) { return '  ' + t.sig + '\n      ' + t.does; }), [
      '',
      'EXAMPLE',
      "  dotMania.clear(); dotMania.drawShape({ type: 'ellipse', from: [14, 14], to: [52, 52] });",
      "  dotMania.setAnimation('ripple', { rings: 3 }); dotMania.setColor({ mode: 'neon' }); dotMania.play();",
      "  dotMania.exportFile('gif', { quality: 'medium' });"
    ]).join('\n');
  }

  window.dotMania = {};
  TOOLS.forEach(function (t) {
    window.dotMania[t.name] = t.fn;
    if (!t.run) t.run = function (input) { return t.fn(input); };    // WebMCP passes one input object
  });

  /* ---------- WebMCP (only in browsers that offer it) ---------- */

  // The W3C Web Machine Learning CG draft (2 Nov 2026): document.modelContext.registerTool({ name, description,
  // inputSchema, execute, annotations }); whatever execute returns is sent to the agent as JSON. Chrome's 2026 trial
  // also kept the older navigator.modelContext name, with the same registerTool.
  var mc = document.modelContext || navigator.modelContext;
  if (mc && typeof mc.registerTool === 'function') {
    TOOLS.forEach(function (t) {
      try {
        var done = mc.registerTool({
          name: t.name, description: t.sig + ': ' + t.does, inputSchema: t.input,
          annotations: { readOnlyHint: !!t.read },
          execute: function (input) { return t.run(input || {}); }
        });
        if (done && done.catch) done.catch(function (e) { console.warn('[agent] WebMCP tool not registered:', t.name, e && e.message); });
      } catch (e) { console.warn('[agent] WebMCP tool not registered:', t.name, e && e.message); }
    });
  }
})();
