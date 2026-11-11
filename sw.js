// Service worker: offline shell, web push, tap opens the links.py coin URL carried in the push payload.
const SHELL = "desk-shell-v9";
const FILES = ["/", "/app.css", "/app.js", "/chart.js", "/office.js", "/assistant.js", "/manifest.json", "/icons/icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  // same-origin shell: network first (with the tunnel's no-interstitial header), cache fallback
  e.respondWith(
    fetch(u.href, { headers: { "X-Pinggy-No-Screen": "1" }, credentials: "include", cache: "no-store" })
      .then((r) => {
        if (r.ok && FILES.includes(u.pathname)) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(u.pathname, cp)); }
        return r;
      })
      .catch(() => caches.match(u.pathname).then((r) => r || caches.match("/")))
  );
});
self.addEventListener("push", (e) => {
  // the desk only sends majority Comprar/Vender alerts here
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: "Grok Desk Trading", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Grok Desk Trading", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", data: { url: d.url },
    tag: d.tag || undefined, renotify: !!d.tag, requireInteraction: true, vibrate: [200, 100, 200],
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;  // exact links.py URL (r=savipww)
  if (url && /^https:\/\/fomo\.family\//.test(url)) { e.waitUntil(self.clients.openWindow(url)); return; }
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((ws) => (ws.length ? ws[0].focus() : self.clients.openWindow("/"))));
});
