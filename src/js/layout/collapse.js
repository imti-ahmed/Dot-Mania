/*
 * Collapsible titles (collapseTitles flag, the normal three-column layout). Every functionality title in the Properties, Image
 * and Export panels gets a caret (Phosphor, regular weight) at its end; it shows on hover, and stays showing on a folded title. Click the title or the caret and what is under it folds away,
 * leaving just the title and the caret; click again to open it. Which ones are folded is remembered in the browser.
 * (The canvas-only view has its own version of this in panels.js.) Loaded after app.js, which builds the controls.
 */
(function () {
  if (!window.FLAGS || !FLAGS.collapseTitles || FLAGS.gridSizes) return;
  var CARET = '<svg class="ph" viewBox="0 0 256 256" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';
  // folded by default; once someone opens or folds a title their choice (1 = folded, 0 = open) is what is remembered
  var FOLDED_AT_START = { 'prop/Color': 1, 'image/Tuning': 1 };
  var KEY = 'dotmania.foldedTitles2', folded = {};
  try { folded = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function remember(id, isFolded) { folded[id] = isFolded ? 1 : 0; try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch (e) {} }

  function make(box, scope) {
    if (!box) return;
    var kids = Array.prototype.slice.call(box.children), i = 0;
    while (i < kids.length) {
      var label = kids[i];
      if (!label.classList.contains('group-label')) { i++; continue; }
      if (label.hasAttribute('data-always-open')) { i++; continue; }      // e.g. Grid Size: never folds, no caret
      var body = document.createElement('div');
      body.className = 'acc-body';
      i++;
      while (i < kids.length && !kids[i].classList.contains('group-label')) { body.appendChild(kids[i]); i++; }
      label.parentNode.insertBefore(body, label.nextSibling);
      var id = scope + '/' + label.textContent.trim();
      var caret = document.createElement('span');
      caret.className = 'acc-caret';
      caret.innerHTML = CARET;
      label.appendChild(caret);
      label.classList.add('acc-head');
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      (function (label, body, id) {
        function set(open) { label.setAttribute('aria-expanded', String(open)); body.classList.toggle('collapsed', !open); }
        function toggle() { var open = label.getAttribute('aria-expanded') === 'false'; set(open); remember(id, !open); }
        label.addEventListener('click', toggle);
        label.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        set(!(id in folded ? folded[id] : FOLDED_AT_START[id]));
      })(label, body, id);
    }
  }

  make(document.querySelector('.main > .panel .panel-body'), 'prop');
  make(document.querySelector('.panel2-image .panel-body'), 'image');
  make(document.querySelector('.panel2-bottom .panel-body'), 'export');
})();
