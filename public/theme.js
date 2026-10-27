/* Stamp My Page: light or dark. Runs in <head>, before the page paints, so there's no flash.
   The visitor's choice is remembered on this device; until they choose, it follows their system setting.
   Adds a sun/moon switcher to the header, or a floating one on pages without a header. */
(function () {
  var KEY = "smp.theme";
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function apply(t) {
    root.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b0b10" : "#f3f3f4");
  }
  apply(saved === "dark" || saved === "light" ? saved : media && media.matches ? "dark" : "light");
  if (media && media.addEventListener) media.addEventListener("change", function (e) { if (!saved) apply(e.matches ? "dark" : "light"); });

  var ICON = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>' +
    '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  function button(floating) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "theme-toggle" + (floating ? " floating" : "");
    b.setAttribute("aria-label", "Switch between light and dark");
    b.title = "Light or dark";
    b.innerHTML = ICON;
    b.addEventListener("click", function () {
      saved = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, saved); } catch (e) {}
      apply(saved);
    });
    return b;
  }
  // Headers drawn by React appear after load and can be redrawn (loading screen, then the page), so keep
  // watching and put the switcher back whenever a header is missing it. No header at all: a floating one.
  function place() {
    var bar = document.querySelector("header.bar");
    if (!bar) return false;
    if (bar.querySelector(".theme-toggle")) return true;
    var stray = document.querySelector(".theme-toggle.floating");
    if (stray) stray.remove();
    var last = bar.lastElementChild;
    bar.insertBefore(button(false), last && last.classList.contains("btn") ? last : null);
    return true;
  }
  function start() {
    place();
    new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { if (!document.querySelector(".theme-toggle")) document.body.appendChild(button(true)); }, 2500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
