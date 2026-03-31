(function () {
  const THEME_KEY = "tuterio-theme";

  function applyTheme(theme) {
    const root = document.documentElement;
    const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (theme === "dark" || (theme === "system" && systemDark)) {
      root.setAttribute("data-theme", "dark");
    } else {
      root.setAttribute("data-theme", "light");
    }
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
    return "system";
  }

  const selectedTheme = getSavedTheme();
  applyTheme(selectedTheme);

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (getSavedTheme() === "system") {
        applyTheme("system");
      }
    });
  }

  window.tuterioTheme = {
    key: THEME_KEY,
    applyTheme,
    getSavedTheme,
    setTheme: function (theme) {
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
    }
  };
})();
