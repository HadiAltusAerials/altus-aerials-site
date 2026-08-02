# Getting Altus Aerials Live — Step by Step

This walks you through moving off Squarespace and onto GitHub + Netlify, which is free. No coding or command-line knowledge needed — everything below is done by clicking around in a browser.

---

## Step 1 — Create a GitHub account

1. Go to https://github.com/signup
2. Sign up with your email (use hadi@altusaerials.com or your personal email, your call).
3. Verify your email when prompted.

GitHub is just where the website's code will live — think of it as cloud storage for code, with version history.

## Step 2 — Create a new repository

1. Once logged in, click the **+** icon top-right → **New repository**.
2. Repository name: `altus-aerials-site`
3. Keep it **Public** (fine for a website — there's no private info in the code).
4. Don't check "Add a README" — leave everything else default.
5. Click **Create repository**.

## Step 3 — Upload the site files (no git needed)

1. On the new repo's page, click **uploading an existing file** (a link in the middle of the page).
2. Unzip the `altus-aerials-site.zip` file I sent you.
3. Drag the **entire contents** of that unzipped folder into the upload box — this now includes the `site` folder (the actual web pages), the `netlify` folder (the booking backend), `netlify.toml`, and `package.json`. All of it needs to go up, not just the HTML files.
4. Scroll down, add a commit message like "Initial site upload," and click **Commit changes**.

Your code is now on GitHub.

## Step 4 — Create a Netlify account

1. Go to https://app.netlify.com/signup
2. Choose **Sign up with GitHub** — this lets Netlify read your repos without you managing a separate password, and makes Step 5 one click.
3. Authorize Netlify when GitHub asks.

## Step 5 — Deploy the site

1. In Netlify, click **Add new site** → **Import an existing project**.
2. Choose **Deploy with GitHub**, then select the `altus-aerials-site` repository.
3. Leave the build settings blank — the `netlify.toml` file already tells Netlify everything it needs (where the pages live, where the booking backend's functions live). Netlify will automatically install the two small packages those functions need (`stripe` and `@netlify/blobs`) as part of deploying — this happens on its own, no action needed from you, it just means each deploy takes a little longer than a plain HTML site would.
4. Click **Deploy site**.
5. Netlify gives you a random URL like `sparkly-narwhal-123.netlify.app` — open it and confirm the site looks right.

From now on, every time the code on GitHub changes, Netlify automatically redeploys the live site within a minute or two.

If you're deploying by dragging the folder onto Netlify directly instead of through GitHub, drop the same **entire** unzipped folder (not just the HTML files) — Netlify Drop now supports this kind of build step too, so it works the same way.

## Step 5.5 — Connect Stripe so paid bookings actually lock in

The Book a Shoot page now has its own live availability calendar built into the site (no Google Calendar or third-party scheduler involved). Here's how it works and what you need to set up:

**How it works:** when someone picks an open date/time and submits the form, that slot is held for 20 minutes while they check out. It only becomes a permanent, blocked-off booking once Stripe confirms they've actually paid — if they abandon checkout, the hold just expires on its own and the slot reopens. Nothing for you to manually clear.

**What you need to do, once you have a Stripe account:**

1. Get your 7 Stripe Payment Links (one per package) as discussed before, and send them to me — I'll drop them into `site/book-shoot-confirm.html`.
2. In the Stripe Dashboard, go to **Developers** → **Webhooks** → **Add an endpoint**.
3. For the endpoint URL, use your Netlify site's URL plus `/.netlify/functions/stripe-webhook` — for example `https://your-site.netlify.app/.netlify/functions/stripe-webhook` (switch to `https://altusaerials.com/.netlify/functions/stripe-webhook` once your domain is connected in Step 6 below).
4. Select the event **checkout.session.completed** and save.
5. Stripe will show you a **Signing secret** (starts with `whsec_...`) for that endpoint — copy it.
6. In Netlify: **Site configuration** → **Environment variables** → **Add a variable**. Add one called `STRIPE_WEBHOOK_SECRET` and paste in that signing secret. Save, then trigger a redeploy (Netlify usually prompts you to) so the function picks it up.

That's it — no Google account, no separate scheduling tool, no per-booking manual work.

**Adjusting your actual availability:** open `netlify/functions/_lib/rules.js` in the code — it's a plain, heavily-commented list of settings (which days you're bookable, what start times you offer, how long a booking blocks, how much notice you require, specific dates you want closed). Change the numbers/lists, save, and redeploy. Come back and ask me if you'd rather I make these adjustments for you.

## Step 6 — Point altusaerials.com at Netlify

Once you've confirmed the Netlify URL looks good:

1. In Netlify: **Site settings** → **Domain management** → **Add a domain** → enter `altusaerials.com`.
2. Netlify will show you DNS records to set (usually an **A record** pointing to Netlify's load balancer IP, plus a **CNAME** for `www`).
3. Log into Ionos (where your domain is registered) → DNS settings for altusaerials.com.
4. Replace the existing A records/CNAMEs (the ones currently pointing to Squarespace) with the ones Netlify gave you.
5. DNS changes can take anywhere from a few minutes to a few hours to fully propagate. Netlify will show a green checkmark once it detects the domain is pointed correctly, and will auto-provision a free SSL certificate (padlock icon) shortly after.

**Important:** Don't cancel your Squarespace subscription until this step is fully confirmed working (site loads at altusaerials.com with the padlock/https). Keeping both running in parallel for a day or two while DNS propagates is normal and safe — visitors will just keep seeing the Squarespace site until the DNS switch fully takes effect, then it flips over cleanly.

## Step 7 — Cancel Squarespace

Once altusaerials.com is confirmed loading the new Netlify site correctly (give it 24-48 hours to be safe), cancel the Squarespace subscription/plan from your Squarespace account billing settings. This is the step that actually saves you money going forward.

---

## Making future edits

Any time you want to change text, prices, or photos:
- Small edits: click the file on GitHub (e.g. `services.html`), click the pencil/edit icon, make the change, commit. Netlify redeploys automatically.
- Bigger changes: come back and ask me — I can edit the files directly and walk you through re-uploading them.
