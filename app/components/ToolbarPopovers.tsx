"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

type Area = "tenant" | "management" | "caretaker";
type Popup = "notifications" | "profile" | null;
const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ToolbarPopovers({ area, compact = false }: { area: Area; compact?: boolean }) {
  const [open, setOpen] = useState<Popup>(null);
  const portalReady = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupPortalRef = useRef<HTMLDivElement>(null);
  const notificationsTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  const profileHref = area === "tenant" ? "/tenant/profile" : area === "caretaker" ? "/caretaker/profile" : "/management/profile";
  const notificationsId = `toolbar-${area}-${compact ? "mobile" : "desktop"}-notifications`;
  const notificationsTitleId = `${notificationsId}-title`;
  const profileMenuId = `toolbar-${area}-${compact ? "mobile" : "desktop"}-profile-menu`;

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
    setOpen((current) => current === popup ? null : popup);
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
        <div><h2 id={notificationsTitleId}>Notifications</h2><p>Your latest account updates.</p></div>
        <button className="toolbar-popover__close" type="button" aria-label="Close notifications" onClick={() => { setOpen(null); notificationsTrigger.current?.focus(); }}><span aria-hidden="true">×</span></button>
      </div>
      <div className="toolbar-popover__empty"><span className="toolbar-popover__empty-icon"><Icon name="bell" /></span><strong>No notifications to display</strong><p>New account updates will appear here.</p></div>
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
      <button className="toolbar-profile-menu__disabled" type="button" role="menuitem" aria-disabled="true"><Icon name="logout" /><span>Log Out</span><span aria-hidden="true" /></button>
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
          className="toolbar-icon toolbar-popup-trigger"
          type="button"
          aria-label="Notifications"
          aria-expanded={notificationsOpen}
          aria-controls={notificationsId}
          onClick={() => toggle("notifications")}
          ref={notificationsTrigger}
        >
          <Icon name="bell" />
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
          <span className="toolbar-profile__avatar" aria-hidden="true">{area === "tenant" ? <Icon name="users" /> : area === "caretaker" ? "C" : "MS"}</span>
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
