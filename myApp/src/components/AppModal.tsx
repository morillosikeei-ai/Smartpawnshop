import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  helpCircleOutline,
  informationCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import './AppModal.css';

/** Every kind of dialog the application shows. One look, six meanings. */
export type ModalVariant = 'success' | 'error' | 'warning' | 'confirm' | 'info' | 'loading';

/** Colour weight of the primary button. Danger is for destructive confirmations. */
export type ModalTone = 'default' | 'danger';

export type AppModalProps = {
  open: boolean;
  variant: ModalVariant;
  title: string;
  /** Body copy. A node rather than a string, so a caller can lay out its own detail. */
  message?: React.ReactNode;
  /** Primary button label. Left off entirely on the loading variant. */
  confirmLabel?: string;
  /** Secondary button label. Omit for a single button dialog. */
  cancelLabel?: string;
  /** Primary button colour. Danger paints it red. */
  tone?: ModalTone;
  /** True while the confirmed action runs, so the dialog can hold and disable itself. */
  busy?: boolean;
  onConfirm?: () => void;
  /** Backdrop click, Escape, the close button, and the secondary button all land here. */
  onCancel?: () => void;
};

const VARIANT_ICON: Record<ModalVariant, string> = {
  success: checkmarkCircleOutline,
  error: closeCircleOutline,
  warning: warningOutline,
  confirm: helpCircleOutline,
  info: informationCircleOutline,
  loading: alertCircleOutline,
};

/** How long the leaving animation runs. Kept in step with the CSS. */
const LEAVE_MS = 150;

/**
 * The one dialog every screen in the application uses.
 *
 * Rendered into the document body rather than in place, so a dialog opened
 * from inside a scrolling panel is never clipped by it. The loading variant
 * cannot be dismissed: the work behind it decides when it closes.
 */
const AppModal: React.FC<AppModalProps> = ({
  open,
  variant,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  // Kept mounted for one animation after open turns false, so the dialog
  // fades out rather than vanishing.
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  const dismissible = variant !== 'loading' && !busy;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }

    if (!mounted) return;

    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, LEAVE_MS);

    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  // The page behind must not scroll while a dialog is up, and the element that
  // opened the dialog gets its focus back when the dialog closes.
  useEffect(() => {
    if (!mounted) return;

    restoreFocusTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      const target = restoreFocusTo.current;
      if (target instanceof HTMLElement) target.focus();
    };
  }, [mounted]);

  // Focus moves into the dialog on open, so the keyboard is already there.
  useEffect(() => {
    if (!mounted || leaving) return;
    const focusable = boxRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
    focusable?.focus();
  }, [mounted, leaving, variant]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onCancel?.();
        return;
      }

      if (event.key !== 'Tab') return;

      // A dialog keeps the keyboard inside itself, so Tab cannot wander onto
      // the page behind it.
      const focusable = Array.from(
        boxRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onCancel]
  );

  if (!mounted || typeof document === 'undefined') return null;

  const showButtons = variant !== 'loading';

  return createPortal(
    <div
      className={`app-modal-backdrop ${leaving ? 'is-leaving' : ''}`}
      // A click on the dialog itself must not close it, only one on the backdrop.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onCancel?.();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`app-modal is-${variant} ${leaving ? 'is-leaving' : ''}`}
        ref={boxRef}
        role={variant === 'loading' ? 'status' : 'dialog'}
        aria-modal={variant === 'loading' ? undefined : true}
        aria-live={variant === 'loading' ? 'polite' : undefined}
        aria-labelledby="app-modal-title"
        aria-describedby={message ? 'app-modal-message' : undefined}
      >
        <span className="app-modal-icon" aria-hidden="true">
          {variant === 'loading' ? <i className="app-modal-spinner" /> : <IonIcon icon={VARIANT_ICON[variant]} />}
        </span>

        <h2 className="app-modal-title" id="app-modal-title">{title}</h2>
        {message && <div className="app-modal-message" id="app-modal-message">{message}</div>}

        {showButtons && (
          <div className="app-modal-actions">
            {cancelLabel && (
              <button type="button" className="app-modal-button is-secondary" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              className={`app-modal-button is-primary ${tone === 'danger' ? 'is-danger' : ''}`}
              onClick={onConfirm}
              disabled={busy}
              aria-busy={busy}
            >
              {busy && <i className="app-modal-button-spinner" aria-hidden="true" />}
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AppModal;
