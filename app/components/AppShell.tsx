"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

function Brand({ area, desktop = false }: { area: Area; desktop?: boolean }) {
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
      {!desktop && <span className="brand__text">
        <strong>MapSilip</strong>
        <small>Dormitory living, made simpler</small>
      </span>}
    </Link>
  );
}

function TenantToolbar({ authEnabled }: { authEnabled: boolean }) {
  return <div className="tenant-toolbar" aria-label="Tenant tools">
    <ThemeToggle />
    <ToolbarPopovers area="tenant" tenantAuthEnabled={authEnabled} />
  </div>;
}

function NavLinks({ area, mobile = false, collapsed = false }: { area: Area; mobile?: boolean; collapsed?: boolean }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const lastPosition = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const highlight = highlightRef.current;
    if (!nav || !highlight) return;
    let animation: Animation | undefined;
    function place(animate: boolean) {
      const active = nav!.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) { highlight!.style.opacity = '0'; lastPosition.current = null; return; }
      const next = { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight };
      const previous = lastPosition.current;
      animation?.cancel();
      Object.assign(highlight!.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px`, opacity: '1', backgroundColor: getComputedStyle(active).backgroundColor, borderRadius: getComputedStyle(active).borderRadius });
      if (animate && previous && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = highlight!.animate([
          { transform: `translate(${previous.x-next.x}px, ${previous.y-next.y}px) scale(${previous.width/next.width}, ${previous.height/next.height})` },
          { transform: 'none' },
        ], { duration: 380, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
      lastPosition.current = next;
    }
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(nav);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, [pathname, collapsed, mobile]);
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
      ref={navRef}
      className={mobile ? "mobile-nav" : "side-nav"}
      id={mobile ? undefined : "desktop-primary-navigation"}
      aria-label={mobile
        ? "Primary navigation"
        : `${area === "tenant" ? "Tenant" : area === "caretaker" ? "Caretaker" : "Management"} navigation`}
    >
      <span ref={highlightRef} className="nav-active-highlight" aria-hidden="true" />
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${active ? " nav-link--active" : ""}`}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon name={item.icon} />
            <span>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function DesktopSidebar({ area }: { area: Area }) {
  const [collapsed, setCollapsed] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const lastDragTime = useRef<number | null>(null);
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('a,button,input,textarea,select,[role="button"]'))) return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(event.clientY - start.y)) return;
    if ((deltaX < 0 && !collapsed) || (deltaX > 0 && collapsed)) {
      lastDragTime.current = event.timeStamp;
      setCollapsed(deltaX < 0);
    }
  };
  const handleBackgroundClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (lastDragTime.current !== null && event.timeStamp - lastDragTime.current < 80) {
      lastDragTime.current = null;
      return;
    }
    lastDragTime.current = null;
    const target = event.target;
    if (target instanceof Element && target.closest('a,button,input,textarea,select,[role="button"]')) return;
    if (target === event.currentTarget || (target instanceof Element && target.closest('.side-nav,.sidebar-caption,.sidebar-brand-row'))) {
      setCollapsed(value => !value);
    }
  };
  return (
    <aside
      className="desktop-sidebar"
      data-sidebar-collapsed={collapsed}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragStart.current = null; }}
      onClick={handleBackgroundClick}
    >
      <div className="sidebar-brand-row">
        <Brand area={area} desktop />
      </div>
      <div className="sidebar-caption">MENU</div>
      <NavLinks area={area} collapsed={collapsed} />
      <SidebarProfileCard area={area} />
    </aside>
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
    const node = element.current;
    if (!node) return;
    const motion = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
    const animation = node.animate?.([{ opacity: 0 }, { opacity: 1 }], {
      duration: Number.parseFloat(motion?.getPropertyValue('--motion-overlay') || '440') || 440,
      easing: motion?.getPropertyValue('--motion-ease').trim() || 'cubic-bezier(.22, .61, .36, 1)',
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
  const mainContentRef = useRef<HTMLElement>(null);
  const mobileTopbarRef = useRef<HTMLElement>(null);
  const [mobileTopbarHidden, setMobileTopbarHidden] = useState(false);

  useEffect(() => {
    const main = mainContentRef.current;
    if (!main) return;

    let previousTop = main.scrollTop;
    let accumulatedDelta = 0;
    let previousDirection = 0;
    const mobile = window.matchMedia("(max-width: 999px)");
    const handleScroll = () => {
      if (!mobile.matches) return;
      const top = Math.max(0, main.scrollTop);
      const delta = top - previousTop;
      previousTop = top;

      if (top < 12) {
        accumulatedDelta = 0;
        setMobileTopbarHidden(false);
        return;
      }
      if (Math.abs(delta) < 1) return;

      const direction = Math.sign(delta);
      if (direction !== previousDirection) accumulatedDelta = 0;
      previousDirection = direction;
      accumulatedDelta += delta;

      if (accumulatedDelta >= 12) {
        if (!mobileTopbarRef.current?.contains(document.activeElement)) setMobileTopbarHidden(true);
        accumulatedDelta = 0;
      } else if (accumulatedDelta <= -8) {
        setMobileTopbarHidden(false);
        accumulatedDelta = 0;
      }
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setMobileTopbarHidden(false), [pathname]);

  return (
    <div className={`app-shell app-shell--${area}${mobileTopbarHidden ? " app-shell--topbar-hidden" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header ref={mobileTopbarRef} className="mobile-topbar" aria-hidden={mobileTopbarHidden ? true : undefined} inert={mobileTopbarHidden ? true : undefined}>
        <Brand area={area} />
        <div className="mobile-topbar__actions"><ThemeToggle />
          <ToolbarPopovers area={area} compact staffAuthEnabled={staffAuthEnabled} tenantAuthEnabled={tenantAuthEnabled} />
        </div>
      </header>

      <DesktopSidebar area={area} />

      <main ref={mainContentRef} className="main-content" id="main-content" tabIndex={-1}>
        {isTenant && <TenantToolbar authEnabled={tenantAuthEnabled} />}
        <div className="content-wrap">
          {!isTenant && <ManagementToolbar area={area} staffAuthEnabled={staffAuthEnabled} />}
          <PortalPageContent pathname={pathname}>{children}</PortalPageContent>
          <footer className="page-footer">
            <span>MapSilip</span>
            <span>Designed for dorm life, wherever you are.</span>
          </footer>
        </div>
      </main>

      <NavLinks area={area} mobile />
      {authenticatedUserId && <PwaManager key={authenticatedUserId} userId={authenticatedUserId} pushEnabled={pushEnabled} />}
    </div>
  );
}
