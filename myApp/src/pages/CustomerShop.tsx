import React, { useCallback, useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { bookmarkOutline, closeCircleOutline, timeOutline } from 'ionicons/icons';
import { money } from '../data/pawnshopStore';
import {
    cancelReservation,
    getForSaleItems,
    getReservations,
    holdEnds,
    isHolding,
    MAX_RESERVATIONS,
    reserveItem,
    type ApiReservation,
    type SaleItem,
} from '../services/api';
import { SkeletonList } from '../components/Skeleton';
import { useModal } from '../components/ModalProvider';
import './CustomerShop.css';

const categoryLabel = (category: string) =>
    category.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const RESERVATION_STATUS: Record<ApiReservation['status'], string> = {
    active: 'Reserved',
    claimed: 'Bought',
    cancelled: 'Cancelled',
    expired: 'Expired',
};

/**
 * Customer > Items for Sale: the shop's listed items with a Reserve button,
 * and the customer's own holds above them.
 *
 * A hold keeps an item for the customer until closing time on the shop's
 * second open day. The customer pays and picks it up at the shop; nothing is
 * paid here.
 */
const CustomerShop: React.FC<{ onFlash: (message: string) => void }> = ({ onFlash }) => {
    const modal = useModal();
    const [items, setItems] = useState<SaleItem[]>([]);
    const [reservations, setReservations] = useState<ApiReservation[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const [forSale, mine] = await Promise.all([getForSaleItems(), getReservations()]);
            setItems(forSale);
            setReservations(mine);
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to load items for sale.');
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const holding = reservations.filter(isHolding);
    const mineByItem = new Map(holding.map(reservation => [reservation.item_id, reservation]));
    const atLimit = holding.length >= MAX_RESERVATIONS;

    const reserve = async (item: SaleItem) => {
        const confirmed = await modal.confirm({
            title: 'Reserve this item?',
            message: `We will hold ${item.description} (${money(Number(item.sale_price))}) for you for 2 shop days. Pay and pick it up at the shop before the hold ends.`,
            confirmLabel: 'Reserve',
        });
        if (!confirmed) return;

        setBusyId(item.items_id);
        try {
            const reservation = await reserveItem(item.items_id);
            onFlash(`${item.description} is reserved for you until ${holdEnds(reservation.expires_at)}.`);
            await load();
        } catch (cause) {
            await modal.error({ message: cause instanceof Error ? cause.message : 'Unable to reserve this item.' });
            await load();
        } finally {
            setBusyId(null);
        }
    };

    const cancel = async (reservation: ApiReservation) => {
        const name = reservation.item?.description || 'this item';
        const confirmed = await modal.confirm({
            title: 'Cancel reservation?',
            message: `${name} will go back on sale and someone else may reserve it.`,
            confirmLabel: 'Cancel reservation',
            tone: 'danger',
        });
        if (!confirmed) return;

        setBusyId(reservation.item_id);
        try {
            await cancelReservation(reservation.item_reservations_id);
            onFlash(`Your reservation for ${name} is cancelled.`);
            await load();
        } catch (cause) {
            await modal.error({ message: cause instanceof Error ? cause.message : 'Unable to cancel this reservation.' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="portal-content cs-page">
            <div className="portal-intro">
                <div>
                    <small>SHOP</small>
                    <h2>Items for Sale</h2>
                    <p>Reserve an item and we hold it for you for 2 shop days. You can hold up to {MAX_RESERVATIONS} items at a time.</p>
                </div>
            </div>

            {error && <p className="portal-load-error">{error}</p>}

            {reservations.length > 0 && (
                <div className="cs-block">
                    <h3>My reservations</h3>
                    <ul className="cs-reservations">
                        {reservations.map(reservation => {
                            const live = isHolding(reservation);
                            const status = reservation.status === 'active' && !live ? 'expired' : reservation.status;
                            return (
                                <li key={reservation.item_reservations_id} className={`cs-reservation ${status}`}>
                                    <span className="cs-reservation-icon" aria-hidden="true"><IonIcon icon={live ? timeOutline : bookmarkOutline} /></span>
                                    <span className="cs-reservation-text">
                                        <strong>{reservation.item?.description || 'Item'}</strong>
                                        <small>
                                            {live ? `Held until ${holdEnds(reservation.expires_at)}` : RESERVATION_STATUS[status]}
                                            {reservation.item?.sale_price != null && ` · ${money(Number(reservation.item.sale_price))}`}
                                        </small>
                                    </span>
                                    {live && (
                                        <button type="button" className="cs-cancel" onClick={() => cancel(reservation)} disabled={busyId !== null}>
                                            <IonIcon icon={closeCircleOutline} aria-hidden="true" />Cancel
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {!loaded && <SkeletonList rows={4} />}
            {loaded && !error && items.length === 0 && <p className="notice-empty">No items are listed for sale right now.</p>}

            <div className="cs-grid">
                {items.map(item => {
                    const mine = mineByItem.get(item.items_id);
                    const takenByOther = !mine && Boolean(item.reserved_until && new Date(item.reserved_until).getTime() > Date.now());
                    return (
                        <article key={item.items_id} className={`cs-card${mine ? ' is-mine' : ''}${takenByOther ? ' is-taken' : ''}`}>
                            <div className="cs-photo">
                                {item.photo_urls?.[0]
                                    ? <img src={item.photo_urls[0]} alt={item.description} loading="lazy" />
                                    : <span aria-hidden="true"><IonIcon icon={bookmarkOutline} /></span>}
                                <em>{mine ? 'Reserved for you' : takenByOther ? 'Reserved' : categoryLabel(item.category)}</em>
                            </div>
                            <div className="cs-body">
                                <h4>{item.description}</h4>
                                <strong className="cs-price">{money(Number(item.sale_price))}</strong>
                                {mine && <small className="cs-note">Held until {holdEnds(mine.expires_at)}</small>}
                                {takenByOther && <small className="cs-note">Reserved by another customer until {holdEnds(item.reserved_until!)}</small>}
                                {!mine && !takenByOther && (
                                    <button
                                        type="button"
                                        className="cs-reserve"
                                        onClick={() => reserve(item)}
                                        disabled={busyId !== null || atLimit}
                                        title={atLimit ? `You already hold ${MAX_RESERVATIONS} items. Cancel one to reserve another.` : undefined}
                                    >
                                        {busyId === item.items_id ? 'Reserving...' : 'Reserve'}
                                    </button>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
            {loaded && atLimit && items.length > 0 && <p className="cs-limit">You hold {MAX_RESERVATIONS} items, the most at a time. Cancel one to reserve another.</p>}
        </section>
    );
};

export default CustomerShop;
