# Altus Aerials — Website

A plain HTML/CSS/JS site (no build step, no framework) built to replace the Squarespace site at altusaerials.com. Designed to be hosted for free on Netlify.

## Structure

```
index.html          Home page
services.html        Services & pricing
about.html            About page
book.html             Book a Shoot / Free Consultation forms (Netlify Forms)
book-shoot-confirm.html   Payment step shown after a shoot booking is submitted
consultation-confirm.html Confirmation shown after a consultation request is submitted
assets/css/style.css  All styling
assets/images/        Logo + photos
netlify.toml           Netlify config
_redirects            Redirects (e.g. the printed QR code's /contact URL -> Services)
```

## Editing content

Every page is plain HTML — open any `.html` file in a text editor and change the text directly. Styling lives in one place: `assets/css/style.css`. Colors are defined as CSS variables at the top of that file (`--navy`, `--blue-accent`, etc.) so you can retheme the whole site by changing a few lines.

## Images

The images in `assets/images/` are placeholders (navy gradient blocks) generated to keep the layout working while real photos are added. Replace any file in that folder with a same-named real photo (same filename) and it'll swap in automatically — no code changes needed. Recommended sizes:

- `hero-home-1.jpg`, `hero-home-2.jpg` — 1600x1100 or larger, landscape
- `services-cinematic.jpg`, `services-documentation.jpg` — 1200x1500, portrait
- `about.jpg` — 1200x1400, portrait
- `logo.svg` — replace with your real logo file (keep the name `logo.svg`, or update the `<img src>` references in each HTML file if using a different filename/format)

See `GUIDE.md` for the full step-by-step on getting this live at altusaerials.com.
