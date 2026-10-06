# Client Gallery Delivery — Plan for Phase 2 and 3

Status: Saratoga prototype built and tested locally. Nothing pushed, nothing deployed.

## 1. The one decision that matters for Netlify credits

Netlify bills about **15 credits per production deploy** and **20 credits per GB of bandwidth** (free plan = 300 credits/month).

- If every gallery were its own committed HTML page, every delivery would need a deploy. That caps you at roughly 15–20 deliveries a month before anything else.
- **Proposal:** deploy the gallery *template* to Netlify once. New galleries need no deploy at all.
  - `altusaerials.com/gallery/{slug}` stays the link agents get.
  - A Netlify `_redirects` rule proxies `/gallery/*` to a small Cloudflare Worker, which returns the same static template with that gallery's title and cover photo filled into the link-preview tags. When the agent forwards the link, iMessage shows your branded cover photo and address in the bubble.
  - Photos, the zip and the gallery data all come from Cloudflare R2, so Netlify bandwidth stays near zero.
- Phase 2 total Netlify cost: **one deploy (~15 credits)**, after you approve everything locally.

## 2. Architecture

| Piece | Where it lives | Cost |
|---|---|---|
| Gallery template, booking page, your studio pages | Netlify (static, existing site) | 1 deploy |
| Photos, floor plans, zips, gallery JSON | Cloudflare R2 bucket `altus-galleries` | Free up to 10 GB (~300 galleries at ~30 MB each), free downloads |
| API: gallery data, password check, view pings, booking requests, Flightpath writes | Cloudflare Worker `altus-api` | Free tier: 100k requests/day |
| Activity log (opens, downloads, shares) | Cloudflare D1 (SQLite) | Free tier |
| Shoots, bookings, delivered status | Flightpath (your Firebase project `flightpath-altus`) | Unchanged |

Everything that runs code is on Cloudflare's free tier, so it never touches Netlify credits.

## 3. Your side: upload → text in about 2 minutes

Page: `altusaerials.com/studio/upload` (hidden from search, unlocked with your passphrase once per device).

1. **Pick the shoot** from a list pulled from Flightpath (shoots that are done but not delivered). Address, agent, package and date fill in automatically.
2. **Drag in the finished folder.** The page reads your `(EXT) Image N` / `(INT) Image N` names and sorts exteriors and interiors itself. Your twilight `(EXT) Image 1` becomes the cover by default; tap any photo to make it the cover instead.
3. The browser shrinks every photo to 1920px / JPEG 80 **before** uploading. A 400 MB folder becomes about 15 MB, so it uploads fast even on home internet. It also builds the download-all zip.
4. **Signature / Summit only:** drop the floor plan files and paste the 3D tour link.
5. Optional: switch on a password for pre-listing privacy.
6. Tap **Publish**. Then, in one go:
   - files go to R2 and the gallery is live at `altusaerials.com/gallery/{slug}`
   - the shoot is marked **Delivered** in Flightpath with the gallery link saved on it
   - you see the text, ready to go:

> Hi Sarah, your photos for 3524 Saratoga Ave are ready: altusaerials.com/gallery/3524-saratoga-ave. Download them all in one tap, plus the floor plans and 3D tour. Thanks for having me out! – Hadi, Altus Aerials

   Buttons: **Copy text** and **Open in Messages** (opens your Messages app with the text filled in; you pick the thread and tap send). If a password is on, it's added to the text.

**Auto-send later:** the Worker already has one `sendDeliveryText()` step that today does nothing. Turning on auto-send means plugging Twilio into it and flipping a switch. Note that business texting through Twilio requires US carrier (A2P 10DLC) registration, which takes a couple of weeks and has small monthly fees, so it's worth doing only once volume justifies it.

## 4. Flightpath integration (simplest reliable option)

Flightpath runs on Firebase/Firestore, so the Worker can talk to it directly with a Firebase service account key (kept as a Cloudflare secret, never in the website code). No second database, no duplicate shoot list.

| Need | How |
|---|---|
| Shoot picker on the upload page | Worker reads Flightpath shoots that aren't delivered yet |
| Mark Delivered | Worker sets the shoot's status to Delivered and stores `galleryUrl` |
| Booking requests from agents | Worker creates a booking in Flightpath with status **Requested** |
| "Days since last booking" | Worker reads each agent's latest booking date |

What I need first: GitHub access for this session to `HadiAltusAerials/flightpath` so I can match its exact data fields, plus a service account key from the Firebase console (I'll walk you through it, about 3 clicks). Flightpath probably needs one small addition: showing Requested bookings with a **Confirm** button. That would be a change inside Flightpath, not a copy of it.

Fallback if you'd rather not touch Flightpath yet: booking requests go out through Netlify Forms (form submissions don't use credits) and email you, and you mark Delivered by hand.

## 5. Agent booking flow (no login)

`altusaerials.com/book/?g=3524-saratoga-ave`

1. Pick a package (cards with the four prices; the one they just bought is highlighted).
2. Pick a date, plus morning / afternoon / twilight.
3. Property address. Name and phone are pre-filled from the gallery they came from, so a returning agent types only the address.
4. **Request shoot** → "Got it. Hadi will text you to confirm." The request lands in Flightpath as Requested and you get a notification.

No payment step (out of scope); you invoice as you do now.

## 6. Activity view (you only)

`altusaerials.com/studio/activity`

- **Galleries:** delivered date, first opened, last opened, total opens, download-all count, single-photo saves, tour opens, shares, book-again clicks. A gallery that isn't opened within 24 hours is flagged so you can nudge the agent.
- **Agents:** last booking date and days since, sorted longest first. Highlighted at 30 days and again at 60, so you know who to call.
- Tracking is a tiny one-line ping per action (no cookies, no third-party analytics). Your own visits from studio pages are excluded.

## 7. Password protection

Per gallery, optional. In production the Worker hands out the gallery's photo list only after the right password, and photo paths include a random token, so they can't be guessed. (The prototype's password screen is a look-and-feel demo only: add `#locked` to the link, password `saratoga`.)

## 8. Build order for Phase 2

1. Cloudflare setup: R2 bucket, Worker, D1, with you clicking through account creation. **Needs from you:** a free Cloudflare account (R2 may ask for a card on file even on the free tier).
2. Worker API plus the gallery template switched from inline data to Worker data (the template is already data-driven, so this is a small change).
3. Upload page with in-browser resize and zip, Flightpath picker and Delivered write.
4. Booking page and Flightpath Requested bookings.
5. Activity view.
6. Full local test (Worker running locally, site served locally, phone-size browser), then a claude.ai preview for you to try on your phone.
7. **One deploy after your approval.**

## 9. Phase 3: homepage scroll redesign (after the gallery system is approved)

Prototype one section first: a full-width twilight photo that pins while the four packages slide in from alternating sides with staggered reveals and light parallax, then build out the rest of the page in the same style. Animations use CSS scroll-driven animation with a small IntersectionObserver fallback (no heavy libraries), and respect "reduce motion" settings. Photos load from R2, so the new homepage doesn't add Netlify bandwidth either.

## 10. Open questions for you

1. **Look and feel:** anything to change on the Saratoga prototype (colors, section order, wording)?
2. **City line:** show the city and state under the address? Flightpath would supply it.
3. **Agent name:** greet the agent on the page ("Prepared for Sarah Lee")? Nice touch, but it also shows to sellers when forwarded.
4. **Floor plans:** where do they come from today (Zillow 3D Home, another app, drawn by hand)? That decides what file type the upload page expects.
5. **Logo:** I couldn't pull the site repo this session, so the prototype uses a text wordmark. Production will use your real `logo-white.png`.
6. **Repos:** please give this session GitHub access to `altus-aerials-site` and `flightpath` next time so I build directly against the real code.
