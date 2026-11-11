// Hand-drawn charts on <canvas> (no chart library). devicePixelRatio aware.
(function () {
  const C = { green: "#00d35a", red: "#ff453a", orange: "#ff9f0a", blue: "#0a84ff", cyan: "#64d2ff", yellow: "#ffd60a",
    sec: "rgba(235,235,245,0.6)", ter: "rgba(235,235,245,0.3)", sep: "rgba(84,84,88,0.55)", card2: "#2c2c2e" };
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function pill(ctx, x, y, text, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "600 12px -apple-system, 'SF Pro Text', system-ui, sans-serif";
    const tw = ctx.measureText(text).width, ph = 20, pw = tw + 14;
    let px = Math.round(x - pw / 2);
    ctx.fillStyle = color;
    roundRect(ctx, px, y, pw, ph, 10); ctx.fill();
    ctx.fillStyle = color === C.yellow || color === C.green ? "#000" : "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 7, y + ph / 2 + 0.5);
    ctx.restore();
    return { x: px, w: pw };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- Home line chart: green line, gradient fill, dashed start line, marks that never overlap ----
  const lineState = new WeakMap();
  function line(canvas, data) {
    const st = lineState.get(canvas) || {};
    const prevN = st.n || 0;
    const n = (data.points || []).length;
    const animate = !reduced() && prevN > 1 && n === prevN + 1;
    const marksNew = (data.marks || []).length > (st.m || 0);
    lineState.set(canvas, { n, m: (data.marks || []).length });
    const t0 = performance.now();
    function frame(now) {
      const p = animate ? Math.min(1, (now - t0) / 250) : 1;
      const mp = marksNew && !reduced() ? Math.min(1, (now - t0) / 200) : 1;
      drawLine(canvas, data, p, mp);
      if (p < 1 || mp < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function drawLine(canvas, data, prog, markAlpha) {
    const { ctx, w, h } = setup(canvas);
    const pts = data.points || [];
    const start = data.start_value;
    const top = 44, bot = h - 14;
    if (pts.length < 2) {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
      const y = (top + bot) / 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.restore();
      return;
    }
    let lo = Infinity, hi = -Infinity;
    pts.forEach((p) => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    if (start != null) { lo = Math.min(lo, start); hi = Math.max(hi, start); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const t0 = pts[0][0];
    // slide-in: the newest point enters over 250ms
    const tLastPrev = pts[pts.length - 2][0], tLast = pts[pts.length - 1][0];
    const t1 = tLastPrev + (tLast - tLastPrev) * prog;
    const span = Math.max(1, t1 - t0);
    const X = (t) => ((t - t0) / span) * w;
    const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    const shown = pts.slice(0, -1).concat([[t1, pts[pts.length - 2][1] + (pts[pts.length - 1][1] - pts[pts.length - 2][1]) * prog]]);
    // gradient fill under the line
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, "rgba(0,211,90,0.28)"); g.addColorStop(1, "rgba(0,211,90,0)");
    ctx.beginPath(); shown.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.lineTo(X(shown[shown.length - 1][0]), bot); ctx.lineTo(X(shown[0][0]), bot); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    // dashed start line
    if (start != null) {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Y(start)); ctx.lineTo(w, Y(start)); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); shown.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    // marks above the line; a later mark that would overlap moves up a row
    const rows = [];
    const colors = { blue: C.blue, green: C.green, red: C.red };
    (data.marks || []).forEach((m) => {
      if (m.ts < t0 || m.ts > t1 + 1) return;
      const x = Math.min(w - 30, Math.max(30, X(m.ts)));
      let v = pts[0][1];
      for (const p of pts) { if (p[0] <= m.ts) v = p[1]; }
      ctx.font = "600 12px -apple-system, system-ui, sans-serif";
      const pw = ctx.measureText(m.text).width + 14;
      let row = 0;
      while ((rows[row] || []).some((r) => !(x + pw / 2 + 4 < r.a || x - pw / 2 - 4 > r.b))) row++;
      (rows[row] = rows[row] || []).push({ a: x - pw / 2, b: x + pw / 2 });
      const y = Math.max(2, Math.min(Y(v) - 28, top - 4) - row * 24);
      ctx.save(); ctx.globalAlpha = markAlpha; ctx.strokeStyle = colors[m.color] || C.sec; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(m.ts), y + 20); ctx.lineTo(X(m.ts), Y(v)); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(m.ts), Y(v), 3, 0, Math.PI * 2); ctx.fillStyle = colors[m.color] || C.sec; ctx.fill(); ctx.restore();
      pill(ctx, x, y, m.text, colors[m.color] || C.sec, markAlpha);
    });
  }

  // ---- Coin candles (1-minute OHLC from db.prices) + volume + orange dashed Risk line ----
  function candles(canvas, cs, opts) {
    const { ctx, w, h } = setup(canvas);
    opts = opts || {};
    const volH = 46, top = 16, bot = h - volH - 10;
    if (!cs || !cs.length) {
      ctx.fillStyle = C.sec; ctx.font = "15px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("No price polled yet", w / 2, h / 2); return;
    }
    const show = cs.slice(-60);
    let lo = Infinity, hi = -Infinity, vmax = 0;
    show.forEach((c) => { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); vmax = Math.max(vmax, c.v || 0); });
    (opts.lines || []).forEach((l) => { if (l.price) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); } });
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    const slot = (w - 16) / Math.max(show.length, 20);
    const bw = Math.max(2, slot * 0.62);
    show.forEach((c, i) => {
      const x = 8 + slot * i + slot / 2;
      const col = c.c >= c.o ? C.green : C.red;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
      if (vmax > 0 && c.v > 0) {
        ctx.globalAlpha = 0.45; const vh = (c.v / vmax) * volH;
        ctx.fillRect(x - bw / 2, h - vh, bw, vh); ctx.globalAlpha = 1;
      }
    });
    (opts.lines || []).forEach((l) => {
      if (!l.price) return;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = l.color || C.orange; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, Y(l.price)); ctx.lineTo(w, Y(l.price)); ctx.stroke(); ctx.restore();
      ctx.fillStyle = l.color || C.orange; ctx.font = "600 12px -apple-system, system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(l.label, 10, Y(l.price) - 6);
    });
  }

  // ---- Analyst score ring 0-100, green from min_score ----
  function ring(canvas, score, threshold) {
    const { ctx, w, h } = setup(canvas);
    const r = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.strokeStyle = C.card2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (score != null) {
      ctx.strokeStyle = score >= threshold ? C.green : C.yellow;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, score))) / 100); ctx.stroke();
    }
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 34px -apple-system, 'SF Pro Display', system-ui, sans-serif";
    ctx.fillText(score == null ? "–" : String(score), cx, cy);
  }

  window.DeskChart = { line, candles, ring, colors: C };
})();
