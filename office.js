// Desk floor: a dark, minimalist virtual office. 5 cute blob agents at desks with monitors, a wall screen with a
// live candle chart, plants, and the 5 copied traders on top. Inline SVG + CSS only, no external assets.
// States: work (typing), win (celebrating), alert (red "!"), idle (sleeping). prefers-reduced-motion = static.
(() => {
  "use strict";
  const AG = [
    { n: "scanner", name: "Scanner", c: "#64d2ff", d: "#3aa9d6", acc: "antenna" },
    { n: "auditor", name: "Auditor", c: "#0a84ff", d: "#0866c4", acc: "glasses" },
    { n: "analyst", name: "Analista", c: "#ffd60a", d: "#d9b300", acc: "bow" },
    { n: "executor", name: "Executor", c: "#00d35a", d: "#00a847", acc: "headset" },
    { n: "risk", name: "Risk", c: "#ff6b9a", d: "#d9507c", acc: "helmet" },
  ];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function acc(a) {
    if (a.acc === "antenna") return `<path d="M30 9 V3" stroke="${a.d}" stroke-width="1.6"/><circle cx="30" cy="2.5" r="2.2" fill="#fff"/>`;
    if (a.acc === "glasses") return `<g stroke="#fff" stroke-width="1" fill="rgba(255,255,255,.18)"><circle cx="25" cy="20" r="3.6"/><circle cx="35" cy="20" r="3.6"/><path d="M28.6 20h2.8"/></g>`;
    if (a.acc === "bow") return `<path d="M36 8 l5 -3 v6 z M36 8 l-5 -3 v6 z" fill="#ff6b9a"/><circle cx="36" cy="8" r="1.4" fill="#ff6b9a"/>`;
    if (a.acc === "headset") return `<path d="M15 21 Q15 6 30 6 Q45 6 45 21" fill="none" stroke="#2c2c2e" stroke-width="2.2"/><rect x="43" y="18" width="4.5" height="7" rx="2" fill="#2c2c2e"/>`;
    return `<path d="M14 15 Q30 -2 46 15 Z" fill="#ff9f0a"/><rect x="13" y="13.5" width="34" height="3" rx="1.5" fill="#ff9f0a"/>`;
  }
  function blob(a) {
    return `<svg class="chr" viewBox="0 0 60 64" aria-hidden="true">
      <g class="fx-stars"><path d="M6 8l1.4 2.8 3 .4-2.2 2 .5 3-2.7-1.4-2.7 1.4.5-3-2.2-2 3-.4z" fill="#ffd60a"/><path d="M53 4l1.1 2.2 2.4.4-1.7 1.6.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.6 2.4-.4z" fill="#00d35a"/></g>
      <g class="fx-zzz" fill="rgba(235,235,245,.65)" font-size="8" font-weight="700" font-family="sans-serif"><text x="44" y="12">z</text><text x="49" y="6" font-size="6">z</text></g>
      <g class="body">
        <path d="M12 38 Q10 10 30 9 Q50 10 48 38 Q47 44 30 44 Q13 44 12 38Z" fill="${a.c}"/>
        <path d="M14 36 Q30 41 46 36 Q46 43 30 43.5 Q14 43 14 36Z" fill="${a.d}" opacity=".5"/>
        <g class="head">
          <ellipse cx="22" cy="27" rx="2.4" ry="1.4" fill="#fff" opacity=".35"/><ellipse cx="38" cy="27" rx="2.4" ry="1.4" fill="#fff" opacity=".35"/>
          <g class="eyes-open"><circle cx="25" cy="20.5" r="2.6" fill="#fff"/><circle cx="35" cy="20.5" r="2.6" fill="#fff"/>
            <circle cx="25.6" cy="21" r="1.4" fill="#111"/><circle cx="35.6" cy="21" r="1.4" fill="#111"/></g>
          <g class="eyes-shut" stroke="#111" stroke-width="1.4" stroke-linecap="round"><path d="M22.5 21.5h5M32.5 21.5h5"/></g>
          <path class="mouth" d="M27.5 26.5 Q30 28.5 32.5 26.5" stroke="#111" stroke-width="1.3" fill="none" stroke-linecap="round"/>
          <ellipse class="mouth-o" cx="30" cy="27.5" rx="2" ry="2.3" fill="#111"/>
          ${acc(a)}
        </g>
        <g class="arm-l"><ellipse cx="13" cy="40" rx="4" ry="3" fill="${a.c}"/></g>
        <g class="arm-r"><ellipse cx="47" cy="40" rx="4" ry="3" fill="${a.c}"/></g>
      </g>
      <rect x="1" y="42" width="58" height="6" rx="2" fill="#2a2a2e"/>
      <rect x="1" y="47" width="58" height="13" rx="2" fill="#1d1d20"/>
      <g class="pc"><rect x="19" y="30" width="22" height="13" rx="2" fill="#111" stroke="#3a3a3c" stroke-width=".8"/>
        <rect class="screen" x="21" y="32" width="18" height="9" rx="1" fill="#0a84ff" opacity=".85"/>
        <path class="scr-line" d="M22 39 L26 36 L29 37.5 L33 34 L38 35" stroke="#fff" stroke-width=".9" fill="none" opacity=".8"/></g>
      <g class="fx-alert"><circle cx="49" cy="10" r="6.5" fill="#ff453a"/><text x="49" y="14" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="sans-serif">!</text></g>
    </svg>`;
  }
  function wallChart() {
    // decorative candles on the wall screen (the real numbers live in the balance chart below)
    const c = [[6, 20, 26, 1], [12, 18, 24, 1], [18, 22, 27, 0], [24, 16, 23, 1], [30, 12, 19, 1], [36, 14, 20, 0], [42, 9, 16, 1], [48, 6, 12, 1], [54, 8, 13, 0], [60, 4, 10, 1]];
    return `<svg class="wall-chart" viewBox="0 0 66 32" preserveAspectRatio="none">${c.map(([x, a, b, up], i) =>
      `<g class="cd" style="animation-delay:${i * 0.18}s"><path d="M${x} ${a - 2}V${b + 2}" stroke="${up ? "#3dff88" : "#ff5a6a"}" stroke-width=".7"/><rect x="${x - 1.6}" y="${a}" width="3.2" height="${b - a}" fill="${up ? "#3dff88" : "#ff5a6a"}"/></g>`).join("")}</svg>`;
  }
  function build(el) {
    el.innerHTML = `<div class="floor-scene">
        <div class="tr-row" id="tr-row"></div>
        <div class="wall">
          <div class="plant p1"><i></i></div>
          <div class="wall-screen">${wallChart()}</div>
          <div class="plant p2"><i></i></div>
        </div>
        <div class="desks">${AG.map((a) => `<div class="desk-slot" data-agent="${a.n}" data-st="idle">
            <div class="bubble"><span class="say"></span></div>${blob(a)}<div class="nm">${a.name}</div></div>`).join("")}</div>
      </div>`;
  }
  window.DeskOffice = {
    render(el, office, traders) {
      if (!el) return;
      if (!el.querySelector(".floor-scene")) build(el);
      AG.forEach((a) => {
        const s = (office && office[a.n]) || { state: "idle", say: "" };
        const slot = el.querySelector(`.desk-slot[data-agent="${a.n}"]`);
        if (!slot) return;
        if (slot.dataset.st !== s.state) slot.dataset.st = s.state;
        slot.classList.toggle("show", !!s.show);
        const say = slot.querySelector(".say");
        const txt = s.state === "idle" && !s.show ? "" : s.say || "";
        if (say.textContent !== txt) say.textContent = txt;
      });
      const row = el.querySelector("#tr-row");
      const tr = traders || [];
      const byCoin = tr.some((t) => (t.chosen_for || []).length);
      const fx = tr.some((t) => t.data_src === "focus");
      const act = tr.filter((t) => !t.paused && (t.bench || "active") === "active");
      const h = (fx || (document.body.classList.contains("fx") && !tr.length)) ? "" // research/focus: names live in the status card
        : byCoin ? ["BTC", "ETH", "SOL", "XRP"].map((c) => `<span class="tr-av coin" title="${c}"><b>${c}</b><i>${tr.filter((t) => !t.paused && (t.chosen_for || []).includes(c)).length}</i></span>`).join("") + `<span class="tr-lbl">${tr.filter((t) => !t.paused).length} traders</span>`
        : tr.length ? tr.map((t) => `<span class="tr-av ${t.paused ? "off" : ""}" title="${esc(t.label)}"><b>${t.rank}</b></span>`).join("") + `<span class="tr-lbl">copiando a ${tr.filter((t) => !t.paused).length} traders</span>`
        : `<span class="tr-lbl">eligiendo traders…</span>`;
      if (row._h !== h) { row.innerHTML = h; row._h = h; }
    },
    AG,
  };
})();
