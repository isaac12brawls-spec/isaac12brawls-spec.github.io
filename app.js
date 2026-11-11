// Grok Desk Trading app. Plain JS, no framework, no build step.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- key: arrives once in the URL fragment, then lives in localStorage ----------
  const frag = new URLSearchParams(location.hash.slice(1));
  if (frag.get("t")) localStorage.setItem("desk_token", frag.get("t"));
  if (frag.get("d")) localStorage.setItem("desk_data", frag.get("d"));
  if (frag.get("t") || frag.get("d")) history.replaceState(null, "", location.pathname);
  // a key link opened again in the same tab is a same-document hash change: pick it up and reload
  window.addEventListener("hashchange", () => {
    const f = new URLSearchParams(location.hash.slice(1));
    if (f.get("t")) { localStorage.setItem("desk_token", f.get("t")); history.replaceState(null, "", location.pathname); location.reload(); }
  });
  const TOKEN = localStorage.getItem("desk_token");
  const DATA = localStorage.getItem("desk_data");
  // plan G = fixed GitHub Pages link: window.GHP is injected into index.html only in the published copy
  const GHP = window.GHP || null;
  const PLAN = TOKEN ? (GHP ? "G" : "A") : DATA ? "B" : null;

  // ---------- formatting ----------
  const usd = (v, d = 2) => (v == null ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big = (v) => v == null ? "n/a" : v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
  const price = (v) => {
    if (v == null) return "–";
    if (v >= 1) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const s = v.toPrecision(4); return "$" + (s.includes("e") ? Number(s).toFixed(12).replace(/0+$/, "") : s);
  };
  const pct = (v, d = 2) => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%");
  const hhmm = (ts) => new Date(ts * 1000).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtNum = (v) => (Number(v) === Math.round(v) ? String(Math.round(v)) : String(+Number(v).toFixed(4)));

  // ---------- data access (plan A: /api with the token; plan B: JSON files under the secret path) ----------
  let planBCache = {};
  // ---------- plan G: one AES-GCM file (key from the #t= token), read by commit SHA so it is never stale ----------
  const G = { key: null, sha: null, bundle: null, at: 0 };
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function gKey() {
    if (G.key) return G.key;
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(TOKEN), "PBKDF2", false, ["deriveKey"]);
    G.key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("grok-desk-ghp-v1"), iterations: 200000 },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return G.key;
  }
  async function gBundle() {
    if (G.bundle && Date.now() - G.at < 4000) return G.bundle;
    let sha = null;
    try {   // the browser revalidates with If-None-Match: unchanged = 304, which GitHub does not count
      const r = await fetch(`${GHP.api}/repos/${GHP.owner}/${GHP.repo}/git/ref/heads/${GHP.branch}`, { cache: "no-cache" });
      if (r.ok) sha = (await r.json()).object.sha;
    } catch (e) { /* rate limited or offline: fall back to the branch URL (CDN, up to 5 min old) */ }
    if (sha && sha === G.sha && G.bundle) { G.at = Date.now(); return G.bundle; }
    const url = `${GHP.raw}/${GHP.owner}/${GHP.repo}/${sha || GHP.branch}/${GHP.file}` + (sha ? "" : "?_=" + Math.floor(Date.now() / 60000));
    const r = await fetch(url, { cache: sha ? "force-cache" : "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const env = await r.json();
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv), additionalData: new TextEncoder().encode("desk-v1") }, await gKey(), b64(env.ct)); }
    catch (e) { showAuthWall(); throw new Error("401"); }
    const txt = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    G.bundle = JSON.parse(txt); G.sha = sha; G.at = Date.now();
    return G.bundle;
  }
  async function getG(path) {
    const b = await gBundle();
    const m = path.match(/^\/(\w+)(?:\/([^?\/]+))?(?:\/(\w+))?(?:\?range=(\w+))?/);
    const kind = m[1], st = b.state;
    if (kind === "state") return st;
    if (kind === "chart") return b.chart[m[4] || "LIVE"];
    if (kind === "activity") return b.activity;
    if (kind === "coin") { const c = b.coins[m[2]]; if (!c) throw new Error("Esta moneda no está en el último resumen"); return c; }
    if (kind === "audit") { const c = b.coins[m[2]]; return c ? c.audit : { layers: [], empty: true }; }
    if (kind === "account") return st.account;
    if (kind === "settings") return { settings: st.settings_list };
    if (kind === "agents") return { rows: st.decisions[m[2]] || [], paused: st.agents[m[2]].paused };
    if (kind === "pushes") return b.pushes || { rows: [] };
    if (kind === "search") { const q = decodeURIComponent((path.split("q=")[1] || "")).toLowerCase(); return { rows: Object.values(b.coins).filter((c) => q && JSON.stringify([c.mint, c.name, c.symbol]).toLowerCase().includes(q)).slice(0, 20) }; }
    throw new Error("n/a");
  }
  // what to write in Telegram instead, when the page is read-only (plans B and G)
  function tgHint(path) {
    if (path === "/callback") return 'Para parar, toca "Parar" en el mensaje de Telegram o escríbele "parar" al bot.';
    if (path === "/seguir") return 'Para seguir, escríbele "seguir" al bot de Telegram.';
    const a = path.match(/^\/agents\/(\w+)\/(pause|resume)/); if (a) return `Escríbele "${a[2]} ${a[1]}" al bot de Telegram.`;
    if (path === "/mode") return 'Escríbele "paper" o "live" al bot de Telegram.';
    if (path === "/settings") return 'Los ajustes se cambian por Telegram, por ejemplo: "set stop to -8%".';
    return "Desde este enlace solo se mira. Los cambios se hacen por Telegram.";
  }
  async function get(path) {
    if (PLAN === "G") return getG(path);
    if (PLAN === "A") {
      const r = await fetch("/api" + path, { headers: { Authorization: "Bearer " + TOKEN, "X-Pinggy-No-Screen": "1" }, cache: "no-store" });
      if (r.status === 401) { showAuthWall(); throw new Error("401"); }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }
    const base = "/d/" + DATA + "/";
    const j = async (f) => { const r = await fetch(base + f + "?_=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
    const m = path.match(/^\/(\w+)(?:\/([^?\/]+))?(?:\/(\w+))?(?:\?range=(\w+))?/);
    const kind = m[1];
    if (kind === "state") return (planBCache.state = await j("state.json"));
    if (kind === "chart") { const c = await j("chart.json"); return c[m[4] || "LIVE"]; }
    if (kind === "activity") return j("activity.json");
    if (kind === "coin") return j("coin/" + m[2] + ".json");
    if (kind === "audit") { try { return (await j("coin/" + m[2] + ".json")).audit; } catch (e) { return { layers: [], empty: true }; } }
    const st = planBCache.state || (await j("state.json"));
    if (kind === "account") return st.account;
    if (kind === "settings") return { settings: st.settings_list };
    if (kind === "agents") return { rows: st.decisions[m[2]] || [], paused: st.agents[m[2]].paused };
    if (kind === "search") return { rows: [] };
    if (kind === "pushes") return { rows: [] };
    throw new Error("n/a");
  }
  async function post(path, body) {
    if (PLAN !== "A") { toast(tgHint(path)); const e = new Error(tgHint(path)); e.quiet = true; throw e; }
    const r = await fetch("/api" + path, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", "X-Pinggy-No-Screen": "1" }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.message || j.detail || "HTTP " + r.status);
    return j;
  }

  // ---------- state ----------
  const S = { state: null, chart: null, range: "LIVE", tab: "home", lastOk: 0, online: true, retryIn: 0, coin: null, audit: null, activityRows: [], nextBefore: null };
  window.DeskApp = { state: () => S.state };   // read-only view for the local Grok helper (assistant.js)

  function showAuthWall() { $("#authwall").hidden = false; }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }

  // ---------- error row: "Desk offline · retrying in {n}s · last update {time}" ----------
  function renderErr() {
    $$(".err-slot").forEach((el) => {
      if (S.online) { el.innerHTML = ""; return; }
      el.innerHTML = `<div class="err-row">Escritorio sin conexión · reintento en ${S.retryIn}s · última actualización ${S.lastOk ? hhmm(S.lastOk / 1000) : "nunca"}</div>`;
    });
  }
  function setOffline() {
    if (S.online) { S.online = false; S.retryIn = 5; }
    renderErr();
  }
  setInterval(() => { if (!S.online) { S.retryIn = Math.max(0, S.retryIn - 1); renderErr(); if (S.retryIn === 0) { S.retryIn = 5; refresh(); } } }, 1000);

  // ---------- odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left ----------
  function odo(el, text) {
    const prev = el.dataset.v || "";
    const sameShape = prev.length === text.length && [...prev].every((c, i) => /\d/.test(c) === /\d/.test(text[i]));
    if (!sameShape) {
      el.innerHTML = [...text].map((c) => /\d/.test(c)
        ? `<span class="d"><span class="col" style="transform:translateY(-${+c * 1.12}em);transition:none">${"0123456789".split("").map((x) => `<span>${x}</span>`).join("")}</span></span>`
        : `<span class="c">${esc(c)}</span>`).join("");
    } else {
      const spans = [...el.children];
      let k = 0;
      for (let i = text.length - 1; i >= 0; i--) {
        if (/\d/.test(text[i]) && text[i] !== prev[i]) {
          const col = spans[i].firstElementChild;
          col.style.transition = reduced() ? "none" : "";
          col.style.transitionDelay = reduced() ? "0ms" : k * 30 + "ms";
          col.style.transform = `translateY(-${+text[i] * 1.12}em)`;
          k++;
        }
      }
    }
    el.dataset.v = text;
  }

  // ---------- skeletons (loading state) ----------
  function skeletons() {
    $("#balance").innerHTML = `<span class="skb" style="width:240px;height:60px"></span>`;
    $("#today").innerHTML = `<span class="skb" style="width:80px;height:18px;display:inline-block"></span>`;
    $("#mult").classList.add("sk");
    $("#carousel").innerHTML = [1, 2].map(() => `<div class="acard sk"></div>`).join("");
    $("#home-activity").innerHTML = [1, 2, 3].map(() => `<div class="row"><span class="skb" style="width:36px;height:36px;border-radius:50%"></span><div class="mid"><span class="skb" style="width:60%;height:14px"></span><span class="skb" style="width:40%;height:12px;margin-top:6px"></span></div></div>`).join("");
    $("#agents-list").innerHTML = [1, 2, 3].map(() => `<div class="fcard skb" style="height:180px"></div>`).join("");
    $("#activity-list").innerHTML = $("#home-activity").innerHTML;
    $("#account-body").innerHTML = `<div class="group skb" style="height:140px"></div><div class="group skb" style="height:240px"></div>`;
  }

  // ---------- HOME ----------
  function paintEquity(el, v) {
    const s = usd(v);
    const i = s.lastIndexOf(".");
    const head = i >= 0 ? s.slice(0, i) : s, tail = i >= 0 ? s.slice(i) : "";
    if (!el.querySelector("#bal-int")) el.innerHTML = `<span id="bal-int" class="odo"></span><span class="cents" id="bal-cent"></span>`;
    odo(el.querySelector("#bal-int"), head);
    el.querySelector("#bal-cent").textContent = tail;
  }
  function renderHome() {
    const st = S.state; if (!st) return;
    const d = st.desk || {};
    $("#mult").classList.remove("sk");
    paintEquity($("#balance"), st.balance);
    const paper = st.mode === "PAPER";
    const ph = $("#paper-home"), live = $("#dash-live");
    if (ph) { ph.hidden = !paper; ph.textContent = "Práctica"; }
    if (live) { live.hidden = paper; live.textContent = "Live"; }
    $("#paper-coin").hidden = !paper;
    const pnl = d.today_pnl != null ? d.today_pnl : (st.balance - st.start_value);
    const t = $("#today"); t.textContent = (pnl >= 0 ? "+" : "") + usd(pnl) + " (" + pct(st.today_pct) + ")"; t.className = "num " + (st.today_pct >= 0 ? "up" : "down");
    $("#mult").textContent = (d.multiplier != null ? d.multiplier : st.multiplier).toFixed(2) + "×";
    const startLbl = usd(d.start_value != null ? d.start_value : st.start_value, 0);
    const when = d.night_label || "08:00";
    const auto = d.auto ? " · Automático" : "";
    const eq = $("#eq-label"); if (eq) eq.textContent = `Equity · ${startLbl} a las ${when}${auto}`;
    const wl = $("#wl"); if (wl) wl.textContent = `${d.wins || 0}W / ${d.losses || 0}L`;
    const rk = $("#open-risk");
    if (rk) {
      if (d.open_risk) { rk.hidden = false; rk.textContent = `-${d.open_risk.stop_pct}% · -${usd(d.open_risk.usd)}`; }
      else rk.hidden = true;
    }
    $("#bell-dot").hidden = !(st.unread > 0);
    const running = (d.agents && d.agents.length) || (Object.values(st.agents).filter((a) => !a.paused).length + 1);
    $("#running-n").textContent = running;
    if (window.DeskOffice && $("#office")) DeskOffice.render($("#office"), st.office, st.traders);
    renderTraders(st);
    renderAction(st);
    renderPush(); resyncPush();
    renderTicker(d);
    renderFocus(st);
    renderDeskCard(d);
    renderLogger(d);
    renderStats(d);
    $("#halt-slot").innerHTML = st.desk_halt ? `<div class="halt"><span>En pausa · ${esc(st.desk_halt.reason || "")}</span><button class="tap" id="seguir">Seguir</button></div>` : "";
    if ($("#details") && !$("#details").hidden) renderCarousel();
  }

  function tprice(v, sym) {
    if (v == null) return "—";
    if (sym === "BTC") return "$" + Math.round(v).toLocaleString("en-US");
    if (v >= 100) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price(v);
  }
  function big$(v) { return v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v); }
  function renderFocus(st) {
    const el = $("#focus-card"); if (!el) return;
    const f = st.focus;
    const sub = $("#dash-sub");
    if (!f) { el.innerHTML = ""; if (sub) sub.textContent = "BTC · ETH · SOL · XRP · práctica → real"; return; }
    if (sub) sub.textContent = `Solo ${f.symbol || f.name} · copiando a sus mejores traders`;
    const ch = (f.safety && f.safety.checks) || [];
    const okN = ch.filter((c) => c.ok).length;
    const safe = !ch.length ? `<span class="fc-s wait">seguridad: revisando…</span>`
      : f.safety.ok ? `<span class="fc-s ok">seguridad ${okN}/${ch.length} ✓</span>` : `<span class="fc-s bad">⚠ ${esc(f.safety.reason || "no segura")}</span>`;
    const team = f.team ? `${f.team_in ?? 0} de ${f.team} traders dentro` : "eligiendo traders…";
    const h = `<div class="focus-card tap" id="focus-open">
      <div class="fc-top"><span class="fc-av">${esc((f.symbol || "?")[0])}</span>
        <span class="fc-nm"><b>${esc(f.name)}</b> <span class="fc-tk">${esc(f.symbol || "")}</span><div class="fc-sub">Capitalización ${big$(f.mcap)} · precio ${tprice(f.price, f.symbol)}</div></span>
        <a class="fc-go tap" href="${esc(f.url)}" target="_blank" rel="noopener">Ver en FOMO</a></div>
      <div class="fc-row">${safe}<span class="fc-t">${esc(team)}</span></div>
      <div class="fc-note">Te aviso Comprar cuando la mayoría de sus traders top esté dentro y uno compre; Vender cuando la mayoría venda. Antes de cada Comprar reviso que no sea estafa.</div>
    </div>`;
    if (el._h !== h) { el.innerHTML = h; el._h = h; }
  }
  function renderTicker(d) {
    const el = $("#ticker"); if (!el) return;
    const rows = (d && d.tickers) || [];
    if (!rows.length) { el.innerHTML = `<div class="tick empty"><span class="tn">${S.state && S.state.focus ? esc(S.state.focus.symbol || "") : "BTC · ETH · SOL · XRP"}</span><span class="tp">esperando precios…</span></div>`; return; }
    el.innerHTML = rows.map((r) => {
      const ch = r.change_pct, cls = ch == null ? "" : ch >= 0 ? "up" : "down";
      const chs = ch == null ? "" : `<span class="tc ${cls}">${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%</span>`;
      return `<div class="tick ${esc(r.symbol)}"><span class="av">${esc(r.symbol[0])}</span><span class="tn">${esc(r.symbol)}</span><span class="tp">${tprice(r.price, r.symbol)}</span>${chs}</div>`;
    }).join("");
  }

  const AICO = {
    scanner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
    auditor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M8 6v14m8-14v14M4 10h16"/></svg>`,
    analyst: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>`,
    executor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
    risk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4.5v6.5c0 4.2-3.2 7.5-8 8.7C7.2 21 4 17.7 4 13.5V7.5z"/></svg>`,
    logger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5M8 13h8M8 17h6"/></svg>`,
  };
  function renderDeskCard(d) {
    const el = $("#desk-card"); if (!el) return;
    const rows = (d && d.agents) || [];
    const scanned = (d && d.scanned) || 0, traded = (d && d.traded) || 0, n = rows.length || 6;
    const sc = scanned >= 1000 ? (scanned / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(scanned);
    el.innerHTML = `<div class="desk-h">Desk · ${n} agentes<span class="r">${sc} revisados · ${traded} copias</span></div>` +
      (rows.length ? rows.map((a) => `<div class="arow" data-agent="${esc(a.id)}">
        <span class="aico ${esc(a.id)}">${AICO[a.id] || ""}</span>
        <span><div class="anm">${esc(a.name)}</div><div class="asub">${esc(a.sub || "")}</div></span>
        <span class="amid ${esc(a.mid_tone || "")}">${esc(a.mid || "—")}</span>
        <span class="aright ${esc(a.right_tone || "")}">${esc(a.right || "")}</span>
      </div>`).join("") : `<div class="empty">Esperando a los agentes…</div>`);
  }
  function renderLogger(d) {
    const el = $("#logger"), cnt = $("#log-count"); if (!el) return;
    const rows = ((d && d.log) || []).slice(0, 5);
    if (cnt) cnt.textContent = rows.length ? `${(d.log || []).length} eventos` : "";
    if (!rows.length) { el.innerHTML = `<div class="empty log-empty">Esperando actividad…</div>`; return; }
    el.innerHTML = rows.map((r) => {
      const ag = (r.agent || "logger").toLowerCase();
      const tone = r.tone || r.kind || "info";
      return `<div class="log-line"><i class="log-dot ${esc(tone)}"></i><span class="log-tm">${hhmm(r.ts)}</span>
        <span class="log-tx"><b class="${esc(ag)}">${esc(ag.toUpperCase())}:</b><span class="${esc(tone)}">${esc(r.text)}</span></span></div>`;
    }).join("");
  }
  function renderStats(d) {
    const el = $("#desk-stats"); if (!el) return;
    const rows = (d && d.stats) || [];
    if (!rows.length) { el.innerHTML = ""; return; }
    const max = Math.max(1, ...rows.map((r) => r.n || 0));
    const best = d.best != null ? `mejor ${d.best >= 0 ? "+" : ""}${usd(d.best)}` : "";
    const worst = d.worst != null ? `peor ${d.worst >= 0 ? "+" : ""}${usd(d.worst)}` : "";
    const right = [best, worst].filter(Boolean).join(" · ") || "sin copias cerradas";
    el.innerHTML = `<div class="stats-h">Esta noche<span class="r">${esc(right)}</span></div>
      <div class="stats-grid">${rows.map((r) => {
        const w = Math.round(100 * (r.n || 0) / max);
        return `<div class="srow"><div class="sl"><span>${esc(r.label)}</span><span class="sn ${r.n ? "" : "zero"}">${r.n || 0}</span></div>
          <div class="sbar"><i style="width:${w}%"></i></div></div>`;
      }).join("")}</div>`;
  }

  function renderAction(st) {
    const a = st.action;
    const el = $("#action");
    let h;
    if (!a) {
      const n = (st.traders || []).filter((r) => !r.paused).length;
      const r = st.agents.scanner.ranking;
      h = `<div class="act-card calm"><span class="ok">✓</span><span class="as">${r ? "Estoy eligiendo a los mejores traders. Tarda unos minutos." : n ? `Yo manejo tu presupuesto. Tú solo tocas el botón. ${st.focus ? `Te aviso cuando la mayoría de tus ${n} traders de ${esc(st.focus.symbol || st.focus.name)} compre o venda.` : `Te aviso cuando uno de tus ${n} traders compre o venda.`}` : "No tienes que hacer nada por ahora."}</span></div>`;
    } else {
      const btn = a.kind === "parar"
        ? `<button class="ab parar tap" data-cb="${esc(a.callback)}">Parar</button>`
        : `<a class="ab ${a.kind} tap" href="${esc(a.url)}" target="_blank" rel="noopener">${a.kind === "buy" ? "Comprar en FOMO" : "Vender en FOMO"}</a>`;
      h = `<div class="act-card"><div class="at">${esc(a.title)}</div>${a.sub ? `<div class="as">${esc(a.sub)}</div>` : ""}${btn}</div>`;
    }
    if (el._h !== h) { el.innerHTML = h; el._h = h; }
  }

  function renderTraders(st) {
    const rows = st.traders || [];
    const sc = st.agents.scanner;
    if (!rows.length) {
      const r = sc.ranking;
      $("#traders").innerHTML = `<div class="empty" style="padding:18px 14px;text-align:left">${r ? `Estudiando traders con datos reales… ${r.done}/${r.total || "…"}` : "Todavía no hay traders elegidos"}</div>`;
      $("#traders-note").textContent = "";
      return;
    }
    const fol = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : `${n}`;
    const hl = rows[0].data_src === "hyperliquid";
    const fx = rows[0].data_src === "focus";
    const roleOf = (r, c) => ((r.bench_for || {})[c]) || r.bench || "active";
    const row = (r, i, reserve) => `<div class="trow tk ${r.paused ? "paused" : ""} ${reserve ? "reserve" : ""}">
        <span class="rk">${i}</span>
        <span class="mid"><div class="t">${esc(r.name || r.label)}${r.handle ? ` <span class="hd">@${esc(r.handle)}</span>` : ""}</div>
        <div class="s">${r.paused ? "Apagado" : fx
          ? `${r.trades ?? 0} operaciones en ${esc(r.days != null ? String(r.days) : "?")} días · ${r.win_rate != null ? `${Math.round(r.win_rate * 100)}% de sus ventas con ganancia` : "todavía no vende"}${r.holding_usd ? ` · tiene ${usd(r.holding_usd, 0)}` : ""}`
          : hl
          ? `opera ${esc((r.coins || []).join(" · ") || "—")} · acierta ${Math.round((r.win_rate || 0) * 100)}% (${r.wins ?? 0} de ${r.closes ?? 0})`
          : `${r.trades ?? "?"} operaciones · ${r.days ? Math.round(r.days) : "?"} días · acierta ${Math.round(((r.kol_win_rate_30d ?? r.win_rate) || 0) * 100)}%`}</div>
        ${r.why ? `<div class="why">${esc(r.why)}</div>` : ""}</span>
        <span class="r ${(r.pnl_30d || 0) >= 0 ? "up" : "down"}">${(r.pnl_30d || 0) >= 0 ? "+" : ""}${usd(r.pnl_30d, 0)}<small>${fx ? `en ${esc((st.focus && st.focus.symbol) || "la moneda")}` : "30 días"}${r.pnl_7d != null ? ` · sem. ${(r.pnl_7d) >= 0 ? "+" : ""}${usd(r.pnl_7d, 0)}` : ""}</small></span>
        <button class="swwrap tap" data-trader="${esc(r.wallet)}" data-tp="${r.paused ? 1 : 0}" aria-label="pausar o seguir"><span class="sw ${r.paused ? "" : "on"}"></span></button></div>`;
    const NAMES = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP" };
    const fsym = (st.focus && (st.focus.symbol || st.focus.name)) || "la moneda";
    $("#traders").innerHTML = fx
      ? (() => {
          const act = rows.filter((r) => roleOf(r, "FOCUS") === "active"), res = rows.filter((r) => roleOf(r, "FOCUS") === "reserve");
          return `<div class="coin-h"><b>${esc(fsym)}</b> ${esc((st.focus && st.focus.name) || "")} <span>${act.length} en activo · ${res.length} en reserva</span></div>`
            + (act.length ? `<div class="coin-subh">En activo</div>` + act.map((r, i) => row(r, i + 1, false)).join("") : "")
            + (res.length ? `<div class="coin-subh">Reserva</div>` + res.map((r, i) => row(r, i + 1, true)).join("") : "");
        })()
      : hl
      ? ["BTC", "ETH", "SOL", "XRP"].map((c) => {
          const g = rows.filter((r) => (r.chosen_for || []).includes(c));
          const act = g.filter((r) => roleOf(r, c) === "active");
          const res = g.filter((r) => roleOf(r, c) === "reserve");
          const count = `${act.length} en activo · ${res.length} en reserva`;
          const body = (act.length ? `<div class="coin-subh">En activo</div>` + act.map((r, i) => row(r, i + 1, false)).join("") : `<div class="empty" style="padding:10px 14px;text-align:left">Hoy ninguno pasó todos los filtros</div>`)
            + (res.length ? `<div class="coin-subh">Reserva</div>` + res.map((r, i) => row(r, i + 1, true)).join("") : "");
          return `<div class="coin-h"><b>${c}</b> ${NAMES[c]} <span>${count}</span></div>` + body;
        }).join("")
      : rows.map((r) => row(r, r.rank, false)).join("");
    const when = rows[0].ranked_at ? new Date(rows[0].ranked_at * 1000).toLocaleString("es", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
    $("#traders-note").textContent = fx
      ? `Solo ${fsym} · sus mejores traders según la blockchain de Solana (ganancia real en esta moneda, sin bots, sin el creador, sin insiders) · elegidos ${when}. Comisión ~2% al comprar y ~2% al vender.`
      : hl
      ? `Solo BTC, ETH, SOL y XRP · datos públicos de Hyperliquid · elegidos ${when}. Con $5, FOMO cobra ~2% al comprar y ~2% al vender (XRP ~0.5%): si sube menos que eso, la comisión se come la ganancia.`
      : rows[0].data_src === "kolscan"
      ? `Traders conocidos · datos de kolscan.io (30 días) y de la blockchain · seguidores de X · elegidos ${when}`
      : `Ganancia real de su historial reciente · elegidos ${when} · cada día los vuelvo a elegir`;
  }

  function renderChart() {
    const c = S.chart, st = S.state; if (!c || !st) return;
    const empty = !st.has_trades;
    const ce = $("#chart-empty"); if (ce) { ce.hidden = !empty; ce.style.top = ""; }
    const pts = (c.points && c.points.length) ? c.points : [];
    if (window.DeskChart && DeskChart.equity) DeskChart.equity($("#home-chart"), { points: pts, start_value: c.start_value });
    else DeskChart.line($("#home-chart"), { points: pts, marks: [], start_value: c.start_value });
    $$("#ranges button").forEach((b) => b.classList.toggle("on", b.dataset.r === S.range));
  }

  const LAYER_SHORT = ["Mint", "Freeze", "Dev", "Top 10", "LP", "Age", "Bundles", "Deleg."];
  function cardHTML(name, st) {
    const a = st.agents[name];
    const dotc = { scanner: "var(--cyan)", auditor: "var(--blue)", analyst: "var(--yellow)", executor: "var(--green)", risk: "var(--pink)" }[name];
    const head = `<div class="an"><span class="dot" style="background:${a.paused ? "var(--ter)" : dotc}"></span>${name[0].toUpperCase() + name.slice(1)}${a.paused ? ' <span class="lbl">en pausa</span>' : ""}</div>`;
    if (name === "scanner") {
      const feed = a.feed.length ? a.feed.map((f) => f.verdict === "pass"
        ? `<div class="fr passed"><span class="nm">${esc(f.name)} · liq ${big(f.liq)}</span><span class="rs">→ Auditor</span></div>`
        : `<div class="fr killed"><span class="nm">${esc(f.name)}</span><span class="rs">${esc(f.reason)}</span></div>`).join("")
        : `<div class="empty" style="padding:18px 0;text-align:left">Esperando la próxima compra de un trader</div>`;
      return `${head}<div class="big" style="color:var(--cyan)">${a.traders || 0} traders</div><div class="lbl">${a.moves || 0} movimientos vistos hoy · ${a.ranking ? "eligiendo traders…" : a.ws ? "vigilando" : "reconectando"}</div><div class="feed">${feed}</div>`;
    }
    if (name === "auditor") {
      const L = a.last ? a.last.layers : [];
      const strips = LAYER_SHORT.map((s, i) => { const x = L[i]; const cls = !x ? "" : x.pass === true ? "ok" : x.pass === false ? "bad" : ""; return `<div class="strip ${cls}">${s}</div>`; }).join("");
      const live = a.live && a.live.state ? a.live.state : a.last ? (a.last.passed ? "8/8 → Executor" : a.last.reason || "revisando...") : (st.focus ? `Antes de cada Comprar de ${st.focus.symbol || st.focus.name} reviso: mint, freeze, liquidez, top 10, dev` : "BTC, ETH, SOL y XRP no necesitan revisión anti-estafa");
      return `${head}<div class="big">${a.count} revisadas</div><div class="lbl">${a.last ? esc(a.last.name) : ""}</div><div class="strips">${strips}</div>
        <div style="margin-top:12px;font-size:15px">${esc(live)}</div><div class="card-foot">${a.rejected} rechazadas</div>`;
    }
    if (name === "analyst") {
      const l = a.last;
      return `${head}<div class="big" style="color:var(--yellow)">Puntuando</div><div class="lbl">Analista (copia) · ${a.count} puntuadas</div>
        <canvas class="ring" id="ring"></canvas><div class="card-foot" style="text-align:center">${l ? esc(l.name) + " · " + (l.pass ? "aprobada" : esc(l.reason)) : (st.focus ? "Si pasa la revisión, va directo al Executor" : "Las copias de BTC, ETH, SOL y XRP van directo al Executor")}</div>`;
    }
    if (name === "executor") {
      const l = a.last;
      const filled = l && l.status === "bought";
      return `${head}<div class="big" style="color:var(--green)">${a.count} copias</div><div class="lbl">${l ? usd(l.size) + " · " + fmtNum(a.stack_pct) + "% del saldo" : "$0.00 · " + fmtNum(a.stack_pct) + "% del saldo"}</div>
        <div class="bar"><i id="exbar" style="width:${filled ? 100 : 0}%"></i></div><div id="exlbl" style="margin-top:8px;font-size:15px">${filled ? "✓ Listo · " + esc(l.name) : l ? esc(l.status) : "Esperando una señal"}</div>`;
    }
    const l = a.last;
    return `${head}<div class="big" style="color:var(--pink)">Cuidando</div><div class="lbl">${a.open} abiertas · ${a.count} cerradas hoy</div>
      <div style="margin-top:12px;font-size:17px">${l ? esc(l.label) + " · " + esc(l.name) + " · " + usd(l.pnl) : "Sin ventas todavía"}</div>
      <div class="pills"><span class="tp red">stop -${fmtNum(a.stop_pct)}%</span><span class="tp green">trail ${fmtNum(a.trail_pct)}%</span></div>`;
  }
  function renderCarousel() {
    const st = S.state; const car = $("#carousel");
    const order = ["scanner", "auditor", "analyst", "executor", "risk"];
    if (car.children.length !== 5 || car.querySelector(".sk")) car.innerHTML = order.map((n) => `<div class="acard tap" data-agent="${n}"></div>`).join("");
    order.forEach((n, i) => { const el = car.children[i]; const h = cardHTML(n, st); if (el._h !== h) { el.innerHTML = h; el._h = h; } });
    const ring = $("#ring"); if (ring) DeskChart.ring(ring, st.agents.analyst.last ? st.agents.analyst.last.score : null, st.agents.analyst.min_score);
  }
  function animateExecutor(name) {
    const bar = $("#exbar"), lbl = $("#exlbl"); if (!bar) return;
    if (reduced()) { bar.style.transition = "none"; bar.style.width = "100%"; lbl.textContent = "✓ Listo · " + name; return; }
    bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth;
    bar.style.transition = "width 1.2s linear"; bar.style.width = "100%";
    const t0 = performance.now();
    (function tick() { const p = Math.min(100, Math.round(((performance.now() - t0) / 1200) * 100)); lbl.textContent = p < 100 ? `Calculando... ${p}%` : "✓ Listo · " + name; if (p < 100) requestAnimationFrame(tick); })();
  }

  // ---------- activity rows ----------
  const ICON = { bought: "C", sold: "V", stopped: "✕", rejected: "R", stop: "■" };
  function rowsHTML(rows) {
    if (!rows.length) return `<div class="empty">Nada todavía esta noche</div>`;
    return rows.map((r) => `<button class="row tap" data-open="${r.opens}" data-mint="${esc(r.mint)}">
      <span class="ic ${r.kind}">${ICON[r.kind] || "•"}</span>
      <span class="mid"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)}</div></span>
      <span class="r ${r.kind === "sold" && String(r.value).startsWith("+") ? "up" : r.kind === "stopped" || String(r.value).startsWith("-") ? "down" : ""}">${esc(r.value)}${r.value2 ? `<small>${esc(r.value2)}</small>` : ""}</span></button>`).join("");
  }
  async function loadHomeActivity() { const a = await get("/activity"); $("#home-activity").innerHTML = rowsHTML(a.rows.slice(0, 5)); }
  async function loadActivity(more) {
    const a = await get("/activity" + (more && S.nextBefore ? "?before=" + S.nextBefore : ""));
    S.activityRows = more ? S.activityRows.concat(a.rows) : a.rows; S.nextBefore = a.next_before;
    $("#activity-list").innerHTML = rowsHTML(S.activityRows); $("#activity-more").hidden = !a.next_before;
  }

  // ---------- AGENTS TAB ----------
  async function renderAgents() {
    const st = S.state; if (!st) return;
    const order = ["scanner", "auditor", "analyst", "executor", "risk"];
    const decs = await Promise.all(order.map((n) => get(`/agents/${n}/decisions`).catch(() => ({ rows: [] }))));
    $("#agents-list").innerHTML = order.map((n, i) => {
      const a = st.agents[n];
      const locked = n === "risk" && !a.can_pause && !a.paused;
      const rows = decs[i].rows.length ? decs[i].rows.map((d) => `<div class="dr"><span class="tm">${hhmm(d.ts)}</span>${d.coin_url ? `<a href="${esc(d.coin_url)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : "<span>–</span>"}<span class="vd">${esc(d.verdict)} · ${esc(d.reason || "")}</span></div>`).join("")
        : `<div class="empty" style="padding:14px 0">${n === "scanner" ? "Esperando la próxima compra de un trader" : n === "auditor" ? "Todavía no revisó ninguna moneda" : "Sin decisiones todavía"}</div>`;
      return `<div class="fcard" id="ag-${n}"><div class="fc-h"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${a.paused ? "var(--ter)" : "var(--green)"}"></span>
        <span class="nm">${n[0].toUpperCase() + n.slice(1)}</span><span class="cnt">${a.paused ? "en pausa" : "trabajando"} · ${a.count} hoy</span>
        <button class="swwrap tap" data-pause="${n}" ${locked ? 'data-locked="1"' : ""} aria-label="pause or resume ${n}"><span class="sw ${a.paused ? "" : "on"} ${locked ? "locked" : ""}"></span></button></div>
        <div class="dec">${rows}</div><div class="fc-foot"><button class="tap" data-settings="${n}">Ajustes</button></div></div>`;
    }).join("");
  }

  // ---------- ACCOUNT ----------
  async function renderAccount() {
    const [acc, set] = await Promise.all([get("/account"), get("/settings")]);
    const ro = acc.read_only;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const groups = {};
    set.settings.forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
    const NAMES = { copy: "Copy trading", scanner: "Scanner", auditor: "Auditor", analyst: "Analista", executor: "Executor", risk: "Risk", desk: "Escritorio" };
    const settingHTML = (s) => {
      const id = "s-" + s.key.replace(".", "-");
      let ctl = "";
      if (s.kind === "bool") ctl = `<button class="swwrap tap" data-bool="${s.key}" ${ro ? "disabled" : ""}><span class="sw ${s.value ? "on" : ""}"></span></button>`;
      else if (s.kind.startsWith("choice:")) ctl = `<div class="seg">${s.kind.slice(7).split("/").map((o) => `<button class="tap ${o === s.value ? "on" : ""}" data-choice="${s.key}" data-val="${o}" ${ro ? "disabled" : ""}>${o}</button>`).join("")}</div>`;
      else if (["str", "url", "time"].includes(s.kind)) ctl = `<input type="text" id="${id}" data-text="${s.key}" value="${esc(s.value)}" ${ro ? "readonly" : ""} style="width:${s.kind === "url" ? "100%" : "130px"}">`;
      else ctl = `<input type="number" inputmode="decimal" id="${id}" data-num="${s.key}" value="${s.value}" min="${s.min}" max="${s.max}" step="any" ${ro ? "readonly" : ""}>`;
      const slider = (s.kind === "int" || s.kind === "float") && s.min != null ? `<input type="range" data-slide="${s.key}" min="${s.min}" max="${s.max}" step="${s.kind === "int" ? 1 : (s.max - s.min) / 200}" value="${s.value}" ${ro ? "disabled" : ""}><div class="rng">${fmtNum(s.min)} – ${fmtNum(s.max)}</div>` : "";
      return `<div class="setting"><div class="top"><span class="nm">${esc(s.name)}</span>${s.kind === "url" ? "" : ctl}</div>${s.kind === "url" ? ctl : ""}${slider}</div>`;
    };
    $("#account-body").innerHTML = `
      <div class="group">
        <div class="cell"><span class="k">Modo</span><div class="seg"><button class="tap ${acc.mode === "PAPER" ? "on" : ""}" data-mode="PAPER">PAPER</button><button class="tap ${acc.mode === "LIVE" ? "on" : ""}" data-mode="LIVE">LIVE</button></div></div>
        <div class="cell"><span class="k">${acc.mode === "PAPER" ? "Saldo de práctica (simulado)" : "Saldo"}</span>${acc.mode === "PAPER" ? `<span class="v">${usd(acc.stack)}</span>` : `<input class="stack-in" type="number" inputmode="decimal" data-num="executor.stack" value="${acc.live_stack}" ${ro ? "readonly" : ""}>`}</div>
        ${ro ? `<div class="cell"><span class="k" style="color:var(--sec);font-size:13px">Este enlace es para mirar. Para cambiar ajustes, pausar o parar, escríbele al bot de Telegram.</span></div>` : ""}
        <div class="cell"><span class="k" style="color:${acc.ticket.level === "skip" ? "var(--red)" : acc.ticket.level === "bump" ? "var(--orange)" : "var(--sec)"};font-size:13px">${esc(acc.ticket.message)}</span></div>
      </div>
      ${acc.coins_on ? `<div class="group-h">Lo que copio</div><div class="group">
        <div class="cell"><span class="k">Modo</span><span class="v">${acc.auto_coins && acc.auto_amount ? "Automático" : acc.auto_coins || acc.auto_amount ? "Mixto" : "Manual"}</span></div>
        <div class="cell"><span class="k">Monedas${acc.auto_coins ? " (las elijo yo)" : ""}</span><span class="v">${acc.focus ? `<span class="coin-pill on">${esc(acc.focus.symbol || acc.focus.name)}</span>` : ["BTC", "ETH", "SOL", "XRP"].map((c) => `<span class="coin-pill ${acc.coins_on.includes(c) ? "on" : ""}">${c}</span>`).join("")}</span></div>
        <div class="cell"><span class="k">Monto por compra${acc.auto_amount ? " (lo elijo yo)" : ""}</span><span class="v">${usd(acc.ticket_usd)}</span></div>
        <div class="cell"><span class="k" style="color:var(--sec);font-size:13px">${acc.focus ? `Yo manejo tu presupuesto: una sola moneda, así que cada Comprar usa tu saldo menos lo de la comisión (nunca más que tu saldo).` : `Yo manejo tu presupuesto: reparto tu saldo en ${acc.max_open || 2} compras y guardo para la comisión.`} Si quieres elegir tú, cámbialo en Telegram: /monedas y /monto (o /monto auto para volver). Mínimo $5, nunca más que tu saldo. Máximo ${acc.max_open || 2} monedas a la vez.</span></div>
      </div>` : ""}
      <div class="group">
        <a class="cell tap" href="${esc(acc.profile_url)}" target="_blank" rel="noopener"><span class="k">Tu perfil de FOMO</span><span class="v">@${esc(acc.fomo_handle)}</span><span class="chev">›</span></a>
        <button class="cell tap" id="invite" data-url="${esc(acc.signup_url)}"><span class="k">Invitar a un amigo</span><span class="chev">›</span></button>
      </div>
      <div class="group">
        <div class="cell"><span class="k">Telegram</span><span class="v">${acc.telegram.connected ? "conectado" : "sin conectar"}</span></div>
        <button class="cell tap" id="testpush" ${ro ? "disabled" : ""}><span class="k" style="color:var(--blue)">Mandar aviso de prueba</span></button>
        ${pushSupported() && (PLAN === "G" || acc.webpush.available) ? `<button class="cell tap" id="enablepush"><span class="k" style="color:var(--blue)">${pushState() === "on" ? "Avisos al teléfono: activados ✓" : "Activar avisos"}</span></button>` : ""}
      </div>
      <details class="adv" ${S.advOpen ? "open" : ""}><summary class="details-btn tap">Ajustes avanzados <span class="chev">›</span></summary>
      ${ro ? `<div class="group-h">Desde este enlace solo se mira. Para cambiar algo, escríbele al bot de Telegram, por ejemplo «parar», «seguir» o «set stop to -8%».</div>` : ""}
      ${Object.keys(NAMES).filter((g) => groups[g]).map((g) => `<div class="group-h" id="set-${g}">${NAMES[g]}</div><div class="group">${groups[g].map(settingHTML).join("")}</div>`).join("")}</details>`;
    const adv = $("#account-body details.adv"); if (adv) adv.addEventListener("toggle", () => (S.advOpen = adv.open));
  }
  async function saveSetting(key, value, confirm) {
    try {
      const r = await post("/settings", { key, value, confirm });
      toast(r.messages.join(" · "));
      if (key === "executor.stack" || key.startsWith("executor.") || key === "desk.paper_start_stack") renderAccount();
      refresh();
    } catch (e) { toast(e.message); renderAccount(); }
  }

  // ---------- COIN SCREEN ----------
  async function openCoin(mint, push = true) {
    S.coin = mint; S.audit = null;
    if (push) history.pushState({ screen: "coin", mint }, "");
    showPushed("coin");
    $("#coin-title").textContent = "";
    $("#coin-body").innerHTML = `<div class="skb" style="height:24px;width:60%;margin-top:8px"></div><div class="skb" style="height:66px;width:80%;margin-top:12px"></div><div class="skb" style="height:240px;margin-top:12px"></div><div class="skb" style="height:120px;margin-top:12px"></div>`;
    await loadCoin();
  }
  async function loadCoin() {
    if (!S.coin) return;
    let c;
    try { c = await get("/coin/" + S.coin); markOk(); } catch (e) { setOffline(); return; }
    if (S.coin !== c.mint) return;
    const sym = c.symbol ? c.symbol : c.mint.slice(0, 4);
    const age = c.age_h == null ? "" : c.age_h < 1 ? Math.round(c.age_h * 60) + "m old" : Math.round(c.age_h) + "h old";
    $("#coin-title").textContent = c.name;
    $("#paper-coin").hidden = c.mode !== "PAPER";
    const e = c.exit;
    const tl = e ? Math.max(0, e.timeout_at - Date.now() / 1000) : 0;
    $("#coin-body").innerHTML = `
      <div class="coin-head"><div class="coin-sub">${esc(sym)} · ${esc(c.chain || "Solana")}${age ? " · " + age : ""}${c.shield ? `<span class="shield ${c.audit_passed ? "" : "bad"}">${c.shield}</span>` : ""}</div>
      <div class="price-big">${price(c.price)}</div>
      ${c.since_entry_pct != null ? `<div class="${c.since_entry_pct >= 0 ? "up" : "down"}" style="font-size:17px;font-weight:500">${c.since_entry_pct >= 0 ? "▲" : "▼"} ${Math.abs(c.since_entry_pct).toFixed(2)}% desde la entrada</div>` : ""}</div>
      <div class="cchart"><canvas id="coin-chart"></canvas></div>
      <div class="stats">
        <div class="stat"><div class="k">Capitalización</div><div class="v">${big(c.stats.market_cap)}</div></div>
        <div class="stat"><div class="k">Liquidez</div><div class="v">${big(c.stats.liquidity)}</div></div>
        <div class="stat"><div class="k">Volumen 24h</div><div class="v">${big(c.stats.volume_24h)}</div></div>
        <div class="stat"><div class="k">Holders</div><div class="v">${c.stats.holders == null ? "n/a" : c.stats.holders.toLocaleString()}</div></div>
      </div>
      ${c.position ? `<div class="poscard"><div class="h">Tu posición · ${usd(c.position.size_usd)} · Executor</div>
        <div class="exitl"><span>Línea de stop</span><span class="down">-${fmtNum(e.stop_pct)}% · ${price(e.stop_price)}</span></div>
        <div class="exitl"><span>Línea de trail</span><span class="${e.trail_active ? "up" : ""}">${e.trail_active ? fmtNum(e.trail_pct) + "% bajo el máximo · " + price(e.trail_price) : "empieza en " + price(e.trail_start_price)}</span></div>
        <div class="exitl"><span>Time left to timeout</span><span>${Math.floor(tl / 3600)}h ${Math.floor((tl % 3600) / 60)}m</span></div></div>` : ""}
      <a class="cta ${c.position ? "sell" : ""}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${c.position ? "Vender en FOMO" : "Comprar en FOMO"}</a>
      <button class="cta ghost tap" data-audit="${esc(c.mint)}">Auditor · taken apart</button>`;
    DeskChart.candles($("#coin-chart"), c.candles, { lines: e ? [{ price: e.exit_line, label: "Risk trailing stop", color: DeskChart.colors.orange }] : [] });
  }

  // ---------- AUDITOR SCREEN (disc stack + cyan beam) ----------
  async function openAudit(mint, push = true) {
    S.audit = { mint, layers: {}, shownUpTo: -1, anim: null };
    if (push) history.pushState({ screen: "audit", mint }, "");
    showPushed("audit");
    $("#audit-body").innerHTML = `<div class="skb" style="height:250px;width:220px;margin:16px auto 0"></div><div class="skb" style="height:300px;margin-top:16px"></div>`;
    let a;
    try { a = await get("/audit/" + mint); markOk(); } catch (e) { setOffline(); return; }
    renderAuditShell(a);
    (a.layers || []).forEach((L) => (S.audit.layers[L.n] = L));
    S.audit.data = a;
    runBeam();
  }
  function renderAuditShell(a) {
    if (!a.layers || !a.layers.length) {
      $("#audit-body").innerHTML = `<div class="empty" style="padding-top:80px">Todavía no revisó ninguna moneda</div>
        <div class="group"><div class="cell"><span class="k">Revisar antes de comprar</span><button class="swwrap tap" data-bool="auditor.enabled" data-twice="1"><span class="sw ${a.enabled ? "on" : ""}"></span></button></div></div>
        ${a.coin_url ? `<a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Abrir en FOMO</a>` : ""}`;
      return;
    }
    const names = ["Autoridad de mint", "Autoridad de freeze", "Billetera del dev", "Top 10 holders", "Liquidez", "Edad del pool", "Billeteras en grupo", "Delegaciones"];
    $("#audit-body").innerHTML = `
      <div style="text-align:center;font-family:var(--disp);font-size:22px;font-weight:700;margin-top:6px">${esc(a.name)}</div>
      <div class="disc-stack" id="discs">${names.map((n, i) => `<div class="disc" id="disc-${i + 1}" style="top:${i * 26}px;z-index:${10 - i}"></div>`).join("")}<div class="beam" id="beam" style="top:-6px"></div></div>
      <div class="verdict" id="verdict"></div>
      <div class="lrows">${names.map((n, i) => `<div class="lrow"><span class="n">${i + 1}</span><span class="k">${n}</span><span class="v" id="lv-${i + 1}">…</span></div>`).join("")}</div>
      <div class="group"><div class="cell"><span class="k">Revisar antes de comprar</span><button class="swwrap tap" data-bool="auditor.enabled" data-twice="1"><span class="sw ${a.enabled ? "on" : ""}"></span></button></div></div>
      <a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Abrir en FOMO</a>`;
  }
  function paintLayer(L) {
    const d = $("#disc-" + L.n), v = $("#lv-" + L.n); if (!d) return;
    d.className = "disc " + (L.pass === true ? "ok" : L.pass === false ? "bad" : "grey");
    d.textContent = L.pass === true ? "✓" : L.pass === false ? "✕" : "";
    v.textContent = L.value; v.className = "v " + (L.pass === true ? "ok" : L.pass === false ? "bad" : "");
  }
  function runBeam() {
    const A = S.audit; if (!A || A.anim || A.done) return;
    const beam = $("#beam");
    const step = (i) => {
      if (!S.audit || S.audit !== A) return;
      if (i > 8) { beam && (beam.style.opacity = 0); verdict(); A.anim = null; A.done = true; return; }
      const L = A.layers[i];
      if (beam) beam.style.top = (i - 1) * 26 + 20 + "px";
      if (!L) { A.anim = setTimeout(() => { A.anim = null; A.waiting = i; }, reduced() ? 0 : 350); return; }   // server slower: beam waits here
      A.anim = setTimeout(() => { paintLayer(L); A.anim = setTimeout(() => step(i + 1), reduced() ? 0 : 150); }, reduced() ? 0 : 350);
    };
    step((A.waiting || 1));
  }
  function verdict() {
    const A = S.audit; const a = A.data || {}; const L = Object.values(A.layers);
    if (L.length < 8) return;
    const red = L.find((x) => x.pass === false);
    $("#verdict").innerHTML = red
      ? `<div class="vt down">Rechazada · ${esc(red.value)}</div><div class="vs">Grok Bot no va a copiar ${esc(a.name)}</div>`
      : `<div class="vt up">Aprobada · 8/8 partes</div><div class="vs">${a.sent_size ? "Enviada al Executor · " + usd(a.sent_size) : "Enviada al Analista"}</div>`;
  }

  // ---------- navigation ----------
  function showTab(tab) {
    S.tab = tab;
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "v-" + tab));
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    window.scrollTo(0, 0);
    if (tab === "agents") renderAgents().catch(() => setOffline());
    if (tab === "activity") loadActivity().catch(() => setOffline());
    if (tab === "account") renderAccount().catch(() => setOffline());
  }
  function showPushed(which) { $("#v-coin").classList.toggle("active", which === "coin"); $("#v-audit").classList.toggle("active", which === "audit"); }
  window.addEventListener("popstate", (e) => {
    const s = e.state;
    if (s && s.screen === "coin") openCoin(s.mint, false);
    else if (s && s.screen === "audit") openAudit(s.mint, false);
    else { S.coin = null; S.audit = null; showPushed(null); }
  });

  // ---------- sheets ----------
  function sheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").hidden = false; }
  function closeSheet() { $("#sheet").hidden = true; }
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });

  // ---------- events ----------
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a, [data-agent]"); if (!t) return;
    if (t.dataset.tab) return showTab(t.dataset.tab);
    if (t.dataset.go) return showTab(t.dataset.go);
    if (t.hasAttribute("data-back")) return history.back();
    if (t.dataset.r) { S.range = t.dataset.r; return loadChart(); }
    if (t.dataset.agent) {
      const n = t.dataset.agent;
      if (n === "auditor" && S.state.agents.auditor.last) return openAudit(S.state.agents.auditor.last.mint);
      if (n === "auditor") return openAudit("none");
      showTab("agents"); setTimeout(() => { const el = $("#ag-" + n); el && el.scrollIntoView({ block: "start" }); }, 300); return;
    }
    if (t.dataset.open === "none") return;
    if (t.dataset.open) return t.dataset.open === "coin" ? openCoin(t.dataset.mint) : openAudit(t.dataset.mint);
    if (t.dataset.trader) {
      try { const r = await post(`/traders/${t.dataset.trader}/${t.dataset.tp === "1" ? "resume" : "pause"}`); toast(r.message); await refresh(); } catch (err) { toast(err.message); }
      return;
    }
    if (t.dataset.cb) { try { const r = await post("/callback", { data: t.dataset.cb }); toast(r.message); await refresh(); } catch (err) { toast(err.message); } return; }
    if (t.id === "details-toggle") {
      const d = $("#details"); d.hidden = !d.hidden;
      t.innerHTML = d.hidden ? 'Ver detalles <span class="chev">›</span>' : 'Ocultar detalles <span class="chev">‹</span>';
      if (!d.hidden) renderCarousel();
      return;
    }
    if (t.id === "seguir") { try { const r = await post("/seguir"); toast(r.message); await refresh(); } catch (err) { toast(err.message); } return; }
    if (t.id === "rerank-info") {
      const rep = (await get("/traders").catch(() => ({ report: null }))).report;
      const fo = S.state && S.state.focus;
      if (fo) {
        const sy = esc(fo.symbol || fo.name);
        sheet(`<div class="sh-t">¿Cómo elijo a los traders?</div><div style="color:var(--sec);font-size:14px;line-height:1.45">
          Ahora opero una sola memecoin: <b>${esc(fo.name)} (${sy})</b>.<br><br>
          1. Busco quién compró y vendió ${sy} con dinero de verdad (las últimas operaciones grandes y los que más tienen).<br>
          2. Leo en la blockchain de Solana cada compra y venta de ${sy} de cada uno: cuánto ganó vendiendo, cuánto tiene sin vender y cuántas veces vendió con ganancia.<br>
          3. Fuera el creador, los bots, los que recibieron monedas gratis (insiders) y los que pierden.<br>
          4. Me quedo con ${rep && rep.chosen ? rep.chosen : 5} en activo y ${rep && rep.reserve != null ? rep.reserve : 3} de reserva. Si uno deja de operar, entra uno de la reserva.<br><br>
          Te aviso <b>Comprar</b> cuando la mayoría de los activos tiene ${sy} y uno compra, y antes reviso que no sea estafa (mint, freeze, liquidez bloqueada, top 10 y que el creador no venda). Te aviso <b>Vender</b> cuando la mayoría ya vendió.
          ${rep ? `<br><br>Última vez: ${rep.candidates ?? 0} wallets revisadas · ${rep.studied ?? 0} con datos · ${rep.chosen ?? 0} elegidos.` : ""}
          <br><br>Las memecoins suben y bajan muy rápido. Copiar traders también pierde.</div>`);
        return;
      }
      sheet(`<div class="sh-t">¿Cómo elijo a los traders?</div><div style="color:var(--sec);font-size:14px;line-height:1.45">
        Solo copio criptos establecidas: Bitcoin, Ethereum, Solana y XRP. Nada de memecoins.<br><br>
        1. Leo el ranking público de Hyperliquid, un exchange donde se ve todo lo que hace cada trader.<br>
        2. Solo quedan los que ganan en 30 días y en todo su historial, que operaron esta semana y tienen una cuenta grande de verdad.<br>
        3. Reviso sus operaciones reales: que la mayoría sea en BTC, ETH, SOL o XRP, que acierten al menos 40% de sus cierres y que no sean bots.<br>
        4. Fuera los que apuestan con mucho apalancamiento o tuvieron caídas grandes este mes. Me quedo con los 5 mejores y los reviso cada día.<br><br>
        Cuando uno compra BTC, ETH, SOL o XRP, te aviso con Comprar ($5). Cuando cierra, te aviso con Vender. Si apuesta a la baja, no hago nada: en FOMO solo se puede comprar.
        ${rep ? `<br><br>Última vez: ${rep.leaderboard_rows ?? rep.kols ?? rep.trades ?? 0} traders en el ranking · ${rep.studied} revisados · ${rep.chosen} elegidos.` : ""}
        <br><br>Con $5, la comisión es ~2% al comprar y ~2% al vender (XRP en Base ~0.5%), así que los movimientos chicos no dejan ganancia. Copiar traders también pierde.</div>`);
      return;
    }
    if (t.dataset.audit) return openAudit(t.dataset.audit);
    if (t.dataset.coin) { closeSheet(); return openCoin(t.dataset.coin); }
    if (t.dataset.settings) { S.advOpen = true; showTab("account"); setTimeout(() => { const g = { scanner: "scanner", auditor: "auditor", analyst: "analyst", executor: "executor", risk: "risk" }[t.dataset.settings]; const el = $("#set-" + g); el && el.scrollIntoView(); }, 400); return; }
    if (t.dataset.pause) {
      if (t.dataset.locked) return toast("Risk no se puede pausar con una posición abierta");
      const paused = S.state.agents[t.dataset.pause].paused;
      try { const r = await post(`/agents/${t.dataset.pause}/${paused ? "resume" : "pause"}`); toast(r.message); await refresh(); renderAgents(); } catch (err) { toast(err.message); }
      return;
    }
    if (t.dataset.mode) {
      const m = t.dataset.mode;
      if (m === "LIVE") {
        sheet(`<div class="sh-t">Pasar a LIVE</div><div style="color:var(--sec);font-size:14px;margin-bottom:10px">El dinero solo se mueve cuando tú tocas Comprar en FOMO y compras dentro de FOMO. Necesita 1 noche completa en PAPER. Escribe LIVE para confirmar.</div>
          <input id="live-in" autocomplete="off" autocapitalize="characters" placeholder="LIVE"><div class="row2"><button class="tap" id="live-no">Cancelar</button><button class="tap pri" id="live-yes">Cambiar</button></div>`);
        return;
      }
      try { const r = await post("/mode", { mode: "PAPER" }); toast(r.message); renderAccount(); refresh(); } catch (err) { toast(err.message); }
      return;
    }
    if (t.id === "live-no") return closeSheet();
    if (t.id === "live-yes") { try { const r = await post("/mode", { mode: "LIVE", confirm: $("#live-in").value }); toast(r.message); } catch (err) { toast(err.message); } closeSheet(); renderAccount(); refresh(); return; }
    if (t.dataset.bool) {
      const key = t.dataset.bool; const on = t.querySelector(".sw").classList.contains("on");
      if (key === "auditor.enabled" && on) {
        if (!confirm("¿Apagar \"Revisar antes de comprar\"? Las monedas llegarían al Analista sin las 8 capas.")) return;
        if (!confirm("¿Segura? Es el control de seguridad.")) return;
        return saveSetting(key, false, "OFF").then(() => S.audit && openAudit(S.audit.mint, false));
      }
      return saveSetting(key, !on);
    }
    if (t.dataset.choice) return saveSetting(t.dataset.choice, t.dataset.val);
    if (t.id === "invite") {
      const url = t.dataset.url;
      if (navigator.share) { try { await navigator.share({ title: "FOMO", url }); return; } catch (err) { if (err && err.name === "AbortError") return; } }
      try { await navigator.clipboard.writeText(url); } catch (err) { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      return toast("Enlace copiado");
    }
    if (t.id === "testpush") { try { const r = await post("/test_push"); toast(r.ok ? "Aviso enviado" : "Telegram no lo aceptó (avisos silenciados)"); } catch (err) { toast(err.message); } return; }
    if (t.id === "enablepush") return enablePush();
    if (t.id === "btn-search") {
      sheet(`<div class="sh-t">Buscar</div><input id="q" placeholder="Nombre, símbolo o mint" autocomplete="off"><div id="qres" class="list"></div>`);
      const q = $("#q"); q.focus();
      q.addEventListener("input", async () => { const r = await get("/search?q=" + encodeURIComponent(q.value)).catch(() => ({ rows: [] })); $("#qres").innerHTML = r.rows.map((x) => `<button class="row tap" data-coin="${esc(x.mint)}"><span class="mid"><div class="t">${esc(x.name || x.mint.slice(0, 6))}</div><div class="s">${esc(x.symbol || "")} · ${esc(x.mint.slice(0, 4))}…${esc(x.mint.slice(-4))}</div></span></button>`).join("") || `<div class="empty">Sin resultados</div>`; });
      return;
    }
    if (t.id === "btn-bell") {
      const r = await get("/pushes").catch(() => ({ rows: [] }));
      sheet(`<div class="sh-t">Avisos</div>${r.rows.length ? r.rows.map((p) => `<a class="row tap" href="${esc(p.url || "#")}" target="_blank" rel="noopener"><span class="mid"><div class="t" style="white-space:normal">${esc(p.text)}</div><div class="s">Grok Desk Trading · ${hhmm(p.ts)}</div></span></a>`).join("") : `<div class="empty">Sin avisos todavía</div>`}`);
      $("#bell-dot").hidden = true; return;
    }
    if (t.id === "activity-more") return loadActivity(true);
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.num) return saveSetting(t.dataset.num, t.value);
    if (t.dataset.text) return saveSetting(t.dataset.text, t.value);
    if (t.dataset.slide) { const n = $(`[data-num="${t.dataset.slide}"]`); if (n) n.value = t.value; return saveSetting(t.dataset.slide, t.value); }
  });
  document.addEventListener("input", (e) => { const t = e.target; if (t.dataset.slide) { const n = $(`[data-num="${t.dataset.slide}"]`); if (n) n.value = (+t.value).toFixed(t.step == 1 ? 0 : 2); } });

  // ---------- web push: ONLY majority Comprar/Vender alerts ----------
  // plan G: VAPID key + relay topic ride inside the encrypted bundle; the subscription is sent encrypted (registerSub).
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  async function subId(endpoint) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
    return Array.from(h).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  async function pushInfo() {
    if (PLAN === "G") return (await gBundle()).push || {};
    const acc = await get("/account");
    return { api: null, vapid: acc.webpush && acc.webpush.vapid_public, subs: null };
  }
  async function registerSub(sub) {
    const id = await subId(sub.endpoint);
    if (PLAN === "G") {
      // the free tunnel shows browsers a "Caution" page (even for CORS), so the subscription goes through an encrypted
      // mailbox: AES-GCM(key from the #t= token) posted to the secret ntfy.sh topic named in the bundle; the desk reads it.
      const p = await pushInfo();
      if (!p.relay || !p.topic) throw new Error("Los avisos todavía no están listos en el escritorio.");
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(TOKEN), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("grok-desk-push-v1"), iterations: 200000 },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("desk-push-v1") }, key,
        new TextEncoder().encode(JSON.stringify({ op: "add", sub: sub.toJSON(), ts: Date.now() }))));
      const enc = (u) => btoa(String.fromCharCode(...u));
      let r;
      try {
        r = await fetch(p.relay.replace(/\/$/, "") + "/" + p.topic, { method: "POST", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ v: 1, iv: enc(iv), ct: enc(ct) }), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
      } catch (e) { throw new Error("Sin conexión. Intenta otra vez en un minuto."); }
      if (!r.ok) throw new Error("No se pudo enviar. Intenta otra vez en un minuto.");
    } else if (PLAN === "A") {
      await post("/push", sub.toJSON());
    } else throw new Error("Desde este enlace no se pueden activar avisos.");
    localStorage.setItem("desk_push_id", id); localStorage.setItem("desk_push_at", String(Date.now())); localStorage.setItem("desk_push_want", "1");
    return id;
  }
  function pushState() {
    if (!pushSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission !== "granted" || localStorage.getItem("desk_push_want") !== "1") return "off";
    const id = localStorage.getItem("desk_push_id"), at = +localStorage.getItem("desk_push_at") || 0;
    const subs = PLAN === "G" && G.bundle && G.bundle.push ? G.bundle.push.subs : null;
    if (!id) return "off";
    if (!subs || subs.includes(id) || Date.now() - at < 5 * 60000) return "on";
    return "lost";   // the desk does not have it (relay message lost/expired, or the push service dropped it)
  }
  let pushBusy = false;
  async function enablePush() {
    if (pushBusy) return; pushBusy = true; renderPush();
    try {
      if (!pushSupported()) throw new Error("Este navegador no permite avisos. Abre la página en Google Chrome.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("No diste permiso. Puedes activarlo en Chrome → Ajustes → Notificaciones.");
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const p = await pushInfo();
      if (!p.vapid) throw new Error("Los avisos todavía no están listos en el escritorio.");
      const raw = Uint8Array.from(atob(p.vapid.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.vapid.length + 3) % 4)), (c) => c.charCodeAt(0));
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      await registerSub(sub);
      reg.showNotification("Avisos activados", { body: "Te aviso solo cuando la mayoría de los traders compre o venda.", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: "desk-push-on" }).catch(() => {});
      toast("Avisos activados ✓");
    } catch (err) { toast(err.message || "No se pudieron activar los avisos"); }
    finally { pushBusy = false; renderPush(); }
  }
  let lastResync = 0;
  async function resyncPush() {   // silent: re-register when the desk lost it (no taps needed once permission is given)
    if (pushState() !== "lost" || Date.now() - lastResync < 5 * 60000 || pushBusy) return;
    lastResync = Date.now();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { localStorage.removeItem("desk_push_id"); return renderPush(); }
      await registerSub(sub); renderPush();
    } catch (e) { /* offline: retry in 5 minutes */ }
  }
  function renderPush() {
    const el = $("#push-slot"); if (!el) return;
    if (PLAN !== "G" && PLAN !== "A") { el.innerHTML = ""; return; }
    const st = pushState();
    if (st === "on" || st === "unsupported" || (st === "lost" && localStorage.getItem("desk_push_id"))) { el.innerHTML = ""; return; }
    if (st === "denied") { el.innerHTML = `<div class="pushcard"><div class="pc-t">Avisos bloqueados</div><div class="pc-s">Para recibirlos: Chrome → ⋮ → Configuración → Notificaciones → permite esta página.</div></div>`; return; }
    el.innerHTML = `<div class="pushcard"><div class="pc-txt"><div class="pc-t">Avisos al teléfono</div><div class="pc-s">Solo cuando la mayoría compre o venda</div></div><button class="pc-btn tap" id="enablepush" ${pushBusy ? "disabled" : ""}>${pushBusy ? "Activando…" : "Activar avisos"}</button></div>`;
  }

  // ---------- refresh + live stream ----------
  function markOk() { S.lastOk = Date.now(); if (!S.online) { S.online = true; renderErr(); } }
  async function loadChart() { S.chart = await get("/chart?range=" + S.range); renderChart(); }
  let refreshing = false;
  async function refresh() {
    if (!PLAN || refreshing) return; refreshing = true;
    try {
      S.state = await get("/state");
      markOk();
      renderHome();
      await Promise.all([loadChart(), loadHomeActivity()]);
      if (S.tab === "agents" && !S.coin && !S.audit) renderAgents().catch(() => {});
    } catch (e) { if (e.message !== "401") { console.warn("refresh failed", e && e.stack); setOffline(); } }
    finally { refreshing = false; }
  }
  let soon = null;
  const refreshSoon = () => { clearTimeout(soon); soon = setTimeout(refresh, 300); };

  async function stream() {
    if (PLAN !== "A") return;
    while (true) {
      try {
        const r = await fetch("/api/stream", { headers: { Authorization: "Bearer " + TOKEN, "X-Pinggy-No-Screen": "1" }, cache: "no-store" });
        if (!r.ok || !r.body) throw new Error("stream " + r.status);
        const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
        while (true) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let msg; try { msg = JSON.parse(line.slice(6)); } catch (e) { continue; }
            onEvent(msg);
          }
        }
      } catch (e) { /* fall through, retry */ }
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
  function onEvent(m) {
    markOk();
    const d = m.data || {};
    if (m.type === "audit_layer" && S.audit && S.audit.mint === d.mint) {
      if (!$("#discs")) { openAudit(d.mint, false); return; }
      S.audit.layers[d.n] = d; if (!S.audit.anim) runBeam();
    }
    if (m.type === "audit_done" && S.audit && S.audit.mint === d.mint) { S.audit.data = Object.assign(S.audit.data || {}, { name: S.audit.data && S.audit.data.name }); }
    if (m.type === "fill") setTimeout(() => animateExecutor(d.name), 50);
    if (m.type === "exit" || m.type === "fill") { if (S.coin === d.mint) loadCoin(); }
    if (["scan", "audit_done", "verdict", "signal", "fill", "exit", "balance", "activity", "push", "traders", "trader_move"].includes(m.type)) refreshSoon();
  }

  // ---------- boot ----------
  if (!PLAN) { showAuthWall(); return; }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  skeletons();
  refresh();
  setInterval(refresh, PLAN === "A" ? 10000 : PLAN === "G" ? 20000 : 15000);
  setInterval(() => { if (S.coin) loadCoin(); }, 15000);
  stream();
  window.addEventListener("resize", () => renderChart());
})();
