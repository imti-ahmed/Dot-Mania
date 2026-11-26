/*
 * Image -> black & white -> grid cells.
 *
 * The app rasterises the uploaded image to exactly one pixel per grid cell (cols x rows) and hands the
 * RGBA pixels here. Pure functions, no DOM, so they are easy to test.
 *
 *   DotImage.suggestOn(px)                      'dark' | 'light'  which tones should become dots
 *   DotImage.toCells(px, cols, rows, opts)      [[col,row], ...]
 *
 * opts: { style: 'threshold' | 'dither' | 'outline' ('halftone' still works, no button), level: 0..1, on: 'dark' | 'light',
 *         tone: 0..1 (the tone the dots sit on: 0 = dark, 1 = light, between = that band of mid tones; overrides on), edge: 0..1 (0 = filled, 1 = outline only; threshold style),
 *         smooth: 0..1 (blur the brightness before the cut: 0 = none) }
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

  // Box blur of the brightness over the solid cells only, radius r in cells (fractions blend two radii so the slider is smooth).
  function boxBlur(src, solid, cols, rows, r) {
    if (r < 1) return src;
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length), x, y, k, s, w, q;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      s = 0; w = 0;
      for (k = -r; k <= r; k++) { q = x + k; if (q >= 0 && q < cols && solid[y * cols + q]) { s += src[y * cols + q]; w++; } }
      tmp[y * cols + x] = w ? s / w : src[y * cols + x];
    }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      s = 0; w = 0;
      for (k = -r; k <= r; k++) { q = y + k; if (q >= 0 && q < rows && solid[q * cols + x]) { s += tmp[q * cols + x]; w++; } }
      out[y * cols + x] = w ? s / w : tmp[y * cols + x];
    }
    return out;
  }
  function smoothLum(l, solid, cols, rows, radius) {
    var r0 = Math.floor(radius), f = radius - r0;
    var a = boxBlur(l, solid, cols, rows, r0);
    if (f < 0.01) return a;
    var b = boxBlur(l, solid, cols, rows, r0 + 1), out = new Float32Array(l.length);
    for (var p = 0; p < l.length; p++) out[p] = a[p] * (1 - f) + b[p] * f;
    return out;
  }

  function toCells(px, cols, rows, o) {
    var n = cols * rows, i, p;
    var l = new Float32Array(n), solid = new Uint8Array(n), hist = new Uint32Array(256), count = 0;
    for (p = 0; p < n; p++) {
      i = p * 4;
      if (px[i + 3] < 128) continue;
      solid[p] = 1;
      l[p] = lum(px, i);
    }
    // Smoothing: blur the brightness a little (more with a higher amount) so speckles melt into clean shapes before the cut.
    if (o.smooth > 0) l = smoothLum(l, solid, cols, rows, o.smooth * 4);
    for (p = 0; p < n; p++) {
      if (!solid[p]) continue;
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
    var tone = o.tone !== undefined ? o.tone : (o.on === 'light' ? 1 : 0);
    var bias = (o.level === undefined ? 0.5 : o.level) - 0.5, v = new Float32Array(n);
    for (p = 0; p < n; p++) {
      var t = stretch ? Math.max(0, Math.min(1, (l[p] - base) / span)) : l[p];
      var ink = 1 - Math.abs(t - tone) / Math.max(tone, 1 - tone);   // dots gather around the chosen tone: 0 = the dark tones, 1 = the light ones, between = the mid tones in that band
      v[p] = Math.max(0, Math.min(1, ink + bias));
    }

    // Dither and Halftone keep a little texture even in solid areas (full ink = about 78% of the dots), so flat shapes and
    // logos show the difference between them and Threshold; photos keep their tones, just a touch lighter.
    if (o.style === 'dither' || o.style === 'halftone') for (p = 0; p < n; p++) v[p] *= 0.78;
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
    } else if (o.style === 'halftone') {
      // Ordered (Bayer 4x4) dither: tones become a regular, printed-looking pattern instead of scattered dots.
      var B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (p = 0; p < n; p++) {
        if (!solid[p]) continue;
        x = p % cols; y = (p / cols) | 0;
        if (v[p] > (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16) out.push([x, y]);
      }
    } else if (o.style === 'outline') {
      // Only the edge: a cell that is ink and touches a cell that is not ink (or the picture's border).
      var ink = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < cols && yy < rows && solid[yy * cols + xx] && v[yy * cols + xx] > 0.5; };
      for (p = 0; p < n; p++) {
        x = p % cols; y = (p / cols) | 0;
        if (ink(x, y) && !(ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1))) out.push([x, y]);
      }
    } else {
      for (p = 0; p < n; p++) if (solid[p] && v[p] > 0.5) out.push([p % cols, (p / cols) | 0]);
      // edge 0..1: 0 keeps the whole shape, 1 keeps only its outline, between keeps a border that gets thinner the higher it goes.
      if (o.edge > 0 && out.length) {
        var mask = new Uint8Array(n), dist = new Int32Array(n), big = 1 << 20, maxD = 0;
        out.forEach(function (c) { mask[c[1] * cols + c[0]] = 1; });
        // distance (in cells, up and down / left and right) from each cell to the nearest cell that is not ink; the picture's border counts as outside
        for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
          p = y * cols + x;
          if (!mask[p]) { dist[p] = 0; continue; }
          dist[p] = Math.min(x === 0 || y === 0 ? 1 : big, (x > 0 ? dist[p - 1] : 0) + 1, (y > 0 ? dist[p - cols] : 0) + 1);
        }
        for (y = rows - 1; y >= 0; y--) for (x = cols - 1; x >= 0; x--) {
          p = y * cols + x;
          if (!mask[p]) continue;
          dist[p] = Math.min(dist[p], x === cols - 1 || y === rows - 1 ? 1 : big, (x < cols - 1 ? dist[p + 1] : 0) + 1, (y < rows - 1 ? dist[p + cols] : 0) + 1);
          if (dist[p] > maxD) maxD = dist[p];
        }
        var keep = Math.max(1, Math.ceil((1 - o.edge) * maxD));
        out = out.filter(function (c) { return dist[c[1] * cols + c[0]] <= keep; });
      }
    }
    return out;
  }

  window.DotImage = { suggestOn: suggestOn, toCells: toCells };
})();
