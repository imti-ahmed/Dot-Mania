/*
 * Play bar (playBar flag, part of the grid-only view). A small panel under the Layers strip with two icon buttons side by
 * side, Play and Pause, and no title. Loaded after layerstrip.js. It works through window.DotApp.setPlaying.
 */
(function () {
  if (!window.FLAGS || !FLAGS.playBar || !FLAGS.gridSizes || !window.DotApp) return;

  var A = window.DotApp;
  var main = document.querySelector('.main[data-page="canvas"]');
  if (!main) return;
  var col = main.querySelector('.leftcol');
  if (!col) { col = document.createElement('div'); col.className = 'leftcol'; main.insertBefore(col, main.querySelector('.stage-card')); }

  var svg = function (d) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' + d + '</svg>';
  };
  var ICON_PLAY = svg('<path d="M4 2.5v11a.6.6 0 00.9.5l9-5.5a.6.6 0 000-1L4.9 2a.6.6 0 00-.9.5z"/>');
  var ICON_PAUSE = svg('<rect x="3.5" y="2.5" width="3" height="11" rx=".8"/><rect x="9.5" y="2.5" width="3" height="11" rx=".8"/>');

  var bar = document.createElement('div');
  bar.className = 'card playbar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Playback');

  var title = document.createElement('div');       // reads Playing or Paused
  title.className = 'gp-title';
  bar.appendChild(title);
  var row = document.createElement('div');
  row.className = 'pb-row';
  bar.appendChild(row);

  function button(icon, label, on) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { A.setPlaying(on); sync(); });
    row.appendChild(b);
    return b;
  }
  var play = button(ICON_PLAY, 'Play', true);
  var pause = button(ICON_PAUSE, 'Pause', false);

  var strip = col.querySelector('.layerstrip');
  col.insertBefore(bar, strip ? strip.nextSibling : col.firstChild);

  function sync() {
    var on = !!A.state.playing;
    play.setAttribute('aria-pressed', String(on));
    pause.setAttribute('aria-pressed', String(!on));
    title.textContent = on ? 'Playing' : 'Paused';
  }
  sync();
  setInterval(sync, 250);                           // Space and Randomize also change playback
})();
