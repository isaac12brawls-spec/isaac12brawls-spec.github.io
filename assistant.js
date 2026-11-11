// Grok helper on Home: a small blob in a corner that answers in Spanish from the desk data already on this phone.
// 100% local keyword matching: no network calls, no AI APIs, nothing is sent anywhere.
(() => {
  "use strict";
  const TG = "https://t.me/Ricardo_desk_bot";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v) => (v < 0 ? "-$" : "$") + Math.abs(v || 0).toFixed(2);
  const big = (v) => { v = v || 0; const a = Math.abs(v); return (v < 0 ? "-" : "") + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)} millones` : a >= 1e3 ? `$${Math.round(a / 1e3)} mil` : `$${Math.round(a)}`); };
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const COINS = { BTC: ["btc", "bitcoin"], ETH: ["eth", "ethereum", "ether"], SOL: ["sol", "solana"], XRP: ["xrp", "ripple", "xpr"] };
  const CHIPS = ["Sigue solo XRP", "Pon $7 por compra", "¿Cómo voy?", "¿Por qué compró?", "¿Quiénes son mis traders?", "¿Qué hace Comprar?", "¿Qué es modo práctica?", "Comisiones"];
  const st = () => (window.DeskApp && window.DeskApp.state()) || null;

  function coinIn(q) { return Object.keys(COINS).find((c) => COINS[c].some((w) => new RegExp(`\\b${w}\\b`).test(q))); }

  // ---- settings commands in plain Spanish -> a Telegram deep link she taps (the bot applies it and confirms) ----
  function coinsIn(q) { return Object.keys(COINS).filter((c) => COINS[c].some((w) => new RegExp(`\\b${w}\\b`).test(q))); }
  function command(raw) {
    const q = norm(raw), s = st(), a = (s && s.assistant) || {};
    const has = (...w) => w.some((x) => q.includes(x));
    const cs = coinsIn(q);
    if (cs.length && has("solo", "nada mas", "unicamente")) return { text: `Entendí: seguir solo ${cs.join(" y ")}.`, payload: "solo_" + cs.join("-") };
    if (cs.length && has("quita", "saca", "elimina", "ya no", "deja de", "sin ")) return { text: `Entendí: dejar de seguir ${cs.join(" y ")}.`, payload: "quita_" + cs.join("-") };
    if (cs.length && has("agrega", "anade", "suma", "tambien", "sigue", "activa")) return { text: `Entendí: seguir también ${cs.join(" y ")}.`, payload: "agrega_" + cs.join("-") };
    const m = q.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:\$|dolares|dolar|usd)?/);
    if (m && has("por compra", "monto", "cada compra", "pon ", "cambia", "quiero")) {
      const v = parseFloat(m[1].replace(",", "."));
      const cap = a.stack || a.start || 14;
      if (v < 5) return { text: "El mínimo es $5 por compra (por las comisiones y el mínimo para vender en FOMO)." };
      if (v > cap) return { text: `No puede ser más que tu saldo: máximo $${cap.toFixed(2)}.` };
      return { text: `Entendí: $${v.toFixed(2)} por compra.`, payload: "monto_" + String(Math.round(v * 100) / 100).replace(".", "-") };
    }
    if (/\b(compra|compralo|comprame|vende|vendelo|vendeme)\b/.test(q) && !has("que hace", "boton", "como", "por compra", "cada compra")) {
      return { text: "Yo no compro ni vendo por ti. Cuando tus traders compren o vendan, te llega un aviso con el botón Comprar o Vender: lo tocas tú y confirmas en FOMO." };
    }
    if (has("automatic", "tu elige", "elige tu", "decide tu", "manejalo tu")) return { text: "Entendí: modo Automático (yo elijo monedas y monto).", payload: "auto" };
    if (/\b(pausa|pausar|parar|para todo|deten)\b/.test(q)) return { text: "Entendí: pausar las compras nuevas (lo abierto lo sigo cuidando).", payload: "parar" };
    if (/\b(reanuda|reanudar|seguir|sigue copiando|continua|continuar)\b/.test(q)) return { text: "Entendí: volver a copiar a tus traders.", payload: "seguir" };
    return null;
  }

  function answer(raw) {
    const q = norm(raw), s = st();
    const a = (s && s.assistant) || {};
    const has = (...w) => w.some((x) => q.includes(x));
    if (!q.trim()) return null;
    if (has("hola", "buenas", "hey")) return "¡Hola! Soy Grok. Pregúntame cómo vas, por qué compró una moneda o qué hace cada botón.";
    if (has("como voy", "saldo", "gane", "gano", "ganancia", "perdi", "pierdo", "resultado", "balance", "cuanto tengo")) {
      if (!s) return "Todavía estoy cargando tus datos. Prueba en unos segundos.";
      const pr = s.mode === "PAPER" ? " (modo práctica, no es dinero real)" : "";
      let t = `Tu saldo es ${usd(s.balance)}${pr}. Esta noche vas ${s.today_pct >= 0 ? "+" : ""}${(s.today_pct || 0).toFixed(1)}%.`;
      if (a.closed) t += ` Cerraste ${a.closed} copia${a.closed === 1 ? "" : "s"}: ${a.wins} con ganancia, total ${usd(a.closed_pnl)} (ya con ${usd(a.fees)} de comisiones).`;
      else t += " Todavía no se cerró ninguna copia.";
      if ((a.positions || []).length) t += ` Tienes abiertas: ${a.positions.map((p) => `${p.symbol || p.name} ${p.pct == null ? "" : (p.pct >= 0 ? "+" : "") + p.pct.toFixed(1) + "%"}`).join(", ")}.`;
      return t;
    }
    if (has("por que", "porque", "quien compro", "compro")) {
      const c = coinIn(q);
      const b = (a.buys || []).filter((x) => !c || x.symbol === c);
      if (!b.length) return c ? `No hubo compras de ${c} todavía. Te aviso cuando los traders de ${c} compren.` : "Todavía no hubo ninguna compra. Te aviso cuando tus traders compren BTC, ETH, SOL o XRP.";
      const x = b[0];
      const hh = new Date(x.ts * 1000).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
      return `${x.name}${x.symbol ? ` (${x.symbol})` : ""} a las ${hh}: ${x.why || "lo compraron tus traders"}. Solo aviso cuando un trader abre una compra; si apuesta a la baja no hago nada.`;
    }
    if (has("trader", "quienes", "a quien copio", "copias")) {
      const tr = (s && s.traders) || [];
      if (!tr.length) return "Todavía estoy eligiendo a tus traders. Tarda unos minutos.";
      const g = Object.keys(COINS).map((c) => {
        const l = tr.filter((r) => (r.chosen_for || []).includes(c));
        return l.length ? `${c}: ${l.map((r) => `${r.name || r.label} (${big(r.pnl_30d)} en 30 días)`).join(", ")}` : null;
      }).filter(Boolean);
      return (g.length ? g.join(". ") + "." : tr.map((r) => r.name || r.label).join(", ")) + " Los vuelvo a elegir cada día. En la pestaña Traders ves por qué elegí a cada uno.";
    }
    if (has("presupuesto", "cuanto pongo", "monto")) return `Yo manejo tu presupuesto${a.auto ? " (modo Automático)" : ""}: reparto tu saldo en ${a.max_open || 2} compras, guardo para la comisión y uso lo que vas ganando. Ahora cada compra es de $${(a.ticket || 5).toFixed(2)}. Tú solo tocas el botón.`;
    if (has("comprar")) return `Cuando un trader de BTC, ETH, SOL o XRP abre una compra, te llega Comprar con el monto exacto (ahora $${(a.ticket || 5).toFixed(2)}). Lo tocas y FOMO se abre con la moneda correcta. Si no lo tocas, no pasa nada. Máximo ${a.max_open || 2} monedas a la vez.`;
    if (has("vender", "venta")) return "Cuando tus traders cierran esa compra (o se pasan a la baja), te llega Vender. Lo tocas y vendes el 100% en FOMO. También te aviso si la moneda cae mucho (stop).";
    if (has("parar", "pausa", "detener")) return "Parar deja de mandarte compras nuevas (de un trader o de todo el escritorio). Lo que ya tienes abierto lo sigo cuidando. Escribe 'seguir' en Telegram para volver.";
    if (has("practica", "paper", "prueba", "real", "live")) return `Modo práctica: hago todo como si fuera de verdad, pero con $${a.start || 14} de mentira. Así ves cómo le iría a tu dinero sin arriesgar nada. Pasar a dinero real lo decides tú.`;
    if (has("comision", "fee", "cobra", "costo")) return "Con compras de $5, FOMO cobra cerca de 2% al comprar y 2% al vender (XRP, que está en Base, cerca de 0.5%). Si la moneda sube menos que eso, la comisión se come la ganancia. Ya las resto en tus números.";
    if (has("abiert", "posicion", "que tengo", "tengo")) {
      const p = a.positions || [];
      return p.length ? `Tienes ${p.length}: ${p.map((x) => `${x.name} ($${x.size}, ${x.pct == null ? "sin precio aún" : (x.pct >= 0 ? "+" : "") + x.pct.toFixed(1) + "%"}, por ${x.traders.join(", ") || "tus traders"})`).join("; ")}.` : "No tienes ninguna moneda abierta ahora.";
    }
    if (has("meme", "pump")) return "Nada de memecoins: solo copio Bitcoin, Ethereum, Solana y XRP.";
    if (has("dinero", "retir", "llega", "banco", "sacar")) return "El dinero siempre está en tu cuenta de FOMO. Yo nunca lo toco. Para sacarlo, usa las opciones de retiro de la app de FOMO.";
    if (has("riesgo", "seguro", "perder")) return "Copiar traders también puede perder, incluso a los mejores. Por eso empezamos en modo práctica y con compras chicas de $5.";
    if (has("gracias")) return "¡De nada! 💜";
    return null;
  }

  window.DeskAssistantLogic = { command, answer };   // pure parts (tested with node)

  function blob() {
    return `<svg viewBox="0 0 60 60" aria-hidden="true"><g class="gb-body">
      <path d="M10 40 Q8 10 30 9 Q52 10 50 40 Q49 50 30 50 Q11 50 10 40Z" fill="#bf5af2"/>
      <path d="M13 41 Q30 47 47 41 Q46 49 30 49.5 Q14 49 13 41Z" fill="#8e3bbd" opacity=".55"/>
      <path d="M30 9 V3" stroke="#8e3bbd" stroke-width="1.6"/><circle cx="30" cy="2.8" r="2.3" fill="#fff"/>
      <circle cx="24" cy="24" r="3" fill="#fff"/><circle cx="36" cy="24" r="3" fill="#fff"/>
      <circle cx="24.6" cy="24.6" r="1.6" fill="#111"/><circle cx="36.6" cy="24.6" r="1.6" fill="#111"/>
      <ellipse cx="20" cy="31" rx="2.6" ry="1.5" fill="#fff" opacity=".35"/><ellipse cx="40" cy="31" rx="2.6" ry="1.5" fill="#fff" opacity=".35"/>
      <path d="M27 31 Q30 34 33 31" stroke="#111" stroke-width="1.4" fill="none" stroke-linecap="round"/></g></svg>`;
  }

  function build() {
    if (document.getElementById("gb")) return;
    const el = document.createElement("div");
    el.id = "gb";
    el.innerHTML = `<button class="gb-btn tap" id="gb-btn" aria-label="Pregúntale a Grok">${blob()}</button>
      <div class="gb-panel" id="gb-panel" role="dialog" aria-label="Grok" hidden>
        <div class="gb-head"><span class="gb-mini">${blob()}</span><b>Grok</b><span class="gb-sub">responde con tus datos, aquí mismo</span>
          <button class="gb-x tap" id="gb-x" aria-label="Cerrar">×</button></div>
        <div class="gb-log" id="gb-log"></div>
        <div class="gb-chips" id="gb-chips">${CHIPS.map((c) => `<button class="gb-chip tap" data-q="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <form class="gb-form" id="gb-form" autocomplete="off"><input id="gb-in" maxlength="200" placeholder="Escribe tu pregunta…" aria-label="Pregunta"><button class="gb-send tap" aria-label="Enviar">➤</button></form>
      </div>`;
    document.body.appendChild(el);
    const log = el.querySelector("#gb-log");
    const add = (who, html) => { const d = document.createElement("div"); d.className = "gb-m " + who; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; };
    const ask = (q) => {
      add("me", esc(q));
      const c = command(q);
      if (c) {
        const s = st(), a = (s && s.assistant) || {};
        if (!c.payload) return add("bot", esc(c.text));
        const url = `${TG}?start=${encodeURIComponent(c.payload)}`;
        return add("bot", `${esc(c.text)} Tócalo y en Telegram toca <b>Iniciar</b> (o Enviar): el bot lo aplica y te confirma.` +
          `<a class="gb-tg tap" href="${esc(url)}" target="_blank" rel="noopener">Abrir en Telegram</a>` +
          (a.tg_muted ? `<span class="gb-note">Ojo: por ahora el bot de Telegram está en silencio, así que el cambio se aplicará cuando se active.</span>` : ""));
      }
      const r = answer(q);
      if (r) add("bot", esc(r));
      else add("bot", `No sé responder eso todavía.<a class="gb-tg tap" href="${TG}" target="_blank" rel="noopener">Escribir al bot de Telegram</a><span class="gb-note">o escríbele a Grok Bot en la app</span>`);
    };
    const open = (on) => {
      el.querySelector("#gb-panel").hidden = !on;
      el.classList.toggle("open", on);
      if (on && !log.childElementCount) add("bot", "¡Hola! Soy Grok 💜 Te ayudo con tu escritorio. Toca una pregunta o escríbela.");
    };
    el.querySelector("#gb-btn").addEventListener("click", () => open(el.querySelector("#gb-panel").hidden));
    el.querySelector("#gb-x").addEventListener("click", () => open(false));
    el.querySelector("#gb-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) ask(b.dataset.q); });
    el.querySelector("#gb-form").addEventListener("submit", (e) => { e.preventDefault(); const i = el.querySelector("#gb-in"); const v = i.value.trim(); if (v) { ask(v); i.value = ""; } });
    const sync = () => { const home = document.querySelector("#v-home.active"); el.hidden = !home; if (!home) open(false); };
    sync();
    new MutationObserver(sync).observe(document.getElementById("v-home"), { attributes: true, attributeFilter: ["class"] });
    window.DeskAssistant = { open, ask, answer, command };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
