/*
 * Grid sizes (gridSizes flag). Shows the canvas on its own (the other panels are hidden for now) with a Small / Medium / Large picker beside it: 16 x 16, 32 x 32 or 64 x 64 dots.
 * The canvas card keeps its normal size; only the number of dots in it changes. Each size uses a 1024px artboard
 * (dots per side x dot size), so the three sizes fill the canvas the same way.
 * Loaded after app.js. It only adds buttons; the editor does the work through window.DotApp.setGrid.
 */
(function () {
  if (!window.FLAGS || !FLAGS.gridSizes || !window.DotApp) return;

  var A = window.DotApp;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  document.body.classList.add('gridonly');          // hides the other panels for now (src/css/gridsizes.css)

  var SIZES = [
    { n: 16, cell: 64, name: 'Small' },
    { n: 32, cell: 32, name: 'Medium' },
    { n: 64, cell: 16, name: 'Large' }
  ];

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
    b.title = s.n + ' x ' + s.n + ' dots';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="lbl">' + s.name + ' <span class="dim">' + s.n + '×' + s.n + '</span></span>';
    b.addEventListener('click', function () { A.setGrid(s.n, s.cell); sync(); });
    group.appendChild(b);
  });

  main.insertBefore(group, main.querySelector('.stage-card'));

  function sync() {
    var g = A.grid();
    group.querySelectorAll('.key').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.n === g.cols && g.cols === g.rows));
    });
  }
  setInterval(sync, 600);                           // Randomize and Open HTML can change the grid too

  A.setGrid(64, 16);                                // start on Large, close to the old 67 x 67 grid
  sync();
})();
