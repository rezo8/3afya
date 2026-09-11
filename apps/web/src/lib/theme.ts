/**
 * Palette selection. The palettes themselves live in `styles/theme.css` as
 * `[data-theme]` blocks — this module only chooses which one is on the document
 * and remembers the choice. Nothing here names a colour, so adding a palette is
 * a CSS block plus one entry below.
 */

export const THEMES = [
  { id: "graphite", name: "Graphite", blurb: "Cool near-black, electric blue." },
  { id: "midnight", name: "Midnight", blurb: "Navy dark under indigo." },
  { id: "forest", name: "Forest", blurb: "Green-black ground, mint accent." },
  { id: "plum", name: "Plum", blurb: "Aubergine and magenta, cyan opposite." },
  { id: "oxblood", name: "Oxblood", blurb: "Wine dark, dusty rose, old gold." },
  { id: "silver", name: "Silver", blurb: "Graphite under brushed platinum." },
  { id: "slate", name: "Slate", blurb: "Blue-grey concrete cut with lime." },
  { id: "vitality", name: "Vitality", blurb: "The original marigold on espresso." },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "graphite";

const STORAGE_KEY = "afya.theme";

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** Falls back to the default for a missing, stale, or unreadable stored value. */
export function readTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private browsing and blocked storage both throw on read. The palette is a
    // preference, not state worth failing a boot over.
    return DEFAULT_THEME;
  }
}

/**
 * Puts the palette on the document and keeps it. Call before the first render so
 * the chosen palette paints instead of the default one.
 */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor instanceof HTMLMetaElement) {
    themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The palette still applies for this visit; only the memory of it is lost.
  }
}
