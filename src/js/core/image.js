/*
 * Image -> black & white -> grid cells.
 *
 * The app rasterises the uploaded image to exactly one pixel per grid cell (cols x rows) and hands the
 * RGBA pixels here. Pure functions, no DOM, so they are easy to test.
 *
 *   DotImage.suggestOn(px)                      'dark' | 'light'  which tones should become dots
 *   DotImage.toCells(px, cols, rows, opts)      [[col,row], ...]
 *
 * opts: { style: 'threshold' | 'dither', level: 0..1, on: 'dark' | 'light' }
 *   level is the amount of "ink": higher means more dots.
 *   Transparent pixels (alpha < 50%) never become dots, so logos with transparent backgrounds just work.
 */
(function () {
  function lum(px, i) { return (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; }

  // Which tones should become dots?
  //  - opaque photo / scan: dots on the minority side (a dark logo on white -> dark, a light subject on black -> light)
  //  - image with real transparency: the visible part IS the subject, so follow its own tone
  //    (a black logo on transparent -> dark dots, a white one -> light dots)
  function suggestOn(px) {
    var sum = 0, n = 0, total = px.length / 4;
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      sum += lum(px, i); n++;
    }
    if (!n) return 'dark';
    var mean = sum / n;
    if (n < total * 0.9) return mean > 0.5 ? 'light' : 'dark';
    return mean > 0.55 ? 'dark' : 'light';
  }

  function toCells(px, cols, rows, o) {
    var n = cols * rows, i, p;
    var l = new Float32Array(n), solid = new Uint8Array(n), hist = new Uint32Array(256), count = 0;
    for (p = 0; p < n; p++) {
      i = p * 4;
      if (px[i + 3] < 128) continue;
      solid[p] = 1;
      l[p] = lum(px, i);
      hist[Math.min(255, (l[p] * 255) | 0)]++;
      count++;
    }
    if (!count) return [];

    // Auto-contrast: stretch the 2nd..98th percentile to 0..1 so dull or washed-out images still split well.
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= count * 0.02) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= count * 0.02) { hi = i; break; } }
    var span = (hi - lo) / 255, base = lo / 255;
    var stretch = span > 0.04;                          // a flat image is left alone

    // "ink" = how much a pixel wants to be a dot (1 = definitely), shifted by the level control.
    var bias = (o.level === undefined ? 0.5 : o.level) - 0.5, v = new Float32Array(n);
    for (p = 0; p < n; p++) {
      var t = stretch ? Math.max(0, Math.min(1, (l[p] - base) / span)) : l[p];
      var ink = o.on === 'light' ? t : 1 - t;
      v[p] = Math.max(0, Math.min(1, ink + bias));
    }

    var out = [], x, y;
    if (o.style === 'dither') {
      // Floyd-Steinberg, serpentine: smooth tones become a believable density of dots.
      for (y = 0; y < rows; y++) {
        var ltr = (y & 1) === 0;
        for (var k = 0; k < cols; k++) {
          x = ltr ? k : cols - 1 - k;
          p = y * cols + x;
          if (!solid[p]) continue;
          var old = v[p], on = old >= 0.5 ? 1 : 0, err = old - on, dir = ltr ? 1 : -1;
          if (on) out.push([x, y]);
          var spread = function (xx, yy, w) {
            if (xx < 0 || xx >= cols || yy >= rows) return;
            var q = yy * cols + xx;
            if (solid[q]) v[q] += err * w;
          };
          spread(x + dir, y, 7 / 16);
          spread(x - dir, y + 1, 3 / 16);
          spread(x, y + 1, 5 / 16);
          spread(x + dir, y + 1, 1 / 16);
        }
      }
    } else {
      for (p = 0; p < n; p++) if (solid[p] && v[p] > 0.5) out.push([p % cols, (p / cols) | 0]);
    }
    return out;
  }

  window.DotImage = { suggestOn: suggestOn, toCells: toCells };
})();
