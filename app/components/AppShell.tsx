"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isNavigationItemActive } from "../lib/navigation.mjs";
import { Icon, type IconName } from "./Icon";
import { ManagementToolbar } from "./ManagementToolbar";
import { ToolbarPopovers } from "./ToolbarPopovers";

type Area = "tenant" | "management" | "caretaker";
type NavItem = { label: string; href: string; icon: IconName; exact?: boolean; mobileLabel?: string };

const navigation: Record<Area, NavItem[]> = {
  tenant: [
    { label: "Home", href: "/tenant", icon: "home", exact: true },
    { label: "My Details", href: "/tenant/details", icon: "users" },
    { label: "Payments", href: "/tenant/payments", icon: "wallet" },
    { label: "Maintenance", href: "/tenant/maintenance", icon: "wrench" },
    { label: "Concerns & Suggestions", href: "/tenant/concerns", icon: "sparkles", mobileLabel: "Concerns" },
    { label: "Notifications", href: "/tenant/notifications", icon: "bell" },
    { label: "Visitors", href: "/tenant/visitors", icon: "calendar" },
    { label: "More", href: "/tenant/more", icon: "more" },
  ],
  management: [
    { label: "Dashboard", mobileLabel: "Overview", href: "/management", icon: "dashboard", exact: true },
    { label: "Room Management", mobileLabel: "Rooms", href: "/management/rooms", icon: "map" },
    { label: "Maintenance Map", href: "/management/maintenance", icon: "thermometer" },
    { label: "Payment Record", mobileLabel: "Payments", href: "/management/payments", icon: "receipt" },
    { label: "Notifications", href: "/management/notifications", icon: "bell" },
    { label: "Tenants", href: "/management/tenants", icon: "users" },
    { label: "Visitors", href: "/management/visitors", icon: "calendar" },
    { label: "More", href: "/management/more", icon: "more" },
  ],
  caretaker: [
    { label: "Dashboard", href: "/caretaker", icon: "dashboard", exact: true },
    { label: "Maintenance", href: "/caretaker/maintenance", icon: "wrench" },
    { label: "Notifications", href: "/caretaker/notifications", icon: "bell" },
    { label: "Profile", href: "/caretaker/profile", icon: "users" },
  ],
};

const managementMobileNavigation = [
  "/management",
  "/management/rooms",
  "/management/tenants",
  "/management/payments",
  "/management/more",
];

function Brand({ area }: { area: Area }) {
  return (
    <Link
      className="brand"
      href={area === "tenant" ? "/tenant" : area === "caretaker" ? "/caretaker" : "/management"}
      aria-label="MapSilip home"
    >
      <Image
        className="brand__logo"
        src="/mapsilip-logo-combi.svg"
        alt=""
        width="1073"
        height="419"
        unoptimized
      />
      <Image
        className="brand__mark"
        src="/mapsilip-logo-mark.svg"
        alt=""
        width="491"
        height="419"
        unoptimized
      />
      <span className="brand__text">
        <strong>MapSilip</strong>
        <small>Dormitory living, made simpler</small>
      </span>
    </Link>
  );
}

function TenantToolbar() {
  const [dark, setDark] = useState<boolean | null>(null);
  function toggleTheme() {
    const current = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = !current;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
  }
  return <div className="tenant-toolbar" aria-label="Tenant tools">
    <button className="toolbar-icon" type="button" onClick={toggleTheme} aria-label={dark === null ? "Toggle color theme" : `Switch to ${dark ? "light" : "dark"} theme`} title="Switch color theme">
      {dark === null ? <span className="toolbar-theme-icons"><Icon name="sun" className="toolbar-theme-icons__sun" /><Icon name="moon" className="toolbar-theme-icons__moon" /></span> : <Icon name={dark ? "sun" : "moon"} />}
    </button>
    <ToolbarPopovers area="tenant" />
  </div>;
}

function NavLinks({ area, mobile = false }: { area: Area; mobile?: boolean }) {
  const pathname = usePathname();
  const items = mobile && area === "caretaker"
    ? navigation.caretaker
    : mobile && area === "tenant"
    ? ["/tenant", "/tenant/payments", "/tenant/maintenance", "/tenant/concerns", "/tenant/more"].flatMap((href) =>
      navigation.tenant.filter((item) => item.href === href)
    )
    : mobile && area === "management"
    ? managementMobileNavigation.flatMap((href) =>
      navigation.management.filter((item) => item.href === href)
    )
    : navigation[area];
  return (
    <nav
      className={mobile ? "mobile-nav" : "side-nav"}
      aria-label={mobile
        ? "Primary navigation"
        : `${area === "tenant" ? "Tenant" : area === "caretaker" ? "Caretaker" : "Management"} navigation`}
    >
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${active ? " nav-link--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PortalPageContent({ pathname, children }: { pathname: string; children: ReactNode }) {
  const previousPath = useRef(pathname);
  const [transitionPath, setTransitionPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setTransitionPath(pathname);
  }, [pathname]);

  const entering = transitionPath !== null;
  return (
    <div
      key={transitionPath ?? "initial"}
      className={`portal-page-content${entering ? " portal-page-content--enter" : ""}`}
    >
      {children}
    </div>
  );
}

export function AppShell(
  { area, children }: { area: Area; children: ReactNode },
) {
  const isTenant = area === "tenant";
  const isCaretaker = area === "caretaker";
  const pathname = usePathname();
  return (
    <div className={`app-shell app-shell--${area}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mobile-topbar">
        <Brand area={area} />
        <ToolbarPopovers area={area} compact />
      </header>

      <aside className="desktop-sidebar">
        <Brand area={area} />
        <div className="sidebar-caption">
          MENU
        </div>
        <NavLinks area={area} />
        <div className="sidebar-bottom">
          {!isCaretaker && <Link
            className="mode-link"
            href={isTenant ? "/management" : "/tenant"}
          >
            {isTenant ? "Management workspace" : "Tenant home"}
            <Icon name="arrow" />
          </Link>}
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {isTenant && <TenantToolbar />}
        <div className="content-wrap">
          {!isTenant && <ManagementToolbar area={area} />}
          <PortalPageContent pathname={pathname}>{children}</PortalPageContent>
          <footer className="page-footer">
            <span>MapSilip</span>
            <span>Designed for dorm life, wherever you are.</span>
          </footer>
        </div>
      </main>

      {!isCaretaker && <nav className="mobile-mode-switch" aria-label="Switch workspace">
        <Link href="/tenant" aria-current={isTenant ? "page" : undefined}>
          Tenant
        </Link>
        <Link href="/management" aria-current={!isTenant ? "page" : undefined}>
          Management
        </Link>
      </nav>}
      <NavLinks area={area} mobile />
    </div>
  );
}
