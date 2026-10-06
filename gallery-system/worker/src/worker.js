/* Altus Aerials API — Cloudflare Worker
 *
 * Serves client galleries (HTML with per-gallery link previews), photos/zips from R2,
 * view/download pings, no-login booking requests, and Hadi's studio API.
 *
 * Bindings (Worker → Settings → Bindings):
 *   MEDIA  R2 bucket   altus-galleries
 *   DB     D1 database altus-db
 * Secrets / variables (Worker → Settings → Variables and Secrets):
 *   STUDIO_KEY           secret   passphrase for the studio pages
 *   PUBLIC_ORIGIN        text     https://altusaerials.com  (leave empty while testing on workers.dev)
 *   FIREBASE_API_KEY     text     Flightpath's Firebase Web API key (Project settings → General)
 *   FP_EMAIL             text     sign-in email of the Flightpath account the gallery system uses
 *   FP_PASSWORD          secret   that account's password
 *   (FIREBASE_SA         secret   alternative: service-account JSON, if your Google org allows keys)
 *   AUTO_SEND            text     "false" (flip to "true" once Twilio is registered)
 *   TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM   (later)
 *
 * The build step (tools/build_worker.py) inlines the front-end files as ASSETS below.
 */

/* __ASSETS__ */

const PACKAGES = ["Overview", "Showcase", "Signature", "Summit"];
const EVENTS = new Set(["open", "view_photo", "download_all", "download_photo", "share", "open_tour", "copy_tour", "book_click"]);
const enc = new TextEncoder();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

      // Front-end files bundled into the Worker (gallery assets, studio + rebook pages for pre-deploy testing)
      if (req.method === "GET" && ASSETS[path]) return asset(path, url);
      if (req.method === "GET" && ASSETS[path + "index.html"]) return asset(path + "index.html", url);
      if (req.method === "GET" && ASSETS[path + "/index.html"]) return Response.redirect(url.origin + path + "/", 301);

      let m;
      if ((m = path.match(/^\/gallery\/([a-z0-9-]{1,80})\/?$/)) && req.method === "GET") return galleryPage(m[1], url, env);
      if ((m = path.match(/^\/api\/g\/([a-z0-9-]{1,80})$/)) && req.method === "POST") return cors(await unlockGallery(m[1], req, url, env));
      if (path.startsWith("/m/") && (req.method === "GET" || req.method === "HEAD")) return media(path.slice(3), req, url, env);
      if (path === "/api/ping" && req.method === "POST") return cors(await ping(req, env));
      if (path === "/api/rebook/prefill" && req.method === "GET") return cors(await prefill(url, env));
      if (path === "/api/book" && req.method === "POST") return cors(await book(req, env, ctx));

      if (path.startsWith("/api/studio/")) {
        if (!(await authorized(req, env))) return cors(json({ error: "Wrong studio passphrase." }, 401));
        const r = path.slice("/api/studio/".length);
        if (r === "whoami" && req.method === "GET") return cors(json({ ok: true, flightpath: Flightpath.enabled(env), autoSend: env.AUTO_SEND === "true" }));
        if (r === "shoots" && req.method === "GET") return cors(json(await Flightpath.listUndelivered(env).catch(e => ({ connected: false, error: String(e.message || e), shoots: [] }))));
        if (r === "file" && req.method === "PUT") return cors(await putFile(req, url, env));
        if (r === "publish" && req.method === "POST") return cors(await publish(req, url, env));
        if (r === "activity" && req.method === "GET") return cors(json(await activity(env)));
        if (r === "send-text" && req.method === "POST") return cors(json(await sendDeliveryText(env, await req.json())));
      }
      if (path === "/" ) return Response.redirect((env.PUBLIC_ORIGIN || "https://altusaerials.com") + "/", 302);
      return notFound();
    } catch (err) {
      console.error(err && err.stack || err);
      return cors(json({ error: "Something went wrong on our side. Try again in a minute." }, 500));
    }
  }
};

/* ---------------- helpers ---------------- */
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET, HEAD, POST, PUT, OPTIONS");
  h.set("access-control-allow-headers", "authorization, content-type, x-file-name");
  h.set("access-control-expose-headers", "content-disposition, content-length");
  return new Response(res.body, { status: res.status, headers: h });
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function clip(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function sha256hex(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function timingSafeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
async function authorized(req, env) {
  const h = req.headers.get("authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!env.STUDIO_KEY || !key) return false;
  return timingSafeEq(await sha256hex(key), await sha256hex(env.STUDIO_KEY));
}
async function hashPassword(pw, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw.trim().toLowerCase()), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 10000 }, k, 256);
  return hex(bits);
}
function asset(path, url) {
  const a = ASSETS[path];
  let body = a.b64 ? b64ToBytes(a.body) : a.body;
  if (!a.b64 && path.endsWith("config.js")) body = `window.ALTUS_API = ${JSON.stringify(url.origin)};`;
  return new Response(body, { headers: { "content-type": a.type, "cache-control": a.type.startsWith("text/html") ? "no-cache" : "public, max-age=3600", "access-control-allow-origin": "*" } });
}
function notFound() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gallery not found | Altus Aerials</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#071a33;color:#fff;font:16px/1.5 -apple-system,Segoe UI,sans-serif;text-align:center;padding:24px">
<div><h1 style="font:600 28px Georgia,serif;margin:0 0 8px">We couldn't find that gallery</h1><p style="opacity:.8;margin:0 0 18px">Double-check the link in your text, or reach Hadi at (708) 778-0566.</p>
<a href="https://altusaerials.com/" style="color:#8ec5ff">altusaerials.com</a></div></body>`, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
}
function publicOrigin(env, url) { return (env.PUBLIC_ORIGIN || url.origin).replace(/\/$/, ""); }

/* ---------------- galleries ---------------- */
async function getGallery(env, slug) {
  return env.DB.prepare("SELECT * FROM galleries WHERE slug = ?").bind(slug).first();
}
function clientData(row, url, env) {
  const d = JSON.parse(row.data);
  const api = url.origin;
  const media = `${api}/m/${row.prefix}/`;
  return {
    slug: row.slug, address: row.address, cityLine: row.city_line || "", package: row.package, shootDate: row.shoot_date,
    imageBase: media, zipUrl: d.zipFile ? `${media}${encodeURIComponent(d.zipFile)}?dl=1` : null,
    cover: d.cover, photos: d.photos, floorPlans: d.floorPlans || [], tour: d.tour || { url: null },
    bookUrl: `${publicOrigin(env, url)}/rebook/?g=${row.slug}`,
    shareUrl: `${publicOrigin(env, url)}/gallery/${row.slug}/`,
    pingUrl: `${api}/api/ping`, logo: `${api}/assets/images/logo-white.png`
  };
}
async function galleryPage(slug, url, env) {
  const row = await getGallery(env, slug);
  if (!row) return notFound();
  const api = url.origin;
  const locked = !!row.pass_hash;
  const d = JSON.parse(row.data);
  const place = row.city_line ? `${row.address}, ${row.city_line}` : row.address;
  const pageUrl = `${publicOrigin(env, url)}/gallery/${slug}/`;
  const ogImage = locked ? `${api}/assets/gallery/og-default.jpg` : `${api}/m/${row.prefix}/full/${d.cover}.jpg`;
  const desc = locked ? "Private listing gallery by Altus Aerials." :
    `${d.photos.length} listing photos${/signature|summit/i.test(row.package) ? ", floor plans and a 3D tour" : ""}. Photos by Altus Aerials.`;
  const og = [
    `<title>${esc(place)} | Altus Aerials</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Altus Aerials">`,
    `<meta property="og:title" content="${esc(place)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${esc(ogImage)}">`,
    `<meta property="og:image:secure_url" content="${esc(ogImage)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:alt" content="${esc(locked ? "Altus Aerials" : "Front of " + place)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="${esc(pageUrl)}">`
  ].join("\n");
  const data = locked
    ? { locked: true, slug, address: row.address, cityLine: row.city_line || "", api }
    : clientData(row, url, env);
  const html = ASSETS["/assets/gallery/template.html"].body
    .replace("<!--OG-->", og)
    .replace(/__API__/g, api)
    .replace("<!--DATA-->", `<script id="gallery-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-robots-tag": "noindex" } });
}
async function unlockGallery(slug, req, url, env) {
  const row = await getGallery(env, slug);
  if (!row) return json({ error: "Not found" }, 404);
  if (row.pass_hash) {
    let pw = "";
    try { pw = String((await req.json()).password || ""); } catch (e) {}
    await new Promise(r => setTimeout(r, 300)); // slow down guessing a little
    if (!pw || !timingSafeEq(await hashPassword(pw, row.pass_salt), row.pass_hash)) return json({ error: "Wrong password" }, 403);
  }
  return json(clientData(row, url, env));
}

/* ---------------- media from R2 ---------------- */
async function media(key, req, url, env) {
  key = decodeURIComponent(key);
  if (!/^g\/[a-z0-9-]+\/[A-Za-z0-9 ._()\/-]+$/.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("access-control-allow-origin", "*");
  h.set("access-control-expose-headers", "content-disposition, content-length");
  h.set("cache-control", "public, max-age=31536000, immutable");
  if (url.searchParams.has("dl")) {
    const name = (obj.customMetadata && obj.customMetadata.filename) || key.split("/").pop();
    h.set("content-disposition", `attachment; filename="${name.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers: h });
  let status = 200;
  if (obj.range && req.headers.has("range")) {
    const r = obj.range, start = r.offset || 0, len = r.length != null ? r.length : obj.size - start;
    h.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    h.set("content-length", String(len));
    status = 206;
  } else h.set("content-length", String(obj.size));
  return new Response(req.method === "HEAD" ? null : obj.body, { status, headers: h });
}

/* ---------------- tracking ---------------- */
async function ping(req, env) {
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return json({ ok: false }, 400); }
  const slug = clip(b.g, 80), ev = clip(b.e, 20);
  if (!/^[a-z0-9-]+$/.test(slug) || !EVENTS.has(ev)) return json({ ok: false }, 400);
  await env.DB.prepare("INSERT INTO events (slug, event, photo, visitor, ts) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM galleries WHERE slug = ?)")
    .bind(slug, ev, clip(b.p, 60) || null, clip(b.v, 16) || null, Date.now(), slug).run();
  return json({ ok: true });
}

/* ---------------- booking requests (no login) ---------------- */
async function prefill(url, env) {
  const slug = clip(url.searchParams.get("g"), 80);
  const row = slug && await env.DB.prepare("SELECT agent_name, agent_phone, agent_email, package FROM galleries WHERE slug = ?").bind(slug).first();
  if (!row) return json({});
  return json({ name: row.agent_name || "", phone: row.agent_phone || "", email: row.agent_email || "", lastPackage: row.package || "" });
}
async function book(req, env, ctx) {
  let b; try { b = await req.json(); } catch (e) { return json({ error: "Please fill in the form and try again." }, 400); }
  if (b.website) return json({ ok: true }); // honeypot
  const r = {
    name: clip(b.name, 80), phone: clip(b.phone, 30), email: clip(b.email, 120), address: clip(b.address, 160),
    city: clip(b.city, 80), package: clip(b.package, 20), date: clip(b.date, 10), window: clip(b.window, 20),
    notes: clip(b.notes, 1000), from: clip(b.from, 80)
  };
  const missing = [];
  if (!r.name) missing.push("your name");
  if (r.phone.replace(/\D/g, "").length < 10) missing.push("a phone number");
  if (!r.address) missing.push("the property address");
  if (!PACKAGES.includes(r.package)) missing.push("a package");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) missing.push("a date");
  if (missing.length) return json({ error: "Please add " + missing.join(", ") + "." }, 400);
  const res = await env.DB.prepare(`INSERT INTO bookings (created_at, name, phone, email, address, city, package, date, time_window, notes, from_slug, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')`)
    .bind(Date.now(), r.name, r.phone, r.email, r.address, r.city, r.package, r.date, r.window, r.notes, r.from || null).run();
  const id = res.meta && res.meta.last_row_id;
  ctx.waitUntil(Flightpath.createRequest(env, r).then(fpId => fpId && env.DB.prepare("UPDATE bookings SET flightpath_id = ? WHERE id = ?").bind(fpId, id).run()).catch(e => console.error("flightpath", e)));
  return json({ ok: true, id });
}

/* ---------------- studio ---------------- */
async function putFile(req, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!/^g\/[a-z0-9-]+-[a-z0-9]{10,}\/(full|thumb|plans|zip)\/[A-Za-z0-9 ._()-]{1,120}$/.test(key)) return json({ error: "Bad file path" }, 400);
  const type = req.headers.get("content-type") || "application/octet-stream";
  if (!/^(image\/(jpeg|png)|application\/zip)$/.test(type)) return json({ error: "Only JPG, PNG and ZIP files" }, 415);
  const filename = clip(req.headers.get("x-file-name"), 140) || key.split("/").pop();
  await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: type }, customMetadata: { filename } });
  return json({ ok: true, key });
}
function slugify(s) { return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "gallery"; }
async function publish(req, url, env) {
  const b = await req.json();
  const address = clip(b.address, 160);
  if (!address) return json({ error: "Add the property address." }, 400);
  if (!PACKAGES.includes(b.package)) return json({ error: "Pick a package." }, 400);
  if (!/^g\/[a-z0-9-]+-[a-z0-9]{10,}$/.test(b.prefix || "")) return json({ error: "Upload didn't finish. Publish again." }, 400);
  const photos = (b.photos || []).filter(p => p && /^(ext|int)-\d{2,3}$/.test(p.id) && (p.kind === "EXT" || p.kind === "INT"))
    .map(p => ({ id: p.id, kind: p.kind, n: p.n | 0, tw: p.tw | 0, th: p.th | 0 }));
  if (!photos.length) return json({ error: "No photos to publish." }, 400);
  const data = {
    cover: photos.some(p => p.id === b.cover) ? b.cover : photos[0].id,
    photos,
    floorPlans: (b.floorPlans || []).slice(0, 8).map(f => ({ label: clip(f.label, 40) || "Floor plan", src: clip(f.src, 140), file: clip(f.file, 120) })),
    tour: { url: /^https:\/\//.test(b.tourUrl || "") ? clip(b.tourUrl, 500) : null, embed: false },
    zipFile: clip(b.zipFile, 140) || null
  };
  // unique slug: 3524-saratoga-ave, then 3524-saratoga-ave-2 …
  let slug;
  if (b.replaceSlug && /^[a-z0-9-]{1,80}$/.test(b.replaceSlug) && await getGallery(env, b.replaceSlug)) slug = b.replaceSlug; // re-publish same link
  else {
    const base = slugify(b.slug || address); slug = base;
    for (let n = 2; await getGallery(env, slug); n++) slug = `${base}-${n}`;
  }
  let salt = null, hash = null;
  if (b.password && String(b.password).trim()) { salt = crypto.randomUUID(); hash = await hashPassword(String(b.password), salt); }
  await env.DB.prepare(`INSERT OR REPLACE INTO galleries (slug, address, city_line, package, shoot_date, agent_name, agent_phone, agent_email, flightpath_id, prefix, data, pass_salt, pass_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(slug, address, clip(b.cityLine, 80), b.package, clip(b.shootDate, 10), clip(b.agentName, 80), clip(b.agentPhone, 30), clip(b.agentEmail, 120),
      clip(b.flightpathId, 80) || null, b.prefix, JSON.stringify(data), salt, hash, Date.now()).run();
  const galleryUrl = `${publicOrigin(env, url)}/gallery/${slug}/`;
  let flightpath = { ok: false, reason: "not-connected" };
  if (b.flightpathId) flightpath = await Flightpath.markDelivered(env, b.flightpathId, galleryUrl).catch(e => ({ ok: false, reason: String(e.message || e) }));
  return json({ ok: true, slug, url: galleryUrl, flightpath, autoSend: env.AUTO_SEND === "true" });
}
async function activity(env) {
  const galleries = (await env.DB.prepare(`SELECT g.slug, g.address, g.city_line, g.package, g.shoot_date, g.agent_name, g.agent_phone, g.created_at,
      (g.pass_hash IS NOT NULL) AS locked,
      SUM(e.event = 'open') AS opens, COUNT(DISTINCT CASE WHEN e.event = 'open' THEN e.visitor END) AS visitors,
      MIN(CASE WHEN e.event = 'open' THEN e.ts END) AS first_open, MAX(e.ts) AS last_seen,
      SUM(e.event = 'download_all') AS zips, SUM(e.event = 'download_photo') AS saves,
      SUM(e.event IN ('open_tour', 'copy_tour')) AS tour, SUM(e.event = 'share') AS shares, SUM(e.event = 'book_click') AS book_clicks
    FROM galleries g LEFT JOIN events e ON e.slug = g.slug GROUP BY g.slug ORDER BY g.created_at DESC LIMIT 200`).all()).results;
  const bookings = (await env.DB.prepare("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 100").all()).results;
  // Agents: last shoot = latest delivered gallery or Flightpath shoot, matched on phone digits.
  const agents = {};
  const key = p => String(p || "").replace(/\D/g, "").slice(-10);
  for (const g of galleries) {
    const k = key(g.agent_phone); if (!k) continue;
    const a = agents[k] || (agents[k] = { name: g.agent_name, phone: g.agent_phone, last: "", shoots: 0 });
    a.shoots++; if ((g.shoot_date || "") > a.last) a.last = g.shoot_date;
  }
  // Booking requests aren't confirmed shoots, so they don't count toward "last shoot".
  const fp = await Flightpath.lastBookingsByPhone(env).catch(() => null);
  if (fp) for (const [k, v] of Object.entries(fp)) { const a = agents[k] || (agents[k] = { name: v.name, phone: v.phone, last: "", shoots: 0 }); if (v.last > a.last) a.last = v.last; }
  return { galleries, bookings, agents: Object.values(agents), source: fp ? "flightpath" : "galleries" };
}

/* ---------------- delivery text (manual today, auto later) ---------------- */
async function sendDeliveryText(env, { to, body }) {
  if (env.AUTO_SEND !== "true" || !env.TWILIO_SID) return { sent: false, reason: "auto-send is off" };
  const digits = String(to || "").replace(/\D/g, "");
  if (digits.length < 10) return { sent: false, reason: "no phone number" };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: "+1" + digits.slice(-10), From: env.TWILIO_FROM, Body: clip(body, 1200) })
  });
  return { sent: r.ok, status: r.status };
}

/* ---------------- Flightpath (Firebase project flightpath-altus) ----------------
 * Talks to Flightpath's Firestore "shoots" collection with a service account
 * signing in as its own Flightpath user (FP_EMAIL / FP_PASSWORD / FIREBASE_API_KEY), so Flightpath's
 * existing security rules apply. A service account (FIREBASE_SA) also works. Field names match the app:
 *   client, phone, email, address, lat, lng, date (YYYY-MM-DD), time (HH:MM), notes,
 *   paymentType ('free'|'paid'), amount, paymentStatus, paidAt,
 *   status ('scheduled'|'shot'|'editing'|'delivered'), timestamps{...}, deliveredBy, createdAt
 * Added by this integration (optional, ignored by older app versions):
 *   package, galleryUrl, source, requestedTime, fromGallery
 * Booking requests are shoots with status "requested"; Flightpath shows them in a
 * Requests section with Confirm / Decline (see the flightpath branch).
 * Everything is a no-op until those settings are added.
 */
const PRICES = { Overview: 149, Showcase: 349, Signature: 499, Summit: 649 };
const fsVal = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
  return { stringValue: String(v) };
};
const fromFs = v => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
  return null;
};
const digits10 = p => String(p || "").replace(/\D/g, "").slice(-10);
const fpPhone = p => { const d = digits10(p); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(p || ""); };
function splitAddress(full) {
  // "3524 Saratoga Ave, Downers Grove, IL 60515, USA" -> street / city / state
  const parts = String(full || "").split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length && /^(usa|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  const street = parts[0] || "";
  let city = parts[1] || "", state = "";
  const st = (parts[2] || "").match(/^([A-Z]{2})\b/);
  if (st) state = st[1];
  else { const m = city.match(/^(.*?)\s+([A-Z]{2})(\s+\d{5})?$/); if (m) { city = m[1]; state = m[2]; } }
  return { street, city, state };
}
function to24h(label) {
  const m = String(label || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
const Flightpath = {
  _tok: null, _exp: 0,
  enabled(env) { return !!(env.FIREBASE_SA || (env.FP_EMAIL && env.FP_PASSWORD && env.FIREBASE_API_KEY)); },
  project(env) {
    if (env.FIREBASE_PROJECT_ID) return env.FIREBASE_PROJECT_ID;
    if (env.FIREBASE_SA) { try { return JSON.parse(env.FIREBASE_SA).project_id || "flightpath-altus"; } catch (e) {} }
    return "flightpath-altus";
  },
  base(env) {
    if (env.FIRESTORE_BASE) return env.FIRESTORE_BASE.replace(/\/$/, "");
    return `https://firestore.googleapis.com/v1/projects/${this.project(env)}/databases/(default)/documents`;
  },
  async token(env) {
    if (this._tok && Date.now() < this._exp - 60000) return this._tok;
    if (!env.FIREBASE_SA) return this.userToken(env);
    const sa = JSON.parse(env.FIREBASE_SA);
    const now = Math.floor(Date.now() / 1000);
    const tokenUrl = env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
    const b64u = s => btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const unsigned = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
    const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const key = await crypto.subtle.importKey("pkcs8", b64ToBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sigBytes = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
    let bin = ""; for (const b of sigBytes) bin += String.fromCharCode(b);
    const r = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64u(bin)}` }) });
    if (!r.ok) throw new Error("Flightpath sign-in failed (" + r.status + ")");
    const j = await r.json();
    this._tok = j.access_token; this._exp = Date.now() + (j.expires_in || 3600) * 1000;
    return this._tok;
  },
  // Signs in like the Flightpath app does (email + password), so Flightpath's own rules apply.
  async userToken(env) {
    const url = (env.IDENTITY_URL || "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword") + "?key=" + encodeURIComponent(env.FIREBASE_API_KEY);
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", referer: env.FP_REFERER || "https://flightpath-altus.netlify.app/" },
      body: JSON.stringify({ email: env.FP_EMAIL, password: env.FP_PASSWORD, returnSecureToken: true })
    });
    if (!r.ok) {
      let msg = ""; try { msg = (await r.json()).error.message; } catch (e) {}
      throw new Error("Flightpath sign-in failed" + (msg ? ": " + msg : ` (${r.status})`));
    }
    const j = await r.json();
    this._tok = j.idToken; this._exp = Date.now() + Number(j.expiresIn || 3600) * 1000;
    return this._tok;
  },
  async call(env, method, path, body) {
    const r = await fetch(this.base(env) + path, { method, headers: { authorization: "Bearer " + await this.token(env), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`Flightpath ${method} failed (${r.status})`);
    return r.json();
  },
  async allShoots(env) {
    const out = []; let pageToken = "";
    for (let i = 0; i < 20; i++) {
      const j = await this.call(env, "GET", `/shoots?pageSize=300${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`);
      for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...fromFs({ mapValue: { fields: d.fields || {} } }) });
      if (!j.nextPageToken) break; pageToken = j.nextPageToken;
    }
    return out;
  },
  async listUndelivered(env) {
    if (!this.enabled(env)) return { connected: false, shoots: [] };
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
    const shoots = (await this.allShoots(env))
      .filter(s => ["scheduled", "shot", "editing"].includes(s.status) && s.date && s.date <= today && s.date >= cutoff)
      .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
      .map(s => {
        const a = splitAddress(s.address);
        const pkg = PACKAGES.includes(s.package) ? s.package : (Object.keys(PRICES).find(k => PRICES[k] === Number(s.amount)) || "");
        return { id: s.id, address: a.street, city: a.city, state: a.state || "IL", date: s.date, package: pkg,
          agentName: s.client || "", agentPhone: s.phone || "", agentEmail: s.email || "", status: s.status };
      });
    return { connected: true, shoots };
  },
  async markDelivered(env, id, galleryUrl) {
    if (!this.enabled(env)) return { ok: false, reason: "not-connected" };
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return { ok: false, reason: "bad-id" };
    const fields = ["status", "timestamps.delivered", "deliveredBy", "galleryUrl"];
    const q = fields.map(f => "updateMask.fieldPaths=" + encodeURIComponent(f)).join("&") + "&currentDocument.exists=true";
    await this.call(env, "PATCH", `/shoots/${id}?${q}`, { fields: {
      status: fsVal("delivered"), deliveredBy: fsVal("gallery@altusaerials.com"), galleryUrl: fsVal(galleryUrl),
      timestamps: fsVal({ delivered: new Date().toISOString() }) } });
    return { ok: true };
  },
  async createRequest(env, r) {
    if (!this.enabled(env)) return null;
    const time = to24h(r.window);
    const lines = [`Booking request from the gallery page: ${r.package}.`, `Preferred: ${r.date}${r.window ? ", " + r.window : ""}.`];
    if (r.notes) lines.push(r.notes);
    const doc = {
      client: r.name, phone: fpPhone(r.phone), email: r.email || "",
      address: r.city ? `${r.address}, ${r.city}` : r.address, lat: null, lng: null,
      date: r.date, time, notes: lines.join("\n"),
      paymentType: "paid", amount: PRICES[r.package] || null, paymentStatus: "pending", paidAt: null,
      status: "requested", package: r.package, source: "rebook", requestedTime: r.window || "", fromGallery: r.from || "",
      timestamps: { requested: new Date().toISOString(), scheduled: null, shot: null, editing: null, delivered: null },
      createdAt: new Date()
    };
    const j = await this.call(env, "POST", "/shoots", { fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, fsVal(v)])) });
    return j.name ? j.name.split("/").pop() : null;
  },
  async lastBookingsByPhone(env) {
    if (!this.enabled(env)) return null;
    const map = {};
    for (const s of await this.allShoots(env)) {
      if (s.status === "requested" || !s.date) continue;
      const k = digits10(s.phone); if (k.length !== 10) continue;
      const a = map[k] || (map[k] = { name: s.client || "", phone: s.phone, last: "" });
      if (s.date > a.last) { a.last = s.date; a.name = s.client || a.name; }
    }
    return map;
  }
};
