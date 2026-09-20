import React from 'react';
import './Skeleton.css';

/**
 * Placeholders shown while a panel's data is still loading.
 *
 * Each one is shaped like the content it stands in for and keeps that
 * content's height, so a panel does not resize when the real values land. The
 * sweep is decorative: the whole group is hidden from assistive technology and
 * the surrounding panel announces the loading state instead.
 */

type SkeletonProps = {
  /** Any CSS width. Defaults to filling the row. */
  width?: string;
  /** Any CSS height. Defaults to one line of text. */
  height?: string;
  /** Any CSS border radius. Defaults to a text-sized corner. */
  radius?: string;
  className?: string;
};

/** One grey block. Every other skeleton is built from these. */
export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = '0.9rem', radius = '6px', className = '' }) => (
  <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} />
);

/**
 * Stacked lines of text. The last line is shortened so the block reads as a
 * paragraph rather than a solid rectangle.
 */
export const SkeletonText: React.FC<{ lines?: number; width?: string }> = ({ lines = 3, width = '100%' }) => (
  <span className="skeleton-stack" style={{ width }}>
    {Array.from({ length: lines }, (_, line) => (
      <Skeleton key={line} width={line === lines - 1 ? '60%' : '100%'} />
    ))}
  </span>
);

/** Stand-in for one figure above its caption, as the stat tiles are laid out. */
export const SkeletonStat: React.FC = () => (
  <div className="skeleton-stat" aria-hidden="true">
    <Skeleton width="38px" height="38px" radius="12px" />
    <span className="skeleton-stack">
      <Skeleton width="54%" height="1.25rem" />
      <Skeleton width="82%" height="0.72rem" />
    </span>
  </div>
);

/**
 * Stand-in for a chart card: the headline figure, its change badge, and the
 * plot area at the height the real chart will occupy.
 */
export const SkeletonChart: React.FC<{ height: number }> = ({ height }) => (
  <div className="skeleton-chart" aria-hidden="true">
    <div className="skeleton-chart-summary">
      <Skeleton width="42%" height="1.6rem" radius="8px" />
      <Skeleton width="74px" height="1.1rem" radius="999px" />
    </div>
    <Skeleton className="skeleton-chart-plot" width="100%" height={`${height}px`} radius="12px" />
  </div>
);

/** Stand-in for table rows, sized to the columns the real table renders. */
export const SkeletonRows: React.FC<{ rows?: number; columns: string[] }> = ({ rows = 4, columns }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <tr key={row} className="skeleton-row" aria-hidden="true">
        {columns.map((column, cell) => (
          <td key={cell}><Skeleton width={column} /></td>
        ))}
      </tr>
    ))}
  </>
);

/** Stand-in for an icon-and-two-lines list, as the activity feed is laid out. */
export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div aria-hidden="true">
    {Array.from({ length: rows }, (_, row) => (
      <div className="skeleton-list-item" key={row}>
        <Skeleton width="20px" height="20px" radius="7px" />
        <span className="skeleton-stack">
          <Skeleton width="72%" />
          <Skeleton width="44%" height="0.7rem" />
        </span>
      </div>
    ))}
  </div>
);

/**
 * Small spinning ring for places where a skeleton would not fit: inside a
 * button that keeps its label, or beside a line of text.
 *
 * Buttons pass their own wording, so the spinner carries no text of its own.
 * The surrounding control marks itself busy for assistive technology.
 */
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <span
    className={`spinner ${className}`}
    style={{ width: `${size}px`, height: `${size}px` }}
    aria-hidden="true"
  />
);

/** Spinner plus wording, for a panel that is fetching a single value. */
export const InlineLoader: React.FC<{ label: string }> = ({ label }) => (
  <p className="inline-loader" role="status">
    <Spinner />
    {label}
  </p>
);

export default Skeleton;
