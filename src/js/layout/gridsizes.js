/*
 * Grid sizes (gridSizes flag). Shows the canvas on its own (the other panels are hidden for now) on a 64 x 64 grid. The Small / Medium / Large picker (16, 32, 64) is behind the gridPicker flag, off until there is a settings panel.
 * The canvas card keeps its normal size and the dots keep the same size on every grid: a smaller grid is a smaller
 * area centred in the card (the scale is fixed to the 64 x 64 artboard, 1024px), it does not blow the dots up.
 * Loaded after app.js. It only adds buttons; the editor does the work through window.DotApp.setGrid.
 */
(function () {
  if (!window.FLAGS || !FLAGS.gridSizes || !window.DotApp) return;

  var A = window.DotApp;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  document.body.classList.add('gridonly');          // hides the other panels for now (src/css/gridsizes.css)

  var SIZES = [
    { n: 16, cell: 16, name: 'Small' },
    { n: 32, cell: 16, name: 'Medium' },
    { n: 64, cell: 16, name: 'Large' }
  ];

  A.setFitRef({ w: 1024, h: 1024 });                // one scale for every grid size, so dots never grow
  A.setGrid(64, 16);                                // the grid is 64 x 64 for now

  // The Small / Medium / Large picker is switched off (gridPicker flag): the grid size will move to a settings panel later.
  if (!FLAGS.gridPicker) return;

  var group = document.createElement('div');
  group.className = 'card gridpick';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Grid size');

  var title = document.createElement('div');
  title.className = 'gp-title';
  title.textContent = 'Grid';
  group.appendChild(title);

  SIZES.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.dataset.n = s.n;
    b.title = s.name + ': ' + s.n + ' x ' + s.n + ' dots';
    b.setAttribute('aria-pressed', 'false');
    b.textContent = s.n + '×' + s.n;
    b.addEventListener('click', function () { A.setGrid(s.n, s.cell); sync(); });
    group.appendChild(b);
  });

  var col = main.querySelector('.leftcol');
  if (!col) { col = document.createElement('div'); col.className = 'leftcol'; main.insertBefore(col, main.querySelector('.stage-card')); }
  col.appendChild(group);

  function sync() {
    var g = A.grid();
    group.querySelectorAll('.key').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.n === g.cols && g.cols === g.rows));
    });
  }
  setInterval(sync, 600);                           // Randomize and Open HTML can change the grid too
  sync();
})();
