(function () {
  var root = document.documentElement;
  var storageKey = "kzr-theme";
  var queryTheme = new URLSearchParams(window.location.search).get("theme");
  var savedTheme = null;

  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch (error) {
    savedTheme = null;
  }

  function applyTheme(theme, persist) {
    var nextTheme = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", nextTheme);
    root.style.colorScheme = nextTheme;

    if (persist) {
      try {
        localStorage.setItem(storageKey, nextTheme);
      } catch (error) {
        // Theme switching still works when storage is unavailable.
      }
    }

    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      var dark = nextTheme === "dark";
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  var initialTheme = queryTheme === "dark" || queryTheme === "light"
    ? queryTheme
    : (savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light");

  applyTheme(initialTheme, false);

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(root.getAttribute("data-theme"), false);

    if (window.location.protocol === "file:") {
      var subpageMatch = window.location.pathname.match(/\/(research|datasets|interests|design|profile|skills)\/index\.html$/);
      var siteRoot = new URL(subpageMatch ? "../" : "./", window.location.href);

      document.querySelectorAll(".nav-logo, .nav-links a, .mobile-menu a").forEach(function (link) {
        var href = link.getAttribute("href");
        if (!href) return;

        if (href === "#" || href === "./" || href === "#about" || href === "./#about") {
          link.href = new URL(href.endsWith("#about") ? "index.html#about" : "index.html", siteRoot).href;
          return;
        }

        var routeMatch = href.match(/^(research|datasets|interests|design|profile|skills)\/?$/);
        if (routeMatch) {
          link.href = new URL(routeMatch[1] + "/index.html", siteRoot).href;
        }
      });
    }

    var backToTop = document.createElement("button");
    backToTop.type = "button";
    backToTop.className = "back-to-top";
    backToTop.setAttribute("aria-label", "Back to top");
    backToTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 4.5 11.5H9V20h6v-8.5h4.5L12 4Z"/></svg>';
    document.body.appendChild(backToTop);

    function updateBackToTop() {
      backToTop.classList.toggle("is-visible", window.scrollY > 40);
    }

    window.addEventListener("scroll", updateBackToTop, { passive: true });
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    updateBackToTop();
  }, { once: true });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    event.preventDefault();
    applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
  });
})();
