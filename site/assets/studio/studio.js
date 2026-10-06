/* Shared helpers for studio pages: API base, passphrase, fetch wrapper. */
(function () {
  var API = (window.ALTUS_API || location.origin).replace(/\/$/, "");
  function getKey() { try { return localStorage.getItem("altus_studio_key") || ""; } catch (e) { return ""; } }
  function setKey(k) { try { localStorage.setItem("altus_studio_key", k); localStorage.setItem("altus_owner", "1"); } catch (e) {} }
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ authorization: "Bearer " + getKey() }, opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      return r.text().then(function (t) {
        var body; try { body = t ? JSON.parse(t) : {}; } catch (e) { body = { error: t }; }
        if (!r.ok) { var err = new Error(body.error || ("Error " + r.status)); err.status = r.status; throw err; }
        return body;
      });
    });
  }
  /* Shows a passphrase box until the Worker accepts it, then calls ready(info). */
  function requireKey(mount, ready) {
    function tryKey(k, quiet) {
      if (!k) return Promise.reject(new Error("empty"));
      setKey(k);
      return api("/api/studio/whoami").then(ready, function (e) {
        try { localStorage.removeItem("altus_studio_key"); } catch (x) {}
        if (!quiet) throw e; else throw e;
      });
    }
    function show() {
      mount.innerHTML = '<div class="card gatebox"><h1>Studio</h1><p class="lede">Enter your studio passphrase. This device will remember it.</p>' +
        '<form id="keyform" class="fields"><label class="f wide">Passphrase<input id="studio-key" type="password" autocomplete="current-password" required></label>' +
        '<button class="btn btn-primary" type="submit">Unlock</button><p id="key-err" class="muted" aria-live="polite"></p></form></div>';
      document.getElementById("keyform").addEventListener("submit", function (e) {
        e.preventDefault();
        tryKey(document.getElementById("studio-key").value.trim()).catch(function (err) {
          document.getElementById("key-err").textContent = err.status === 401 ? "That passphrase didn't work." : "Couldn't reach the server. Check your connection.";
        });
      });
    }
    var k = getKey();
    if (k) tryKey(k, true).catch(show); else show();
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  window.Studio = { API: API, api: api, requireKey: requireKey, esc: esc, key: getKey };
})();
