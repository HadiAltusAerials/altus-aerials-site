# Gallery system (private source, not published)

Netlify only publishes `site/`, so nothing in this folder is public.

- `worker/dist/worker.js`: the exact code running in the Cloudflare Worker `altus-api`
  (paste into Cloudflare → altus-api → Edit code → worker.js → Deploy).
- `worker/src/worker.js` + `assets/gallery/`: readable source. Rebuild dist with
  `python3 tools/build_worker.py` (expects the site's studio/rebook pages beside it; ask Claude).
- `worker/schema.sql`: database tables (already set up in Cloudflare D1 `altus-db`).
- `docs/`: setup guide and plan.

Live pieces: `site/studio/` (upload + activity), `site/rebook/`, `site/assets/studio/`,
and one line in `site/_redirects` that sends `/gallery/*` to the Worker.
