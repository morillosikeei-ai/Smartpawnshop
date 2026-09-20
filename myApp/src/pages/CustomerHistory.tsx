import React, { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
    alertCircleOutline,
    cashOutline,
    checkmarkCircleOutline,
    handRightOutline,
    refreshOutline,
    searchOutline,
    walletOutline,
} from 'ionicons/icons';
import { moneyExact } from '../data/pawnshopStore';
import type { ApiItemDetail, ApiRenewalRequest, ApiTransaction } from '../services/api';
import { SkeletonList } from '../components/Skeleton';
import Pager, { usePagedRows } from '../components/Pager';
import './CustomerHistory.css';

type EventKind = 'pawned' | 'requested' | 'confirmed' | 'paid' | 'expired' | 'renewal_sent' | 'renewed' | 'renewal_rejected';

/** One dated thing that happened on one of the customer's pawn tickets. */
type HistoryEvent = {
    id: string;
    kind: EventKind;
    date: string;
    itemId: number;
    itemName: string;
    ticket: string;
    amount: number | null;
};

const KIND_META: Record<EventKind, { label: string; icon: string }> = {
    pawned: { label: 'Pawned', icon: walletOutline },
    requested: { label: 'Request sent', icon: handRightOutline },
    confirmed: { label: 'Request confirmed', icon: checkmarkCircleOutline },
    paid: { label: 'Paid', icon: cashOutline },
    expired: { label: 'Expired/Unclaimed', icon: alertCircleOutline },
    renewal_sent: { label: 'Renewal payment sent', icon: refreshOutline },
    renewed: { label: 'Renewed', icon: refreshOutline },
    renewal_rejected: { label: 'Renewal not confirmed', icon: alertCircleOutline },
};

type Filter = 'all' | 'pawned' | 'renewed' | 'paid' | 'expired';

const FILTERS: Array<{ id: Filter; label: string; kinds: EventKind[] }> = [
    { id: 'all', label: 'All', kinds: ['pawned', 'requested', 'confirmed', 'paid', 'expired', 'renewal_sent', 'renewed', 'renewal_rejected'] },
    { id: 'pawned', label: 'Pawned', kinds: ['pawned'] },
    // Everything the customer did about a renewal, decided or not, so a
    // payment that was never confirmed is still accounted for here.
    { id: 'renewed', label: 'Renewed', kinds: ['renewal_sent', 'renewed', 'renewal_rejected'] },
    { id: 'paid', label: 'Paid', kinds: ['paid'] },
    { id: 'expired', label: 'Expired', kinds: ['expired'] },
];

/** The last day a pawn could be redeemed: due date plus the extension period. */
const forfeitDate = (transaction: ApiTransaction) => {
    const date = new Date(transaction.due_date);
    date.setDate(date.getDate() + Number(transaction.grace_period_days || 0));
    return date.toISOString();
};

/** Every event on every ticket, built from the items the portal already loads. */
const buildEvents = (items: ApiItemDetail[]): HistoryEvent[] =>
    items.flatMap(item => (item.transactions || []).flatMap(transaction => {
        const event = (kind: EventKind, date: string, amount: number | null = null): HistoryEvent => ({
            id: `${transaction.transactions_id}-${kind}`,
            kind,
            date,
            itemId: item.items_id,
            itemName: item.description,
            ticket: transaction.ticket_number,
            amount,
        });

        const events = [event('pawned', transaction.created_at, Number(transaction.loan_amount))];
        if (transaction.ready_to_redeem_at) events.push(event('requested', transaction.ready_to_redeem_at));
        if (transaction.redemption_confirmed_at) events.push(event('confirmed', transaction.redemption_confirmed_at));
        if (transaction.status === 'redeemed' && transaction.redeemed_at) events.push(event('paid', transaction.redeemed_at, Number(transaction.total_payable)));
        if (transaction.status === 'forfeited') events.push(event('expired', forfeitDate(transaction)));

        /*
          A renewal is two dated things, not one: the day the customer sent the
          GCash payment, and the day the shop decided on it. Both are shown,
          because a payment sitting unconfirmed is exactly what the customer
          needs to be able to point at.
        */
        (transaction.renewal_requests || []).forEach((renewal: ApiRenewalRequest) => {
            // The id carries the renewal's own id: one ticket can be renewed
            // more than once, and each renewal is its own pair of events.
            const renewalEvent = (kind: EventKind, date: string): HistoryEvent => ({
                ...event(kind, date, renewal.amount),
                id: `renewal-${renewal.renewal_requests_id}-${kind}`,
            });

            if (renewal.submitted_at) events.push(renewalEvent('renewal_sent', renewal.submitted_at));
            if (renewal.status !== 'pending' && renewal.reviewed_at) {
                events.push(renewalEvent(renewal.status === 'confirmed' ? 'renewed' : 'renewal_rejected', renewal.reviewed_at));
            }
        });

        return events;
    })).sort((a, b) => b.date.localeCompare(a.date));

/** Events per page. Larger than a table's, because each row is one short line. */
const HISTORY_PAGE_SIZE = 15;

const monthLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Customer > History. Everything that happened on the customer's pawn
 * tickets, newest first, grouped by month. Read only.
 */
const CustomerHistory: React.FC<{ items: ApiItemDetail[]; loaded: boolean; onOpenItem: (itemId: number) => void }> = ({ items, loaded, onOpenItem }) => {
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');

    const events = useMemo(() => buildEvents(items), [items]);
    const paidTotal = events.filter(event => event.kind === 'paid').reduce((total, event) => total + (event.amount || 0), 0);
    const ticketCount = events.filter(event => event.kind === 'pawned').length;

    const term = search.trim().toLowerCase();
    const kinds = FILTERS.find(entry => entry.id === filter)!.kinds;
    const visible = events.filter(event =>
        kinds.includes(event.kind)
        && (!term || event.itemName.toLowerCase().includes(term) || event.ticket.toLowerCase().includes(term)));

    // Paged first, then grouped: the month headings describe the page being
    // read, so a month split across two pages is headed on both.
    const { pageRows, pager } = usePagedRows(visible, HISTORY_PAGE_SIZE);

    const months: Array<{ label: string; events: HistoryEvent[] }> = [];
    pageRows.forEach(event => {
        const label = monthLabel(event.date);
        const last = months[months.length - 1];
        if (last && last.label === label) last.events.push(event);
        else months.push({ label, events: [event] });
    });

    return (
        <section className="portal-content ch-page">
            <div className="portal-intro">
                <div>
                    <small>YOUR RECORDS</small>
                    <h2>History</h2>
                    <p>{loaded ? `${ticketCount} ${ticketCount === 1 ? 'pawn' : 'pawns'} · ${moneyExact(paidTotal)} paid in total` : 'Every pawn and payment on your account.'}</p>
                </div>
            </div>

            <div className="ch-toolbar">
                <div className="ch-filters" role="tablist" aria-label="Show">
                    {FILTERS.map(entry => (
                        <button key={entry.id} role="tab" aria-selected={filter === entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}>
                            {entry.label}
                        </button>
                    ))}
                </div>
                <label className="ch-search">
                    <IonIcon icon={searchOutline} aria-hidden="true" />
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item or ticket" aria-label="Search history" />
                </label>
            </div>

            {!loaded && <SkeletonList rows={5} />}

            {loaded && months.map(month => (
                <div className="ch-month" key={month.label}>
                    <h3>{month.label}</h3>
                    <div className="ch-list">
                        {month.events.map(event => (
                            <button type="button" key={event.id} className={`ch-row ${event.kind}`} onClick={() => onOpenItem(event.itemId)}>
                                <span className="ch-icon" aria-hidden="true"><IonIcon icon={KIND_META[event.kind].icon} /></span>
                                <span className="ch-text">
                                    <strong>{event.itemName}</strong>
                                    <small>{KIND_META[event.kind].label} · {dayLabel(event.date)} · #{event.ticket}</small>
                                </span>
                                {event.amount !== null && <b className="ch-amount">{moneyExact(event.amount)}</b>}
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {loaded && months.length === 0 && (
                <p className="notice-empty">{events.length === 0 ? 'No pawn activity on your account yet.' : 'Nothing matches your search.'}</p>
            )}

            {loaded && <Pager pager={pager} label="events" />}
        </section>
    );
};

export default CustomerHistory;
