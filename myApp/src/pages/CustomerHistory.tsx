import React, { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
    alertCircleOutline,
    eyeOutline,
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
    expired: { label: 'For auction', icon: alertCircleOutline },
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

/** The last day a pawn could be redeemed: due date plus the redemption (grace) period. */
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
        if (transaction.status === 'redeemed' && transaction.redeemed_at) events.push(event('paid', transaction.redeemed_at, Number(transaction.amount_paid ?? transaction.total_payable)));
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

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Customer > History. Everything that happened on the customer's pawn
 * tickets, newest first, in one table. Read only; a row opens its item.
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

    const { pageRows, pager } = usePagedRows(visible, HISTORY_PAGE_SIZE);

    return (
        <section className="portal-content ch-page">
            <div className="portal-intro">
                <div>
                    <small>YOUR RECORDS</small>
                    <h2>View History</h2>
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

            <div className="items-table-wrap ch-table-wrap">
                <table className="items-table ch-table">
                    <thead>
                        <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Activity</th>
                            <th scope="col">Item</th>
                            <th scope="col">Ticket</th>
                            <th scope="col" className="is-num">Amount</th>
                            <th scope="col">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loaded && pageRows.map(event => (
                            <tr key={event.id} className={event.kind} onClick={() => onOpenItem(event.itemId)}>
                                <td>
                                    <strong className="ch-date">{dateLabel(event.date)}</strong>
                                    <small className="ch-time">{timeLabel(event.date)}</small>
                                </td>
                                <td>
                                    <span className={`ch-kind ${event.kind}`}>
                                        <IonIcon icon={KIND_META[event.kind].icon} aria-hidden="true" />
                                        {KIND_META[event.kind].label}
                                    </span>
                                </td>
                                <td data-label="Item"><strong className="ch-item">{event.itemName}</strong></td>
                                <td className="ch-ticket" data-label="Ticket">#{event.ticket}</td>
                                <td className="is-num ch-amount" data-label="Amount">{event.amount !== null ? moneyExact(event.amount) : '—'}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="item-view-btn"
                                        onClick={clickEvent => { clickEvent.stopPropagation(); onOpenItem(event.itemId); }}
                                        aria-label={`View ${event.itemName}`}
                                    >
                                        <IonIcon icon={eyeOutline} aria-hidden="true" />View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loaded && <SkeletonList rows={5} />}
                {loaded && visible.length === 0 && (
                    <p className="notice-empty">{events.length === 0 ? 'No pawn activity on your account yet.' : 'Nothing matches your search.'}</p>
                )}
            </div>

            {loaded && <Pager pager={pager} label="events" />}
        </section>
    );
};

export default CustomerHistory;
