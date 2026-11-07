/*
 * Starter shapes.
 *
 * Each shape's gen(cols, rows, scale) returns an array of [col, row] cells,
 * centred on the grid. `scale` (0..1) is the fraction of the grid's shorter side
 * that centred shapes fill. Full-bleed patterns (Full, Checkers) ignore it.
 */
(function () {
  // Test every cell centre against f(x, y, R); x,y are in units of the shape radius R.
  function field(cols, rows, scale, f) {
    var out = [], cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    var R = Math.max(1, Math.min(cols, rows) / 2 * scale);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (f((c - cx) / R, (r - cy) / R, R)) out.push([c, r]);
      }
    }
    return out;
  }

  function each(cols, rows, f) {
    var out = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) if (f(c, r)) out.push([c, r]);
    return out;
  }

  function inPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Rasterise line segments given in cell coordinates.
  function segments(cols, rows, scale, build) {
    var cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    var L = Math.max(1, Math.min(cols, rows) / 2 * scale);
    var seen = {}, out = [];
    function plot(x, y) {
      var c = Math.round(x), r = Math.round(y);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var k = c + ',' + r;
      if (!seen[k]) { seen[k] = 1; out.push([c, r]); }
    }
    function seg(x0, y0, x1, y1) {
      var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
      for (var i = 0; i <= n; i++) plot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
    }
    build({ cx: cx, cy: cy, L: L, seg: seg, plot: plot });
    return out;
  }

  var STAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) {
    var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 0.42 : 1;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  });

  window.SHAPES = [
    { id: 'full', name: 'Full', gen: function (cols, rows) { return each(cols, rows, function () { return true; }); } },
    { id: 'checkers', name: 'Checkers', gen: function (cols, rows) { return each(cols, rows, function (c, r) { return (c + r) % 2 === 0; }); } },
    { id: 'disc', name: 'Disc', gen: function (cols, rows, s) { return field(cols, rows, s, function (x, y) { return x * x + y * y <= 1; }); } },
    { id: 'ring', name: 'Ring', gen: function (cols, rows, s) {
        return field(cols, rows, s, function (x, y, R) {
          var d = Math.sqrt(x * x + y * y);
          return d <= 1 && d >= 1 - Math.max(0.22, 1.3 / R);
        });
      } },
    { id: 'diamond', name: 'Diamond', gen: function (cols, rows, s) { return field(cols, rows, s, function (x, y) { return Math.abs(x) + Math.abs(y) <= 1; }); } },
    { id: 'star', name: 'Star', gen: function (cols, rows, s) { return field(cols, rows, s, function (x, y) { return inPoly(x, y, STAR); }); } },
    { id: 'heart', name: 'Heart', gen: function (cols, rows, s) {
        return field(cols, rows, s, function (x, y) {
          var xx = x * 1.2, yy = -y * 1.2 + 0.15;
          var a = xx * xx + yy * yy - 1;
          return a * a * a - xx * xx * yy * yy * yy <= 0;
        });
      } },
    { id: 'snowflake', name: 'Snowflake', gen: function (cols, rows, s) {
        // A single flake at the centre: six arms, each with two pairs of side branches.
        return segments(cols, rows, s, function (g) {
          for (var k = 0; k < 6; k++) {
            var a = k * Math.PI / 3 - Math.PI / 2;
            g.seg(g.cx, g.cy, g.cx + Math.cos(a) * g.L, g.cy + Math.sin(a) * g.L);
            [0.45, 0.72].forEach(function (f) {
              var bx = g.cx + Math.cos(a) * g.L * f, by = g.cy + Math.sin(a) * g.L * f;
              var bl = g.L * (f < 0.6 ? 0.32 : 0.22);
              [-1, 1].forEach(function (sgn) {
                var ba = a + sgn * Math.PI / 3;
                g.seg(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
              });
            });
          }
          g.plot(g.cx, g.cy);
        });
      } }
  ];
})();
