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
  }, { once: true });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    event.preventDefault();
    applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
  });
})();
