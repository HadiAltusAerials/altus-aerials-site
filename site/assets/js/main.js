// Altus Aerials — shared interactivity: transparent header on scroll,
// subtle scroll-reveal animations, and a light parallax on the home hero video.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Transparent header -> solid on scroll ----------
  var header = document.querySelector(".site-header.header-transparent");
  if (header) {
    var THRESHOLD = 80;
    var setScrolled = function () {
      if (window.scrollY > THRESHOLD) {
        header.classList.add("is-scrolled");
      } else {
        header.classList.remove("is-scrolled");
      }
    };
    setScrolled();
    window.addEventListener("scroll", setScrolled, { passive: true });
  }

  // ---------- Scroll reveal ----------
  // Sections gently fade and lift into place as they enter the viewport.
  // Kept short and eased so it reads as smooth, not choppy, and every
  // element still has its final layout space reserved (no jumps).
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) { el.classList.add("in-view"); });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
      );
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  // ---------- Book a Shoot ----------
  // Pricing-card "Select This Package" buttons set the form's package
  // dropdown and scroll down to it. The date/time slot picker below calls
  // our own Netlify Function for real, live availability (backed by
  // Netlify Blobs) instead of a plain date field, so a slot only becomes
  // unavailable to others once it's actually reserved or paid for.
  var shootForm = document.getElementById("shoot-form");
  var packageSelect = document.getElementById("shoot-package");
  if (shootForm && packageSelect) {
    var selectPackageByValue = function (pkg) {
      for (var i = 0; i < packageSelect.options.length; i++) {
        if (packageSelect.options[i].value === pkg) {
          packageSelect.selectedIndex = i;
          return true;
        }
      }
      return false;
    };

    // Support a ?package= query param too (e.g. bookmarked/shared links).
    var params = new URLSearchParams(window.location.search);
    var requestedPackage = params.get("package");
    if (requestedPackage) selectPackageByValue(requestedPackage);

    var packageButtons = document.querySelectorAll(".package-select");
    packageButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectPackageByValue(btn.getAttribute("data-package"));
        // Native anchor jump (href="#shoot-form") handles the scroll.
      });
    });

    // ---- Live availability slot picker ----
    var dateInput = document.getElementById("shoot-pick-date");
    var slotsContainer = document.getElementById("shoot-slots");
    var dateHidden = document.getElementById("shoot-date");
    var timeHidden = document.getElementById("shoot-time");
    var errorEl = document.getElementById("shoot-form-error");
    var submitBtn = document.getElementById("shoot-submit");

    var formatTime = function (hhmm) {
      var parts = hhmm.split(":");
      var h = parseInt(parts[0], 10);
      var m = parts[1];
      var period = h >= 12 ? "PM" : "AM";
      var h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return h12 + ":" + m + " " + period;
    };

    var clearSelection = function () {
      dateHidden.value = "";
      timeHidden.value = "";
    };

    var renderSlots = function (state, payload) {
      slotsContainer.innerHTML = "";
      clearSelection();

      if (state === "loading") {
        slotsContainer.innerHTML = '<p class="slot-hint">Checking availability&hellip;</p>';
        return;
      }
      if (state === "error") {
        slotsContainer.innerHTML = '<p class="slot-empty">Couldn\'t load availability right now. Please try again in a moment.</p>';
        return;
      }
      if (!payload || !payload.slots || !payload.slots.length) {
        slotsContainer.innerHTML = '<p class="slot-empty">No open times on this date &mdash; try another day.</p>';
        return;
      }

      payload.slots.forEach(function (time) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-button";
        btn.textContent = formatTime(time);
        btn.setAttribute("data-time", time);
        btn.addEventListener("click", function () {
          slotsContainer.querySelectorAll(".slot-button").forEach(function (b) {
            b.classList.remove("is-selected");
          });
          btn.classList.add("is-selected");
          dateHidden.value = payload.date;
          timeHidden.value = time;
          if (errorEl) { errorEl.hidden = true; }
        });
        slotsContainer.appendChild(btn);
      });
    };

    if (dateInput && slotsContainer && dateHidden && timeHidden) {
      // Don't let the picker suggest dates before today.
      var today = new Date();
      var todayStr = today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, "0") + "-" +
        String(today.getDate()).padStart(2, "0");
      dateInput.min = todayStr;

      dateInput.addEventListener("change", function () {
        var chosen = dateInput.value;
        if (!chosen) return;
        renderSlots("loading");
        fetch("/.netlify/functions/availability?date=" + encodeURIComponent(chosen))
          .then(function (res) {
            if (!res.ok) throw new Error("bad_response");
            return res.json();
          })
          .then(function (data) { renderSlots("ready", data); })
          .catch(function () { renderSlots("error"); });
      });
    }

    // ---- Submit: create a short-lived hold, then send to Stripe ----
    shootForm.addEventListener("submit", function (evt) {
      evt.preventDefault();
      if (errorEl) errorEl.hidden = true;

      if (!shootForm.checkValidity()) {
        shootForm.reportValidity();
        return;
      }
      if (!dateHidden.value || !timeHidden.value) {
        if (errorEl) {
          errorEl.textContent = "Please pick an open date and time above before continuing.";
          errorEl.hidden = false;
        }
        return;
      }

      var formData = new FormData(shootForm);
      var holdPayload = {
        date: formData.get("date"),
        time: formData.get("time"),
        package: formData.get("package"),
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
        shootType: formData.get("shoot_type"),
        notes: formData.get("notes"),
        referral: formData.get("referral_source"),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Reserving your slot…";

      fetch("/.netlify/functions/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holdPayload),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (!result.ok) {
            if (result.data && result.data.error === "slot_taken") {
              if (errorEl) {
                errorEl.textContent = "That time slot was just taken by someone else. Please pick another.";
                errorEl.hidden = false;
              }
              // Refresh the list for the currently selected date.
              if (dateInput.value) dateInput.dispatchEvent(new Event("change"));
            } else if (errorEl) {
              errorEl.textContent = "Something went wrong reserving your slot. Please try again.";
              errorEl.hidden = false;
            }
            submitBtn.disabled = false;
            submitBtn.textContent = "Continue to Payment";
            return;
          }

          // Fire the existing Netlify Forms submission in the background so
          // it still shows up as an immediate notification email, same as
          // before -- this doesn't block the redirect to payment.
          var netlifyBody = new URLSearchParams();
          formData.forEach(function (value, key) { netlifyBody.append(key, value); });
          fetch("/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: netlifyBody.toString(),
          }).catch(function () { /* non-fatal */ });

          var redirectParams = new URLSearchParams();
          redirectParams.set("package", holdPayload.package);
          redirectParams.set("bookingId", result.data.bookingId);
          redirectParams.set("date", holdPayload.date);
          redirectParams.set("time", holdPayload.time);
          window.location.href = "/book-shoot-confirm.html?" + redirectParams.toString();
        })
        .catch(function () {
          if (errorEl) {
            errorEl.textContent = "Something went wrong reserving your slot. Please check your connection and try again.";
            errorEl.hidden = false;
          }
          submitBtn.disabled = false;
          submitBtn.textContent = "Continue to Payment";
        });
    });
  }

  // ---------- Subtle hero video parallax ----------
  var heroVideo = document.querySelector(".hero-video");
  if (heroVideo && !reduceMotion) {
    var heroSection = heroVideo.closest(".hero-video-section");
    var ticking = false;
    var applyParallax = function () {
      ticking = false;
      var rect = heroSection.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      var offset = window.scrollY * 0.12;
      heroVideo.style.transform = "translateY(" + offset + "px) scale(1.08)";
    };
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(applyParallax);
          ticking = true;
        }
      },
      { passive: true }
    );
    applyParallax();
  }
})();
