import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ItemThumb, ItemThumbViewer, PhotoLightbox, PhotoStrip } from './ItemPhotos';

const PHOTOS = ['data:image/jpeg;base64,front', 'data:image/jpeg;base64,back'];

test('shows the letter badge when the item has no photo', () => {
  const { container } = render(<ItemThumb photos={[]} name="Ring" />);

  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe('R');
});

test('falls back to the letter badge when the photo fails to load', () => {
  const { container } = render(<ItemThumb photos={PHOTOS} name="Ring" onOpen={() => undefined} />);

  fireEvent.error(container.querySelector('img') as HTMLImageElement);
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe('R');
});

test('opening the thumbnail does not click the row around it', () => {
  const rowClick = vi.fn();
  render(<div onClick={rowClick}><ItemThumbViewer photos={PHOTOS} name="Ring" /></div>);

  fireEvent.click(screen.getByRole('button', { name: 'View photo of Ring' }));
  expect(screen.getByRole('dialog', { name: 'Photo of Ring' })).toBeTruthy();

  // Closing from the backdrop stays inside the viewer too.
  fireEvent.click(screen.getByRole('dialog', { name: 'Photo of Ring' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(rowClick).not.toHaveBeenCalled();
});

test('the viewer moves between photos and closes with Escape', () => {
  const onClose = vi.fn();
  render(<PhotoLightbox photos={PHOTOS} name="Ring" onClose={onClose} />);

  const image = () => screen.getByRole('img') as HTMLImageElement;
  expect(image().getAttribute('src')).toBe(PHOTOS[0]);

  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(image().getAttribute('src')).toBe(PHOTOS[1]);
  expect(screen.getByText('2 / 2')).toBeTruthy();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('the strip shows every photo and opens the one clicked', () => {
  const onOpen = vi.fn();
  render(<PhotoStrip photos={PHOTOS} name="Ring" onOpen={onOpen} />);

  const buttons = screen.getAllByRole('listitem');
  expect(buttons).toHaveLength(2);

  fireEvent.click(buttons[1]);
  expect(onOpen).toHaveBeenCalledWith(1);
});
