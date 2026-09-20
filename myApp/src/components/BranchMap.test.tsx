import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Leaflet measures its container to lay out tiles, and jsdom reports every
 * element as zero sized. The map itself is not what these tests are about, so
 * the library is stubbed and the card's own markup is checked instead.
 */
const addTo = vi.fn().mockReturnThis();
const bindTooltip = vi.fn().mockReturnThis();

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      on: vi.fn(),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
      scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
    })),
    tileLayer: vi.fn(() => ({ addTo })),
    marker: vi.fn(() => ({ addTo: vi.fn(() => ({ bindTooltip })) })),
    divIcon: vi.fn(() => ({})),
    control: { zoom: vi.fn(() => ({ addTo })) },
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

const BranchMap = (await import('./BranchMap')).default;

test('labels the branch on the map and under it', () => {
  render(<BranchMap />);

  expect(screen.queryByText('Pag-Asa Pawnshop – Kauswagan')).not.toBeNull();
  expect(screen.queryByText('Kauswagan, Cagayan de Oro City, Misamis Oriental')).not.toBeNull();
});

test('opens the branch in Google Maps in a new tab', () => {
  render(<BranchMap />);

  const link = screen.getByText('Get Directions') as HTMLAnchorElement;
  expect(link.href).toContain('https://www.google.com/maps/search/');
  expect(decodeURIComponent(link.href)).toContain('Pag-Asa Pawnshop Kauswagan Cagayan de Oro City');
  expect(link.target).toBe('_blank');
  // Without noopener the opened page keeps a handle on this one.
  expect(link.rel).toContain('noopener');
});

test('describes the map for readers who cannot see the tiles', () => {
  const { container } = render(<BranchMap />);

  const surface = container.querySelector('.branch-map-surface');
  expect(surface?.getAttribute('aria-label')).toBe('Map of Pag-Asa Pawnshop – Kauswagan');
});
