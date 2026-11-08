import React, { useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { closeOutline, star, starHalf, starOutline } from 'ionicons/icons';
import { getPublicRatings, type ApiPublicRatings } from '../services/api';
import './RatingToast.css';

/** When the badge first shows, how long it stays, and how often it comes back, in ms. */
const FIRST_SHOW_MS = 3000;
const VISIBLE_MS = 6000;
const CYCLE_MS = 20000;
/** Matches the 0.4s fade in RatingToast.css, so the badge unmounts after it. */
const FADE_MS = 400;

type Phase = 'hidden' | 'shown' | 'leaving';

/**
 * A small floating badge with the shop's rating, on the landing page.
 *
 * It reads the shop's rating from /api/ratings (initials only, never a name).
 * Hidden while there are no ratings. It shows 3 seconds after load for 6 seconds,
 * then again every 20 seconds. While it is hidden, a small star button stays
 * in its place: it opens the badge, and × folds it back into the button.
 * Once the visitor has opened or closed it themselves, the automatic showings
 * stop, so it never pops up again against their choice.
 *
 * The fade and slide only run while the motion toggle is on and the visitor
 * has not asked for reduced motion (see RatingToast.css); otherwise it simply
 * appears and disappears on the same schedule.
 */
const RatingToast: React.FC = () => {
    const [ratings, setRatings] = useState<ApiPublicRatings | null>(null);
    const [phase, setPhase] = useState<Phase>('hidden');
    // True once the visitor has opened or closed the badge themselves.
    const [manual, setManual] = useState(false);
    const closeTimer = useRef<number | undefined>(undefined);
    const toggleRef = useRef<HTMLButtonElement>(null);
    // The schedule counts from page load, not from when the ratings arrive.
    const loadedAt = useRef(Date.now());

    useEffect(() => {
        getPublicRatings().then(setRatings).catch(() => setRatings(null));
    }, []);

    const hasRatings = Boolean(ratings && ratings.total > 0 && ratings.average_rating !== null);

    useEffect(() => {
        if (!hasRatings || manual) return undefined;

        const timeouts: number[] = [];
        let repeat: number | undefined;

        const showOnce = () => {
            setPhase('shown');
            timeouts.push(window.setTimeout(() => setPhase('leaving'), VISIBLE_MS));
            timeouts.push(window.setTimeout(() => setPhase('hidden'), VISIBLE_MS + FADE_MS));
        };

        // First showing 3 seconds after load; the 20 second cycle counts from it.
        const wait = Math.max(0, FIRST_SHOW_MS - (Date.now() - loadedAt.current));
        timeouts.push(window.setTimeout(() => {
            showOnce();
            repeat = window.setInterval(showOnce, CYCLE_MS);
        }, wait));

        return () => {
            timeouts.forEach(timeout => window.clearTimeout(timeout));
            window.clearInterval(repeat);
        };
    }, [hasRatings, manual]);

    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    if (!hasRatings || !ratings) return null;

    const average = ratings.average_rating as number;

    const open = () => {
        setManual(true);
        window.clearTimeout(closeTimer.current);
        setPhase('shown');
    };

    const close = () => {
        setManual(true);
        setPhase('leaving');
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => {
            setPhase('hidden');
            // Keyboard users land back on the button that reopens it.
            window.setTimeout(() => toggleRef.current?.focus(), 0);
        }, FADE_MS);
    };

    if (phase === 'hidden') {
        return (
            <button
                ref={toggleRef}
                type="button"
                className="rating-toast-toggle"
                onClick={open}
                aria-label={`Show customer rating, ${average.toFixed(1)} out of 5`}
                title="Customer rating"
            >
                <IonIcon icon={star} aria-hidden="true" />
                <span>{average.toFixed(1)}</span>
            </button>
        );
    }

    return (
        <aside className={`rating-toast${phase === 'leaving' ? ' is-leaving' : ''}`} aria-label="Customer rating">
            <strong className="rating-toast-score">{average.toFixed(1)}</strong>
            <div className="rating-toast-copy">
                <span className="rating-toast-stars" role="img" aria-label={`${average.toFixed(1)} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map(position => (
                        <IonIcon
                            key={position}
                            aria-hidden="true"
                            icon={average >= position ? star : average >= position - 0.5 ? starHalf : starOutline}
                        />
                    ))}
                </span>
                <small>From {ratings.total} {ratings.total === 1 ? 'customer' : 'customers'} who redeemed with us</small>
            </div>
            <button type="button" className="rating-toast-close" onClick={close} aria-label="Close rating">
                <IonIcon icon={closeOutline} />
            </button>
        </aside>
    );
};

export default RatingToast;
