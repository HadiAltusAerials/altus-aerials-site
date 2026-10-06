/* Altus Aerials — client gallery renderer.
   Reads one JSON object (inline <script id="gallery-data"> today; R2 JSON in phase 2)
   and builds the whole page. No framework, no build step. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var D, base, ext, int, isSignature, coverPhoto;
  var full = function (p) { return base + "full/" + p.id + ".jpg"; };
  var thumb = function (p) { return base + "thumb/" + p.id + ".jpg"; };
  var fileName = function (p) { return "(" + p.kind + ") Image " + p.n + ".jpg"; };
  function setup(data) {
    D = data;
    base = D.imageBase.replace(/\/?$/, "/");
    ext = D.photos.filter(function (p) { return p.kind === "EXT"; });
    int = D.photos.filter(function (p) { return p.kind === "INT"; });
    isSignature = /signature|summit/i.test(D.package);
    coverPhoto = D.photos.filter(function (p) { return p.id === D.cover; })[0] || ext[0] || D.photos[0];
  }

  var ICON = {
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  /* ---------- tracking ping (no-op until D.pingUrl is set) ---------- */
  var visitor = (function () { try { var v = sessionStorage.getItem("altus_v"); if (!v) { v = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("altus_v", v); } return v; } catch (e) { return ""; } })();
  function ping(event, extra) {
    try { if (localStorage.getItem("altus_owner")) return; } catch (e) {}
    var body = JSON.stringify(Object.assign({ g: D.slug, e: event, v: visitor }, extra || {}));
    if (!D.pingUrl) { if (window.console) console.debug("[ping]", body); return; }
    try { navigator.sendBeacon ? navigator.sendBeacon(D.pingUrl, body) : fetch(D.pingUrl, { method: "POST", body: body, keepalive: true }); } catch (e) {}
  }

  var toastT;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- render ---------- */
  function tiles(list, startIdx) {
    return list.map(function (p, i) {
      return '<button class="tile" type="button" data-i="' + (startIdx + i) + '" aria-label="Open ' + esc(fileName(p)) + '">' +
        '<img src="' + thumb(p) + '" alt="' + (p.kind === "EXT" ? "Exterior" : "Interior") + ' photo ' + p.n + '" loading="lazy" decoding="async" width="' + p.tw + '" height="' + p.th + '"></button>';
    }).join("");
  }

  function render() {
    document.title = D.address + " | Altus Aerials";
    var dateTxt = new Date(D.shootDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    var chips = [
      ["exteriors", "Exteriors", ext.length], ["interiors", "Interiors", int.length]
    ];
    if (isSignature) { chips.push(["floor-plans", "Floor plans", D.floorPlans.length]); chips.push(["tour", "3D tour", ""]); }
    chips.push(["book", "Book again", ""]);

    var html = "";
    if (D.prototype) html += '<div class="proto-banner">' + esc(D.banner || "Prototype preview. Yellow notes mark items Hadi still needs to supply.") + '</div>';
    html +=
      '<header class="cover">' +
        '<img class="cover-img" src="' + full(coverPhoto) + '" alt="Twilight exterior of ' + esc(D.address) + '" fetchpriority="high">' +
        '<div class="wrap topbar"><a class="brand" href="https://altusaerials.com/" aria-label="Altus Aerials home"><img class="brand-mark" src="' + esc(D.logo || "/assets/images/logo-white.png") + '" alt="" width="50" height="32"><span class="brand-text">Altus Aerials</span></a>' +
          '<button class="icon-btn" type="button" data-act="share">' + ICON.share + 'Share</button></div>' +
        '<div class="wrap cover-text"><p class="eyebrow"><span class="pkg-badge">' + esc(D.package) + ' Package</span><span>Shot ' + dateTxt + '</span></p>' +
          '<h1>' + esc(D.address) + '</h1>' +
          (D.cityLine ? '<p class="city">' + esc(D.cityLine) + '</p>' : '') + '<p class="sub">' + D.photos.length + ' photos' + (isSignature ? ' · floor plans · 3D tour' : '') + '</p></div>' +
      '</header>' +
      '<div class="wrap actions" id="actions">' +
        '<button class="btn btn-primary" type="button" data-act="zip">' + ICON.dl + '<span>Download all ' + D.photos.length + ' photos</span></button>' +
        '<button class="btn btn-outline" type="button" data-act="share">' + ICON.share + 'Share</button>' +
        '<a class="btn btn-outline" href="#book">' + ICON.cal + 'Book</a>' +
        '<p class="meta">MLS-ready JPEGs, 1920px on the long edge. Tap any photo to view or save it.</p>' +
      '</div>' +
      '<nav class="chips" aria-label="Gallery sections"><div class="wrap">' +
        chips.map(function (c) { return '<a class="chip" href="#' + c[0] + '">' + c[1] + (c[2] !== "" ? " <small>" + c[2] + "</small>" : "") + "</a>"; }).join("") +
      '</div></nav><main>' +
      '<section class="block wrap" id="exteriors"><div class="block-head"><h2>Exteriors</h2><p>' + ext.length + ' photos</p></div>' +
        '<div class="grid">' + tiles(ext, 0) + '</div></section>' +
      '<section class="block wrap" id="interiors"><div class="block-head"><h2>Interiors</h2><p>' + int.length + ' photos</p></div>' +
        '<div class="grid">' + tiles(int, ext.length) + '</div></section>';

    if (isSignature) html += plansHtml() + tourHtml();
    html += rebookHtml() + '</main>' +
      '<footer class="foot"><div class="wrap"><div class="foot-top"><a class="brand" href="https://altusaerials.com/"><img class="brand-mark" src="' + esc(D.logo || "/assets/images/logo-white.png") + '" alt="" width="50" height="32"><span class="brand-text">Altus Aerials</span></a>' +
      '<nav><a href="https://altusaerials.com/">Home</a><a href="https://altusaerials.com/services.html">Services</a><a href="https://altusaerials.com/about.html">About</a></nav></div>' +
      '<div class="foot-bottom"><span>Photos by Altus Aerials · Chicago suburbs</span><span><a href="tel:+17087780566">(708) 778-0566</a> · <a href="mailto:hadi@altusaerials.com">hadi@altusaerials.com</a></span></div></div></footer>' +
      '<div class="dock" id="dock" aria-hidden="true"><button class="btn btn-primary" type="button" data-act="zip" tabindex="-1">' + ICON.dl + '<span>Download all</span></button>' +
      '<button class="btn btn-outline" type="button" data-act="share" tabindex="-1" aria-label="Share gallery">' + ICON.share + '</button></div>' +
      lightboxHtml() + '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
    $("#app").innerHTML = html;
  }

  function plansHtml() {
    var todo = D.floorPlans.some(function (f) { return f.placeholder; }) ?
      '<p class="todo"><b>For Hadi:</b><span>These are placeholder drawings. Drop the real floor plan files (PNG/JPG/PDF) in the upload page and they replace these automatically.</span></p>' : "";
    return '<section class="block wrap" id="floor-plans"><div class="block-head"><h2>Floor plans</h2><p>' + D.floorPlans.length + ' levels</p></div>' + todo +
      '<div class="plans">' + D.floorPlans.map(function (f, i) {
        return '<div class="plan"><button class="view" type="button" data-plan="' + i + '" aria-label="Enlarge ' + esc(f.label) + '"><img src="' + base + f.src + '" alt="' + esc(f.label) + ' floor plan" loading="lazy"></button>' +
          '<div class="plan-foot"><div><strong>' + esc(f.label) + '</strong><small>' + esc(f.note || "") + '</small></div>' +
          '<button class="mini" type="button" data-saveplan="' + i + '">' + ICON.dl + 'Save</button></div></div>';
      }).join("") + '</div></section>';
  }

  function tourHtml() {
    var t = D.tour, url = t.url || "";
    var todo = t.placeholder ? '<p class="todo"><b>For Hadi:</b><span>Paste the Zillow 3D Home tour link here (<code>tour.url</code>). Until then the buttons below point to a placeholder.</span></p>' : "";
    return '<section class="block wrap" id="tour"><div class="block-head"><h2>3D home tour</h2><p>Walk through from any phone</p></div>' + todo +
      '<div class="tour"><div class="tour-stage">' +
        (t.embed && url ? '<iframe src="' + esc(url) + '" title="3D tour of ' + esc(D.address) + '" allow="fullscreen; xr-spatial-tracking" loading="lazy"></iframe>' :
        '<img src="' + thumb(int[0] || coverPhoto) + '" alt=""><div class="tour-cta"><span class="ring">' + ICON.cube + '</span>' +
        '<a class="btn btn-light" href="' + esc(url || "#tour") + '" target="_blank" rel="noopener" data-act="tour">' + ICON.ext + 'Open the 3D tour</a>' +
        '<p>Opens in your browser. No app or login needed.</p></div>') +
      '</div><div class="tour-link"><code id="tour-url">' + esc(url || "https://www.zillow.com/view-imx/PLACEHOLDER-tour-link") + '</code>' +
        '<button class="mini" type="button" data-act="copytour">' + ICON.copy + 'Copy link</button></div></div>' +
      '<div class="explain">' +
        '<article><h3>What it is</h3><p>A walk-through of the whole home, built from 360° photos taken in every room. Buyers move from room to room on their own, the same way they would at a showing, from their phone or laptop.</p></article>' +
        '<article><h3>How to use it</h3><ol><li>Tap <b>Open the 3D tour</b>.</li><li>Drag to look around the room.</li><li>Tap a circle on the floor to step to that spot.</li><li>Use the floor plan or room list in the tour to jump to another room.</li></ol></article>' +
        '<article><h3>Where to share it</h3><ul><li><b>MLS:</b> paste the link into your listing\'s Virtual Tour field.</li><li><b>Zillow:</b> the tour can show on the Zillow listing itself. If it isn\'t there once the listing is live, text Hadi and he\'ll get it attached.</li><li><b>Buyers and sellers:</b> text or email the link. It opens in any browser.</li></ul>' +
        '<p class="note">Tap <b>Copy link</b> above to grab it.</p></article>' +
      '</div></section>';
  }

  function rebookHtml() {
    var pk = [["Overview", 149, "Exterior aerial photos"], ["Showcase", 349, "Aerial photos + video, full interiors"], ["Signature", 499, "Showcase + 3D tour + floor plans"], ["Summit", 649, "Signature + cinematic FPV fly-through"]];
    return '<section class="rebook" id="book"><div class="wrap"><h2>Got another listing coming up?</h2>' +
      '<p>Pick a package and a date. No account needed. Hadi confirms by text, usually the same day.</p>' +
      '<div class="pkgs">' + pk.map(function (p) {
        return '<div class="pkg' + (p[0] === D.package ? " current" : "") + '"><b>' + p[0] + '</b><span>$' + p[1] + '</span><small>' + p[2] + '</small></div>';
      }).join("") + '</div>' +
      '<a class="btn btn-light" href="' + esc(D.bookUrl) + '" data-act="book">' + ICON.cal + 'Book your next shoot</a></div></section>';
  }

  function lightboxHtml() {
    return '<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-label="Photo viewer">' +
      '<div class="lb-top"><span class="lb-count" id="lb-count"></span><button class="icon-btn" type="button" data-act="close" aria-label="Close">' + ICON.x + '</button></div>' +
      '<div class="lb-stage" id="lb-stage"><img id="lb-img" alt=""><button class="lb-nav lb-prev" type="button" data-act="prev" aria-label="Previous photo">' + ICON.l + '</button>' +
      '<button class="lb-nav lb-next" type="button" data-act="next" aria-label="Next photo">' + ICON.r + '</button></div>' +
      '<div class="lb-bottom"><span class="lb-name" id="lb-name"></span><button class="icon-btn" type="button" data-act="save">' + ICON.dl + 'Save photo</button></div></div>';
  }

  /* ---------- lightbox ---------- */
  var lbList = [], lbIdx = 0, lastFocus = null;
  function lbItems(kind) {
    if (kind === "plans") return D.floorPlans.map(function (f) { return { src: base + f.src, name: f.label + " floor plan", file: f.file || (f.label + ".png") }; });
    return ext.concat(int).map(function (p) { return { src: full(p), name: fileName(p), file: fileName(p), id: p.id }; });
  }
  function openLb(kind, i) {
    lbList = lbItems(kind); lbIdx = i; lastFocus = document.activeElement;
    $("#lb").hidden = false; document.documentElement.style.overflow = "hidden";
    showLb(0); $("#lb [data-act=close]").focus();
  }
  function showLb(dir) {
    var it = lbList[lbIdx], img = $("#lb-img");
    img.style.opacity = "0"; img.style.transform = dir ? "translateX(" + (dir * 24) + "px)" : "none";
    var pre = new Image(); pre.onload = function () { img.src = it.src; img.alt = it.name; img.style.opacity = "1"; img.style.transform = "none"; };
    pre.src = it.src;
    $("#lb-count").textContent = (lbIdx + 1) + " / " + lbList.length;
    $("#lb-name").textContent = it.name;
    [1, -1].forEach(function (d) { var n = lbList[(lbIdx + d + lbList.length) % lbList.length]; if (n) new Image().src = n.src; });
    if (it.id) ping("view_photo", { p: it.id });
  }
  function step(d) { if (lbList.length < 2) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(d); }
  function closeLb() { $("#lb").hidden = true; document.documentElement.style.overflow = ""; if (lastFocus) lastFocus.focus(); }

  /* ---------- saving ---------- */
  function fetchBlob(url) { return fetch(url, { mode: "cors" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }); }
  function saveBlob(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function saveOne(it) {
    return fetchBlob(it.src).then(function (blob) {
      var f = new File([blob], it.file, { type: blob.type || "image/jpeg" });
      // Phones: the share sheet offers "Save Image" straight to the camera roll.
      if (navigator.canShare && navigator.canShare({ files: [f] }) && matchMedia("(pointer: coarse)").matches) {
        return navigator.share({ files: [f] }).catch(function () {});
      }
      saveBlob(blob, it.file); toast("Saved " + it.file);
    }).then(function () { ping("download_photo", { p: it.id || it.file }); })
      .catch(function () { location.href = it.src + (it.src.indexOf("?") < 0 ? "?" : "&") + "dl=1"; });
  }

  var zipBusy = false;
  function loadJSZip() {
    return window.JSZip ? Promise.resolve() : new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
  }
  function downloadAll() {
    if (zipBusy) return;
    ping("download_all");
    var zipName = D.address + " - Altus Aerials.zip";
    if (D.zipUrl) { location.href = D.zipUrl; toast("Downloading " + zipName); return; } // pre-built zip on R2 (production path)
    zipBusy = true;
    var btns = document.querySelectorAll("[data-act=zip]");
    var label = function (t) { btns.forEach(function (b) { b.disabled = !!t; b.querySelector("span").textContent = t || (b.closest(".dock") ? "Download all" : "Download all " + D.photos.length + " photos"); }); };
    label("Preparing… 0%");
    loadJSZip().then(function () {
      var zip = new JSZip(), done = 0;
      var jobs = D.photos.map(function (p) {
        return fetchBlob(full(p)).then(function (b) {
          zip.file((p.kind === "EXT" ? "Exteriors/" : "Interiors/") + fileName(p), b);
          label("Preparing… " + Math.round(++done / D.photos.length * 100) + "%");
        });
      });
      if (isSignature) D.floorPlans.forEach(function (f) { jobs.push(fetchBlob(base + f.src).then(function (b) { zip.file("Floor Plans/" + (f.file || f.label + ".png"), b); })); });
      return Promise.all(jobs).then(function () { return zip.generateAsync({ type: "blob", compression: "STORE" }); });
    }).then(function (blob) { saveBlob(blob, zipName); toast("Download started"); })
      .catch(function () { toast("Download didn't finish. Check your connection and try again."); })
      .then(function () { zipBusy = false; label(""); });
  }

  /* ---------- share ---------- */
  function shareGallery() {
    var url = D.shareUrl || location.href.split("#")[0];
    var data = { title: D.address + " | Photos by Altus Aerials", text: "Photos for " + D.address + ", by Altus Aerials", url: url };
    ping("share");
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    copy(url, "Gallery link copied");
  }
  function copy(text, msg) {
    var done = function () { toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove();
  }

  /* ---------- events ---------- */
  function wire() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-i],[data-plan],[data-saveplan],[data-act]"); if (!t) return;
      if (t.dataset.i != null) return openLb("photos", +t.dataset.i);
      if (t.dataset.plan != null) return openLb("plans", +t.dataset.plan);
      if (t.dataset.saveplan != null) return saveOne(lbItems("plans")[+t.dataset.saveplan]);
      switch (t.dataset.act) {
        case "zip": return downloadAll();
        case "share": return shareGallery();
        case "close": return closeLb();
        case "prev": return step(-1);
        case "next": return step(1);
        case "save": return saveOne(lbList[lbIdx]);
        case "copytour": ping("copy_tour"); return copy($("#tour-url").textContent, "Tour link copied");
        case "tour": ping("open_tour"); if (!D.tour.url) { e.preventDefault(); toast("Tour link coming soon"); } return;
        case "book": return ping("book_click");
      }
    });
    document.addEventListener("keydown", function (e) {
      if ($("#lb").hidden) return;
      if (e.key === "Escape") closeLb(); else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
    });
    // swipe: left/right to change photo, down to close
    var sx = 0, sy = 0, st = $("#lb-stage");
    st.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    st.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();
    }, { passive: true });
    st.addEventListener("click", function (e) { if (e.target === st && matchMedia("(pointer: coarse)").matches === false) closeLb(); });

    // sticky dock appears once the main action row scrolls away
    var dock = $("#dock");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        var show = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
        dock.classList.toggle("show", show); dock.setAttribute("aria-hidden", show ? "false" : "true");
        dock.querySelectorAll("button").forEach(function (b) { b.tabIndex = show ? 0 : -1; });
      }).observe($("#actions"));
      var chips = document.querySelectorAll(".chip");
      var spy = new IntersectionObserver(function (en) {
        en.forEach(function (x) {
          if (!x.isIntersecting) return;
          chips.forEach(function (c) {
            var on = c.getAttribute("href") === "#" + x.target.id; c.classList.toggle("active", on);
            if (on && c.scrollIntoView) c.parentNode.scrollTo({ left: c.offsetLeft - 16, behavior: "smooth" });
          });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      document.querySelectorAll("main > section[id]").forEach(function (s) { spy.observe(s); });
    }
  }

  /* ---------- optional password gate ----------
     Real galleries: the Worker sends only {locked:true, slug, address, api} until the
     right password is posted back, so photo addresses never reach the browser early.
     Prototype preview only: hash check in the page (look-and-feel demo, add #locked). */
  function sha256(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function gate(boot, unlock) {
    var g = document.createElement("div"); g.className = "gate";
    g.innerHTML = '<form id="gate-form"><h2>' + esc(boot.address) + '</h2>' +
      (boot.cityLine ? '<p>' + esc(boot.cityLine) + '</p>' : '') +
      '<p>This gallery is private until the listing goes live. Enter the password from Hadi\'s text.</p>' +
      '<label for="gate-pw" class="sr">Password</label><input id="gate-pw" type="password" autocomplete="off" autocapitalize="none" placeholder="Password" required>' +
      '<button class="btn btn-blue" type="submit">View photos</button><p class="err" id="gate-err" aria-live="polite"></p>' +
      (boot.passwordDemoOnHash ? '<p style="font-size:13px;opacity:.7">Prototype password: saratoga</p>' : '') + '</form>';
    document.body.appendChild(g);
    var btn = g.querySelector("button");
    g.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = g.querySelector("input").value.trim();
      btn.disabled = true;
      unlock(pw).then(function (data) { g.remove(); start(data); }, function () {
        btn.disabled = false;
        $("#gate-err").textContent = "That password didn't match. Check the text from Hadi and try again.";
      });
    });
  }
  function start(data) {
    setup(data); render(); wire(); ping("open");
    if (location.hash && location.hash.length > 1) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }

  var boot = JSON.parse(document.getElementById("gallery-data").textContent);
  if (boot.locked) {
    gate(boot, function (pw) {
      return fetch(boot.api + "/api/g/" + encodeURIComponent(boot.slug), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw })
      }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    });
  } else if (boot.passwordHash && boot.passwordDemoOnHash && location.hash === "#locked") {
    gate(boot, function (pw) {
      return sha256(pw.toLowerCase()).then(function (h) { if (h !== boot.passwordHash) throw new Error("no"); return boot; });
    });
  } else {
    start(boot);
  }
})();
