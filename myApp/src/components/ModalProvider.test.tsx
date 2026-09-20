import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ModalProvider, { useModal, type ModalApi } from './ModalProvider';

/** Hands the dialog API out to the test, so a dialog can be opened directly. */
const Harness: React.FC<{ onReady: (api: ModalApi) => void }> = ({ onReady }) => {
  const api = useModal();
  onReady(api);
  return <button type="button">page button</button>;
};

const renderProvider = () => {
  let api: ModalApi | null = null;
  render(
    <ModalProvider>
      <Harness onReady={(next) => { api = next; }} />
    </ModalProvider>
  );
  return api as unknown as ModalApi;
};

describe('ModalProvider', () => {
  it('resolves true when the primary button is pressed', async () => {
    const modal = renderProvider();

    let settled: boolean | null = null;
    act(() => { modal.confirm({ message: 'Are you sure you want to cancel this request?' }).then((value) => { settled = value; }); });

    expect(await screen.findByText('Are you sure you want to cancel this request?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(settled).toBe(true));
  });

  it('resolves false when cancelled', async () => {
    const modal = renderProvider();

    let settled: boolean | null = null;
    act(() => { modal.warning({ message: 'This cannot be undone.' }).then((value) => { settled = value; }); });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(settled).toBe(false));
  });

  it('uses the per variant defaults when the caller states only a message', async () => {
    const modal = renderProvider();
    act(() => { modal.error({ message: 'The payment could not be processed.' }); });

    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    // An error dialog has one button, so no stray Cancel appears beside it.
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('closes a dismissible dialog on Escape', async () => {
    const modal = renderProvider();

    let settled: boolean | null = null;
    act(() => { modal.info({ message: 'Redemption appointment requested.' }).then((value) => { settled = value; }); });

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(settled).toBe(false));
  });

  /** The loading dialog is held open by the work behind it, never by the viewer. */
  it('shows a loading dialog that Escape cannot dismiss', async () => {
    const modal = renderProvider();
    act(() => { modal.loading(); });

    const status = await screen.findByRole('status');
    expect(screen.getByText('Please wait...')).toBeTruthy();

    fireEvent.keyDown(status, { key: 'Escape' });
    expect(screen.getByText('Please wait...')).toBeTruthy();

    act(() => { modal.hideLoading(); });
    await waitFor(() => expect(screen.queryByText('Please wait...')).toBeNull());
  });

  it('cancels a dialog that a second dialog replaces', async () => {
    const modal = renderProvider();

    let first: boolean | null = null;
    act(() => { modal.confirm({ message: 'First question.' }).then((value) => { first = value; }); });
    act(() => { modal.success({ message: 'Second dialog.' }); });

    await waitFor(() => expect(first).toBe(false));
    expect(await screen.findByText('Second dialog.')).toBeTruthy();
  });
});
