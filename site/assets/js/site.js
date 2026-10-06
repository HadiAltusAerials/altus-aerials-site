/* Altus Aerials — shared page behavior + scroll motion.
   Everything is visible without this file. Motion only runs when GSAP loaded
   and the visitor hasn't asked for reduced motion. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header: transparent over the hero, solid after ---------- */
  var head = document.querySelector(".site-head");
  var hero = document.querySelector(".hero");
  if (head && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      head.classList.toggle("is-solid", !en[0].isIntersecting);
    }, { rootMargin: "-80px 0px 0px 0px" }).observe(hero);
  } else if (head) {
    head.classList.add("is-solid");
  }

  /* ---------- Mobile menu ---------- */
  var btn = document.querySelector(".menu-btn");
  var menu = document.getElementById("mobile-menu");
  if (btn && menu) {
    var setOpen = function (open) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.hidden = !open;
      if (open) head.classList.add("is-solid");
      else if (hero && hero.getBoundingClientRect().bottom > 80) head.classList.remove("is-solid");
    };
    btn.addEventListener("click", function () { setOpen(btn.getAttribute("aria-expanded") !== "true"); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
  }

  /* ---------- Scroll motion (GSAP + ScrollTrigger) ---------- */
  if (reduce || !window.gsap || !window.ScrollTrigger) return;
  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  doc.classList.add("motion");

  function start() {
    var mm = gsap.matchMedia();

    mm.add({ mobile: "(max-width: 1023px)", desktop: "(min-width: 1024px)" }, function (ctx) {
      var desktop = ctx.conditions.desktop;
      var dist = desktop ? 60 : 22;          // slide distance (px)

      /* Hero parallax: the photo drifts slower than the copy */
      if (hero) {
        gsap.to(".hero-media", { yPercent: desktop ? 10 : 6, ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".hero .cue", { opacity: 0, ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "30% top", scrub: true } });
      }

      /* Section headings: slide in from alternating sides */
      gsap.utils.toArray("[data-slide]").forEach(function (el, i) {
        var from = el.getAttribute("data-slide") === "right" ? dist : -dist;
        gsap.from(el, { x: from, opacity: 0, duration: .8, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true } });
      });

      /* Opening work sequence */
      var seq = document.querySelector(".seq");
      var frames = seq ? gsap.utils.toArray(".seq .frame") : [];
      if (seq && frames.length === 3 && desktop) {
        // One pinned moment: twilight → aerial → interior, each wiping in from the opposite side.
        seq.classList.add("is-pinned");
        gsap.set(frames[1], { clipPath: "inset(0 0 0 100%)", x: 40 });
        gsap.set(frames[2], { clipPath: "inset(0 100% 0 0)", x: -40 });
        gsap.from(frames[0], { clipPath: "inset(0 0 0 100%)", x: -40, duration: 1, ease: "power3.out",
          scrollTrigger: { trigger: seq, start: "top 80%", once: true } });
        var tl = gsap.timeline({ scrollTrigger: { trigger: ".work-pin", start: "top top", end: "+=90%", pin: ".work-pin", scrub: 0.4, anticipatePin: 1 } });
        tl.to(frames[1], { clipPath: "inset(0 0 0 0%)", x: 0, ease: "power2.inOut", duration: 1 })
          .to(frames[2], { clipPath: "inset(0 0% 0 0)", x: 0, ease: "power2.inOut", duration: 1 }, "+=0.25")
          .to({}, { duration: 0.25 });
        return function () { seq.classList.remove("is-pinned"); };
      }
      // Phones/tablets: normal flow, gentle alternating slide + wipe.
      frames.forEach(function (f, i) { wipeIn(f, i % 2 ? "right" : "left", dist); });
    });

    mm.add({ mobile: "(max-width: 1023px)", desktop: "(min-width: 1024px)" }, function (ctx) {
      var dist = ctx.conditions.desktop ? 60 : 22;
      /* Editorial frames: clean wipe reveals, alternating sides */
      gsap.utils.toArray(".edit .frame").forEach(function (f, i) { wipeIn(f, i % 2 ? "right" : "left", dist); });

      /* Package cards: staggered rise with a slight alternating drift */
      var cards = gsap.utils.toArray(".pk");
      if (cards.length) {
        gsap.from(cards, { y: ctx.conditions.desktop ? 50 : 28, x: function (i) { return (i % 2 ? 1 : -1) * (ctx.conditions.desktop ? 14 : 6); },
          opacity: 0, duration: .7, ease: "power2.out", stagger: ctx.conditions.desktop ? .12 : .06,
          scrollTrigger: { trigger: ".pk-grid", start: "top 85%", once: true } });
      }
      /* Trust band: simple fade */
      gsap.from(".trust li", { opacity: 0, duration: .8, stagger: .12, ease: "none",
        scrollTrigger: { trigger: ".trust", start: "top 90%", once: true } });
      /* Closing CTA: clean rise */
      gsap.from(".closing .wrap > *", { y: 30, opacity: 0, duration: .8, stagger: .1, ease: "power2.out",
        scrollTrigger: { trigger: ".closing", start: "top 80%", once: true } });
    });
  }

  function wipeIn(el, side, dist) {
    var clip = side === "right" ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
    gsap.fromTo(el, { clipPath: clip, x: side === "right" ? dist : -dist },
      { clipPath: "inset(0 0% 0 0%)", x: 0, duration: 1, ease: "power3.out", clearProps: "clipPath,transform",
        scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  }

  // Start once the hero photo is ready (or right away if it already is).
  var heroImg = document.querySelector(".hero-media img");
  if (heroImg && !heroImg.complete) {
    heroImg.addEventListener("load", start, { once: true });
    heroImg.addEventListener("error", start, { once: true });
  } else start();
  window.addEventListener("load", function () { window.ScrollTrigger.refresh(); });
})();
