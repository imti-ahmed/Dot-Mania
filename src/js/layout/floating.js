/*
 * Floating layout (sample). Switched on with the floatingLayout flag (index.html?flags=floatingLayout).
 *
 * Same features as the fixed layout, but nothing is docked: the canvas fills the whole area under the top nav, and
 * every group of controls lives in its own floating panel you can drag, minimise or close. A slim rail on the right
 * opens the panels again, and a pill at the bottom picks the grid size.
 *
 * It does not rebuild anything. app.js has already built every control, so this file only moves those existing
 * elements into floating panels. Loaded last, after app.js. Styles: src/css/floating.css (all under body.fl).
 */
(function () {
  if (!window.FLAGS || !FLAGS.floatingLayout || !window.DotApp) return;

  var A = window.DotApp;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  document.body.classList.add('fl');

  var STORE = 'dotmania.floating.v1';
  var RAIL = 104;            // width the right rail takes, so new panels open beside it
  var HEAD = 36;             // panel title bar height
  var z = 10;                // stacking counter: the panel you touched last is on top

  // Grid sizes: dots per side, and the dot size that makes it fill a 1080px artboard. Edit these to taste.
  var SIZES = [
    { n: 64,  cell: 16, name: 'Small' },
    { n: 360, cell: 3,  name: 'Medium' },
    { n: 540, cell: 2,  name: 'Large' }
  ];

  // Panels. `ids` are existing control containers (each is moved together with the label above it).
  var DEFS = [
    { id: 'tools',   title: 'Tools',     w: 168, node: document.querySelector('.sidebar'), x: 16, y: 16 },
    { id: 'look',    title: 'Look',      w: 340, ids: ['shapeControls', 'colorControls'] },
    { id: 'animate', title: 'Animate',   w: 340, ids: ['presets', 'trialPresets'] },
    { id: 'tuning',  title: 'Tuning',    w: 320, ids: ['controls', 'interactionControls'] },
    { id: 'image',   title: 'Image',     w: 320, ids: ['imageControls', 'starterControls'] },
    { id: 'draw',    title: 'Draw',      w: 320, ids: ['drawControls', 'gridControls', 'pointerControls'] },
    { id: 'layers',  title: 'Layers',    w: 300, ids: ['addLayerBtn', 'layerList'] },
    { id: 'export',  title: 'Export',    w: 320, ids: ['exportBg', 'exportQuality', 'exportCodeGroup', 'exportMedia'] }
  ];
  // Open the first time (before the person has moved anything)
  var START_OPEN = { tools: true, look: true, animate: true };

  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { saved = {}; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) {} }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var panels = [];

  /* ---------- Build the panels ---------- */

  DEFS.forEach(function (d) {
    var root, body;
    if (d.node) {                                   // the existing left bar becomes a panel: its contents are the body
      root = d.node;
      root.classList.add('fl-panel', 'fl-tools');
    } else {
      var nodes = [];
      d.ids.forEach(function (id) {
        var n = document.getElementById(id);
        if (!n) return;
        var lab = n.previousElementSibling;
        if (lab && lab.classList.contains('group-label')) nodes.push(lab);
        nodes.push(n);
      });
      var live = d.ids.some(function (id) {          // a panel whose controls are all switched off by flags is not offered
        var n = document.getElementById(id);
        return n && !(n.dataset.flag && n.hidden);
      });
      if (!live) return;
      root = el('section', 'card fl-panel');
      body = el('div', 'panel-body fl-body');
      nodes.forEach(function (n) { body.appendChild(n); });
      root.appendChild(body);
    }
    root.style.width = d.w + 'px';
    root.dataset.panel = d.id;

    var head = el('div', 'fl-head');
    head.appendChild(el('span', 'fl-title', d.title));
    var min = el('button', 'fl-btn', '−'); min.type = 'button'; min.title = 'Minimise'; min.setAttribute('aria-label', 'Minimise ' + d.title);
    var close = el('button', 'fl-btn', '×'); close.type = 'button'; close.title = 'Close'; close.setAttribute('aria-label', 'Close ' + d.title);
    head.appendChild(min); head.appendChild(close);
    root.insertBefore(head, root.firstChild);
    main.appendChild(root);

    var p = { def: d, root: root, head: head, open: false, min: false, x: 0, y: 0, placed: false };
    panels.push(p);

    var s = saved[d.id];
    if (s) { p.x = s.x; p.y = s.y; p.placed = true; p.min = !!s.min; p.open = !!s.open; }
    else p.open = !!START_OPEN[d.id];

    min.addEventListener('click', function () { p.min = !p.min; render(p); persist(p); });
    close.addEventListener('click', function () { setOpen(p, false); });
    root.addEventListener('pointerdown', function () { raise(p); });
    head.addEventListener('dblclick', function (e) { if (e.target === head || e.target.className === 'fl-title') { p.min = !p.min; render(p); persist(p); } });
    drag(p);
  });

  function persist(p) { saved[p.def.id] = { x: p.x, y: p.y, open: p.open, min: p.min }; save(); }
  function raise(p) { p.root.style.zIndex = ++z; }

  function clamp(p) {
    var mw = main.clientWidth, mh = main.clientHeight, w = p.root.offsetWidth;
    p.x = Math.min(Math.max(p.x, 80 - w), mw - 80);
    p.y = Math.min(Math.max(p.y, 0), Math.max(0, mh - HEAD));
  }

  function place(p) {                               // first time open: cascade down the left of the rail
    var n = panels.filter(function (q) { return q !== p && q.open && q.placed && q.def.id !== 'tools'; }).length;
    if (p.def.x != null) { p.x = p.def.x; p.y = p.def.y; }
    else { p.x = main.clientWidth - RAIL - p.def.w - 16 - n * 26; p.y = 16 + n * 30; }
    p.placed = true;
  }

  function render(p) {
    p.root.hidden = !p.open;
    p.root.classList.toggle('fl-min', p.min);
    if (!p.open) return;
    if (!p.placed) place(p);
    clamp(p);
    p.root.style.left = p.x + 'px';
    p.root.style.top = p.y + 'px';
    p.root.style.maxHeight = Math.max(120, main.clientHeight - p.y - 12) + 'px';
    var b = dock.querySelector('[data-for="' + p.def.id + '"]');
    if (b) b.setAttribute('aria-pressed', String(p.open));
  }

  function setOpen(p, on) {
    p.open = on;
    if (on) { p.min = false; raise(p); }
    render(p);
    var b = dock.querySelector('[data-for="' + p.def.id + '"]');
    if (b) b.setAttribute('aria-pressed', String(on));
    persist(p);
  }

  /* ---------- Dragging by the title bar ---------- */

  function drag(p) {
    var start = null;
    p.head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.fl-btn')) return;
      start = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
      p.head.setPointerCapture(e.pointerId);
      p.root.classList.add('fl-dragging');
    });
    p.head.addEventListener('pointermove', function (e) {
      if (!start) return;
      p.x = start.x + e.clientX - start.px;
      p.y = start.y + e.clientY - start.py;
      render(p);
    });
    function end() { if (!start) return; start = null; p.root.classList.remove('fl-dragging'); persist(p); }
    p.head.addEventListener('pointerup', end);
    p.head.addEventListener('pointercancel', end);
  }

  /* ---------- Right rail: opens and closes the panels ---------- */

  var dock = el('div', 'card fl-dock');
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Panels');
  panels.forEach(function (p) {
    var b = el('button', 'key', p.def.title);
    b.type = 'button';
    b.dataset.for = p.def.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { setOpen(p, !p.open); });
    dock.appendChild(b);
  });
  var reset = el('button', 'key fl-reset', 'Reset layout');
  reset.type = 'button';
  reset.title = 'Put every panel back where it started';
  reset.addEventListener('click', function () {
    saved = {};
    panels.forEach(function (p) { p.placed = false; p.min = false; p.open = !!START_OPEN[p.def.id]; });
    panels.forEach(function (p) { render(p); raise(p); });
    save();
  });
  dock.appendChild(reset);
  main.appendChild(dock);

  /* ---------- Grid size pill (bottom centre) ---------- */

  var sizes = el('div', 'card fl-sizes');
  sizes.setAttribute('role', 'group');
  sizes.setAttribute('aria-label', 'Grid size');
  SIZES.forEach(function (s) {
    var b = el('button', 'key');
    b.type = 'button';
    b.title = s.n + ' x ' + s.n + ' dots';
    b.innerHTML = s.name + ' <span class="fl-dim">' + s.n + '²</span>';
    b.dataset.n = s.n;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { A.setGrid(s.n, s.cell); syncSizes(); });
    sizes.appendChild(b);
  });
  main.appendChild(sizes);

  function syncSizes() {
    var g = A.grid();
    sizes.querySelectorAll('.key').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.n === g.cols && g.cols === g.rows)); });
  }
  setInterval(syncSizes, 600);                      // Randomize and Open HTML can change the grid too

  /* ---------- Boot ---------- */

  panels.forEach(function (p) { render(p); });
  syncSizes();
  window.addEventListener('resize', function () { panels.forEach(function (p) { if (p.open) render(p); }); });
})();
