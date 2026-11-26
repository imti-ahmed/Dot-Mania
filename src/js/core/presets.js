/*
 * Animation presets.
 *
 * Each preset's fn(c, t, p) returns an intensity 0..1 for one selected cell.
 *   c: { d, a, ux, uy, vy, col, row, rnd, rnd2, colRnd }
 *      d      distance from the selection's centre, 0 (centre) .. 1 (farthest cell)
 *      a      angle from the centre, radians
 *      ux,uy  position relative to the centre, roughly -1..1
 *      vy     0 (top of selection) .. 1 (bottom)
 *      rnd, rnd2, colRnd  stable random numbers (per cell / per column)
 *   t: seconds elapsed (only advances while playing)
 *   p: this preset's current control values (speed, size, glow + extras)
 *
 * `params` are the preset-specific sliders shown under the common ones.
 * Colour is a separate, global control (see app.js).
 */
(function () {
  var TAU = Math.PI * 2;
  var frac = function (x) { return x - Math.floor(x); };
  var pct = function (v) { return Math.round(v * 100) + '%'; };
  var deg = function (v) { return Math.round(v) + '°'; };
  var num = function (v) { return String(Math.round(v)); };
  var dec1 = function (v) { return v.toFixed(1); };
  var dec2 = function (v) { return v.toFixed(2); };
  var hash = function (a, b) {
    var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  var base = function (size, glow) { return { speed: 1, size: size, glow: glow }; };

  // Lava: per blob [x speed, y speed, x offset, y offset]; the speeds are whole numbers of cycles per loop
  var LAVA = [[1, 2, 0.0, 0.25], [2, 1, 0.4, 0.0], [1, 3, 0.7, 0.55], [3, 2, 0.15, 0.8], [2, 3, 0.55, 0.35]];

  window.PRESETS = [
    {
      id: 'shimmer', name: 'Shimmer', defaults: base(0.7, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.45); },
      params: [
        { key: 'trail', label: 'Trail', min: 0.05, max: 1, step: 0.01, def: 0.35, fmt: pct },
        { key: 'spread', label: 'Spread', min: 0.2, max: 2, step: 0.05, def: 0.9, fmt: dec2 }
      ],
      // Dots blink one after another, travelling from the centre to the edge, looped.
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.45 - c.d * p.spread);
        return Math.pow(1 - ph, 1 + (1 - p.trail) * 12);
      }
    },
    {
      id: 'pulse', name: 'Pulse', defaults: base(0.7, 0.4),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'depth', label: 'Depth', min: 0.1, max: 1, step: 0.01, def: 0.8, fmt: pct },
        { key: 'delay', label: 'Delay', min: 0, max: 1, step: 0.01, def: 0, fmt: pct }
      ],
      fn: function (c, t, p) {
        var s = 0.5 + 0.5 * Math.sin((t * p.speed * 0.5 - c.d * p.delay * 0.5) * TAU);
        return (1 - p.depth) + p.depth * s;
      }
    },
    {
      id: 'ripple', name: 'Ripple', defaults: base(0.65, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'rings', label: 'Rings', min: 1, max: 6, step: 1, def: 2, fmt: num },
        { key: 'sharp', label: 'Sharpness', min: 1, max: 6, step: 0.1, def: 2, fmt: dec1 }
      ],
      fn: function (c, t, p) {
        var v = 0.5 + 0.5 * Math.cos((c.d * p.rings - t * p.speed * 0.5) * TAU);
        return Math.pow(v, p.sharp);
      }
    },
    {
      id: 'wave', name: 'Wave', defaults: base(0.7, 0.4),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'angle', label: 'Angle', min: 0, max: 360, step: 5, def: 0, fmt: deg },
        { key: 'waves', label: 'Waves', min: 0.5, max: 4, step: 0.1, def: 1.5, fmt: dec1 }
      ],
      fn: function (c, t, p) {
        var a = p.angle * Math.PI / 180;
        var proj = c.ux * Math.cos(a) + c.uy * Math.sin(a);
        return 0.5 + 0.5 * Math.sin((proj * p.waves * 0.5 - t * p.speed * 0.5) * TAU);
      }
    },
    {
      id: 'spiral', name: 'Spiral', defaults: base(0.7, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.4); },
      params: [
        { key: 'arms', label: 'Arms', min: 1, max: 6, step: 1, def: 3, fmt: num },
        { key: 'twist', label: 'Twist', min: 0, max: 2, step: 0.05, def: 0.8, fmt: dec2 }
      ],
      fn: function (c, t, p) {
        var ph = (c.a / TAU) * p.arms + c.d * p.twist - t * p.speed * 0.4;
        var v = 0.5 + 0.5 * Math.cos(ph * TAU);
        return v * v;
      }
    },
    {
      id: 'scan', name: 'Scan', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return TAU / (p.speed * 1.2); },
      params: [
        { key: 'width', label: 'Thickness', min: 0.05, max: 0.6, step: 0.01, def: 0.2, fmt: pct },
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 5, def: 0, fmt: deg }
      ],
      // A bar sweeps back and forth across the shape.
      fn: function (c, t, p) {
        var a = p.angle * Math.PI / 180;
        var proj = c.ux * Math.cos(a) + c.uy * Math.sin(a);
        var x = (proj - Math.sin(t * p.speed * 1.2)) / p.width;
        return Math.exp(-x * x);
      }
    },
    {
      id: 'rain', name: 'Rain', defaults: base(0.6, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.3); },
      params: [
        { key: 'trail', label: 'Trail', min: 0.05, max: 1, step: 0.01, def: 0.5, fmt: pct },
        { key: 'slant', label: 'Slant', min: -0.5, max: 0.5, step: 0.01, def: 0, fmt: dec2 }
      ],
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.3 + c.colRnd - c.vy - c.ux * p.slant);
        return Math.pow(1 - ph, 1 + (1 - p.trail) * 12);
      }
    },
    {
      id: 'breathe', name: 'Breathe', defaults: base(0.75, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.35); },
      params: [
        { key: 'lag', label: 'Lag', min: 0, max: 1, step: 0.01, def: 0.4, fmt: pct },
        { key: 'depth', label: 'Depth', min: 0.1, max: 1, step: 0.01, def: 0.9, fmt: pct }
      ],
      // The whole shape swells and settles, the edge a beat behind the centre.
      fn: function (c, t, p) {
        var s = 0.5 + 0.5 * Math.sin((t * p.speed * 0.35 - c.d * p.lag * 0.5) * TAU);
        return (1 - p.depth) + p.depth * s * s;
      }
    },
    {
      id: 'flicker', name: 'Flicker', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'chaos', label: 'Chaos', min: 0.1, max: 1, step: 0.01, def: 0.7, fmt: pct },
        { key: 'rough', label: 'Roughness', min: 0, max: 0.25, step: 0.01, def: 0.25, fmt: dec2 }
      ],
      // Uneven, candle-like brightness: two wobbles at different rates per dot.
      fn: function (c, t, p) {
        var f = t * p.speed * 0.5;
        var n = 0.5 + 0.25 * Math.sin((2 * f + c.rnd) * TAU) + p.rough * Math.sin((3 * f + c.rnd2) * TAU);
        return (1 - p.chaos) + p.chaos * n;
      }
    },
    {
      id: 'reveal', name: 'Reveal', defaults: base(0.75, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.25); },
      params: [
        { key: 'soft', label: 'Softness', min: 0.05, max: 1, step: 0.01, def: 0.3, fmt: pct },
        { key: 'linear', label: 'Linear', min: 0, max: 1, step: 0.01, def: 0, fmt: pct }
      ],
      // The shape fills in from the centre outwards, then drains back out the same way.
      fn: function (c, t, p) {
        var progress = Math.abs(frac(t * p.speed * 0.25) * 2 - 1);
        var v = (progress * (1 + p.soft) - (c.d * (1 - p.linear) + (c.ux * 0.5 + 0.5) * p.linear)) / p.soft;
        return v < 0.05 ? 0.05 : v > 1 ? 1 : v;
      }
    },
    {
      id: 'bars', name: 'Bars', defaults: base(0.75, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'barw', label: 'Width', min: 1, max: 6, step: 1, def: 2, fmt: num },
        { key: 'swing', label: 'Swing', min: 0.1, max: 0.45, step: 0.01, def: 0.4, fmt: pct }
      ],
      // Columns rise and fall like the bars of an audio level meter.
      fn: function (c, t, p) {
        var b = Math.floor(c.col / p.barw);
        var r1 = frac(Math.sin(b * 127.1 + 13.7) * 43758.5453), r2 = frac(Math.sin(b * 311.7 + 7.3) * 43758.5453);
        var level = 0.55 + p.swing * Math.sin((t * p.speed * 0.5 * (1 + Math.floor(r1 * 3)) + r2) * TAU);
        var v = (level - (1 - c.vy)) * 8;
        return v < 0.06 ? 0.06 : v > 1 ? 1 : v;
      }
    },
    {
      id: 'glint', name: 'Glint', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.35); },
      params: [
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 5, def: 30, fmt: deg },
        { key: 'width', label: 'Thickness', min: 0.05, max: 0.35, step: 0.01, def: 0.14, fmt: pct }
      ],
      // A quick shine slides across a softly lit shape, then rests, like light catching a logo.
      fn: function (c, t, p) {
        var a = p.angle * Math.PI / 180;
        var proj = c.ux * Math.cos(a) + c.uy * Math.sin(a);
        var x = (proj - (frac(t * p.speed * 0.35) * 3.2 - 1.6)) / p.width;
        return 0.28 + 0.72 * Math.exp(-x * x);
      }
    }
  ];

  // New animations being tried out. They show in their own "Trying Out" group in the panel.
  // To approve one: move its block into window.PRESETS above (it then joins the main Animations list).
  // To drop one: delete its block.
  window.TRIAL_PRESETS = [
    {
      id: 'lava', name: 'Lava', defaults: base(0.75, 0.8),
      // seconds for one seamless loop
      period: function (p) { return 4 / p.speed; },
      params: [
        { key: 'blobs', label: 'Blobs', min: 2, max: 5, step: 1, def: 3, fmt: num },
        { key: 'gooey', label: 'Gooey', min: 0.05, max: 0.6, step: 0.01, def: 0.25, fmt: pct }
      ],
      // Like a lava lamp: soft blobs drift about, melt into each other when they meet and pinch apart again.
      fn: function (c, t, p) {
        var f = t * p.speed * 0.25, n = Math.round(p.blobs), F = 0;
        for (var k = 0; k < n; k++) {
          var bx = 0.62 * Math.sin((LAVA[k][0] * f + LAVA[k][2]) * TAU), by = 0.62 * Math.sin((LAVA[k][1] * f + LAVA[k][3]) * TAU);
          var dx = c.ux - bx, dy = c.uy - by;
          F += 0.09 / (dx * dx + dy * dy + 0.01);
        }
        var v = (F - (1 - p.gooey)) / (2 * p.gooey);                        // 1 inside the merged blobs, soft at the skin
        return 0.04 + 0.96 * (v < 0 ? 0 : v > 1 ? 1 : v);
      }
    },
    {
      id: 'iris', name: 'Iris', defaults: base(0.7, 0.7),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'blades', label: 'Blades', min: 3, max: 8, step: 1, def: 6, fmt: num },
        { key: 'width', label: 'Thickness', min: 0.05, max: 0.4, step: 0.01, def: 0.12, fmt: pct }
      ],
      // A camera aperture: a polygon ring that opens and closes while it turns by one blade per loop.
      fn: function (c, t, p) {
        var n = Math.round(p.blades), f = t * p.speed * 0.5, sector = TAU / n;
        var a = ((c.a + Math.PI - f * sector) % sector + sector) % sector - sector / 2;      // angle inside one blade, 0 in the middle
        var edge = Math.cos(Math.PI / n) / Math.cos(a);                                       // radius of the polygon at this angle
        var dp = c.d / edge, open = 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(f * TAU));
        var e = (dp - open) / p.width;
        return 0.04 + 0.96 * Math.exp(-e * e);
      }
    },
    {
      id: 'drip', name: 'Drip', defaults: base(0.65, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.4); },
      params: [
        { key: 'weight', label: 'Weight', min: 1, max: 3, step: 0.1, def: 2, fmt: dec1 },
        { key: 'splash', label: 'Splash', min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct }
      ],
      // Drops hang at the top, then fall faster and faster, stretching into streaks, and splash across the bottom row.
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.4 + c.colRnd), y = Math.pow(ph, p.weight);
        var behind = y - c.vy;                                                              // how far above the drop this cell is
        var v = behind >= 0 ? Math.exp(-behind / (0.04 + 0.3 * ph)) : 0;
        var s = ph > 0.8 ? Math.sin(Math.PI * (ph - 0.8) / 0.2) : 0;
        var splash = p.splash * s * Math.exp(-Math.pow((1 - c.vy) / 0.07, 2));
        v = Math.max(v, splash);
        return v < 0.04 ? 0.04 : v;
      }
    },
    {
      id: 'ridge', name: 'Ridge', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'peaks', label: 'Peaks', min: 0.5, max: 3, step: 0.1, def: 1.2, fmt: dec1 },
        { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, def: 0.5, fmt: pct }
      ],
      // Mountain ranges slide past: a bright front range and a dimmer one behind it, each with a glowing crest.
      fn: function (c, t, p) {
        var f = t * p.speed * 0.5, k = p.peaks;
        var front = 0.62 + 0.16 * Math.sin((c.ux * k - 2 * f) * TAU) + 0.07 * Math.sin((c.ux * k * 2.3 - 3 * f) * TAU);
        var back = 0.42 + 0.14 * Math.sin((c.ux * k * 0.8 - f) * TAU + 1.3) + 0.06 * Math.sin((c.ux * k * 1.9 - 2 * f) * TAU);
        var sf = (c.vy - front) / 0.06, sb = (c.vy - back) / 0.06;
        sf = sf < 0 ? 0 : sf > 1 ? 1 : sf; sb = sb < 0 ? 0 : sb > 1 ? 1 : sb;
        var crestF = Math.exp(-Math.pow((c.vy - front) / 0.04, 2)), crestB = Math.exp(-Math.pow((c.vy - back) / 0.04, 2));
        var vf = sf * (0.3 + 0.2 * (c.vy - front)) + 0.7 * crestF;
        var vb = p.depth * (sb * 0.28 + 0.6 * crestB);
        var v = Math.max(vf, vb);
        return v < 0.04 ? 0.04 : v > 1 ? 1 : v;
      }
    },
    {
      id: 'monitor', name: 'Monitor', defaults: base(0.65, 0.8),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'beats', label: 'Beats', min: 1, max: 4, step: 1, def: 2, fmt: num },
        { key: 'trail', label: 'Trail', min: 0.4, max: 4, step: 0.1, def: 1.4, fmt: dec1 }
      ],
      // A heart monitor: a trace with a sharp spike, drawn from left to right by a bright head that leaves a fading trail.
      fn: function (c, t, p) {
        var f = t * p.speed * 0.5, hx = -1 + 2 * frac(f);
        var delta = (((hx - c.ux) % 2) + 2) % 2;                                            // how far behind the head this cell is
        var trail = Math.exp(-delta * p.trail * 2.5), line = 0;
        for (var s = -1; s <= 1; s++) {                                                     // three nearby samples so the steep spike stays joined up
          var ph = frac(c.ux * p.beats * 0.5 + 0.5 + s * 0.012), y = 0.5 * Math.exp(-Math.pow((ph - 0.3) / 0.05, 2)) + 0.25 * Math.exp(-Math.pow((ph - 0.74) / 0.07, 2));
          y += -0.9 * Math.exp(-Math.pow((ph - 0.5) / 0.018, 2)) + 0.3 * Math.exp(-Math.pow((ph - 0.54) / 0.02, 2));
          var e = (c.uy + y * 0.9 - 0.15) / 0.11;
          var l = Math.exp(-e * e);
          if (l > line) line = l;
        }
        var v = line * (0.2 + 0.8 * trail);
        return v < 0.04 ? 0.04 : v;
      }
    },
    {
      id: 'type', name: 'Type', defaults: base(0.7, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [
        { key: 'cursor', label: 'Cursor', min: 0.005, max: 0.08, step: 0.005, def: 0.025, fmt: pct },
        { key: 'hold', label: 'Hold', min: 0, max: 0.4, step: 0.01, def: 0.15, fmt: pct }
      ],
      // The shape is written like a line of text: row by row, left to right, with a bright cursor at the head; then it holds and fades.
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.5), prog = Math.min(1.02, ph / (0.88 - p.hold));
        var env = ph < 0.88 ? 1 : (1 - ph) / 0.12;
        var idx = c.vy * 0.985 + (c.ux * 0.5 + 0.5) * 0.012;                                // reading order
        var v = idx <= prog ? 0.65 : 0.04;
        if (Math.abs(idx - prog) < p.cursor) v = 1;
        v *= env;
        return v < 0.04 ? 0.04 : v;
      }
    }
  ];

  // Slider ranges for the controls every preset shares.
  window.COMMON_PARAMS = {
    speed: { label: 'Speed', min: 0.1, max: 3, step: 0.05, fmt: function (v) { return v.toFixed(2) + '×'; } },
    size:  { label: 'Size',  min: 0.2, max: 1.2, step: 0.01, fmt: pct },
    glow:  { label: 'Glow',  min: 0,   max: 1,   step: 0.01, fmt: pct }
  };

  window.SWATCHES = ['#1a79ff', '#ff8a1f', '#ffd23f', '#5cf08a', '#2de2e6', '#8f7bff', '#ff5fa2'];
})();
