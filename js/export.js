/*
 * Export: turns the current drawing + animation into a self-contained web component.
 *
 *   DotExport.build(snapshot, opts) -> { tag, script, snippet, html, llm }
 *
 * The output has no dependencies. It reuses the editor's own engine functions (js/engine.js)
 * and the chosen preset's function, so the exported animation matches the editor.
 */
(function () {
  var E = window.DotEngine;

  // Runs in the exported page. Defines the custom element. E = engine functions (see build()).
  // Must stay self-contained: only DATA, presetFn, E and built-ins.
  function boot(tag, DATA, presetFn, E) {
    if (customElements.get(tag)) return;

    var cells = [];
    DATA.runs.forEach(function (row) {
      row[1].forEach(function (run) {
        for (var i = 0; i < run[1]; i++) cells.push([run[0] + i, row[0]]);
      });
    });
    var list = E.buildList(cells);
    var T = DATA.period;
    var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    customElements.define(tag, class extends HTMLElement {
      static get observedAttributes() { return ['paused', 'interaction']; }

      constructor() {
        super();
        var root = this.attachShadow({ mode: 'open' });
        root.innerHTML =
          '<style>:host{display:block;width:100%;aspect-ratio:' + DATA.w + '/' + DATA.h + '}' +
          'canvas{display:block;width:100%;height:100%}</style><canvas></canvas>';
        var cv = root.querySelector('canvas');
        cv.width = DATA.w; cv.height = DATA.h;
        this._ctx = cv.getContext('2d');
        if (DATA.grid) {
          this._idle = document.createElement('canvas');
          this._idle.width = DATA.w; this._idle.height = DATA.h;
          E.drawIdle(this._idle.getContext('2d'), DATA.gridCols, DATA.gridRows, DATA.geo, DATA.gridVis);
        }
        this._tl = E.makeTimeline(DATA.mode);
        this._raf = 0; this._last = 0; this._visible = true; this._forced = null;
        this._frame = this._frame.bind(this);
      }

      _mode() {
        var m = this.getAttribute('interaction');
        return m === 'auto' || m === 'hover' || m === 'click' ? m : DATA.mode;
      }

      _setMode() {
        E.tlSetMode(this._tl, this._mode());
        var click = this._tl.mode === 'click';
        this.style.cursor = click ? 'pointer' : '';
        if (click && !this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      }

      connectedCallback() {
        var self = this, tl = this._tl;
        this._setMode();
        this.addEventListener('pointerenter', this._onEnter = function () {
          if (tl.mode === 'hover') { E.tlStart(tl); self._update(); }
        });
        this.addEventListener('pointerleave', this._onLeave = function () {
          if (tl.mode === 'hover') { E.tlStop(tl); self._update(); }
        });
        this.addEventListener('click', this._onClick = function () {
          if (tl.mode === 'click') { E.tlTrigger(tl, T); self._update(); }
        });
        this.addEventListener('keydown', this._onKey = function (e) {
          if (tl.mode === 'click' && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); E.tlTrigger(tl, T); self._update();
          }
        });
        if ('IntersectionObserver' in window) {
          this._io = new IntersectionObserver(function (entries) {
            self._visible = entries[entries.length - 1].isIntersecting;
            self._update();
          });
          this._io.observe(this);
        }
        this._update();
      }

      disconnectedCallback() {
        if (this._io) this._io.disconnect();
        this.removeEventListener('pointerenter', this._onEnter);
        this.removeEventListener('pointerleave', this._onLeave);
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKey);
        cancelAnimationFrame(this._raf); this._raf = 0;
      }

      attributeChangedCallback(name) {
        if (name === 'interaction' && this.isConnected) this._setMode();
        if (this.isConnected) this._update();
      }

      // Auto: resume. Hover / Click: play one cycle.
      play() {
        this._forced = 'play';
        if (this._tl.mode === 'auto') E.tlStart(this._tl); else E.tlTrigger(this._tl, T);
        this._update();
      }
      pause() { this._forced = 'pause'; this._update(); }

      _running() {
        return this._tl.running && this.isConnected && this._visible &&
          !this.hasAttribute('paused') && this._forced !== 'pause' &&
          (!reduceMotion || this._forced === 'play');
      }

      _update() {
        if (this._running()) {
          if (!this._raf) { this._last = 0; this._raf = requestAnimationFrame(this._frame); }
        } else {
          cancelAnimationFrame(this._raf); this._raf = 0;
          this._draw();
        }
      }

      _frame(now) {
        this._raf = 0;
        if (this._last) E.tlAdvance(this._tl, Math.min((now - this._last) / 1000, 0.1), T);
        this._last = now;
        this._draw();
        if (this._running()) this._raf = requestAnimationFrame(this._frame);
      }

      _draw() {
        var ctx = this._ctx, t = this._tl.t, ph = this._tl.ph;
        // reduced motion: show a pleasant still frame instead of animating
        if (reduceMotion && this._forced !== 'play') { t = DATA.still; ph = t / T; }
        if (DATA.bg) { ctx.fillStyle = DATA.bg; ctx.fillRect(0, 0, DATA.w, DATA.h); }
        else ctx.clearRect(0, 0, DATA.w, DATA.h);
        if (this._idle) ctx.drawImage(this._idle, 0, 0);
        E.drawCells(ctx, list, presetFn, DATA.p, DATA.color, t, ph, DATA.geo, false);
      }
    });
  }

  // Cells -> rows of [startCol, length] runs, compact for big fills.
  function encode(cells) {
    var byRow = {};
    cells.forEach(function (c) { (byRow[c[1]] = byRow[c[1]] || []).push(c[0]); });
    return Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; }).map(function (r) {
      var cs = byRow[r].sort(function (a, b) { return a - b; }), runs = [], start = cs[0], len = 1;
      for (var i = 1; i < cs.length; i++) {
        if (cs[i] === cs[i - 1] + 1) len++;
        else { runs.push([start, len]); start = cs[i]; len = 1; }
      }
      runs.push([start, len]);
      return [r, runs];
    });
  }

  // Short stable id so several different exports can live on one page.
  function shortId(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36).slice(0, 6);
  }

  var INTERACTION_TEXT = {
    auto: 'Auto: the animation loops continuously.',
    hover: 'Hover: the animation plays while the pointer is over it and stops immediately when the pointer leaves, returning to its first frame.',
    click: 'Click: each click (or Enter / Space when focused) plays the animation for one cycle, then it rests on its first frame.'
  };

  function describeColor(c) {
    return c.mode === 'solid' ? 'solid ' + c.hex : c.mode.charAt(0).toUpperCase() + c.mode.slice(1) + ' palette';
  }

  // snapshot: { cells, art:{w,h}, cols, rows, geo:{ox,oy,cell}, preset, values, color, interaction, period }
  // opts: { bg: 'dark' | 'transparent', grid: boolean }
  function build(snapshot, opts) {
    var data = {
      w: snapshot.art.w, h: snapshot.art.h,
      gridCols: snapshot.cols, gridRows: snapshot.rows, geo: snapshot.geo,
      p: snapshot.values,
      color: { mode: snapshot.color.mode, hex: snapshot.color.hex, steps: snapshot.color.steps || 12, cycle: snapshot.color.cycle === undefined ? 1 : snapshot.color.cycle },
      bg: opts.bg === 'dark' ? '#0b0b0a' : null,
      grid: !!opts.grid, gridVis: snapshot.gridVis === undefined ? 0.35 : snapshot.gridVis,
      period: snapshot.period, mode: snapshot.interaction, still: snapshot.period * 0.35,
      runs: encode(snapshot.cells)
    };

    var json = JSON.stringify(data);
    var tag = 'dot-mania-' + shortId(json);

    var fns = ['hash', 'gradient', 'colorFor', 'buildList', 'dot', 'drawCells', 'drawIdle',
      'makeTimeline', 'tlSetMode', 'tlAdvance', 'tlStart', 'tlStop', 'tlTrigger'];
    var parts = [
      'var TAU=Math.PI*2;',
      'function frac(x){return x-Math.floor(x);}',
      'var STOPS=' + JSON.stringify(E.STOPS) + ';'
    ].concat(fns.map(function (n) { return E[n].toString(); }), [
      'var presetFn=' + snapshot.preset.fn.toString() + ';',
      'var DATA=' + json + ';',
      '(' + boot.toString() + ')(' + JSON.stringify(tag) + ',DATA,presetFn,{' +
        fns.map(function (n) { return n + ':' + n; }).join(',') + '});'
    ]);
    var script = ('(function(){\n' + parts.join('\n') + '\n})();').replace(/<\//g, '<\\/');
    var snippet = '<' + tag + '></' + tag + '>\n<script>\n' + script + '\n</script>';

    var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Dot Mania</title>\n' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e0e}' +
      tag + '{width:min(960px,92vw)}</style>\n</head>\n<body>\n' + snippet + '\n</body>\n</html>\n';

    var llm = [
      'Add an animated dot-grid component to my website.',
      '',
      'It is a dependency-free web component (custom element <' + tag + '>) that draws on a <canvas> inside a shadow root.',
      'Paste the snippet at the bottom where it should appear. No build step or packages are needed.',
      '',
      'Design',
      '- Canvas: ' + data.w + ' x ' + data.h + ' (fixed aspect ratio; it scales to its container)',
      '- Animation: ' + snapshot.preset.name + ', one seamless loop is about ' + snapshot.period.toFixed(1) + 's',
      '- Mark shape: ' + (snapshot.geo.shape || 'dot'),
      '- Color: ' + describeColor(snapshot.color),
      '- Background: ' + (data.bg ? 'solid dark (' + data.bg + ')' : 'transparent'),
      '- Interaction: ' + INTERACTION_TEXT[snapshot.interaction],
      '',
      'Usage',
      '- Size it with CSS, e.g. ' + tag + ' { width: 100%; max-width: 960px; }. Its height follows the aspect ratio.',
      '- Attributes: paused (freezes it), interaction="auto|hover|click" (overrides the default above).',
      '- Methods: element.play() (resumes in auto, plays one cycle in hover/click) and element.pause().',
      '- It pauses when scrolled out of view and shows a still frame when the visitor prefers reduced motion.',
      '- The script defines the element once, so it is safe to include more than once.',
      '',
      'If I am using a framework (React, Vue, Svelte, Astro, ...), put the <script> contents in a client-side module or effect',
      'and render the custom element tag in the template. Do not change the animation code itself.',
      '',
      'Code',
      '```html',
      snippet,
      '```'
    ].join('\n');

    return { tag: tag, script: script, snippet: snippet, html: html, llm: llm };
  }

  window.DotExport = { build: build };
})();
