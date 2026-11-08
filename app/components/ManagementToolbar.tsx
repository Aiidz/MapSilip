"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
import { Icon } from "./Icon";
import { ToolbarPopovers } from "./ToolbarPopovers";
import { ThemeToggle } from "./ThemeToggle";

type ToolbarArea = "management" | "caretaker";

export function ManagementToolbar({ area = "management", staffAuthEnabled = false }: {
  area?: ToolbarArea;
  staffAuthEnabled?: boolean;
}) {
  const [query,setQuery] = useState('');
  const [results,setResults] = useState<{ title:string;href:string }[]>([]);
  const [searchOpen,setSearchOpen] = useState(false);
  useEffect(() => {
    if (area !== 'management' || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(response => response.ok ? response.json() : null)
        .then(value => { if (!controller.signal.aborted) setResults(value?.results ?? []); }).catch(() => { if (!controller.signal.aborted) setResults([]); });
    },200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  },[area,query]);

  return (
    <div className={`management-toolbar${area === "caretaker" ? " management-toolbar--caretaker" : ""}`} aria-label={`${area === "caretaker" ? "Caretaker" : "Management"} tools`}>
      {area === 'management' && <div className="toolbar-global-search"><label className="toolbar-search"><Icon name="search" />
        <span className="sr-only">Search rooms, tenants, and maintenance</span>
        <input aria-label="Search rooms, tenants, and maintenance" placeholder="Search room, tenant, ticket ..." value={query}
          onChange={event => { setQuery(event.target.value);setResults([]);setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
          onKeyDown={event => { if (event.key==='Escape') setSearchOpen(false); }} />
      </label>{searchOpen && query.trim().length >= 2 && <div className="toolbar-global-results" role="region" aria-label="Search results">
        {results.length ? results.map((item,index) => <Link key={`${item.href}-${index}`} href={item.href} onClick={() => setSearchOpen(false)}>{item.title}</Link>)
          : <p>No matching records</p>}
      </div>}</div>}
      <ThemeToggle />
      <ToolbarPopovers area={area} staffAuthEnabled={staffAuthEnabled} />
    </div>
  );
}
