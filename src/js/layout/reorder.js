/*
 * Reorder (reorder flag, part of the grid-only view). The three sections (the canvas card and the two empty cards) show a
 * dark see-through strip with a 6 dot grip on hover. Drag the grip onto another section and let go to swap them.
 * Only these three swap places, in the three grid columns. The order is remembered in the browser.
 * Loaded after gridsizes.js, which builds the cards.
 */
(function () {
  if (!window.FLAGS || !FLAGS.reorder || !FLAGS.gridSizes) return;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  var canvas = main.querySelector('.stage-card'), slots = main.querySelectorAll('.slot');
  if (!canvas || slots.length < 2) return;

  var items = { canvas: canvas, a: slots[0], b: slots[1] };
  var KEY = 'dotmania.sectionOrder', order = ['canvas', 'a', 'b'];

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.length === 3 && order.every(function (id) { return saved.indexOf(id) >= 0; })) order = saved;
  } catch (e) {}

  function apply() {
    var left = main.querySelector('.leftcol');
    if (left) left.style.order = -1;
    order.forEach(function (id, i) { items[id].style.order = i; });
    // The canvas column is as wide as the canvas; the other two share what is left, equally
    main.style.gridTemplateColumns = (left ? '112px ' : '') + order.map(function (id) { return id === 'canvas' ? 'var(--stage-size)' : '1fr'; }).join(' ');
  }

  var DOTS = '<svg viewBox="0 0 16 24" width="16" height="24" aria-hidden="true" fill="currentColor">' +
    [4, 12, 20].map(function (y) { return '<circle cx="4" cy="' + y + '" r="2"/><circle cx="12" cy="' + y + '" r="2"/>'; }).join('') + '</svg>';

  var drag = null;
  function itemAt(x, y) {
    for (var id in items) {
      var r = items[id].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }
  function clear() {
    for (var id in items) items[id].classList.remove('drop-slot', 'dragging');
    document.body.classList.remove('reordering');
  }

  Object.keys(items).forEach(function (id) {
    var grip = document.createElement('div');
    grip.className = 'grip';
    grip.title = 'Drag to move this section';
    grip.setAttribute('aria-label', 'Move section');
    grip.innerHTML = DOTS;
    items[id].appendChild(grip);

    grip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      drag = { id: id, over: null };
      items[id].classList.add('dragging');
      document.body.classList.add('reordering');
    });
    grip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var over = itemAt(e.clientX, e.clientY);
      over = over === drag.id ? null : over;
      if (over !== drag.over) {
        if (drag.over) items[drag.over].classList.remove('drop-slot');
        if (over) items[over].classList.add('drop-slot');
        drag.over = over;
      }
    });
    function end(e, drop) {
      if (!drag) return;
      var from = drag.id, to = drag.over;
      drag = null;
      clear();
      if (drop && to) {
        var i = order.indexOf(from), j = order.indexOf(to);
        order[i] = to; order[j] = from;
        apply();
        try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (err) {}
      }
    }
    grip.addEventListener('pointerup', function (e) { end(e, true); });
    grip.addEventListener('pointercancel', function (e) { end(e, false); });
  });

  apply();
})();
