import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { THEMES, applyTheme, readTheme, type ThemeId } from "@/lib/theme";

export function SettingsScreen() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);

  function choose(next: ThemeId) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <>
      <Link to="/" className="back-link">
        ‹ Done
      </Link>
      <div className="view-head">
        <p className="eyebrow">Settings</p>
        <h1>Palette</h1>
      </div>

      <div className="card">
        <div className="card-head">
          <p className="eyebrow">Colour</p>
          <span className="readout">this device</span>
        </div>
        <div className="palettes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === theme ? "palette on" : "palette"}
              onClick={() => choose(t.id)}
              aria-pressed={t.id === theme}
            >
              {/* data-theme here is what paints the swatch: the palette cascades
                  into this subtree, so the preview is the live thing. */}
              <span className="palette-swatch" data-theme={t.id} aria-hidden="true">
                <i className="pal-bg" />
                <i className="pal-surface" />
                <i className="pal-accent" />
                <i className="pal-alert" />
                <i className="pal-good" />
              </span>
              <span className="palette-text">
                <b>{t.name}</b>
                <small>{t.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
