import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import AppModal, { type ModalTone, type ModalVariant } from './AppModal';

/** What a caller may say about the dialog it wants. Everything else has a default. */
export type ModalOptions = {
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  /** Pass to give a single button dialog a secondary action as well. */
  cancelLabel?: string;
  tone?: ModalTone;
};

/**
 * The imperative dialog API every screen uses.
 *
 * Each opener returns a promise: it resolves true when the primary button is
 * pressed and false when the dialog is cancelled, dismissed, or closed. A
 * message-only dialog can be awaited the same way when the caller wants to
 * carry on only after it has been read.
 */
export type ModalApi = {
  success: (options: ModalOptions) => Promise<boolean>;
  error: (options: ModalOptions) => Promise<boolean>;
  warning: (options: ModalOptions) => Promise<boolean>;
  confirm: (options: ModalOptions) => Promise<boolean>;
  info: (options: ModalOptions) => Promise<boolean>;
  /** Shows the blocking loading dialog. Nothing dismisses it but hideLoading. */
  loading: (message?: string) => void;
  hideLoading: () => void;
};

/** Per variant fallbacks, so a caller only states what is particular to its case. */
const DEFAULTS: Record<ModalVariant, { title: string; confirmLabel: string; cancelLabel?: string }> = {
  success: { title: 'Success', confirmLabel: 'Done' },
  error: { title: 'Something went wrong', confirmLabel: 'Close' },
  warning: { title: 'Please confirm', confirmLabel: 'Confirm', cancelLabel: 'Cancel' },
  confirm: { title: 'Are you sure?', confirmLabel: 'Confirm', cancelLabel: 'Cancel' },
  info: { title: 'For your information', confirmLabel: 'Close' },
  loading: { title: 'Please wait...', confirmLabel: '' },
};

const ModalContext = createContext<ModalApi | null>(null);

/** One open dialog, with the promise the opener is waiting on. */
type ActiveDialog = ModalOptions & {
  variant: ModalVariant;
  settle: (confirmed: boolean) => void;
};

/**
 * Holds the application's dialogs.
 *
 * One dialog is open at a time, with the loading dialog on its own layer so a
 * confirmation can hand straight over to it while the work runs.
 */
export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // Held in a ref as well, so closing can settle the promise without the
  // callbacks having to be rebuilt every time the dialog changes.
  const activeRef = useRef<ActiveDialog | null>(null);

  const close = useCallback((confirmed: boolean) => {
    const active = activeRef.current;
    activeRef.current = null;
    setDialog(null);
    active?.settle(confirmed);
  }, []);

  const open = useCallback(
    (variant: ModalVariant, options: ModalOptions) =>
      new Promise<boolean>((resolve) => {
        // A dialog opened over another one cancels the first, so its caller is
        // never left waiting on a promise that can no longer settle.
        activeRef.current?.settle(false);

        const next: ActiveDialog = { ...options, variant, settle: resolve };
        activeRef.current = next;
        setDialog(next);
      }),
    []
  );

  const api = useMemo<ModalApi>(
    () => ({
      success: (options) => open('success', options),
      error: (options) => open('error', options),
      warning: (options) => open('warning', options),
      confirm: (options) => open('confirm', options),
      info: (options) => open('info', options),
      loading: (message = 'Please wait...') => setLoadingMessage(message),
      hideLoading: () => setLoadingMessage(null),
    }),
    [open]
  );

  const defaults = dialog ? DEFAULTS[dialog.variant] : null;

  return (
    <ModalContext.Provider value={api}>
      {children}

      <AppModal
        open={dialog !== null}
        variant={dialog?.variant || 'info'}
        title={dialog?.title || defaults?.title || ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel || defaults?.confirmLabel}
        cancelLabel={dialog?.cancelLabel ?? defaults?.cancelLabel}
        tone={dialog?.tone}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />

      <AppModal open={loadingMessage !== null} variant="loading" title={loadingMessage || 'Please wait...'} />
    </ModalContext.Provider>
  );
};

/**
 * The dialog API for the screen calling it.
 *
 * Throws when used outside the provider rather than failing quietly, because a
 * missing provider means the dialog would never appear at all.
 */
export const useModal = (): ModalApi => {
  const api = useContext(ModalContext);
  if (!api) throw new Error('useModal must be used inside a ModalProvider.');
  return api;
};

export default ModalProvider;
