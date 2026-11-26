/*
 * Layers strip (layerStrip flag, part of the grid-only view). A straight strip at the top of the left column, above the
 * Grid picker: one small card per layer that previews only the dots in that layer, then an Add layer button.
 * Up to DotApp.layerMax (5) layers. The cards are square, with no names. Click a card to edit that layer.
 * Loaded after gridsizes.js. The editor does the work through window.DotApp (layerView, selectLayer, addLayer, removeLayer).
 */
(function () {
  if (!window.FLAGS || !FLAGS.layerStrip || !FLAGS.gridSizes || !window.DotApp) return;

  var A = window.DotApp;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  var col = main.querySelector('.leftcol');
  if (!col) { col = document.createElement('div'); col.className = 'leftcol'; main.insertBefore(col, main.querySelector('.stage-card')); }

  var strip = document.createElement('div');
  strip.className = 'card layerstrip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Layers');
  col.insertBefore(strip, col.firstChild);

  var title = document.createElement('div');
  title.className = 'gp-title';
  var count = document.createElement('span');
  title.innerHTML = '<span>Layers</span>';
  title.appendChild(count);
  strip.appendChild(title);

  var listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  strip.appendChild(listEl);

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'key ls-add';
  add.textContent = '+ Add layer';
  add.addEventListener('click', function () { A.addLayer(); render(true); });
  strip.appendChild(add);

  var shown = '';        // what the cards were built from (how many, and which is active), so they are only rebuilt when that changes
  var thumbs = [];

  function build(view) {
    listEl.innerHTML = '';
    thumbs = view.map(function (L, i) {
      var card = document.createElement('div');
      card.className = 'ls-card';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', L.name);
      card.setAttribute('aria-current', String(L.active));
      var cv = document.createElement('canvas');
      cv.width = cv.height = 184;
      card.addEventListener('click', function () { A.selectLayer(i); render(true); });
      card.appendChild(cv);
      listEl.appendChild(card);
      return cv;
    });
  }

  function paint(cv, L, g) {
    var ctx = cv.getContext('2d'), S = cv.width, n = Math.max(g.cols, g.rows), u = S / n;
    ctx.clearRect(0, 0, S, S);
    var fallback = L.color && L.color.hex ? L.color.hex : '#ffffff';
    var r = Math.max(u, 2);                       // keep every dot visible even on the 64 x 64 grid
    L.cells.forEach(function (k) {
      var p = k.split(','), c = L.colors.get(k);
      ctx.fillStyle = c && c.hex ? c.hex : fallback;
      ctx.fillRect(+p[0] * u + (u - r) / 2, +p[1] * u + (u - r) / 2, r, r);
    });
  }

  function render(force) {
    var view = A.layerView(), g = A.grid();
    var sig = view.map(function (L) { return (L.active ? '*' : '-'); }).join('|');
    if (force === true || sig !== shown) { build(view); shown = sig; }
    view.forEach(function (L, i) { paint(thumbs[i], L, g); });
    count.textContent = view.length + '/' + A.layerMax;
    add.disabled = view.length >= A.layerMax;
    add.title = add.disabled ? 'Up to ' + A.layerMax + ' layers' : 'Add a layer: its own dots and its own animation';
  }

  render(true);
  setInterval(render, 250);                         // drawing, undo, Randomize and Open HTML all change the previews
})();
