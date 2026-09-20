import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import './Pager.css';

/** Rows shown per page. Small enough to read a table without scrolling it. */
export const DEFAULT_PAGE_SIZE = 10;

/** What a paged list hands back to the screen showing it. */
export type PagerState = {
  page: number;
  pageCount: number;
  /** Position of the first and last row on this page, 1 based. Both 0 when the list is empty. */
  firstShown: number;
  lastShown: number;
  total: number;
  setPage: (page: number) => void;
};

/**
 * Cut a list into pages.
 *
 * The whole list is already in memory on these screens, so paging is a slice
 * rather than another request. The page is clamped to what exists, which keeps
 * the view sane when a filter shortens the list under it, and it returns to the
 * first page whenever the list changes length, because page 4 of a new list is
 * rarely where the reader meant to be.
 */
export function usePagedRows<T>(rows: T[], pageSize: number = DEFAULT_PAGE_SIZE): { pageRows: T[]; pager: PagerState } {
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [rows.length]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);

  return {
    pageRows: rows.slice((current - 1) * pageSize, current * pageSize),
    pager: {
      page: current,
      pageCount,
      firstShown: rows.length === 0 ? 0 : (current - 1) * pageSize + 1,
      lastShown: Math.min(current * pageSize, rows.length),
      total: rows.length,
      setPage,
    },
  };
}

/**
 * The page controls under a table.
 *
 * Nothing is drawn while everything fits on one page: a short list should not
 * carry the furniture of a long one.
 */
const Pager: React.FC<{ pager: PagerState; label: string; className?: string }> = ({ pager, label, className = '' }) => {
  if (pager.pageCount <= 1) return null;

  return (
    <div className={`pager ${className}`.trim()}>
      <span className="pager-count">Showing {pager.firstShown}–{pager.lastShown} of {pager.total} {label}</span>
      <div className="pager-controls">
        <button type="button" onClick={() => pager.setPage(pager.page - 1)} disabled={pager.page <= 1} aria-label="Previous page">
          <IonIcon icon={chevronBackOutline} />
        </button>
        <span className="pager-position">Page {pager.page} of {pager.pageCount}</span>
        <button type="button" onClick={() => pager.setPage(pager.page + 1)} disabled={pager.page >= pager.pageCount} aria-label="Next page">
          <IonIcon icon={chevronForwardOutline} />
        </button>
      </div>
    </div>
  );
};

export default Pager;
