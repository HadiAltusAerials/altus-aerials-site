/* Studio → Deliver a shoot.
   Pick the shoot, drop the edited folder, curate, publish. Photos are resized in the
   browser (1920px, JPEG 80) before upload, so a 400 MB folder uploads as ~15 MB. */
(function () {
  "use strict";
  var S = window.Studio, esc = S.esc;
  var PACKAGES = [["Overview", 149], ["Showcase", 349], ["Signature", 499], ["Summit", 649]];
  var MAX_EDGE = 1920, QUALITY = 0.8, THUMB_EDGE = 800, THUMB_Q = 0.72;
  var st = { info: null, shoots: [], photos: [], cover: null, plans: [], busy: false, lastSlug: null };
  var app = document.getElementById("app");

  S.requireKey(app, function (info) { st.info = info; renderShell(); loadShoots(); });

  /* ---------- layout ---------- */
  function renderShell() {
    app.innerHTML =
      '<div><h1>Deliver a shoot</h1><p class="lede">Pick the shoot, drop the edited folder, tap any photo you want to leave out, then publish. You get a link and a text ready to send.</p></div>' +

      '<section class="card" aria-labelledby="s1"><div class="card-head"><h2 id="s1"><span class="step">1</span>Shoot</h2><span id="fp-status"></span></div>' +
        '<label class="f wide" id="shoot-pick-wrap" hidden>From Flightpath<select id="shoot-pick"><option value="">Choose a shoot…</option></select></label>' +
        '<div class="fields">' +
          '<label class="f wide">Property address<input id="f-address" type="text" placeholder="3524 Saratoga Ave" autocomplete="off" required></label>' +
          '<label class="f">City<input id="f-city" type="text" placeholder="Downers Grove" autocomplete="off"></label>' +
          '<label class="f">State<input id="f-state" type="text" value="IL" maxlength="2" autocomplete="off"></label>' +
          '<label class="f">Package<select id="f-package">' + PACKAGES.map(function (p) { return '<option value="' + p[0] + '">' + p[0] + ' ($' + p[1] + ')</option>'; }).join("") + '</select></label>' +
          '<label class="f">Shoot date<input id="f-date" type="date"></label>' +
          '<label class="f">Agent name<input id="f-agent" type="text" autocomplete="off"></label>' +
          '<label class="f">Agent mobile<input id="f-phone" type="tel" autocomplete="off" placeholder="(708) 555-0123"></label>' +
          '<label class="f">Agent email (optional)<input id="f-email" type="email" autocomplete="off"></label>' +
        '</div></section>' +

      '<section class="card" aria-labelledby="s2"><div class="card-head"><h2 id="s2"><span class="step">2</span>Photos</h2><span class="muted" id="photo-count"></span></div>' +
        '<label class="drop" id="drop" for="pick-folder">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6m0-6-2.5 2.5M12 11l2.5 2.5"/></svg>' +
          '<b>Drop the shoot folder here</b><span>or tap to choose it. JPG and PNG. Anything inside an "MLS" subfolder is skipped.</span></label>' +
        '<input id="pick-folder" type="file" webkitdirectory directory multiple hidden>' +
        '<div class="row"><button class="link" type="button" id="pick-files-btn">Choose individual photos instead</button><input id="pick-files" type="file" accept="image/jpeg,image/png" multiple hidden></div>' +
        '<div class="legend" id="legend" hidden><span><b>Tap</b> a photo to exclude or include it</span><span><b>★</b> sets the cover</span><span><b>EXT/INT</b> switches its section</span></div>' +
        '<div id="tiles"></div></section>' +

      '<section class="card" aria-labelledby="s3" id="sig-card"><div class="card-head"><h2 id="s3"><span class="step">3</span>Floor plans and 3D tour</h2><span class="muted">Signature and Summit</span></div>' +
        '<p class="muted" style="margin:0">Export the floor plans from the Zillow 3D Home app as PNG or JPG and drop them here, then paste the tour link from the same app.</p>' +
        '<label class="drop" id="plan-drop" for="pick-plans" style="padding:18px"><b>Drop floor plan images</b><span>PNG or JPG, one per level</span></label>' +
        '<input id="pick-plans" type="file" accept="image/png,image/jpeg" multiple hidden>' +
        '<div class="plans-list" id="plans"></div>' +
        '<label class="f wide">3D tour link<input id="f-tour" type="url" placeholder="https://www.zillow.com/view-imx/…" autocomplete="off"></label>' +
      '</section>' +

      '<section class="card" aria-labelledby="s4"><h2 id="s4"><span class="step" id="s4n">4</span>Privacy</h2>' +
        '<label class="switch"><input type="checkbox" id="f-lock"> Password-protect this gallery (pre-listing)</label>' +
        '<label class="f" id="pw-wrap" hidden>Password for the agent<input id="f-pw" type="text" autocomplete="off" placeholder="e.g. saratoga"></label>' +
        '<p class="muted" style="margin:0">The password goes in the text automatically. Link previews show the Altus logo instead of the house while it\'s locked.</p>' +
      '</section>' +

      '<section class="card" id="result" hidden aria-live="polite"></section>' +

      '<div class="sticky-go"><div class="row" style="justify-content:space-between">' +
        '<div style="flex:1 1 220px;min-width:0"><div class="progress" id="prog" hidden><i></i></div><p class="muted" id="status" style="margin:6px 0 0">Add photos to get started.</p></div>' +
        '<button class="btn btn-primary" type="button" id="publish" disabled>Publish gallery</button></div></div>';

    wire();
    syncPackage();
    var d = new Date(); document.getElementById("f-date").value = d.toISOString().slice(0, 10);
  }

  function loadShoots() {
    var badge = document.getElementById("fp-status");
    S.api("/api/studio/shoots").then(function (r) {
      st.shoots = (r && r.shoots) || [];
      if (r.error) { badge.innerHTML = '<span class="pill bad" title="' + esc(r.error) + '">Flightpath error: ' + esc(r.error) + '</span>'; return; }
      if (!r.connected) { badge.innerHTML = '<span class="pill warn">Flightpath not connected yet: fill in by hand</span>'; return; }
      badge.innerHTML = '<span class="pill good">Flightpath connected</span>';
      if (!st.shoots.length) return;
      var sel = document.getElementById("shoot-pick");
      st.shoots.forEach(function (s, i) { var o = document.createElement("option"); o.value = i; o.textContent = s.date + " · " + s.address + (s.agentName ? " · " + s.agentName : "") + (s.package ? " · " + s.package : ""); sel.appendChild(o); });
      document.getElementById("shoot-pick-wrap").hidden = false;
    }, function () { badge.innerHTML = '<span class="pill warn">Couldn\'t load Flightpath shoots</span>'; });
  }

  /* ---------- events ---------- */
  function $(id) { return document.getElementById(id); }
  function wire() {
    $("shoot-pick").addEventListener("change", function () {
      var s = st.shoots[this.value]; if (!s) return;
      $("f-address").value = s.address || ""; $("f-city").value = s.city || ""; $("f-state").value = s.state || "IL";
      if (s.package) $("f-package").value = s.package; $("f-date").value = s.date || "";
      $("f-agent").value = s.agentName || ""; $("f-phone").value = s.agentPhone || ""; $("f-email").value = s.agentEmail || "";
      syncPackage(); validate();
    });
    $("f-package").addEventListener("change", syncPackage);
    $("f-address").addEventListener("input", validate);
    $("f-lock").addEventListener("change", function () { $("pw-wrap").hidden = !this.checked; if (this.checked) $("f-pw").focus(); });
    $("pick-folder").addEventListener("change", function () { addFiles(Array.from(this.files).map(function (f) { return { file: f, path: f.webkitRelativePath || f.name }; })); this.value = ""; });
    $("pick-files-btn").addEventListener("click", function () { $("pick-files").click(); });
    $("pick-files").addEventListener("change", function () { addFiles(Array.from(this.files).map(function (f) { return { file: f, path: f.name }; })); this.value = ""; });
    $("pick-plans").addEventListener("change", function () { addPlans(Array.from(this.files)); this.value = ""; });
    dropZone($("drop"), function (list) { addFiles(list); });
    dropZone($("plan-drop"), function (list) { addPlans(list.map(function (x) { return x.file; })); });
    $("tiles").addEventListener("click", onTile);
    $("plans").addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm]"); if (!b) return;
      var p = st.plans.splice(+b.dataset.rm, 1)[0]; if (p) URL.revokeObjectURL(p.url); renderPlans();
    });
    $("plans").addEventListener("input", function (e) { var i = e.target.dataset.label; if (i != null) st.plans[+i].label = e.target.value; });
    $("publish").addEventListener("click", publish);
  }
  function syncPackage() {
    var sig = /Signature|Summit/.test($("f-package").value);
    $("sig-card").hidden = !sig; $("s4n").textContent = sig ? "4" : "3";
  }
  function dropZone(el, cb) {
    ["dragenter", "dragover"].forEach(function (t) { el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { el.addEventListener(t, function () { el.classList.remove("over"); }); });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      var items = e.dataTransfer.items, entries = [];
      if (items && items.length && items[0].webkitGetAsEntry) {
        for (var i = 0; i < items.length; i++) { var en = items[i].webkitGetAsEntry(); if (en) entries.push(en); }
        walk(entries).then(cb);
      } else cb(Array.from(e.dataTransfer.files).map(function (f) { return { file: f, path: f.name }; }));
    });
  }
  function walk(entries) {
    var out = [];
    function visit(entry, prefix) {
      if (entry.isFile) return new Promise(function (ok) { entry.file(function (f) { out.push({ file: f, path: prefix + f.name }); ok(); }, ok); });
      if (entry.isDirectory) {
        var reader = entry.createReader(), all = [];
        return new Promise(function (ok) {
          (function more() {
            reader.readEntries(function (batch) {
              if (!batch.length) return Promise.all(all.map(function (c) { return visit(c, prefix + entry.name + "/"); })).then(ok);
              all = all.concat(Array.from(batch)); more();
            }, ok);
          })();
        });
      }
      return Promise.resolve();
    }
    return Promise.all(entries.map(function (e) { return visit(e, ""); })).then(function () { return out; });
  }

  /* ---------- photos ---------- */
  function classify(path, name) {
    var m = name.match(/\((EXT|INT)\)\s*Image\s*(\d+)/i);
    if (m) return { kind: m[1].toUpperCase(), n: +m[2], sure: true };
    var num = (name.match(/(\d+)/) || [])[1];
    var low = path.toLowerCase();
    if (/(^|\/)interior/.test(low) || /\b(kitchen|bath|bed|living|dining|closet|hall|laundry|basement)/.test(low)) return { kind: "INT", n: num ? +num : 999, sure: true };
    if (/(^|\/)exterior/.test(low) || /sunset|twilight|dusk|aerial|drone/.test(low)) return { kind: "EXT", n: num ? +num : (/sunset|twilight|dusk/.test(low) ? 0 : 999), sure: true };
    return { kind: "EXT", n: num ? +num : 999, sure: false };
  }
  function addFiles(list) {
    var seen = {}; st.photos.forEach(function (p) { seen[p.file.name + p.file.size] = 1; });
    var added = 0, skipped = 0;
    list.forEach(function (x) {
      var name = x.file.name;
      if (!/\.(jpe?g|png)$/i.test(name) || name.charAt(0) === ".") return;
      if (/(^|\/)mls\//i.test(x.path)) { skipped++; return; }
      if (seen[name + x.file.size]) return; seen[name + x.file.size] = 1;
      var c = classify(x.path, name);
      st.photos.push({ file: x.file, name: name, kind: c.kind, n: c.n, sure: c.sure, off: false, preview: null, uid: Math.random().toString(36).slice(2) });
      added++;
    });
    st.photos.sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === "EXT" ? -1 : 1) || a.n - b.n || a.name.localeCompare(b.name); });
    if (!st.cover || st.photos.indexOf(st.cover) < 0) st.cover = st.photos.filter(function (p) { return p.kind === "EXT"; })[0] || st.photos[0] || null;
    renderTiles(); makePreviews(); validate();
    if (skipped) setStatus(added + " photos added. Skipped " + skipped + " in the MLS folder.");
  }
  function makePreviews() {
    var queue = st.photos.filter(function (p) { return !p.preview && !p.pending; });
    var running = 0;
    function next() {
      if (!queue.length || running >= 3) return;
      var p = queue.shift(); p.pending = true; running++;
      createImageBitmap(p.file, { resizeWidth: 360, resizeQuality: "medium" }).then(function (bmp) {
        var c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
        return new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.7); });
      }).then(function (b) {
        p.preview = URL.createObjectURL(b);
        var img = document.querySelector('[data-uid="' + p.uid + '"] img'); if (img) img.src = p.preview;
      }).catch(function () {}).then(function () { running--; next(); });
      next();
    }
    next();
  }
  function tileHtml(p) {
    var cls = "pt" + (p.off ? " off" : "") + (p === st.cover ? " cover" : "");
    return '<button type="button" class="' + cls + '" data-uid="' + p.uid + '" aria-pressed="' + (!p.off) + '" aria-label="' + esc(p.name) + (p.off ? ", excluded" : ", included") + '">' +
      '<img alt="" src="' + (p.preview || "data:image/gif;base64,R0lGODlhAQABAAAAACw=") + '">' +
      (!p.sure ? '<span class="kindwarn">Check section</span>' : '') +
      '<span class="tools"><span data-k="kind" role="button" aria-label="Switch section">' + p.kind + '</span><span data-k="cover" class="' + (p === st.cover ? "on" : "") + '" role="button" aria-label="Make cover">★</span></span>' +
      '<span class="name">' + esc(p.name.replace(/\.(jpe?g|png)$/i, "")) + '</span></button>';
  }
  function renderTiles() {
    var ext = st.photos.filter(function (p) { return p.kind === "EXT"; }), int = st.photos.filter(function (p) { return p.kind === "INT"; });
    var sec = function (title, list) { return list.length ? '<h3 style="margin:16px 0 8px;font-size:15px">' + title + ' <span class="muted">' + list.filter(function (p) { return !p.off; }).length + ' of ' + list.length + '</span></h3><div class="ptiles">' + list.map(tileHtml).join("") + '</div>' : ""; };
    $("tiles").innerHTML = sec("Exteriors", ext) + sec("Interiors", int);
    $("legend").hidden = !st.photos.length;
    var on = st.photos.filter(function (p) { return !p.off; }).length;
    $("photo-count").textContent = st.photos.length ? on + " of " + st.photos.length + " photos included" : "";
  }
  function onTile(e) {
    var t = e.target.closest(".pt"); if (!t || st.busy) return;
    var p = st.photos.filter(function (x) { return x.uid === t.dataset.uid; })[0]; if (!p) return;
    var k = e.target.closest("[data-k]");
    if (k && k.dataset.k === "cover") { st.cover = p; p.off = false; }
    else if (k && k.dataset.k === "kind") { p.kind = p.kind === "EXT" ? "INT" : "EXT"; p.sure = true; st.photos.sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === "EXT" ? -1 : 1) || a.n - b.n; }); }
    else {
      p.off = !p.off;
      if (p.off && p === st.cover) st.cover = st.photos.filter(function (x) { return !x.off && x.kind === "EXT"; })[0] || st.photos.filter(function (x) { return !x.off; })[0] || null;
    }
    renderTiles(); validate();
  }

  /* ---------- floor plans ---------- */
  var LEVELS = ["Main level", "Second level", "Lower level", "Third level"];
  function addPlans(files) {
    files.filter(function (f) { return /\.(png|jpe?g)$/i.test(f.name); }).forEach(function (f) {
      var base = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      var generic = !/[a-z]{3}/i.test(base) || /^(img|image|screenshot|photo|scan|download)\b/i.test(base);
      st.plans.push({ file: f, url: URL.createObjectURL(f), label: generic ? (LEVELS[st.plans.length] || ("Floor plan " + (st.plans.length + 1))) : base.slice(0, 40) });
    });
    renderPlans();
  }
  function renderPlans() {
    $("plans").innerHTML = st.plans.map(function (p, i) {
      return '<div class="plan-row"><img src="' + p.url + '" alt=""><label class="f">Label<input type="text" data-label="' + i + '" value="' + esc(p.label) + '"></label>' +
        '<button class="btn btn-outline" type="button" data-rm="' + i + '" style="min-height:40px;padding:8px 14px">Remove</button></div>';
    }).join("");
  }

  /* ---------- publish ---------- */
  function setStatus(t, cls) { var s = $("status"); s.textContent = t; s.style.color = cls === "bad" ? "var(--bad)" : ""; }
  function setProg(f) { var p = $("prog"); p.hidden = f == null; if (f != null) p.firstChild.style.width = Math.round(f * 100) + "%"; }
  function validate() {
    var n = st.photos.filter(function (p) { return !p.off; }).length;
    var ok = n > 0 && $("f-address").value.trim();
    $("publish").disabled = !ok || st.busy;
    if (!st.busy) setStatus(!st.photos.length ? "Add photos to get started." : !$("f-address").value.trim() ? "Add the property address." : n + " photos ready to publish.");
  }
  function slugify(s) { return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "gallery"; }
  function safeName(s) { return s.replace(/[^A-Za-z0-9 ._()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Gallery"; }
  function toBlob(canvas, q) { return new Promise(function (ok) { canvas.toBlob(ok, "image/jpeg", q); }); }
  function scaleTo(src, w, h, edge) {
    var s = Math.min(1, edge / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    var ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function put(key, blob, type, fileName, tries) {
    tries = tries || 0;
    return fetch(S.API + "/api/studio/file?key=" + encodeURIComponent(key), {
      method: "PUT", body: blob, headers: { authorization: "Bearer " + S.key(), "content-type": type, "x-file-name": fileName }
    }).then(function (r) {
      if (r.ok) return; if (r.status === 401) throw new Error("Your studio passphrase stopped working. Reload and unlock again.");
      throw new Error("Upload failed (" + r.status + ")");
    }).catch(function (e) { if (tries < 2 && !/passphrase/.test(e.message)) return new Promise(function (ok) { setTimeout(ok, 1200 * (tries + 1)); }).then(function () { return put(key, blob, type, fileName, tries + 1); }); throw e; });
  }

  function publish() {
    if (st.busy) return;
    var address = $("f-address").value.trim();
    var pkg = $("f-package").value, sig = /Signature|Summit/.test(pkg);
    var lock = $("f-lock").checked, pw = $("f-pw").value.trim();
    if (lock && !pw) { setStatus("Type a password, or switch password protection off.", "bad"); $("f-pw").focus(); return; }
    var tour = sig ? $("f-tour").value.trim() : "";
    if (tour && !/^https:\/\//i.test(tour)) { setStatus("The 3D tour link should start with https://", "bad"); $("f-tour").focus(); return; }

    st.busy = true; $("publish").disabled = true; $("result").hidden = true;
    var inc = st.photos.filter(function (p) { return !p.off; });
    var ext = inc.filter(function (p) { return p.kind === "EXT"; }), int = inc.filter(function (p) { return p.kind === "INT"; });
    var ordered = ext.concat(int), seq = 0;
    ordered.forEach(function (p) { seq++; p.outN = seq; p.outId = p.kind.toLowerCase() + "-" + String(seq).padStart(2, "0"); });
    var prefix = "g/" + slugify(address) + "-" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 14) : Math.random().toString(36).slice(2, 16));
    var zip = new JSZip(), meta = [], inflight = [], total = ordered.length * 2 + st.plans.length + 2, done = 0;
    var tick = function () { done++; setProg(done / total); };
    var plansSel = sig ? st.plans.slice() : [];
    var zipName = safeName(address) + " - Altus Aerials.zip";
    setProg(0);

    function limit(p) { inflight.push(p); p.then(function () { inflight.splice(inflight.indexOf(p), 1); }, function () {}); return inflight.length >= 4 ? Promise.race(inflight).catch(function () {}) : Promise.resolve(); }

    var chain = Promise.resolve();
    ordered.forEach(function (p, i) {
      chain = chain.then(function () {
        setStatus("Resizing and uploading photo " + (i + 1) + " of " + ordered.length + "…");
        return createImageBitmap(p.file);
      }).then(function (bmp) {
        var big = scaleTo(bmp, bmp.width, bmp.height, MAX_EDGE); bmp.close();
        var small = scaleTo(big, big.width, big.height, THUMB_EDGE);
        return Promise.all([toBlob(big, QUALITY), toBlob(small, THUMB_Q), big.width, big.height, small.width, small.height]);
      }).then(function (r) {
        var fname = "(" + p.kind + ") Image " + p.outN + ".jpg";
        zip.file((p.kind === "EXT" ? "Exteriors/" : "Interiors/") + fname, r[0]);
        meta.push({ id: p.outId, kind: p.kind, n: p.outN, tw: r[4], th: r[5] });
        return limit(Promise.all([
          put(prefix + "/full/" + p.outId + ".jpg", r[0], "image/jpeg", fname).then(tick),
          put(prefix + "/thumb/" + p.outId + ".jpg", r[1], "image/jpeg", fname).then(tick)
        ]));
      });
    });
    var planMeta = [];
    chain = chain.then(function () {
      return Promise.all(plansSel.map(function (pl, i) {
        var isPng = /png$/i.test(pl.file.type || pl.file.name), ext2 = isPng ? "png" : "jpg";
        var prep = pl.file.size <= 8e6 ? Promise.resolve(pl.file) :
          createImageBitmap(pl.file).then(function (b) { var c = scaleTo(b, b.width, b.height, 2400); b.close(); isPng = false; ext2 = "jpg"; return toBlob(c, 0.9); });
        return prep.then(function (blob) {
          var dl = safeName(pl.label + " Floor Plan") + "." + ext2, key = "plans/plan-" + (i + 1) + "." + ext2;
          zip.file("Floor Plans/" + dl, blob);
          planMeta.push({ label: pl.label, src: key, file: dl, i: i });
          return put(prefix + "/" + key, blob, isPng ? "image/png" : "image/jpeg", dl).then(tick);
        });
      }));
    }).then(function () { return Promise.all(inflight); }).then(function () {
      setStatus("Building the download-all zip…");
      return zip.generateAsync({ type: "blob", compression: "STORE" });
    }).then(function (zblob) {
      tick(); setStatus("Uploading the zip (" + (zblob.size / 1048576).toFixed(1) + " MB)…");
      return put(prefix + "/zip/" + zipName, zblob, "application/zip", zipName);
    }).then(function () {
      tick(); setStatus("Publishing…");
      planMeta.sort(function (a, b) { return a.i - b.i; });
      var city = $("f-city").value.trim(), state = $("f-state").value.trim().toUpperCase();
      return S.api("/api/studio/publish", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address, cityLine: [city, state].filter(Boolean).join(", "), package: pkg, shootDate: $("f-date").value,
          agentName: $("f-agent").value.trim(), agentPhone: $("f-phone").value.trim(), agentEmail: $("f-email").value.trim(),
          flightpathId: (st.shoots[$("shoot-pick").value] || {}).id || null,
          prefix: prefix, photos: meta, cover: st.cover && !st.cover.off ? st.cover.outId : meta[0].id,
          floorPlans: planMeta.map(function (m) { return { label: m.label, src: m.src, file: m.file }; }),
          tourUrl: tour, zipFile: "zip/" + zipName, password: lock ? pw : "",
          replaceSlug: $("f-replace") && $("f-replace").checked ? st.lastSlug : null
        })
      });
    }).then(function (res) {
      setProg(1); setStatus("Published.");
      st.lastSlug = res.slug;
      showResult(res, { address: address, sig: sig, pw: lock ? pw : "", agent: $("f-agent").value.trim(), phone: $("f-phone").value.trim(), tour: !!tour, plans: planMeta.length });
    }).catch(function (e) {
      setProg(null); setStatus((e && e.message) || "Something went wrong. Check your connection and publish again.", "bad");
    }).then(function () { st.busy = false; $("publish").disabled = !st.photos.some(function (p) { return !p.off; }); });
  }

  function message(o, url) {
    var first = (o.agent.split(/\s+/)[0] || "").trim();
    var extras = o.sig ? (o.plans && o.tour ? " The floor plans and 3D tour are on the same page." : o.plans ? " The floor plans are on the same page." : o.tour ? " The 3D tour is on the same page." : "") : "";
    return (first ? "Hi " + first + ", y" : "Y") + "our photos for " + o.address + " are ready:\n" + url + "\n\n" +
      "Tap Download All to save every photo at once." + extras +
      (o.pw ? "\nPassword: " + o.pw : "") + "\n\nThanks for having me out!\nHadi, Altus Aerials";
  }
  function showResult(res, o) {
    var r = $("result"), text = message(o, res.url), digits = o.phone.replace(/\D/g, "");
    var fp = res.flightpath && res.flightpath.ok ? '<p class="note good">Marked Delivered in Flightpath.</p>' :
      '<p class="note">Flightpath isn\'t connected yet, so mark this shoot Delivered there by hand.</p>';
    r.innerHTML = '<div class="card-head"><h2>Gallery is live</h2><a class="btn btn-outline" href="' + esc(res.url) + '" target="_blank" rel="noopener">Open gallery</a></div>' +
      '<p class="done-link"><a href="' + esc(res.url) + '" target="_blank" rel="noopener">' + esc(res.url) + '</a></p>' + fp +
      '<label class="f wide">Text for the agent (edit if you like)<textarea id="msg">' + esc(text) + '</textarea></label>' +
      '<div class="row"><button class="btn btn-primary" type="button" id="copy-msg">Copy text</button>' +
      (digits ? '<a class="btn btn-outline" id="sms-link" href="sms:' + digits + '?&body=' + encodeURIComponent(text) + '">Open in Messages</a>' : '') +
      (res.autoSend && digits ? '<button class="btn btn-blue" type="button" id="send-now">Send text now</button>' : '') + '</div>' +
      '<label class="switch"><input type="checkbox" id="f-replace"> Fix something and re-publish to this same link</label>';
    r.hidden = false; r.scrollIntoView({ behavior: "smooth", block: "start" });
    $("msg").addEventListener("input", function () { var a = $("sms-link"); if (a) a.href = "sms:" + digits + "?&body=" + encodeURIComponent(this.value); });
    $("copy-msg").addEventListener("click", function () {
      var t = $("msg"), b = this;
      var ok = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy text"; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(ok, function () { t.select(); document.execCommand("copy"); ok(); });
      else { t.select(); document.execCommand("copy"); ok(); }
    });
    if ($("send-now")) $("send-now").addEventListener("click", function () {
      var b = this; b.disabled = true;
      S.api("/api/studio/send-text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: digits, body: $("msg").value }) })
        .then(function (x) { b.textContent = x.sent ? "Sent" : "Not sent"; }, function () { b.textContent = "Not sent"; b.disabled = false; });
    });
  }
})();
