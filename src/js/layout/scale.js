/*
 * Small screens: the design is 1600 x 732 px. On a smaller window the whole page is drawn at 1600 x 732 and scaled down
 * to fit (everything shrinks together), never reflowed. Bigger windows are left alone.
 * It sets --vw / --vh (1600px / 732px while scaled) so the CSS that sizes things from the window uses the design size.
 * Loaded first, no dependencies.
 */
(function () {
  var W = 1600, H = 732;
  var root = document.documentElement, body = document.body;

  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w >= W && h >= H) {                           // big enough: normal fluid layout
      body.style.cssText = body.style.cssText.replace(/(width|height|transform|transform-origin|position|left|top):[^;]*;?/g, '');
      root.style.removeProperty('--vw'); root.style.removeProperty('--vh');
      return;
    }
    var s = Math.min(w / W, h / H);
    root.style.setProperty('--vw', W + 'px');
    root.style.setProperty('--vh', H + 'px');
    body.style.position = 'absolute';
    body.style.left = '0'; body.style.top = '0';
    body.style.width = W + 'px'; body.style.height = H + 'px';
    body.style.transformOrigin = '0 0';
    body.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();
})();
