/*
 * Small, dependency-free GIF89a encoder, tuned for this app's content (soft glowing dots on a dark field).
 *
 * Keeping files small (tens to a few hundred KB):
 *  - renders the whole artboard (never crops to the drawing) and scales it down
 *  - one adaptive, deliberately small palette built by median cut over the whole animation
 *  - frame differencing: each frame stores only the rectangle that changed
 *  - slightly lossy: a pixel whose new colour is nearly the colour already on screen is left alone
 *  - few frames per second (dots move smoothly enough at ~14 fps)
 *
 * Transparent background ("Clear"): GIF only has 1-bit transparency, so a pixel is either drawn or
 * not. Anything with a little ink in it is drawn, with its colour blended onto the dark editor tone
 * (so dim dots stay visible, exactly like the dark preview) and only empty space stays transparent.
 * Soft glow halos and anti-aliased edges become hard-edged. Those frames are stored whole, with
 * "restore to background" between frames.
 *
 *   DotGif.encode(opts)            low level: draw(ctx, i, frames) paints each frame (delay: number or fn(i))
 *   DotGif.encodeAnimation(opts)   what the app calls: scales and renders the animation
 *   both return Promise<Blob>
 */
(function () {

  /* ---------- Palette ---------- */

  // hist / sums are indexed by a 15-bit colour key (5 bits per channel); sums hold the real 8-bit totals.
  function medianCut(hist, sr, sg, sb, max) {
    var keys = [], k;
    for (k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
    if (!keys.length) return [[0, 0, 0]];

    function chan(key, axis) { return axis === 0 ? key >> 10 : axis === 1 ? (key >> 5) & 31 : key & 31; }
    function makeBox(ks) {
      var lo = [31, 31, 31], hi = [0, 0, 0], pop = 0;
      for (var i = 0; i < ks.length; i++) {
        pop += hist[ks[i]];
        for (var a = 0; a < 3; a++) {
          var v = chan(ks[i], a);
          if (v < lo[a]) lo[a] = v;
          if (v > hi[a]) hi[a] = v;
        }
      }
      return { ks: ks, pop: pop, range: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
    }

    var boxes = [makeBox(keys)];
    while (boxes.length < max) {
      var bi = -1, best = 0, i;
      for (i = 0; i < boxes.length; i++) {
        if (boxes[i].ks.length > 1 && boxes[i].pop > best) { best = boxes[i].pop; bi = i; }
      }
      if (bi < 0) break;
      var box = boxes[bi], r = box.range;
      var axis = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2;
      box.ks.sort(function (a, b) { return chan(a, axis) - chan(b, axis); });
      var half = box.pop / 2, acc = 0, cut = 1;
      for (i = 0; i < box.ks.length; i++) {
        acc += hist[box.ks[i]];
        if (acc >= half) { cut = i + 1; break; }
      }
      if (cut >= box.ks.length) cut = box.ks.length - 1;
      boxes.splice(bi, 1, makeBox(box.ks.slice(0, cut)), makeBox(box.ks.slice(cut)));
    }

    return boxes.map(function (b) {
      var n = 0, r = 0, g = 0, bl = 0;
      for (var i = 0; i < b.ks.length; i++) {
        var key = b.ks[i];
        n += hist[key]; r += sr[key]; g += sg[key]; bl += sb[key];
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }

  /* ---------- LZW ---------- */

  var TBL = new Int32Array(1 << 20), GEN = new Uint32Array(1 << 20), gen = 0;

  function ByteWriter() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  ByteWriter.prototype.ensure = function (extra) {
    if (this.n + extra <= this.buf.length) return;
    var nb = new Uint8Array(Math.max(this.buf.length * 2, this.n + extra));
    nb.set(this.buf); this.buf = nb;
  };
  ByteWriter.prototype.byte = function (b) { this.ensure(1); this.buf[this.n++] = b; };
  ByteWriter.prototype.u16 = function (v) { this.byte(v & 255); this.byte(v >> 8); };
  ByteWriter.prototype.ascii = function (s) { for (var i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); };
  ByteWriter.prototype.result = function () { return this.buf.subarray(0, this.n); };

  // Writes GIF-style LZW image data (with sub-blocks and terminator) for pix[0..n).
  function lzw(pix, n, out, minCode) {
    var clear = 1 << minCode, eoi = clear + 1, next = eoi + 1, size = minCode + 1;
    var cur = 0, shift = 0, blk = new Uint8Array(255), bl = 0;
    gen++;

    function flush() {
      if (!bl) return;
      out.byte(bl);
      out.ensure(bl);
      out.buf.set(blk.subarray(0, bl), out.n);
      out.n += bl;
      bl = 0;
    }
    function put(code) {
      cur |= code << shift;
      shift += size;
      while (shift >= 8) {
        blk[bl++] = cur & 255;
        cur >>>= 8;
        shift -= 8;
        if (bl === 255) flush();
      }
    }

    out.byte(minCode);
    put(clear);
    var prefix = pix[0];
    for (var i = 1; i < n; i++) {
      var k = pix[i], key = (prefix << 8) | k;
      if (GEN[key] === gen) { prefix = TBL[key]; continue; }
      put(prefix);
      if (next === 4096) {
        put(clear);
        next = eoi + 1; size = minCode + 1; gen++;
      } else {
        if (next >= (1 << size)) size++;
        TBL[key] = next++; GEN[key] = gen;
      }
      prefix = k;
    }
    put(prefix);
    put(eoi);
    if (shift > 0) blk[bl++] = cur & 255;
    flush();
    out.byte(0);
  }

  /* ---------- Encoder ---------- */

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // o: { width, height, frames, delay (centiseconds per frame, or a function of the frame index), draw(ctx, i, frames),
  //      colors (max palette size, default 255), tolerance (lossy colour distance, default 0),
  //      transparent (bool), matte ([r,g,b] blended under partly transparent pixels), alphaCut (0-255) }
  function encode(o) {
    var W = o.width, H = o.height, N = o.frames, delay = o.delay;
    var transparent = !!o.transparent, tol2 = (o.tolerance || 0) * (o.tolerance || 0);
    var matte = o.matte || [11, 11, 10], cut = o.alphaCut === undefined ? 38 : o.alphaCut;
    var wanted = Math.max(2, Math.min(255, o.colors || 255));
    var bits = 2;
    while ((1 << bits) < wanted + 1) bits++;                 // palette + one slot for "transparent"
    var tableSize = 1 << bits, TRANS = tableSize - 1;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    var hist = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    var i, p;

    return (async function () {
      // Pass 1: gather colours from every frame to build one good palette.
      for (i = 0; i < N; i++) {
        o.draw(ctx, i, N);
        var d = ctx.getImageData(0, 0, W, H).data;
        for (p = 0; p < d.length; p += 4) {
          var r = d[p], g = d[p + 1], b = d[p + 2], a = d[p + 3];
          if (transparent) {
            if (a < cut) continue;
            if (a < 255) { var k0 = a / 255; r = r * k0 + matte[0] * (1 - k0); g = g * k0 + matte[1] * (1 - k0); b = b * k0 + matte[2] * (1 - k0); }
          }
          var key = (((r + 0.5) >> 3) << 10) | (((g + 0.5) >> 3) << 5) | ((b + 0.5) >> 3);
          hist[key]++; sr[key] += r; sg[key] += g; sb[key] += b;
        }
        await tick();
      }
      var palette = medianCut(hist, sr, sg, sb, TRANS);       // at most TRANS colours

      // Colour key -> palette index, filled in lazily.
      var map = new Int16Array(32768).fill(-1);
      function lookup(key, r, g, b) {
        var m = map[key];
        if (m >= 0) return m;
        var best = 0, bd = Infinity;
        for (var q = 0; q < palette.length; q++) {
          var dr = palette[q][0] - r, dg = palette[q][1] - g, db = palette[q][2] - b, dist = dr * dr + dg * dg + db * db;
          if (dist < bd) { bd = dist; best = q; }
        }
        map[key] = best;
        return best;
      }
      function near(a, b) {
        var pa = palette[a], pb = palette[b], dr = pa[0] - pb[0], dg = pa[1] - pb[1], db = pa[2] - pb[2];
        return dr * dr + dg * dg + db * db <= tol2;
      }

      var out = new ByteWriter();
      out.ascii('GIF89a');
      out.u16(W); out.u16(H);
      out.byte(0xF0 | (bits - 1)); out.byte(0); out.byte(0);   // global palette of 2^bits entries
      for (i = 0; i < tableSize; i++) {
        var c = palette[i] || [0, 0, 0];
        out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
      }
      out.byte(0x21); out.byte(0xFF); out.byte(11); out.ascii('NETSCAPE2.0');
      out.byte(3); out.byte(1); out.u16(0); out.byte(0);      // loop forever
      var gce = transparent ? 0x09 : 0x05;                    // disposal 2 (restore) or 1 (keep) + transparent flag

      // Pass 2: render again, quantise, store only what is needed.
      var shown = null, cur = new Uint8Array(W * H);          // shown = what a viewer currently sees
      for (i = 0; i < N; i++) {
        o.draw(ctx, i, N);
        var px = ctx.getImageData(0, 0, W, H).data;
        for (p = 0; p < cur.length; p++) {
          var j = p * 4, rr = px[j], gg = px[j + 1], bb = px[j + 2], aa = px[j + 3];
          if (transparent) {
            if (aa < cut) { cur[p] = TRANS; continue; }
            if (aa < 255) { var k1 = aa / 255; rr = rr * k1 + matte[0] * (1 - k1); gg = gg * k1 + matte[1] * (1 - k1); bb = bb * k1 + matte[2] * (1 - k1); }
          }
          cur[p] = lookup((((rr + 0.5) >> 3) << 10) | (((gg + 0.5) >> 3) << 5) | ((bb + 0.5) >> 3), rr, gg, bb);
        }

        var x0 = 0, y0 = 0, w = W, h = H, frame = cur, x, y, idx;
        if (transparent) {
          // whole-frame images, cropped to the visible pixels
          var tx0 = W, ty0 = H, tx1 = -1, ty1 = -1;
          for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
            if (cur[y * W + x] !== TRANS) {
              if (x < tx0) tx0 = x;
              if (x > tx1) tx1 = x;
              if (y < ty0) ty0 = y;
              if (y > ty1) ty1 = y;
            }
          }
          if (tx1 < 0) { tx0 = 0; ty0 = 0; tx1 = 0; ty1 = 0; }
          x0 = tx0; y0 = ty0; w = tx1 - tx0 + 1; h = ty1 - ty0 + 1;
          frame = new Uint8Array(w * h);
          for (y = 0; y < h; y++) for (x = 0; x < w; x++) frame[y * w + x] = cur[(y0 + y) * W + x0 + x];
        } else if (shown) {
          // keep only pixels whose colour visibly changed; the rest become transparent (= leave as is)
          var minX = W, minY = H, maxX = -1, maxY = -1, changed = new Uint8Array(W * H);
          for (y = 0; y < H; y++) {
            for (x = 0; x < W; x++) {
              idx = y * W + x;
              if (cur[idx] !== shown[idx] && !(tol2 && near(cur[idx], shown[idx]))) {
                changed[idx] = 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < 0) { minX = 0; minY = 0; maxX = 0; maxY = 0; }       // nothing changed: 1px transparent frame
          x0 = minX; y0 = minY; w = maxX - minX + 1; h = maxY - minY + 1;
          frame = new Uint8Array(w * h);
          for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
              idx = (y0 + y) * W + (x0 + x);
              if (changed[idx]) { frame[y * w + x] = cur[idx]; shown[idx] = cur[idx]; }
              else frame[y * w + x] = TRANS;
            }
          }
        }
        if (!shown) shown = new Uint8Array(cur);                // first frame is stored in full

        out.byte(0x21); out.byte(0xF9); out.byte(4); out.byte(gce); out.u16(typeof delay === 'function' ? delay(i) : delay); out.byte(TRANS); out.byte(0);
        out.byte(0x2C); out.u16(x0); out.u16(y0); out.u16(w); out.u16(h); out.byte(0);
        lzw(frame, w * h, out, bits);
        await tick();
      }
      out.byte(0x3B);
      return new Blob([out.result()], { type: 'image/gif' });
    })();
  }

  /* ---------- Animation -> GIF ---------- */

  // o: { E (engine), layers ([{ list, fn, p, color, shape, k }]), T (loop seconds), secs (seconds to render),
  //      art: {w,h}, geo: {ox,oy,cell}, cols, rows, gridVis, transparent, bg, maxSide, fps, colors, tolerance }
  function encodeAnimation(o) {
    var E = o.E, geo = o.geo, cell = geo.cell, art = o.art;
    var i;
    // the whole artboard, so the GIF is the complete grid size, not just the part you drew on
    var x0 = 0, y0 = 0, x1 = art.w, y1 = art.h;
    var cw = x1 - x0, ch = y1 - y0;
    // Whole pixels per grid cell, so every dot is rasterised identically (no uneven dot sizes or wobble).
    var cellPx = Math.max(3, Math.floor(cell * Math.min(1, o.maxSide / Math.max(cw, ch))));
    var s = Math.min(1, cellPx / cell);
    var W = Math.max(1, Math.round(cw * s)), H = Math.max(1, Math.round(ch * s));

    var layer = null;
    if (!o.transparent && o.grid !== false) {
      layer = document.createElement('canvas');
      layer.width = art.w; layer.height = art.h;
      E.drawIdle(layer.getContext('2d'), o.cols, o.rows, geo, o.gridVis);
    }
    // Frame delays are whole hundredths of a second, so 30 fps (3.33 cs) alternates 3, 3, 4 cs and averages exactly 30.
    var fps = o.fps || (o.delay ? 100 / o.delay : 20);
    var frames = Math.max(8, Math.round(o.secs * fps));
    var delayOf = function (i) { return Math.round((i + 1) * 100 / fps) - Math.round(i * 100 / fps); };

    return encode({
      width: W, height: H, frames: frames, delay: delayOf, colors: o.colors, tolerance: o.tolerance, transparent: o.transparent,
      draw: function (c, idx) {
        var t = idx / frames * o.secs;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, W, H);
        c.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
        if (!o.transparent) {
          c.fillStyle = o.bg;
          c.fillRect(x0 - 2, y0 - 2, cw + 4, ch + 4);
          if (layer) c.drawImage(layer, x0, y0, cw, ch, x0, y0, cw, ch);
        }
        E.drawLayers(c, o.layers, t, t / o.T, geo, false);
      }
    });
  }

  window.DotGif = { encode: encode, encodeAnimation: encodeAnimation };
})();
