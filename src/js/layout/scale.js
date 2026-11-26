/*
 * Fixed design size: the page is always drawn at 1600 x 732 px and scaled to fit the window (centred, empty space on the
 * sides or below when the shape differs), whatever the screen size or browser zoom. Nothing reflows.
 * It sets --vw / --vh (1600px / 732px) so the CSS that sizes things from the window uses the design size, and
 * window.pageFit = { s: scale, x: left offset, y: top offset, W, H } for code that mixes window pixels with page pixels.
 * Switched off by the fitScreen flag (flags.js). Loaded right after flags.js.
 */
(function () {
  if (window.FLAGS && !FLAGS.fitScreen) return;         // fitScreen flag off: no scaling, the page is laid out at the window's real size (scale 100%)
  var W = 1600, H = 732;
  var root = document.documentElement, body = document.body;
  window.pageFit = { s: 1, x: 0, y: 0, W: W, H: H };

  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.min(w / W, h / H);
    var x = (w - W * s) / 2, y = (h - H * s) / 2;
    window.pageFit = { s: s, x: x, y: y, W: W, H: H };
    root.style.setProperty('--vw', W + 'px');
    root.style.setProperty('--vh', H + 'px');
    body.style.position = 'absolute';
    body.style.left = x + 'px'; body.style.top = y + 'px';
    body.style.width = W + 'px'; body.style.height = H + 'px';
    body.style.transformOrigin = '0 0';
    body.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();
})();
