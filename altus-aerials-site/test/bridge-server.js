// Minimal local server for browser-level testing: serves the static site
// and routes /.netlify/functions/* to the real function handlers, using
// the same in-memory fake blob store as run-tests.js. Not used in
// production — Netlify's own infra serves both in the real deploy.
const path = require("path");
const http = require("http");
const fs = require("fs");
const Module = require("module");

const fakeBlobsPath = path.join(__dirname, "fake-netlify-blobs.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "@netlify/blobs") return fakeBlobsPath;
  return originalResolve.call(this, request, ...args);
};

const REPO_ROOT = path.join(__dirname, "..");
const ROOT = path.join(REPO_ROOT, "site");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "netlify", "functions");
const availabilityFn = require(path.join(FUNCTIONS_DIR, "availability.js"));
const createHoldFn = require(path.join(FUNCTIONS_DIR, "create-hold.js"));

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".json": "application/json", ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/.netlify/functions/availability") {
    availabilityFn
      .handler({ httpMethod: "GET", queryStringParameters: Object.fromEntries(url.searchParams) })
      .then((result) => {
        res.writeHead(result.statusCode, result.headers || {});
        res.end(result.body);
      });
    return;
  }

  if (url.pathname === "/.netlify/functions/create-hold" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      createHoldFn.handler({ httpMethod: "POST", body }).then((result) => {
        res.writeHead(result.statusCode, result.headers || {});
        res.end(result.body);
      });
    });
    return;
  }

  // Netlify Forms' own AJAX endpoint (POST "/") -- just accept it in this test bridge.
  if (url.pathname === "/" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  let filePath = path.join(ROOT, url.pathname === "/" ? "/index.html" : url.pathname);
  if (!path.extname(filePath)) filePath += ".html";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found: " + filePath);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

const port = process.env.PORT || 8095;
server.listen(port, () => console.log("bridge server listening on " + port));
