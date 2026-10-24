"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { ToolbarPopovers } from "./ToolbarPopovers";

type ToolbarArea = "management" | "caretaker";

export function ManagementToolbar({ area = "management" }: { area?: ToolbarArea }) {
  const [dark, setDark] = useState<boolean | null>(null);

  function toggleTheme() {
    const current = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = !current;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
  }

  return (
    <div className={`management-toolbar${area === "caretaker" ? " management-toolbar--caretaker" : ""}`} aria-label={`${area === "caretaker" ? "Caretaker" : "Management"} tools`}>
      {area === "management" && <label className="toolbar-search toolbar-search--disabled">
        <Icon name="search" />
        <span className="sr-only">Search is unavailable</span>
        <input aria-label="Search is unavailable" placeholder="Search room, tenant, ticket ..." disabled />
      </label>}
      <button className="toolbar-icon" type="button" onClick={toggleTheme} aria-label={dark === null ? "Toggle color theme" : `Switch to ${dark ? "light" : "dark"} theme`} title="Switch color theme">
        {dark === null
          ? <span className="toolbar-theme-icons"><Icon name="sun" className="toolbar-theme-icons__sun" /><Icon name="moon" className="toolbar-theme-icons__moon" /></span>
          : <Icon name={dark ? "sun" : "moon"} />}
      </button>
      <ToolbarPopovers area={area} />
    </div>
  );
}
