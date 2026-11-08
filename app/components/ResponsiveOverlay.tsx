'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';

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
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

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
  }, [dismissible]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
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
      dialog.close();
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    }
  }, [open]);

  useEffect(() => {
    function handlePopState() {
      if (!pushedRef.current) return;
      if (!dismissible) {
        window.history.pushState({ ...(window.history.state ?? {}), mapsilipOverlay: true }, '');
        return;
      }
      pushedRef.current = false;
      onCloseRef.current();
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dismissible]);

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) requestClose();
  }

  return (
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
      <span className="ps-overlay__grab" aria-hidden="true" />
      <header className="ps-overlay__header">
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
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="ps-overlay__body">{children}</div>
    </dialog>
  );
}
