"""Bundle front-end files into one paste-able Worker script: worker/dist/worker.js"""
import base64, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {
  "/assets/gallery/template.html": "text/html; charset=utf-8",
  "/assets/gallery/gallery.css": "text/css; charset=utf-8",
  "/assets/gallery/gallery.js": "text/javascript; charset=utf-8",
  "/assets/gallery/og-default.jpg": "image/jpeg",
  "/assets/images/logo-white.png": "image/png",
  "/assets/images/favicon.png": "image/png",
  "/assets/studio/studio.css": "text/css; charset=utf-8",
  "/assets/studio/studio.js": "text/javascript; charset=utf-8",
  "/assets/studio/upload.js": "text/javascript; charset=utf-8",
  "/assets/studio/config.js": "text/javascript; charset=utf-8",
  "/assets/studio/rebook.css": "text/css; charset=utf-8",
  # Copy of the site's own stylesheet so /rebook/ looks right while testing on workers.dev.
  # On altusaerials.com the page uses your real /assets/css/style.css instead.
  "/assets/css/style.css": "text/css; charset=utf-8",
  "/studio/upload/index.html": "text/html; charset=utf-8",
  "/studio/activity/index.html": "text/html; charset=utf-8",
  "/rebook/index.html": "text/html; charset=utf-8",
}
assets = {}
for path, ctype in FILES.items():
    raw = open(ROOT + path, "rb").read()
    if ctype.startswith(("image/",)):
        assets[path] = {"type": ctype, "b64": True, "body": base64.b64encode(raw).decode()}
    else:
        assets[path] = {"type": ctype, "body": raw.decode("utf-8")}
# Cache-busting: the gallery page asks for gallery.css/js with a version tag, so browsers
# pick up updates right away instead of using an hour-old cached copy.
import hashlib
ver = hashlib.sha1((assets["/assets/gallery/gallery.css"]["body"] + assets["/assets/gallery/gallery.js"]["body"]).encode()).hexdigest()[:10]
t = assets["/assets/gallery/template.html"]
t["body"] = t["body"].replace("/assets/gallery/gallery.css", "/assets/gallery/gallery.css?v=" + ver).replace("/assets/gallery/gallery.js", "/assets/gallery/gallery.js?v=" + ver)
src = open(os.path.join(ROOT, "worker/src/worker.js")).read()
out = src.replace("/* __ASSETS__ */", "const ASSETS = " + json.dumps(assets) + ";")
os.makedirs(os.path.join(ROOT, "worker/dist"), exist_ok=True)
open(os.path.join(ROOT, "worker/dist/worker.js"), "w").write(out)
print("worker/dist/worker.js", len(out) // 1024, "KB")
