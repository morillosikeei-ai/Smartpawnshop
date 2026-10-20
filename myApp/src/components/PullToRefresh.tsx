import React from 'react';
import { IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { clearApiCache } from '../services/api';

/** Shortest time the spinner shows, so a fast reload still reads as a refresh. */
const MIN_SPIN_MS = 600;

/**
 * Pull down at the top of a portal to reload it.
 *
 * Goes first inside the page's IonContent. `onRefresh` starts the reload; the
 * spinner closes once it settles, and a failed reload still closes it, since
 * each view already shows its own load errors.
 */
const PullToRefresh: React.FC<{ onRefresh: () => Promise<unknown> | void }> = ({ onRefresh }) => {
    const handle = async (event: CustomEvent<RefresherEventDetail>) => {
        // Pulling asks for fresh data, not the copy kept for quick screen changes.
        clearApiCache();
        try {
            await Promise.all([
                Promise.resolve(onRefresh()),
                new Promise(resolve => setTimeout(resolve, MIN_SPIN_MS)),
            ]);
        } catch {
            // The view reports its own errors.
        } finally {
            event.detail.complete();
        }
    };

    return (
        <IonRefresher slot="fixed" onIonRefresh={handle}>
            <IonRefresherContent />
        </IonRefresher>
    );
};

export default PullToRefresh;
