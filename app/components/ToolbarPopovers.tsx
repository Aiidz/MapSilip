"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { profilePathForArea } from "../lib/navigation.mjs";
import { Icon } from "./Icon";
import { ProfilePhoto } from "./ProfilePhoto";

type Area = "tenant" | "management" | "caretaker";
type Popup = "notifications" | "profile" | null;
const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ToolbarPopovers({ area, compact = false, staffAuthEnabled = false, tenantAuthEnabled = false }: {
  area: Area;
  compact?: boolean;
  staffAuthEnabled?: boolean;
  tenantAuthEnabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Popup>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [notificationRows, setNotificationRows] = useState<{ id: string; title: string; body: string; href: string; read_at: string | null }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRequest = useRef(0);
  const portalReady = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupPortalRef = useRef<HTMLDivElement>(null);
  const notificationsTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  const profileHref = profilePathForArea(area);
  const notificationsId = `toolbar-${area}-${compact ? "mobile" : "desktop"}-notifications`;
  const notificationsTitleId = `${notificationsId}-title`;
  const profileMenuId = `toolbar-${area}-${compact ? "mobile" : "desktop"}-profile-menu`;
  const authEnabled = area === "tenant" ? tenantAuthEnabled : staffAuthEnabled;

  const loadUnread = useCallback(async () => {
    // Only the visible header fetches. Results stay in its component state;
    // there is no shared private-data cache across sessions or roles.
    if (window.matchMedia('(min-width: 1000px)').matches === compact) return;
    const requestId = ++unreadRequest.current;
    try {
      const response = await fetch('/api/operations?resource=notifications&read=unread&pageSize=5', { cache: 'no-store' });
      if (!response.ok) return;
      const list = await response.json();
      if (requestId !== unreadRequest.current) return;
      if (Array.isArray(list.rows)) setNotificationRows(list.rows.filter((row: { read_at: string | null }) => !row.read_at));
      if (Number.isFinite(Number(list.count))) setUnreadCount(Number(list.count));
    } catch { /* Keep the last known unread state until the next refresh. */ }
  }, [compact]);

  useEffect(() => {
    if (!authEnabled) return;
    const timer = window.setTimeout(() => void loadUnread(), 0);
    const viewport = window.matchMedia('(min-width: 1000px)');
    viewport.addEventListener('change', loadUnread);
    window.addEventListener('mapsilip-notifications-updated', loadUnread);
    return () => { window.clearTimeout(timer); viewport.removeEventListener('change', loadUnread); window.removeEventListener('mapsilip-notifications-updated', loadUnread); };
  }, [authEnabled, loadUnread]);

  useLayoutEffect(() => {
    if (open !== "profile") return;
    profileMenu.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [open, profileMenuId]);

  const containsTarget = useCallback((target: EventTarget | null) => {
    return target instanceof Node && Boolean(rootRef.current?.contains(target) || popupPortalRef.current?.contains(target));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containsTarget(event.target)) setOpen(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(null);
      (open === "notifications" ? notificationsTrigger : profileTrigger).current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [containsTarget, open]);

  function toggle(popup: Exclude<Popup, null>) {
    if (popup === 'notifications' && open !== popup) {
      void loadUnread();
    }
    setOpen((current) => current === popup ? null : popup);
  }

  async function handleSignOut() {
    if (!authEnabled || signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const response = await fetch(area === "tenant" ? "/api/tenant/auth/signout" : "/api/auth/signout", { method: "POST", credentials: "same-origin" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" ||
          (result as Record<string, unknown>).state !== "signed-out") throw new Error();
      router.replace("/login");
    } catch {
      setSigningOut(false);
      setSignOutError(true);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(profileMenu.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  }

  const notificationsOpen = open === "notifications";
  const profileOpen = open === "profile";
  const notificationsPanel = (
    <section
      className={`toolbar-popover${notificationsOpen ? " is-open" : ""}`}
      id={notificationsId}
      aria-labelledby={notificationsTitleId}
      aria-hidden={!notificationsOpen}
      inert={!notificationsOpen}
    >
      <div className="toolbar-popover__heading">
        <div><h2 id={notificationsTitleId}>Notifications</h2><p>Your unread updates.</p></div>
        <button className="toolbar-popover__close" type="button" aria-label="Close notifications" onClick={() => { setOpen(null); notificationsTrigger.current?.focus(); }}><span aria-hidden="true">×</span></button>
      </div>
      {notificationRows.length ? <ul className="toolbar-notification-list">{notificationRows.map(item =>
        <li key={item.id}><Link href={item.href} onClick={async event => {
          event.preventDefault();
          const response = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notification.read', data: { id: item.id } }) });
          if (!response.ok) return;
          setNotificationRows(current => current.filter(row => row.id !== item.id));
          setUnreadCount(current => Math.max(0, current - 1));
          window.dispatchEvent(new Event('mapsilip-notifications-updated'));
          router.push(item.href);
        }}><strong>{item.title}</strong><span>{item.body}</span><small>Unread</small></Link></li>)}</ul>
        : <div className="toolbar-popover__empty"><span className="toolbar-popover__empty-icon"><Icon name="bell" /></span><strong>No unread notifications</strong><p>You’re all caught up.</p></div>}
      <Link className="toolbar-popover__link" href={area === "tenant" ? "/tenant/notifications" : area === "caretaker" ? "/caretaker/notifications" : "/management/notifications"}>Open notifications <Icon name="arrow" /></Link>
    </section>
  );
  const profilePanel = (
    <div
      className={`toolbar-popover toolbar-profile-menu${profileOpen ? " is-open" : ""}`}
      id={profileMenuId}
      role="menu"
      aria-label="Profile options"
      aria-hidden={!profileOpen}
      inert={!profileOpen}
      onKeyDown={handleMenuKeyDown}
      ref={profileMenu}
    >
      <Link role="menuitem" href={profileHref}><Icon name="users" /><span>Profile</span><Icon name="chevron" /></Link>
      {authEnabled && <button type="button" role="menuitem" onClick={() => {
        setOpen(null); profileTrigger.current?.focus();
        window.dispatchEvent(new Event('mapsilip-open-app-settings'));
      }}><Icon name="bell" /><span>App and notifications</span><Icon name="chevron" /></button>}
      <button
        className={authEnabled ? undefined : "toolbar-profile-menu__disabled"}
        type="button"
        role="menuitem"
        aria-disabled={!authEnabled || signingOut}
        disabled={!authEnabled || signingOut}
        onClick={handleSignOut}
      >
        <Icon name="logout" />
        <span>{signingOut ? "Signing out…" : signOutError ? "Sign out failed — try again" : "Log Out"}</span>
        <span aria-hidden="true" />
      </button>
    </div>
  );
  return (
    <div
      className={`toolbar-popovers${compact ? " toolbar-popovers--compact" : ""}`}
      ref={rootRef}
      onBlurCapture={(event) => {
        if (!containsTarget(event.relatedTarget)) setOpen(null);
      }}
    >
      <div className="toolbar-popup-anchor">
        <button
          className="toolbar-icon toolbar-popup-trigger toolbar-notification-trigger"
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          aria-expanded={notificationsOpen}
          aria-controls={notificationsId}
          onClick={() => toggle("notifications")}
          ref={notificationsTrigger}
        >
          <Icon name="bell" />
          {unreadCount > 0 && <span className="toolbar-notification-dot" aria-hidden="true" />}
        </button>
        {!compact && notificationsPanel}
      </div>

      <div className="toolbar-popup-anchor">
        <button
          className={`toolbar-profile toolbar-popup-trigger${compact ? " toolbar-profile--compact" : ""}`}
          type="button"
          aria-label="Profile options"
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          aria-controls={profileMenuId}
          onClick={() => toggle("profile")}
          ref={profileTrigger}
        >
          <ProfilePhoto className="toolbar-profile__avatar" fallback={area === "tenant" ? <Icon name="users" /> : area === "caretaker" ? "C" : "MS"} />
          <span className="toolbar-profile__label">Profile</span>
        </button>
        {!compact && profilePanel}
      </div>
      {compact && portalReady && createPortal(
        <div className="toolbar-popover-portal" ref={popupPortalRef}>{notificationsPanel}{profilePanel}</div>,
        document.body,
      )}
    </div>
  );
}
