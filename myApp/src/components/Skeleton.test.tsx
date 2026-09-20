import React from 'react';
import { render } from '@testing-library/react';
import { InlineLoader, Skeleton, SkeletonList, SkeletonRows, SkeletonStat, SkeletonText, Spinner } from './Skeleton';

test('applies the requested size and corner', () => {
  const { container } = render(<Skeleton width="42%" height="1.6rem" radius="999px" />);

  const block = container.querySelector('.skeleton') as HTMLElement;
  expect(block.style.width).toBe('42%');
  expect(block.style.height).toBe('1.6rem');
  expect(block.style.borderRadius).toBe('999px');
});

test('shortens the last line so a text block does not read as a rectangle', () => {
  const { container } = render(<SkeletonText lines={3} />);

  const lines = Array.from(container.querySelectorAll('.skeleton')) as HTMLElement[];
  expect(lines).toHaveLength(3);
  expect(lines[0].style.width).toBe('100%');
  expect(lines[2].style.width).toBe('60%');
});

test('renders one placeholder per requested row', () => {
  const { container: list } = render(<SkeletonList rows={4} />);
  expect(list.querySelectorAll('.skeleton-list-item')).toHaveLength(4);

  const { container: table } = render(
    <table><tbody><SkeletonRows rows={3} columns={['70%', '58%']} /></tbody></table>
  );
  expect(table.querySelectorAll('tr.skeleton-row')).toHaveLength(3);
  expect(table.querySelectorAll('tr.skeleton-row td')).toHaveLength(6);
});

test('hides decorative placeholders from assistive technology', () => {
  const { container: stat } = render(<SkeletonStat />);
  expect(stat.querySelector('.skeleton-stat')?.getAttribute('aria-hidden')).toBe('true');

  const { container: list } = render(<SkeletonList rows={2} />);
  expect(list.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

  const { container: rows } = render(
    <table><tbody><SkeletonRows rows={1} columns={['50%']} /></tbody></table>
  );
  expect(rows.querySelector('tr.skeleton-row')?.getAttribute('aria-hidden')).toBe('true');
});

test('sizes the spinner and keeps it out of the accessibility tree', () => {
  const { container } = render(<Spinner size={18} />);

  const ring = container.querySelector('.spinner') as HTMLElement;
  expect(ring.style.width).toBe('18px');
  expect(ring.style.height).toBe('18px');
  // A button carries its own label, so the ring beside it must not be read out.
  expect(ring.getAttribute('aria-hidden')).toBe('true');
});

test('announces an inline loader while keeping its ring decorative', () => {
  const { container } = render(<InlineLoader label="Loading gold price" />);

  const loader = container.querySelector('.inline-loader') as HTMLElement;
  expect(loader.getAttribute('role')).toBe('status');
  expect(loader.textContent).toBe('Loading gold price');
  expect(loader.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');
});
