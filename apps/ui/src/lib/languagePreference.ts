export function readLanguage(): "fr" | "en" {
  try {
    return localStorage.getItem("gridone.language") === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export function applyLanguage(language: string) {
  if (language !== "fr" && language !== "en") return;
  document.documentElement.lang = language;
  try {
    localStorage.setItem("gridone.language", language);
  } catch {
    /* Preference is optional. */
  }
}
