const themeOptionsEl = document.getElementById("themeOptions");
const themeStatusEl = document.getElementById("themeStatus");

function renderThemeState() {
  const active = window.tuterioTheme.getSavedTheme();
  const buttons = themeOptionsEl.querySelectorAll(".theme-btn");

  buttons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.theme === active);
  });

  themeStatusEl.textContent = `Current theme setting: ${active}`;
}

themeOptionsEl.addEventListener("click", (event) => {
  const target = event.target.closest(".theme-btn");
  if (!target) {
    return;
  }

  const selected = target.dataset.theme;
  if (!selected) {
    return;
  }

  window.tuterioTheme.setTheme(selected);
  renderThemeState();
});

renderThemeState();
