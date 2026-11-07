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

  window.PRESETS = [
    {
      id: 'shimmer', name: 'Shimmer', defaults: base(0.7, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.45); },
      params: [{ key: 'trail', label: 'Trail', min: 0.05, max: 1, step: 0.01, def: 0.35, fmt: pct }],
      // Dots blink one after another, travelling from the centre to the edge, looped.
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.45 - c.d * 0.9);
        return Math.pow(1 - ph, 1 + (1 - p.trail) * 12);
      }
    },
    {
      id: 'pulse', name: 'Pulse', defaults: base(0.7, 0.4),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [{ key: 'depth', label: 'Depth', min: 0.1, max: 1, step: 0.01, def: 0.8, fmt: pct }],
      fn: function (c, t, p) {
        var s = 0.5 + 0.5 * Math.sin(t * p.speed * 0.5 * TAU);
        return (1 - p.depth) + p.depth * s;
      }
    },
    {
      id: 'ripple', name: 'Ripple', defaults: base(0.65, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [{ key: 'rings', label: 'Rings', min: 1, max: 6, step: 1, def: 2, fmt: num }],
      fn: function (c, t, p) {
        var v = 0.5 + 0.5 * Math.cos((c.d * p.rings - t * p.speed * 0.5) * TAU);
        return v * v;
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
      id: 'twinkle', name: 'Twinkle', defaults: base(0.6, 0.7),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.3); },
      params: [{ key: 'sparkle', label: 'Sparkle', min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct }],
      fn: function (c, t, p) {
        var s = 0.5 + 0.5 * Math.sin((t * p.speed * 0.3 * (1 + Math.floor(c.rnd2 * 2)) + c.rnd) * TAU);
        return Math.pow(s, 1 + p.sparkle * 8);
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
      params: [{ key: 'trail', label: 'Trail', min: 0.05, max: 1, step: 0.01, def: 0.5, fmt: pct }],
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.3 + c.colRnd - c.vy);
        return Math.pow(1 - ph, 1 + (1 - p.trail) * 12);
      }
    },
    {
      id: 'heartbeat', name: 'Heartbeat', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.6); },
      params: [{ key: 'spread', label: 'Spread', min: 0, max: 1, step: 0.01, def: 0.3, fmt: pct }],
      // Lub-dub, with the beat rippling outward from the centre.
      fn: function (c, t, p) {
        var ph = frac(t * p.speed * 0.6 - c.d * p.spread * 0.4);
        var a = (ph - 0.12) / 0.06, b = (ph - 0.32) / 0.07;
        return Math.min(1, Math.exp(-a * a) + 0.7 * Math.exp(-b * b));
      }
    }
  ];

  // Behind FLAGS.extraPresets (see flags.js). Same shape as the presets above; each loops seamlessly at period().
  window.EXTRA_PRESETS = [
    {
      id: 'diamond', name: 'Diamond', defaults: base(0.7, 0.5),
      // seconds for one seamless loop
      period: function (p) { return 2 / p.speed; },
      params: [{ key: 'rings', label: 'Rings', min: 1, max: 6, step: 1, def: 2, fmt: num }],
      // Like Ripple, but the rings are diamonds.
      fn: function (c, t, p) {
        var m = (Math.abs(c.ux) + Math.abs(c.uy)) / 1.4;
        var v = 0.5 + 0.5 * Math.cos((m * p.rings - t * p.speed * 0.5) * TAU);
        return v * v;
      }
    },
    {
      id: 'radar', name: 'Radar', defaults: base(0.7, 0.6),
      // seconds for one seamless loop
      period: function (p) { return 1 / (p.speed * 0.3); },
      params: [{ key: 'trail', label: 'Trail', min: 0.05, max: 1, step: 0.01, def: 0.5, fmt: pct }],
      // A sweep arm rotates around the centre, leaving a fading trail.
      fn: function (c, t, p) {
        var ph = frac(c.a / TAU - t * p.speed * 0.3);
        return Math.pow(1 - ph, 1 + (1 - p.trail) * 14);
      }
    },
    {
      id: 'checker', name: 'Checker', defaults: base(0.7, 0.3),
      period: function (p) { return 1 / (p.speed * 0.6); },
      params: [{ key: 'soft', label: 'Softness', min: 0, max: 1, step: 0.01, def: 0.3, fmt: pct }],
      // Two interleaved halves swap on and off like a chessboard.
      fn: function (c, t, p) {
        var s = 0.5 + 0.5 * Math.sin(t * p.speed * 0.6 * TAU);
        var v = ((c.col + c.row) & 1) ? s : 1 - s;
        var k = 1 + (1 - p.soft) * 10;
        return Math.min(1, Math.max(0, (v - 0.5) * k + 0.5));
      }
    },
    {
      id: 'orbit', name: 'Orbit', defaults: base(0.75, 0.7),
      period: function (p) { return TAU / (p.speed * 1.4); },
      params: [
        { key: 'radius', label: 'Radius', min: 0.15, max: 1, step: 0.01, def: 0.6, fmt: pct },
        { key: 'tail', label: 'Tail', min: 0.05, max: 1, step: 0.01, def: 0.4, fmt: pct }
      ],
      // A comet circles the centre on a ring.
      fn: function (c, t, p) {
        var da = (((c.a - t * p.speed * 1.4) % TAU) + TAU) % TAU;
        var tail = Math.max(0, 1 - da / (p.tail * TAU));
        var ring = Math.exp(-Math.pow((c.d - p.radius) / 0.2, 2));
        return tail * tail * ring;
      }
    },
    {
      id: 'bounce', name: 'Bounce', defaults: base(0.65, 0.5),
      period: function (p) { return 1 / (p.speed * 0.35); },
      params: [
        { key: 'spread', label: 'Spread', min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct },
        { key: 'width', label: 'Thickness', min: 0.05, max: 0.5, step: 0.01, def: 0.18, fmt: pct }
      ],
      // Each column has a bright cell bouncing up and down.
      fn: function (c, t, p) {
        var pos = Math.abs(frac(t * p.speed * 0.35 + c.colRnd * p.spread) * 2 - 1);
        var x = (c.vy - pos) / p.width;
        return Math.exp(-x * x);
      }
    },
    {
      id: 'glitch', name: 'Glitch', defaults: base(0.7, 0.3),
      period: function (p) { return 2 / p.speed; },
      params: [{ key: 'amount', label: 'Amount', min: 0.02, max: 0.9, step: 0.01, def: 0.25, fmt: pct }],
      // Cells flicker on and off in jumpy, random steps (16 steps, then it repeats).
      fn: function (c, t, p) {
        var step = Math.floor(t * p.speed * 8 + c.rnd * 5) % 16;
        return hash(step * 1.7 + c.col, c.row + step) > 1 - p.amount ? 1 : 0;
      }
    },
    {
      id: 'strobe', name: 'Strobe', defaults: base(0.75, 0.8),
      period: function (p) { return 1 / (p.speed * 1.5); },
      params: [{ key: 'duty', label: 'On time', min: 0.05, max: 0.9, step: 0.01, def: 0.3, fmt: pct }],
      fn: function (c, t, p) {
        return frac(t * p.speed * 1.5) < p.duty ? 1 : 0;
      }
    }
  ];

  // Slider ranges for the controls every preset shares.
  window.COMMON_PARAMS = {
    speed: { label: 'Speed', min: 0.1, max: 3, step: 0.05, fmt: function (v) { return v.toFixed(2) + '×'; } },
    size:  { label: 'Size',  min: 0.2, max: 1.2, step: 0.01, fmt: pct },
    glow:  { label: 'Glow',  min: 0,   max: 1,   step: 0.01, fmt: pct }
  };

  window.SWATCHES = ['#ef282d', '#ff8a1f', '#ffd23f', '#5cf08a', '#2de2e6', '#8f7bff', '#ff5fa2', '#f6efe3'];
})();
