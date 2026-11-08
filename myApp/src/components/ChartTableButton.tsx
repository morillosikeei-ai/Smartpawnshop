import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { closeOutline, downloadOutline, gridOutline } from 'ionicons/icons';
import './ChartTableButton.css';

export type ChartTableColumn = {
    key: string;
    label: string;
    /** Numbers line up on the right. */
    align?: 'left' | 'right';
};

/** One row, keyed by column. Values are already formatted for reading. */
export type ChartTableRow = Record<string, string>;

/** How a change cell is drawn: up, down, or flat. Read from its leading sign. */
const changeTone = (value: string) => (value.startsWith('+') ? 'is-up' : value.startsWith('−') || value.startsWith('-') ? 'is-down' : '');

type Props = {
    /** Shown on the modal, e.g. "Gold price history". */
    title: string;
    /** A line under the title: the range or the unit. */
    subtitle?: string;
    columns: ChartTableColumn[];
    /** Newest first reads best; the chart itself runs oldest to newest. */
    rows: ChartTableRow[];
    /** The column whose values are signed changes, coloured green or red. */
    changeKey?: string;
    /** Name of the CSV file, without the extension. */
    fileName: string;
};

/**
 * "View table": the numbers behind a chart, in a table, in a modal.
 *
 * A chart shows the shape; staff and customers also need the exact figure on
 * a given day, and a table is the accessible way to read it. The table opens
 * on demand, so the chart keeps its small footprint, and can be saved as CSV.
 */
const ChartTableButton: React.FC<Props> = ({ title, subtitle, columns, rows, changeKey, fileName }) => {
    const [open, setOpen] = useState(false);
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return undefined;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const close = () => {
        setOpen(false);
        openerRef.current?.focus();
    };

    const downloadCsv = () => {
        const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
        const lines = [columns.map(column => escape(column.label)).join(','), ...rows.map(row => columns.map(column => escape(row[column.key] ?? '')).join(','))];
        // The BOM lets Excel read the peso sign correctly.
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };

    if (rows.length === 0) return null;

    return (
        <>
            <button ref={openerRef} type="button" className="chart-table-open" onClick={() => setOpen(true)} aria-haspopup="dialog">
                <IonIcon icon={gridOutline} aria-hidden="true" />
                View table
            </button>

            {open && createPortal(
                <div className="chart-table-backdrop" onClick={close}>
                    <div className="chart-table-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
                        <header className="chart-table-head">
                            <div>
                                <h3 id={titleId}>{title}</h3>
                                <small>{subtitle ? `${subtitle} · ` : ''}{rows.length} {rows.length === 1 ? 'row' : 'rows'}</small>
                            </div>
                            <button ref={closeRef} type="button" className="chart-table-close" onClick={close} aria-label="Close table">
                                <IonIcon icon={closeOutline} />
                            </button>
                        </header>

                        <div className="chart-table-scroll" tabIndex={0} aria-label={`${title} table`}>
                            <table className="chart-table">
                                <thead>
                                    <tr>
                                        {columns.map(column => (
                                            <th key={column.key} scope="col" className={column.align === 'right' ? 'is-num' : ''}>{column.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={index}>
                                            {columns.map(column => (
                                                <td
                                                    key={column.key}
                                                    data-label={column.label}
                                                    className={[column.align === 'right' ? 'is-num' : '', column.key === changeKey ? changeTone(row[column.key] || '') : ''].join(' ').trim() || undefined}
                                                >
                                                    {row[column.key] ?? '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <footer className="chart-table-foot">
                            <button type="button" className="chart-table-download" onClick={downloadCsv}>
                                <IonIcon icon={downloadOutline} aria-hidden="true" />
                                Download CSV
                            </button>
                            <button type="button" className="chart-table-done" onClick={close}>Done</button>
                        </footer>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

/** A signed change between two figures, e.g. "+₱120" or "−₱45", or "—" for the first row. */
export const signedChange = (current: number, previous: number | undefined, format: (value: number) => string) => {
    if (previous === undefined) return '—';
    const change = current - previous;
    if (Math.abs(change) < 0.005) return '0';
    return `${change > 0 ? '+' : '−'}${format(Math.abs(change))}`;
};

export default ChartTableButton;
