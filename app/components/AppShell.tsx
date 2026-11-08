"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { isNavigationItemActive } from "../lib/navigation.mjs";
import { PwaManager } from "./PwaManager";
import { SidebarProfileCard } from "./SidebarProfileCard";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
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
    { label: "Concerns & Suggestions", mobileLabel: "Concerns", href: "/management/concerns", icon: "sparkles" },
    { label: "Analytics", href: "/management/analytics", icon: "analytics" },
    { label: "Notifications", href: "/management/notifications", icon: "bell" },
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
  "/management/maintenance",
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

function TenantToolbar({ authEnabled }: { authEnabled: boolean }) {
  return <div className="tenant-toolbar" aria-label="Tenant tools">
    <ThemeToggle />
    <ToolbarPopovers area="tenant" tenantAuthEnabled={authEnabled} />
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
    : navigation[area].filter((item) => item.label !== "More");
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
  const element = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Keep the page mounted and fixed sheets anchored to the viewport.
    const animation = element.current?.animate?.([{ opacity: .92 }, { opacity: 1 }], {
      duration: 320, easing: 'cubic-bezier(.22, .61, .36, 1)',
    });
    return () => animation?.cancel();
  }, [pathname]);

  return (
    <div ref={element} className="portal-page-content">
      {children}
    </div>
  );
}

export function AppShell(
  { area, children, staffAuthEnabled = false, tenantAuthEnabled = false, authenticatedUserId, pushEnabled = false }: { authenticatedUserId?: string; pushEnabled?: boolean; area: Area; children: ReactNode; staffAuthEnabled?: boolean; tenantAuthEnabled?: boolean },
) {
  const isTenant = area === "tenant";
  const pathname = usePathname();
  return (
    <div className={`app-shell app-shell--${area}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mobile-topbar">
        <Brand area={area} />
        <div className="mobile-topbar__actions"><ThemeToggle />
          <ToolbarPopovers area={area} compact staffAuthEnabled={staffAuthEnabled} tenantAuthEnabled={tenantAuthEnabled} />
        </div>
      </header>

      <aside className="desktop-sidebar">
        <Brand area={area} />
        <div className="sidebar-caption">
          MENU
        </div>
        <NavLinks area={area} />
        <SidebarProfileCard area={area} />
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {isTenant && <TenantToolbar authEnabled={tenantAuthEnabled} />}
        <div className="content-wrap">
          {!isTenant && <ManagementToolbar area={area} staffAuthEnabled={staffAuthEnabled} />}
          <PortalPageContent pathname={pathname}>{children}</PortalPageContent>
          <footer className="page-footer">
            <span>MapSilip</span>
            {authenticatedUserId && <PwaManager key={authenticatedUserId} userId={authenticatedUserId} pushEnabled={pushEnabled} />}
            <span>Designed for dorm life, wherever you are.</span>
          </footer>
        </div>
      </main>

      <NavLinks area={area} mobile />
    </div>
  );
}
