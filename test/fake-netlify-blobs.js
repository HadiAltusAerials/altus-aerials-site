// A tiny in-memory stand-in for @netlify/blobs, used only for local testing
// of the real function files without needing Netlify's live infrastructure.
const stores = new Map();

function getStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const map = stores.get(name);
  return {
    async get(key, opts) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      if (opts && opts.type === "json") return JSON.parse(raw);
      return raw;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

module.exports = { getStore, __stores: stores };
