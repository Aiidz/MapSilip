'use client';

import { CloseIcon } from "./CloseIcon";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const subscribeToPortal = () => () => {};
const getPortalSnapshot = () => true;
const getServerPortalSnapshot = () => false;

type OpenOverlay = { handOff: () => { ownsHistory: boolean; closeReplaced: () => void } };
const openOverlays = new Map<HTMLDialogElement, OpenOverlay>();

type OverlayVariant = 'dialog' | 'drawer';

type ResponsiveOverlayProps = {
  open: boolean;
  dismissible?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: OverlayVariant;
  children: ReactNode;
  className?: string;
};

/**
 * Responsive task surface built on the native <dialog> element.
 *
 * - Desktop: a centred floating dialog, or a right-hand drawer for deeper flows.
 * - Phones: the same surface becomes a bottom sheet.
 *
 * Native showModal() supplies the focus trap, Escape handling and top-layer
 * stacking. A guarded history entry makes the browser/Android back button close
 * the overlay instead of leaving the page. Content stays mounted while closed,
 * so unsaved form input survives an accidental dismissal.
 */
export function ResponsiveOverlay({
  open,
  dismissible = true,
  onClose,
  title,
  description,
  variant = 'dialog',
  children,
  className = '',
}: ResponsiveOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const portalReady = useSyncExternalStore(subscribeToPortal, getPortalSnapshot, getServerPortalSnapshot);
  const pushedRef = useRef(false);
  const closeReplacedRef = useRef<(() => void) | null>(null);
  const finishReplacement = useCallback(() => {
    const closeReplaced = closeReplacedRef.current;
    closeReplacedRef.current = null;
    closeReplaced?.();
  }, []);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const drag = useRef<{ id: number; startY: number; startedAt: number; distance: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (!dismissible || !open || event.button !== 0 || !event.isPrimary || !window.matchMedia('(max-width: 767px)').matches ||
      (event.target as Element).closest('button,a,input,textarea,select')) return;
    drag.current = { id: event.pointerId, startY: event.clientY, startedAt: event.timeStamp, distance: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    dialogRef.current?.classList.remove('ps-overlay--drag-return');
    dialogRef.current?.classList.add('ps-overlay--dragging');
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture.distance = Math.max(0, event.clientY - gesture.startY);
    dialogRef.current?.style.setProperty('--sheet-drag-y', `${gesture.distance}px`);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    const dialog = dialogRef.current;
    const speed = gesture.distance / Math.max(1, event.timeStamp - gesture.startedAt);
    const threshold = Math.min(140, Math.max(80, (dialog?.offsetHeight ?? 400) * .22));
    const dismiss = event.type !== 'pointercancel' && (gesture.distance > threshold || (gesture.distance > 30 && speed > .6));
    dialog?.classList.remove('ps-overlay--dragging');
    if (!dismiss) {
      dialog?.classList.add('ps-overlay--drag-return');
      dialog?.style.setProperty('--sheet-drag-y', '0px');
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dismiss) requestClose();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (!dismissible) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
    onCloseRef.current();
    finishReplacement();
  }, [dismissible, finishReplacement]);

  // Body swipe-down-to-dismiss via native (non-passive) touch events.
  // Pointer events on the body don't work because touch-action:pan-y makes
  // the browser claim the gesture before pointer capture can fire.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !dismissible) return;

    let startY = 0;
    let startTime = 0;
    let dy = 0;
    let dragging = false;

    function onTouchStart(e: TouchEvent) {
      if (!open || !window.matchMedia('(max-width: 767px)').matches) return;
      if (body!.scrollTop > 0) return;
      const t = e.touches[0];
      if (!t) return;
      startY = t.clientY;
      startTime = e.timeStamp;
      dy = 0;
      dragging = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (!open) return;
      const t = e.touches[0];
      if (!t) return;
      // If body has scrolled down, cancel any drag intention.
      if (body!.scrollTop > 0) { dragging = false; return; }
      dy = t.clientY - startY;
      if (dy <= 0) { dragging = false; return; }
      // Once we're sure it's a downward pull, take over from the scroll.
      if (!dragging && dy > 5) {
        dragging = true;
        dialogRef.current?.classList.remove('ps-overlay--drag-return');
        dialogRef.current?.classList.add('ps-overlay--dragging');
      }
      if (dragging) {
        e.preventDefault();
        dialogRef.current?.style.setProperty('--sheet-drag-y', `${dy}px`);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!dragging) return;
      dragging = false;
      const dialog = dialogRef.current;
      const speed = dy / Math.max(1, e.timeStamp - startTime);
      const threshold = Math.min(140, Math.max(80, (dialog?.offsetHeight ?? 400) * 0.22));
      const dismiss = e.type !== 'touchcancel' && (dy > threshold || (dy > 30 && speed > 0.6));
      dialog?.classList.remove('ps-overlay--dragging');
      if (dismiss) {
        requestClose();
      } else {
        dialog?.classList.add('ps-overlay--drag-return');
        dialog?.style.setProperty('--sheet-drag-y', '0px');
      }
    }

    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('touchend', onTouchEnd, { passive: true });
    body.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      body.removeEventListener('touchstart', onTouchStart);
      body.removeEventListener('touchmove', onTouchMove);
      body.removeEventListener('touchend', onTouchEnd);
      body.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, dismissible, requestClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    drag.current = null;
    dialog.classList?.remove('ps-overlay--dragging', 'ps-overlay--drag-return');
    dialog.style?.removeProperty('--sheet-drag-y');

    if (open && !dialog.open) {
      const previous = window.matchMedia('(max-width: 767px)').matches
        ? Array.from(openOverlays.entries()).reverse().find(([node]) => node !== dialog && node.open)?.[1]
        : undefined;
      // Close the old dialog visually while keeping its React tree mounted.
      // A receipt or another nested sheet can be rendered inside that tree.
      const replaced = previous?.handOff();
      dialog.showModal();
      openOverlays.set(dialog, {
        handOff() {
          const ownsHistory = pushedRef.current;
          pushedRef.current = false;
          openOverlays.delete(dialog);
          dialog.close();
          return {
            ownsHistory,
            closeReplaced() {
              onCloseRef.current();
              finishReplacement();
            },
          };
        },
      });
      closeReplacedRef.current = replaced?.closeReplaced ?? null;
      if (replaced?.ownsHistory) {
        pushedRef.current = true;
        return;
      }
      try {
        window.history.pushState(
          { ...(window.history.state ?? {}), mapsilipOverlay: true },
          '',
        );
        pushedRef.current = true;
      } catch {
        pushedRef.current = false;
      }
      return;
    }

    if (!open && dialog.open) {
      openOverlays.delete(dialog);
      dialog.close();
      finishReplacement();
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    }
  }, [open, portalReady, finishReplacement]);

  useEffect(() => {
    function handlePopState() {
      if (!pushedRef.current) return;
      if (!dismissible) {
        window.history.pushState({ ...(window.history.state ?? {}), mapsilipOverlay: true }, '');
        return;
      }
      pushedRef.current = false;
      onCloseRef.current();
      finishReplacement();
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dismissible, finishReplacement]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog) openOverlays.delete(dialog);
    };
  }, [portalReady]);

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) requestClose();
  }

  if (!portalReady) return null;

  return createPortal((
    <dialog
      ref={dialogRef}
      className={`ps-overlay ps-overlay--${variant} ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={handleBackdrop}
    >
      <span className="ps-overlay__grab" aria-hidden="true" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
      <header className="ps-overlay__header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <button
          className="ps-overlay__close"
          type="button"
          disabled={!dismissible}
          onClick={requestClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="ps-overlay__body" ref={bodyRef}>{children}</div>
    </dialog>
  ), document.body);
}
