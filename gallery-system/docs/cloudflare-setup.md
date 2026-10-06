# Cloudflare setup for Altus galleries (about 15 minutes)

You'll create three things in your Cloudflare dashboard: a storage bucket for photos (R2), a small database (D1), and the Worker that runs the gallery API. None of this touches Netlify, and none of it uses my code yet. Code only goes in after you approve it.

Cloudflare moves menu items around now and then. If a name below doesn't match exactly, look in the left sidebar under **Storage & databases** (R2, D1) or **Compute** / **Workers & Pages** (Worker).

**Never send me** your Cloudflare password, card details, API tokens or the studio passphrase. The only thing I need back is the Worker's web address (step 3).

---

## 1. R2 bucket (photo storage)

1. Sidebar → **R2 Object Storage**.
2. The first time, Cloudflare asks you to enable R2 and add a payment method. The free tier covers this setup (10 GB of storage, and downloads are free). You'd only pay if you went past that, at about $0.015 per GB per month.
3. Click **Create bucket**.
   - Name: `altus-galleries`
   - Location: Automatic
   - Storage class: Standard
4. Click **Create bucket**. Leave **Public access off**. The Worker serves the photos, so the bucket stays private.

## 2. D1 database (galleries, views, booking requests)

1. Sidebar → **D1 SQL Database** → **Create database**.
2. Name: `altus-db`, then click **Create**.
3. Open `altus-db` → **Console** tab.
4. Open `worker/schema.sql` from the files I sent, copy everything, paste it into the console, and click **Execute**. You should see three tables: `galleries`, `events` and `bookings`.

## 3. Worker (the gallery API)

1. Sidebar → **Workers & Pages** → **Create** → **Create Worker** (the "Hello World" starter).
2. Name it `altus-api` and click **Deploy**. This only publishes Cloudflare's placeholder "Hello World", not my code.
3. Copy the address it shows, something like `https://altus-api.yourname.workers.dev`. **Send me this address.**

### Connect the bucket and database

Open the `altus-api` Worker → **Settings** → **Bindings** → **Add binding**:

| Type | Variable name | Choose |
|---|---|---|
| R2 bucket | `MEDIA` | `altus-galleries` |
| D1 database | `DB` | `altus-db` |

The variable names must be exactly `MEDIA` and `DB` (capital letters).

### Add your settings

Same Worker → **Settings** → **Variables and Secrets** → **Add**:

| Type | Name | Value |
|---|---|---|
| **Secret** | `STUDIO_KEY` | A passphrase you'll type on the upload page. Make it long, like 4 random words. Keep it to yourself. |
| Text | `AUTO_SEND` | `false` |

Leave `PUBLIC_ORIGIN` out for now. We add it (`https://altusaerials.com`) only at the very end, once Netlify points `/gallery/` links at the Worker.

**That's all for setup.** Reply with your workers.dev address and "Cloudflare is set up."

---

## What happens next (each step needs your OK)

**A. Load my code into the Worker. Needs your approval. Uses no Netlify credits.**
Worker → **Edit code** → select everything in the editor → paste the whole contents of `worker/dist/worker.js` → **Deploy**. (I can walk you through it live, or do it in your browser with your permission.)

**B. Your acceptance test, still with no Netlify deploy.**
1. Open `https://altus-api.yourname.workers.dev/studio/upload/` on your PC, enter your passphrase, and deliver the Saratoga folder.
2. Text the gallery link to your own phone. The bubble should show the twilight cover with "3524 Saratoga Ave, Downers Grove, IL".
3. On the phone, tap **Download all**. iPhone asks "Download?" and saves the zip to Files → Downloads. Android saves it to Downloads.

**C. One Netlify deploy (~15 credits), only after B passes and you approve.**
- Append the one `_redirects` line (under your `/contact` rule) so `altusaerials.com/gallery/...` serves galleries.
- Add the new `rebook/`, `studio/` and `assets/studio/` folders.
- Set `PUBLIC_ORIGIN` = `https://altusaerials.com` on the Worker, so new links and texts use your domain.
- Re-run the phone test on the altusaerials.com link.

## Costs at your volume

- **R2:** each gallery is about 13–15 MB. The free 10 GB holds roughly 600+ galleries before any charge.
- **Worker:** free plan, 100,000 requests a day. A gallery view is about 50–60 requests, so that covers well over 1,000 gallery views a day.
- **D1:** free plan limits are far beyond what this needs.
- **Netlify:** one deploy for the whole system. Photo traffic never touches Netlify.
