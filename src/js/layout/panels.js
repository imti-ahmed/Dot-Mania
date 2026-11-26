/*
 * Panel slots (panelSlots flag, part of the grid-only view). The old panels fill the two cards on the right of the canvas,
 * and every group of options in them is a collapsible section (click its title). The controls themselves are the same
 * elements the editor already wires up, they are only moved here, so everything keeps working.
 *   Left card:  Properties (Shapes, Color, Animations, Tuning, ...)
 *   Right card: Tools (the old left bar), Layers, Export
 * Which sections are open is remembered in the browser. Loaded after gridsizes.js, which builds the cards.
 */
(function () {
  if (!window.FLAGS || !FLAGS.panelSlots || !FLAGS.gridSizes) return;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  var slots = main.querySelectorAll('.slot');
  var side = main.querySelector(':scope > .sidebar'), prop = main.querySelector(':scope > .panel'), p2 = main.querySelector(':scope > .panel2');
  if (slots.length < 2 || !side || !prop || !p2) return;

  var KEY = 'dotmania.openSections', saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function remember(id, open) { saved[id] = open; try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function header(title) { var h = el('div', 'panel-header'); h.appendChild(el('span', 'panel-title', title)); return h; }
  function moveAll(from, to, skip) { Array.prototype.slice.call(from.children).forEach(function (c) { if (!skip || !c.matches(skip)) to.appendChild(c); }); }

  // Every .group-label in the container becomes a clickable title that folds up everything after it, down to the next title
  function collapsible(box, scope, openByDefault) {
    var kids = Array.prototype.slice.call(box.children), i = 0;
    while (i < kids.length) {
      var label = kids[i];
      if (!label.classList.contains('group-label')) { i++; continue; }
      var body = el('div', 'acc-body');
      i++;
      while (i < kids.length && !kids[i].classList.contains('group-label')) { body.appendChild(kids[i]); i++; }
      label.parentNode.insertBefore(body, label.nextSibling);
      var id = scope + '/' + label.textContent.trim();
      var open = id in saved ? saved[id] : openByDefault(label.textContent.trim());
      label.classList.add('acc-head');
      label.classList.remove('first');
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      (function (label, body, id) {
        function set(o) { label.setAttribute('aria-expanded', String(o)); body.classList.toggle('collapsed', !o); }
        function toggle() { var o = label.getAttribute('aria-expanded') !== 'true'; set(o); remember(id, o); }
        label.addEventListener('click', toggle);
        label.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        set(open);
      })(label, body, id);
    }
  }

  // Left card: Properties
  slots[0].appendChild(header('Properties'));
  var propBody = prop.querySelector('.panel-body');
  slots[0].appendChild(propBody);
  collapsible(propBody, 'prop', function (t) { return t === 'Color' || t === 'Animations'; });

  // Right card: Tools, Layers and Export, each one a section
  var body = el('div', 'panel-body');
  var tools = el('div', 'sidebar');
  moveAll(side, tools, '.crafted');
  var layers = el('div', 'acc-plain');
  moveAll(p2.querySelector('.panel2-top .panel-body'), layers);
  var exp = el('div', 'acc-plain');
  var expBody = p2.querySelector('.panel2-bottom .panel-body');
  moveAll(expBody, exp);
  collapsible(exp, 'export', function () { return true; });
  [['Tools', tools], ['Layers', layers], ['Export', exp]].forEach(function (s) {
    body.appendChild(el('div', 'group-label', s[0]));
    body.appendChild(s[1]);
  });
  slots[1].appendChild(header('Tools'));
  slots[1].appendChild(body);
  collapsible(body, 'right', function (t) { return t === 'Tools' || t === 'Layers'; });
})();
