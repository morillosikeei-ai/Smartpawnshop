import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonPage } from '@ionic/react';
import { alertCircleOutline, cashOutline, checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline, chevronUpOutline, closeOutline, eyeOutline, homeOutline, logOutOutline, menuOutline, notificationsOutline, personCircleOutline, receiptOutline, timeOutline, walletOutline } from 'ionicons/icons';
import { cloudUploadOutline, pricetagOutline, keyOutline, refreshOutline, removeOutline, trashOutline, trendingDownOutline, trendingUpOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { daysUntil, dueStatus, FORFEITED_LABEL, longDate, money, moneyExact, purityLabel, statusClass, statusLabel, timeAgo } from '../data/pawnshopStore';
import {
    generatePickupCode,
    getDashboard,
    getItems,
    getMe,
    getOnlineRenewalInfo,
    getPickupCode,
    requestRedemption,
    sendCustomerRequest,
    submitOnlineRenewal,
    type CustomerRequestType,
    updateMe,
    updateMyPassword,
    NOTIFICATION_TITLES,
    type ApiDashboard,
    type ApiItemDetail,
    type ApiMe,
    type ApiNotification,
    type ApiOnlineRenewalInfo,
    type ApiPickupCode,
    type ApiRenewalRequest,
    type ApiTransaction,
} from '../services/api';
import { ITEM_PHOTO_SCALE, readImageAsScaledDataUrl } from '../services/photoQuality';
import { useNotifications } from '../components/useNotifications';
import ThemeToggle from '../components/ThemeToggle';
import FaqChatbot from '../components/FaqChatbot';
import TrendSuggestionCard from '../components/TrendSuggestionCard';
import ValueSparkline, { ValuePoint } from '../components/ValueSparkline';
import LoanTermBar, { loanTermProgress } from '../components/LoanTermBar';
import LoanOverviewChart, { type LoanRecord } from '../components/LoanOverviewChart';
import GoldPriceChart, { type GoldPricePoint } from '../components/GoldPriceChart';
import { SkeletonList, Spinner } from '../components/Skeleton';
import Pager, { usePagedRows } from '../components/Pager';
import { useModal } from '../components/ModalProvider';
import { ItemThumbViewer, PhotoLightbox, PhotoStrip } from '../components/ItemPhotos';
import CustomerHistory from './CustomerHistory';
import CustomerShop from './CustomerShop';
import './CustomerPortal.css';
import '../theme/portal-ui.css';

type Status = 'Active' | 'Overdue' | 'Redeemed' | typeof FORFEITED_LABEL | 'For Sale' | 'Sold';
type View = 'dashboard' | 'items' | 'payments' | 'shop' | 'history' | 'profile';

/** One pawned item, flattened from the API for the customer screens. */
type Item = {
    id: string;
    ticketNumber: string;
    name: string;
    group: string;
    category: string;
    specs: string;
    description: string;
    value: string;
    valueAmount: number;
    loan: string;
    loanAmount: number;
    interest: string;
    /** interest_rate as stored: a fraction per month. Used by the Loan Overview graph. */
    monthlyRate: number;
    totalPayable: number;
    interestDue: number;
    pawned: string;
    /** Raw start date of the loan, kept so the term progress can be measured. */
    pawnedIso: string;
    due: string;
    dueIso: string;
    /** When the loan was redeemed, if it was. Shown on the transaction timeline. */
    redeemedIso: string;
    /** The item photo staff recorded at intake, if any. */
    photoUrl: string | null;
    /** Every photo staff recorded at intake, first one first. */
    photos: string[];
    status: Status;
    /** Daily recorded value (gold plus any gemstone), from item_value_logs. */
    valueHistory: ValuePoint[];
    /** The open loan on this item, when there is one. */
    transactionId: number | null;
    /** Whether the customer has already asked to redeem this item. */
    readyToRedeem: boolean;
    /**
     * Whether this item's value follows the gold price. Only jewelry does, so
     * only jewelry carries the redemption timing suggestion.
     */
    goldLinked: boolean;
};

/** An enum value as the pawnshop stores it, rendered for a person to read. */
const readable = (value?: string | null) =>
    (value || '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/** The catch-all item type, recorded with the exact type in custom_item_type. */
const OTHER_ITEM_TYPE = 'others';

/**
 * The item type of a saved item. An item recorded under "Others" is shown as
 * the exact type the staff typed in, never as the word "Others". A stored key
 * such as "brooch_pin" is made readable; a custom type the staff typed in is
 * already readable, so it is shown as typed.
 */
const itemTypeLabel = (item: { category?: string | null; custom_item_type?: string | null }) =>
    item.category === OTHER_ITEM_TYPE && item.custom_item_type?.trim()
        ? item.custom_item_type.trim()
        : /^[a-z0-9_]+$/.test(item.category || '') ? readable(item.category) : (item.category || '').trim();

/**
 * What identifies the item at a glance: karat and weight for jewelry, brand or
 * model for a watch, cellphone, or bulky item.
 */
const specsFor = (item: ApiItemDetail) =>
    item.group === 'jewelry'
        ? [purityLabel(item), item.weight_grams ? `${item.weight_grams} g` : null, item.has_gemstone ? 'with gemstone' : null].filter(Boolean).join(' · ')
        : item.brand_model || itemTypeLabel(item);

/** The loan that matters for this item: the open one, else the most recent. */
const currentLoan = (item: ApiItemDetail): ApiTransaction | null => {
    const loans = item.transactions || [];
    return loans.find((loan) => loan.status === 'active') || loans[loans.length - 1] || null;
};

const toItem = (item: ApiItemDetail): Item => {
    const loan = currentLoan(item);
    // total_value adds a gemstone's value to the gold value for jewelry with a stone.
    const valueAmount = Number(item.adjusted_value ?? item.total_value ?? item.appraised_value ?? 0);

    return {
        id: String(item.items_id),
        ticketNumber: loan?.ticket_number || '-',
        name: item.description,
        group: readable(item.group),
        category: itemTypeLabel(item),
        specs: specsFor(item),
        description: item.description,
        value: money(valueAmount),
        valueAmount,
        loan: loan ? money(Number(loan.loan_amount)) : '-',
        loanAmount: loan ? Number(loan.loan_amount) : 0,
        interest: loan ? `${(Number(loan.interest_rate) * 100).toFixed(2)}% monthly` : '-',
        monthlyRate: loan ? Number(loan.interest_rate) || 0 : 0,
        totalPayable: loan ? Number(loan.total_payable) : 0,
        interestDue: loan ? Number(loan.interest_due) : 0,
        pawned: longDate(loan?.created_at),
        pawnedIso: loan?.created_at || '',
        due: longDate(loan?.due_date),
        dueIso: loan?.due_date || '',
        redeemedIso: loan?.redeemed_at || '',
        photoUrl: item.photo_urls?.[0] || null,
        photos: item.photo_urls || [],
        status: statusLabel(item.status) as Status,
        transactionId: loan && loan.status === 'active' ? loan.transactions_id : null,
        readyToRedeem: Boolean(loan?.ready_to_redeem_at),
        // Read from the stored group rather than the display label, so the
        // check does not follow how the group happens to be formatted.
        goldLinked: item.group === 'jewelry',
        // Only jewelry is revalued daily against the gold price, so only
        // jewelry has a value history to chart.
        valueHistory: (item.value_logs || [])
            .map((log) => ({ date: log.log_date, value: Number(log.computed_value) }))
            .filter((point) => Number.isFinite(point.value)),
    };
};

/** How long a flash stays on screen before it clears itself, in ms. */
const TOAST_VISIBLE_MS = 6000;

/** How long the portal's own reply to an action stays up, in ms. */
const FLASH_VISIBLE_MS = 7000;

/**
 * Ids already flashed, kept in the browser so a reload does not replay a
 * notification the customer has already been shown once.
 */
const SEEN_NOTICES_KEY = 'smartpawn_seen_notices';

/** Notification types the flash shows with the warning icon rather than the clock. */
const ALERT_NOTIFICATIONS: ApiNotification['type'][] = ['risk_notice', 'forfeited'];

/** Most ids kept. The API builds notifications from live loans, so the list
 *  stays small; the cap only stops the entry growing without bound. */
const SEEN_NOTICES_LIMIT = 60;

const readSeenNotices = (): string[] => {
    try {
        const stored = JSON.parse(localStorage.getItem(SEEN_NOTICES_KEY) || '[]');
        return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        // A private window, cleared site data, or storage the browser blocks.
        // Losing the record only means one flash is shown again.
        return [];
    }
};

const writeSeenNotices = (ids: string[]) => {
    try {
        localStorage.setItem(SEEN_NOTICES_KEY, JSON.stringify(ids.slice(-SEEN_NOTICES_LIMIT)));
    } catch {
        // Same as above: the flash still works, it just repeats after a reload.
    }
};

const CustomerPortal: React.FC = () => {
    const navigate = useNavigate();
    const modal = useModal();
    const [view, setView] = useState<View>('dashboard');
    const [filter, setFilter] = useState<'All' | Status>('All');
    const [selected, setSelected] = useState<Item | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    // Stored rows, polled so the badge stays current without a page reload.
    const { notifications: notices, unreadCount, loaded: noticesLoaded, markRead, markAllRead } = useNotifications();

    const [items, setItems] = useState<Item[]>([]);
    // The items as the API sent them, with every ticket, for the History page.
    const [apiItems, setApiItems] = useState<ApiItemDetail[]>([]);
    const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
    const [me, setMe] = useState<ApiMe | null>(null);
    const [apiError, setApiError] = useState('');
    const [loaded, setLoaded] = useState(false);

    // The notification currently flashing beside the bell, and the ids that
    // have already had their turn. The set is a ref because flashing one must
    // not depend on a re-render having happened first.
    const [toast, setToast] = useState<ApiNotification | null>(null);
    /*
      The flash bar: what the portal says back after the customer does
      something. It is separate from the notification toast above, which
      reports what the shop did. One line, dismissed by hand or on its own.
    */
    const [flash, setFlash] = useState<string>('');
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seenNoticeIds = useRef<Set<string>>(new Set(readSeenNotices()));
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Read the account again.
     *
     * Staff change these records from their own portal: confirming a renewal
     * moves a due date the customer may be looking at. The item open in the
     * modal is looked up again from the new list, so an open screen shows the
     * new date rather than the one it was opened with.
     */
    const loadAccount = useCallback(() => {
        let active = true;

        Promise.all([getItems(), getDashboard('customer'), getMe()])
            .then(([apiItems, apiDashboard, apiMe]) => {
                if (!active) return;
                const mapped = apiItems.map(toItem);
                setItems(mapped);
                setApiItems(apiItems);
                setDashboard(apiDashboard);
                setMe(apiMe);
                setSelected((current) => (current ? mapped.find((row) => row.id === current.id) || current : current));
            })
            .catch((error) => {
                if (active) setApiError(error instanceof Error ? error.message : 'Unable to load your account data.');
            })
            .finally(() => { if (active) setLoaded(true); });

        return () => { active = false; };
    }, []);

    useEffect(() => loadAccount(), [loadAccount]);

    /*
      A renewal is decided in the staff portal, so the customer's copy of the
      pawn goes stale the moment it is confirmed. The notification poll is the
      only signal that reaches this screen, so the newest renewal message is
      what triggers the re-read. The id is remembered so one message causes one
      re-read, not one per poll.
    */
    const renewalNoticeId = notices.find((notice) => notice.type === 'renewal_confirmed' || notice.type === 'renewal_rejected')?.notifications_id ?? null;
    const readRenewalNoticeId = useRef<number | null>(null);

    useEffect(() => {
        if (renewalNoticeId === null) return;
        // The first poll after a reload reports the newest message again; only
        // a message this screen has not already reacted to is worth a re-read.
        if (readRenewalNoticeId.current === null) {
            readRenewalNoticeId.current = renewalNoticeId;
            return;
        }
        if (readRenewalNoticeId.current === renewalNoticeId) return;

        readRenewalNoticeId.current = renewalNoticeId;
        loadAccount();
    }, [renewalNoticeId, loadAccount]);

    // Flash the newest notification the customer has not been shown yet.
    // /notifications comes back newest first, so the first unseen row is the
    // one worth interrupting for. Everything else stays in the bell.
    useEffect(() => {
        const fresh = notices.find((notice) => !notice.is_read && !seenNoticeIds.current.has(String(notice.notifications_id)));
        if (!fresh) return;

        seenNoticeIds.current.add(String(fresh.notifications_id));
        writeSeenNotices([...seenNoticeIds.current]);
        setToast(fresh);

        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_VISIBLE_MS);
    }, [notices]);

    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    /** Say something back to the customer, in one line, above the page. */
    const showFlash = useCallback((message: string) => {
        setFlash(message);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(''), FLASH_VISIBLE_MS);
    }, []);

    useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

    /*
      An account that was never activated has no password: the shop made it and
      the customer reached the portal by scanning their pawn ticket. They are
      asked once, when they arrive, rather than on every screen. Setting the
      password activates the account, so the question stops being asked.
    */
    const passwordPromptShown = useRef(false);

    useEffect(() => {
        if (!me || me.user.is_activated || passwordPromptShown.current) return;

        passwordPromptShown.current = true;
        modal.confirm({
            title: 'Set a password for your account',
            message: 'You signed in by scanning your pawn ticket. Set a password so you can sign in with your email address from any device.',
            confirmLabel: 'Set password now',
            cancelLabel: 'Later',
        }).then(confirmed => { if (confirmed) go('profile'); });
    }, [me]);

    const dismissToast = () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(null);
    };

    /** Clicking the flash hands the customer straight to the full list. */
    const openToastInBell = () => {
        dismissToast();
        setProfileOpen(false);
        setNotificationsOpen(true);
    };

    /**
     * Open what a notification points at.
     *
     * The type says which screen, and related_item_id says which record on it.
     * A row whose item is no longer in the customer's list still opens My Items,
     * so a click never dead ends.
     */
    const openNotification = (notice: ApiNotification) => {
        markRead(notice.notifications_id);
        setNotificationsOpen(false);
        dismissToast();

        const item = items.find((row) => row.id === String(notice.related_item_id));

        if (notice.type === 'reservation_expired' || notice.type === 'reservation_cancelled') {
            go('shop');
            return;
        }

        if (notice.type === 'redemption_complete') {
            setFilter('Redeemed');
            go('items');
            return;
        }

        if (notice.type === 'forfeited') {
            setFilter(FORFEITED_LABEL);
            go('items');
            return;
        }

        setFilter('All');
        go('items');
        // go() clears the open card, so the item is selected after it.
        if (item) setSelected(item);
    };

    /**
     * Tell staff the customer is ready to redeem an item.
     *
     * Only the request is recorded. The loan is unchanged until staff takes the
     * payment in the shop.
     */
    const askToRedeem = async (item: Item) => {
        if (!item.transactionId) return;

        const confirmed = await modal.confirm({
            title: 'Tell the shop you are ready?',
            message: <>Staff will be told that you are ready to pick up/pay for <strong>{item.name}</strong>. Your pawn is unchanged until you pay at the branch.</>,
            confirmLabel: 'Yes, notify staff',
        });
        if (!confirmed) return;

        await requestRedemption(item.transactionId);
        const requested = { ...item, readyToRedeem: true };
        setItems((current) => current.map((row) => (row.id === item.id ? requested : row)));
        setSelected(requested);
        showFlash(`Your request for ${item.name} is with our staff. They will confirm it shortly.`);
    };

    const active = items.filter((item) => item.status === 'Active' || item.status === 'Overdue');
    const visible = filter === 'All' ? items : items.filter((item) => item.status === filter);
    const displayName = me?.user.name || 'Customer';

    const logout = async () => {
        const confirmed = await modal.confirm({
            title: 'Sign out?',
            message: 'You will need to sign in again to see your items and payments.',
            confirmLabel: 'Sign out',
            tone: 'danger',
        });
        if (!confirmed) return;

        localStorage.removeItem('smartpawn_customer');
        localStorage.removeItem('smartpawn_api_token');
        navigate('/');
    };

    const menu: Array<{ id: View; label: string; icon: string }> = [
        { id: 'dashboard', label: 'Home', icon: homeOutline }, { id: 'items', label: 'My Items', icon: walletOutline },
        { id: 'payments', label: 'Payments', icon: cashOutline },
        { id: 'shop', label: 'Items for Sale', icon: pricetagOutline },
        { id: 'history', label: 'History', icon: receiptOutline },
    ];
    const go = (next: View) => { setView(next); setSelected(null); setMobileMenuOpen(false); };

    return <IonPage className="portal-page"><IonContent fullscreen><div className="portal-shell">
        <div className={`portal-mobile-backdrop ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div><aside className={`portal-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}><div className="portal-brand"><img src="/logo.png" alt="SmartPawn" /></div><div className="portal-user"><IonIcon icon={personCircleOutline} /><div><strong>{displayName}</strong><span>Customer</span></div></div><span className="portal-menu-label">CUSTOMER MENU</span><nav className="portal-nav">{menu.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><IonIcon icon={item.icon} /><span>{item.label}</span></button>)}</nav></aside>
        <main className="portal-main"><header className="portal-topbar"><div className="portal-title-group"><button className="portal-mobile-menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Hide navigation' : 'Show navigation'}><IonIcon icon={mobileMenuOpen ? closeOutline : menuOutline} /></button><div><small>CUSTOMER PORTAL</small></div></div><div className="portal-header-actions"><div className="portal-action-wrap"><ThemeToggle className="portal-notice-button" /></div><div className="portal-action-wrap"><button className="portal-notice-button" onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} aria-label="Notifications" aria-expanded={notificationsOpen}><IonIcon icon={notificationsOutline} />{unreadCount > 0 && <b>{unreadCount}</b>}</button>{notificationsOpen && <div className="portal-dropdown portal-notification-dropdown"><div className="portal-dropdown-head"><strong>Notifications</strong><button onClick={markAllRead}>Mark all read</button></div>{notices.map(notice => <button className={`portal-notification-item ${notice.is_read ? 'read' : 'unread'}`} key={notice.notifications_id} onClick={() => openNotification(notice)}><strong>{NOTIFICATION_TITLES[notice.type] || 'Notification'}</strong><small>{notice.message} · {timeAgo(notice.created_at)}</small></button>)}{!noticesLoaded && <SkeletonList rows={3} />}{noticesLoaded && notices.length === 0 && <p className="portal-notification-empty">Nothing needs your attention right now.</p>}</div>}{toast && !notificationsOpen && <div className="portal-toast" role="status" aria-live="polite"><button type="button" className="portal-toast-body" onClick={openToastInBell}><span className={`portal-toast-icon ${ALERT_NOTIFICATIONS.includes(toast.type) ? 'risk' : 'due'}`}><IonIcon icon={ALERT_NOTIFICATIONS.includes(toast.type) ? alertCircleOutline : timeOutline} aria-hidden="true" /></span><span className="portal-toast-copy"><strong>{NOTIFICATION_TITLES[toast.type] || 'Notification'}</strong><small>{toast.message}</small><em>{timeAgo(toast.created_at)}</em></span></button><button type="button" className="portal-toast-close" onClick={dismissToast} aria-label="Dismiss notification"><IonIcon icon={closeOutline} /></button></div>}</div><div className="portal-action-wrap"><button className="portal-profile-button" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} aria-expanded={profileOpen}><IonIcon icon={personCircleOutline} /><span>{displayName}</span><IonIcon className="profile-chevron" icon={profileOpen ? chevronUpOutline : chevronDownOutline} aria-hidden="true" /></button>{profileOpen && <div className="portal-dropdown portal-profile-dropdown"><button onClick={() => { setProfileOpen(false); go('profile'); }}><IonIcon icon={personCircleOutline} />Profile</button><button onClick={logout}><IonIcon icon={logOutOutline} />Logout</button></div>}</div></div></header>
            {flash && <div className="portal-flash" role="status" aria-live="polite">
                <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
                <p>{flash}</p>
                <button type="button" onClick={() => setFlash('')} aria-label="Dismiss message"><IonIcon icon={closeOutline} /></button>
            </div>}
            {apiError && <p className="portal-load-error">{apiError}</p>}
            {view === 'dashboard' && <Dashboard active={active} items={items} dashboard={dashboard} name={displayName} loaded={loaded} go={go} openItems={(next) => { setFilter(next); go('items'); }} />}
            {view === 'items' && <Items items={items} visible={visible} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} loaded={loaded} onAskToRedeem={askToRedeem} onFlash={showFlash} />}
            {view === 'payments' && <Payments active={active} go={go} loaded={loaded} onFlash={showFlash} />}
            {view === 'history' && <CustomerHistory items={apiItems} loaded={loaded} onOpenItem={(itemId) => {
                const item = items.find((row) => row.id === String(itemId));
                setFilter('All');
                go('items');
                // go() clears the open card, so the item is selected after it.
                if (item) setSelected(item);
            }} />}
            {view === 'shop' && <CustomerShop onFlash={showFlash} />}
            {view === 'profile' && <Profile me={me} logout={logout} onAccountChanged={loadAccount} onFlash={showFlash} />}
        </main>
        <FaqChatbot customerName={me?.user.name} onGoToItems={() => go('items')} />
    </div></IonContent></IonPage>;
};

/** Soonest due date among the customer's open loans. */
const nextDue = (active: Item[]) =>
    active.filter(item => item.dueIso).sort((first, second) => first.dueIso.localeCompare(second.dueIso))[0] || null;

const Dashboard: React.FC<{ active: Item[]; items: Item[]; dashboard: ApiDashboard | null; name: string; loaded: boolean; go: (view: View) => void; openItems: (filter: 'All' | Status) => void }> = ({ active, items, dashboard, name, loaded, go, openItems }) => {
    const upcoming = nextDue(active);
    const daysLeft = upcoming ? daysUntil(upcoming.dueIso) : null;
    const goldPrices = (dashboard?.gold_prices || []).map(price => Number(price.price_per_gram)).filter(value => Number.isFinite(value) && value > 0);
    const latestGold = goldPrices[0] || 0;
    const previousGold = goldPrices[1] || latestGold;
    const goldChange = previousGold > 0 ? ((latestGold - previousGold) / previousGold) * 100 : 0;
    // The API sends the latest 30 days newest first; the chart wants oldest first.
    const goldSeries: GoldPricePoint[] = (dashboard?.gold_prices || [])
        .map(price => ({ date: price.price_date, price: Number(price.price_per_gram) }))
        .filter(point => Number.isFinite(point.price) && point.price > 0)
        .sort((first, second) => first.date.localeCompare(second.date));
    // Every loan on record with a start date, for the amount-due graph.
    const loanRecords: LoanRecord[] = items
        .filter(item => item.pawnedIso && item.loanAmount > 0)
        .map(item => ({
            pawnedIso: item.pawnedIso,
            redeemedIso: item.redeemedIso || null,
            open: item.status === 'Active' || item.status === 'Overdue',
            principal: item.loanAmount,
            monthlyRate: item.monthlyRate,
        }));

    return <section className="portal-content dashboard-content">
        <div className="dashboard-welcome"><small>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase()}</small><h2>Welcome back, {name}!</h2><p>Here is the latest update on your pawned items.</p></div>
        <div className="portal-stats dashboard-stats">
            {/* Quick links: each card opens the page behind its figure. */}
            <Stat icon={walletOutline} value={loaded ? String(active.length) : '--'} label="Active items" onClick={() => openItems('Active')} />
            <Stat icon={timeOutline} value={daysLeft === null ? '--' : daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`} label="Upcoming due date" onClick={() => go('payments')} />
            <Stat icon={cashOutline} value={loaded ? money(dashboard?.stats.amount_due || 0) : '--'} label="Total amount due" onClick={() => go('payments')} />
        </div>
        {/* Only jewelry follows the gold price, so the redemption timing
            suggestion is shown only while an active jewelry item exists. */}
        {active.some(item => item.goldLinked) && <div className="dashboard-suggestion"><TrendSuggestionCard compact /></div>}
        <div className="dashboard-columns">
            <div className="dashboard-section">
                <div className="portal-heading"><div><small>PAWN RECORDS</small><h3>My Items</h3></div><button onClick={() => go('items')}>View all <IonIcon icon={chevronForwardOutline} /></button></div>
                <div className="dashboard-items">
                    {items.slice(0, 3).map(item => {
                        // A closed loan has no term left to run, so only open ones show the bar.
                        const loanOpen = item.status === 'Active' || item.status === 'Overdue';
                        return (
                            <button className="pawn-card" key={item.id} onClick={() => go('items')}>
                                <i className="pawn-card-mark" aria-hidden="true">{item.name[0]}</i>
                                <span className="pawn-card-body">
                                    <span className="pawn-card-head">
                                        <strong className="pawn-card-name">{item.name}</strong>
                                        <strong className="pawn-card-amount">{item.loan}</strong>
                                    </span>
                                    <span className="pawn-card-meta">
                                        <span className="pawn-card-ticket">{item.ticketNumber}</span>
                                        <span className="pawn-card-due">Due {item.due}</span>
                                    </span>
                                </span>
                                {loanOpen && <LoanTermBar className="pawn-card-term" pawnedIso={item.pawnedIso} dueIso={item.dueIso} />}
                                <IonIcon className="pawn-card-chevron" icon={chevronForwardOutline} aria-hidden="true" />
                            </button>
                        );
                    })}
                    {!loaded && <SkeletonList rows={3} />}
                    {loaded && items.length === 0 && <p className="notice-empty">You have no pawned items on record.</p>}
                </div>
                <button className="dashboard-view-all" onClick={() => go('items')}>View All Items <IonIcon icon={chevronForwardOutline} /></button>
            </div>
        </div>
        {/* Loan Overview beside a small Gold Price Trend. The trend card takes the
            place of the one-line gold ticker, so the price is not shown twice. */}
        <div className="dashboard-insights">
            <div className="dashboard-insight-card">
                <LoanOverviewChart loans={loanRecords} loading={!loaded} />
            </div>
            <div className="dashboard-insight-card gold-trend-card">
                <div className="gold-trend-head">
                    <div>
                        <small>GOLD PRICE TREND</small>
                        <h3>Today's gold price</h3>
                    </div>
                    {goldPrices.length > 1 && (
                        <span className={`gold-ticker-change ${goldChange > 0 ? 'is-up' : goldChange < 0 ? 'is-down' : 'is-flat'}`}>
                            <IonIcon icon={goldChange > 0 ? trendingUpOutline : goldChange < 0 ? trendingDownOutline : removeOutline} aria-hidden="true" />
                            {goldChange >= 0 ? '+' : ''}{goldChange.toFixed(1)}%
                        </span>
                    )}
                </div>
                <strong className="gold-trend-price">{latestGold > 0 ? <>{money(latestGold)} <i>/ gram</i></> : 'No price recorded'}</strong>
                <GoldPriceChart points={goldSeries} loading={!loaded} height={110} />
                <small className="gold-trend-note">Last {goldSeries.length || 0} recorded days · change vs previous day</small>
            </div>
        </div>
    </section>;
};

const Stat: React.FC<{ icon: string; value: string; label: string; onClick?: () => void }> = ({ icon, value, label, onClick }) => onClick
    ? <button type="button" className="portal-stat portal-stat-link" onClick={onClick} aria-label={`${label}: ${value}. Open`}><IonIcon icon={icon} /><strong>{value}</strong><span>{label}</span></button>
    : <div className="portal-stat"><IonIcon icon={icon} /><strong>{value}</strong><span>{label}</span></div>;
const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <div className="portal-panel"><h3>{title}</h3>{children}</div>;

const Items: React.FC<{ items: Item[]; visible: Item[]; filter: 'All' | Status; setFilter: (value: 'All' | Status) => void; selected: Item | null; setSelected: (item: Item | null) => void; loaded: boolean; onAskToRedeem: (item: Item) => Promise<void>; onFlash: (message: string) => void }> = ({ items, visible, filter, setFilter, selected, setSelected, loaded, onAskToRedeem, onFlash }) => {
    const { pageRows, pager } = usePagedRows(visible);

    return <section className="portal-content">
        <div className="portal-intro"><div><small>PAWN RECORDS</small><h2>My Items</h2><p>Review every item connected to your account.</p></div></div>
        <div className="item-tabs" role="tablist">{(['All', 'Active', 'Redeemed', FORFEITED_LABEL] as const).map(tab => <button key={tab} className={filter === tab ? 'active' : ''} onClick={() => setFilter(tab)} role="tab" aria-selected={filter === tab}>{tab} <span>{tab === 'All' ? items.length : items.filter(item => item.status === tab).length}</span></button>)}</div>
        <div className="items-table-wrap">
            <table className="items-table">
                <thead><tr><th>Item</th><th>Pawn amount</th><th>Date pawned</th><th>Due date</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{pageRows.map(item => <tr key={item.id} onClick={() => setSelected(item)}><td><div className="table-item"><ItemThumbViewer photos={item.photos} name={item.name} /><span><strong>{item.name}</strong><small>{item.description}</small></span></div></td><td>{item.loan}</td><td>{item.pawned}</td><td>{item.due}</td><td><em className={`pill ${statusClass(item.status)}`}>{item.status}</em></td><td><button type="button" className="item-view-btn" onClick={event => { event.stopPropagation(); setSelected(item); }} aria-label={`View details for ${item.name}`}><IonIcon icon={eyeOutline} />View</button></td></tr>)}</tbody>
            </table>
            {!loaded && <SkeletonList rows={4} />}
            {loaded && visible.length === 0 && <p className="notice-empty">No items match this filter.</p>}
        </div>
        <Pager pager={pager} label="items" />
        {selected && <ItemDetail item={selected} onClose={() => setSelected(null)} onAskToRedeem={onAskToRedeem} onFlash={onFlash} />}
    </section>;
};

/** The expanded card for one item, built entirely from that item's own record. */
const ItemDetail: React.FC<{ item: Item; onClose: () => void; onAskToRedeem: (item: Item) => Promise<void>; onFlash: (message: string) => void }> = ({ item, onClose, onAskToRedeem, onFlash }) => {
    const [requesting, setRequesting] = useState(false);
    const [requestError, setRequestError] = useState('');

    const askToRedeem = async () => {
        setRequesting(true);
        setRequestError('');
        try {
            await onAskToRedeem(item);
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : 'The request could not be sent.');
        } finally {
            setRequesting(false);
        }
    };

    // Equity is what the item is worth above the loan; loan-to-value is the
    // loan as a share of that worth. Both read from figures already on record.
    const equity = item.valueAmount - item.loanAmount;
    const ltv = item.valueAmount > 0 ? (item.loanAmount / item.valueAmount) * 100 : 0;
    const loanOpen = item.status === 'Active' || item.status === 'Overdue';
    const statusDate = loanOpen
        ? `As of ${longDate(new Date().toISOString())}`
        : item.status === 'Redeemed' && item.redeemedIso ? longDate(item.redeemedIso) : 'Pawn closed';
    const titleId = `item-modal-title-${item.id}`;
    // A missing or broken photo falls back to the item's initial.
    const [photoFailed, setPhotoFailed] = useState(false);
    // Which photo is open full size, or null when none is.
    const [photoIndex, setPhotoIndex] = useState<number | null>(null);

    /*
      The portal shell blurs its backdrop, which turns it into the containing
      block for fixed elements, so the modal is mounted on the page element
      instead. It stays inside .portal-page and keeps the portal's styles.
    */
    const anchorRef = useRef<HTMLSpanElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setHost(anchorRef.current?.closest<HTMLElement>('.portal-page') ?? document.body);
    }, []);

    // The parent passes a fresh onClose each render; a ref keeps the listener
    // and the initial focus from being reset on every re-render.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!host) return;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [host]);

    const modal = <div className="item-modal-backdrop" onClick={onClose}>
        <div className="item-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
            <header className="item-modal-head">
                <div className="item-modal-identity">
                    <span className="item-modal-thumb" aria-hidden="true">
                        {item.photoUrl && !photoFailed
                            ? <img src={item.photoUrl} alt="" onError={() => setPhotoFailed(true)} />
                            : <i>{item.name[0]}</i>}
                    </span>
                    <div>
                        <small>TICKET {item.ticketNumber}</small>
                        <h3 id={titleId}>{item.name}</h3>
                        <em className={`pill ${statusClass(item.status)}`}>{item.status}</em>
                    </div>
                </div>
                <button ref={closeRef} type="button" className="item-modal-close" onClick={onClose} aria-label="Close item details"><IonIcon icon={closeOutline} /></button>
            </header>
            <div className="item-modal-body">
                {item.photos.length > 0 && <section className="item-modal-section item-modal-photos">
                    <h4>{item.photos.length > 1 ? `Item Photos (${item.photos.length})` : 'Item Photo'}</h4>
                    <PhotoStrip photos={item.photos} name={item.name} onOpen={setPhotoIndex} />
                </section>}
                <section className="item-modal-section">
                    <h4>Pawn Summary</h4>
                    {/* The three headline figures. Dates moved to the timeline below. */}
                    <div className="detail-grid loan-summary-grid">
                        <div><span>Appraised value</span><strong>{item.value}</strong></div>
                        <div className="is-loan"><span>Pawn amount</span><strong>{item.loan}</strong></div>
                        <div><span>Interest (Renta)</span><strong>{item.interest}</strong></div>
                    </div>
                </section>
                {/* Pay now or buy more time: the two things the customer can
                    do about this pawn, side by side. Renewal is offered on an
                    Active loan only, because an overdue or closed pawn is
                    settled at the counter. */}
                {item.transactionId && <div className="item-modal-actions">
                    <div className="redeem-request">
                        {item.readyToRedeem
                            ? <p className="redeem-request-sent">Your redemption request is with our staff. They will confirm it shortly.</p>
                            : <button className="redeem-request-button" onClick={askToRedeem} disabled={requesting} aria-busy={requesting}>{requesting && <Spinner />}{requesting ? 'Sending' : "I'm ready to pick up/pay"}</button>}
                        {requestError && <p className="redeem-request-error">{requestError}</p>}
                    </div>
                    {/* Keyed on the due date: once a renewal is confirmed the
                        date moves, and the panel starts again on the new renta
                        rather than on the figure it was opened with. */}
                    {item.status === 'Active' && <PickupCodePanel transactionId={item.transactionId} onFlash={onFlash} />}
                    {item.status === 'Active' && <RenewOnlinePanel key={item.dueIso} transactionId={item.transactionId} itemName={item.name} onFlash={onFlash} />}
                </div>}
                <section className="item-modal-section">
                    <h4>Pawn Transaction Timeline</h4>
                    <ol className="item-timeline">
                        <li className="is-done">
                            <span className="item-timeline-dot" aria-hidden="true" />
                            <span className="item-timeline-label">Pawned</span>
                            <strong>{item.pawned}</strong>
                        </li>
                        <li className={item.status === 'Overdue' ? 'is-alert' : loanOpen ? 'is-next' : 'is-done'}>
                            <span className="item-timeline-dot" aria-hidden="true" />
                            <span className="item-timeline-label">Due date</span>
                            <strong>{item.due}</strong>
                            {loanOpen && <LoanTermBar className="item-timeline-term" pawnedIso={item.pawnedIso} dueIso={item.dueIso} />}
                        </li>
                        <li className={item.status === 'Overdue' || item.status === FORFEITED_LABEL ? 'is-alert' : 'is-current'}>
                            <span className="item-timeline-dot" aria-hidden="true" />
                            <span className="item-timeline-label">Current status</span>
                            <strong>{item.status}</strong>
                            <small>{statusDate}</small>
                        </li>
                    </ol>
                </section>
                <section className="item-modal-section">
                    <h4>Item Information</h4>
                    <div className="item-spec-grid">
                        <div><span>Group</span><strong>{item.group}</strong></div>
                        <div><span>Type</span><strong>{item.category}</strong></div>
                        <div><span>Details</span><strong>{item.specs || '-'}</strong></div>
                        <div className="detail-wide"><span>Description</span><strong>{item.description || '-'}</strong></div>
                    </div>
                </section>
                {/* Up to 30 days of recorded value, right above the value vs loan bar.
                    A single recorded day shows only that value. */}
                {item.valueHistory.length > 0 && <ValueSparkline points={item.valueHistory} formatValue={money} />}
                {item.loanAmount > 0 && <section className="item-modal-section">
                    <h4>Current Value vs Pawn Amount</h4>
                    <div className="equity-metrics">
                        <div><span>Current value</span><strong>{item.value}</strong></div>
                        <div className="is-loan"><span>Pawn amount</span><strong>{item.loan}</strong></div>
                        <div className={equity < 0 ? 'is-negative' : 'is-equity'}><span>Equity</span><strong>{equity < 0 ? '−' : ''}{money(Math.abs(equity))}</strong></div>
                        <div><span>Pawn-to-value</span><strong>{Math.round(ltv)}%</strong></div>
                    </div>
                    {/* The whole track is the current value; the gold fill is the loan,
                        the rest is equity. A loan above the value fills it in red. */}
                    <div
                        className={`equity-bar ${ltv > 100 ? 'is-over' : ''}`}
                        role="img"
                        aria-label={`Pawn amount is ${Math.round(ltv)}% of the current value. Equity ${equity < 0 ? 'minus ' : ''}${money(Math.abs(equity))}.`}
                    >
                        <i style={{ width: `${Math.min(100, ltv)}%` }} />
                    </div>
                    <div className="equity-legend" aria-hidden="true">
                        <span><b className="is-loan" />Pawn {Math.round(ltv)}%</span>
                        <span><b className="is-equity" />Equity {Math.max(0, 100 - Math.round(ltv))}%</span>
                    </div>
                </section>}
                {/*
                  Watches, cellphones, and bulky items are not valued against the gold
                  price, and a closed loan has nothing left to time, so the suggestion
                  is shown only on an active jewelry item.
                */}
                {item.goldLinked && item.status === 'Active' && <TrendSuggestionCard />}
            </div>
        </div>
    </div>;

    return <>
        <span ref={anchorRef} hidden />
        {host && createPortal(modal, host)}
        {photoIndex !== null && <PhotoLightbox photos={item.photos} startIndex={photoIndex} name={item.name} onClose={() => setPhotoIndex(null)} />}
    </>;
};

/**
 * A dialog opened from inside the item modal.
 *
 * Both actions on an item used to grow the modal they were opened from, which
 * pushed the record the customer was reading off the screen. Each one now
 * stands on its own above it, and closing it leaves the item exactly where it
 * was.
 *
 * It mounts on the portal page for the same reason the item modal does: the
 * shell blurs its backdrop, which makes it the containing block for anything
 * fixed inside it.
 */
const ActionDialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setHost(anchorRef.current?.closest<HTMLElement>('.portal-page') ?? document.body);
    }, []);

    // The parent passes a fresh onClose each render; a ref keeps the listener
    // and the initial focus from being reset on every re-render.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!host) return;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // The item modal listens for Escape too, and only the dialog on
            // top should answer it.
            event.stopPropagation();
            onCloseRef.current();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [host]);

    const dialog = <div className="action-dialog-backdrop" onClick={onClose}>
        <div className="action-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
            <header className="action-dialog-head">
                <h4>{title}</h4>
                <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${title}`}><IonIcon icon={closeOutline} /></button>
            </header>
            <div className="action-dialog-body">{children}</div>
        </div>
    </div>;

    return <>
        <span ref={anchorRef} hidden />
        {host && createPortal(dialog, host)}
    </>;
};

/**
 * The code the customer shows at the counter.
 *
 * A ticket number is long and a name is not proof of anything. Four digits are
 * quick to read out, mean nothing to anyone else, and stop working two hours
 * after they are made or the moment the pawn is paid. The code the shop holds
 * is read back when the panel opens, so closing the screen does not lose a code
 * that is still good.
 */
const PickupCodePanel: React.FC<{ transactionId: number; onFlash: (message: string) => void }> = ({ transactionId, onFlash }) => {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState<ApiPickupCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    // Ticks while a code is live, so the time left counts down rather than
    // going stale at whatever it said when the screen opened.
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let active = true;
        getPickupCode(transactionId)
            .then((loaded) => { if (active) setCode(loaded); })
            .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Your pickup code could not be read.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [transactionId]);

    useEffect(() => {
        if (!code?.expires_at) return;
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, [code?.expires_at]);

    const minutesLeft = code?.expires_at
        ? Math.max(0, Math.round((new Date(code.expires_at).getTime() - now) / 60000))
        : 0;
    const live = Boolean(code?.pickup_code) && minutesLeft > 0;

    const generate = async () => {
        setWorking(true);
        setError('');
        try {
            const made = await generatePickupCode(transactionId);
            setCode(made);
            setNow(Date.now());
            onFlash(`Your pickup code is ${made.pickup_code}. Show it to staff at the shop.`);
        } catch (generateError) {
            setError(generateError instanceof Error ? generateError.message : 'Your pickup code could not be made.');
        } finally {
            setWorking(false);
        }
    };

    if (loading) return null;

    return <div className="pickup-code">
        <button type="button" className="pickup-code-button" onClick={() => setOpen(true)}>
            <IonIcon icon={keyOutline} aria-hidden="true" />
            {live ? 'Your Pickup Code' : 'Generate Pickup Code'}
        </button>

        {open && <ActionDialog title="Pickup Code" onClose={() => setOpen(false)}>
            {live
                ? <div className="pickup-code-live">
                    <span>Your pickup code</span>
                    <strong className="pickup-code-digits">{code?.pickup_code}</strong>
                    <small>Show this code to staff at the shop. Valid for {code?.valid_hours} hours.</small>
                    <em>{minutesLeft > 60 ? `Expires in ${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `Expires in ${minutesLeft} min`}</em>
                    <button type="button" onClick={generate} disabled={working} aria-busy={working}>
                        {working && <Spinner />}{working ? 'Making a new code' : 'Make a new code'}
                    </button>
                </div>
                : <>
                    <p className="pickup-code-lead">Staff read this out instead of your ticket number. It lasts {code?.valid_hours ?? 2} hours and stops working once your pawn is paid.</p>
                    <button type="button" className="pickup-code-generate" onClick={generate} disabled={working} aria-busy={working}>
                        {working && <Spinner />}{working ? 'Generating' : 'Generate Pickup Code'}
                    </button>
                </>}
            {error && <p className="pickup-code-error">{error}</p>}
        </ActionDialog>}
    </div>;
};

/**
 * Renewing a pawn by GCash, without the shop taking the payment.
 *
 * The customer pays the renta in their own GCash app and types the reference
 * number here. Submitting records a claim and tells the staff; nothing about
 * the pawn moves until a staff member checks that reference against the shop's
 * GCash account. The renta and the GCash number both come from the API, so the
 * figure shown is the one the shop computed and the number is whatever the
 * admin has set.
 */
const GCASH_QR_SRC = '/qr.jpg';

const RenewOnlinePanel: React.FC<{ transactionId: number; itemName: string; onFlash: (message: string) => void }> = ({ transactionId, itemName, onFlash }) => {
    const modal = useModal();
    const [open, setOpen] = useState(false);
    const [info, setInfo] = useState<ApiOnlineRenewalInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [reference, setReference] = useState('');
    // The GCash receipt, already downscaled to a data URL, and the name of the
    // file it came from so the customer can see which one they picked.
    const [receipt, setReceipt] = useState<{ dataUrl: string; name: string } | null>(null);
    const [reading, setReading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    // The claim now waiting on this pawn: either one that was already pending
    // when the panel opened, or the one just submitted.
    const [pending, setPending] = useState<ApiRenewalRequest | null>(null);

    // The renta accrues by the day, so it is read when the panel is opened
    // rather than carried along with the item list.
    useEffect(() => {
        if (!open || info) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        getOnlineRenewalInfo(transactionId)
            .then((loaded) => {
                if (cancelled) return;
                setInfo(loaded);
                setPending(loaded.pending_request);
            })
            .catch((loadError) => {
                if (cancelled) return;
                setError(loadError instanceof Error ? loadError.message : 'The renewal details could not be loaded.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, info, transactionId]);

    /**
     * Read a picked receipt into a downscaled data URL.
     *
     * A phone screenshot runs to several megabytes and the API carries it as
     * text, so it is scaled here before it is ever sent. Item photo settings
     * suit it: a screenshot only has to stay readable.
     */
    const pickReceipt = async (file: File | undefined) => {
        if (!file) return;

        setReading(true);
        setError('');
        try {
            const dataUrl = await readImageAsScaledDataUrl(file, ITEM_PHOTO_SCALE);
            setReceipt({ dataUrl, name: file.name });
        } catch {
            setError('That file could not be read. Try another screenshot.');
        } finally {
            setReading(false);
        }
    };

    const submit = async () => {
        const trimmed = reference.trim();
        if (!trimmed) {
            setError('Enter the GCash reference number from your payment receipt.');
            return;
        }

        // Confirmed first: staff are told at once, and the claim cannot be
        // taken back from here.
        const confirmed = await modal.confirm({
            title: 'Submit this renewal payment?',
            message: <>Our staff will check GCash reference <strong>{trimmed}</strong> for <strong>{itemName}</strong>{receipt ? ' against the receipt you attached' : ''}. Send it only after your GCash payment has gone through.</>,
            confirmLabel: 'Submit payment',
        });
        if (!confirmed) return;

        setSending(true);
        setError('');
        try {
            const created = await submitOnlineRenewal(transactionId, trimmed, receipt?.dataUrl);
            setPending(created);
            setReference('');
            setReceipt(null);
            onFlash(`Reference ${created.gcash_reference_number} is with our staff. They will confirm your renewal once the payment is checked.`);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Your renewal could not be submitted.');
        } finally {
            setSending(false);
        }
    };

    return <div className="renew-online">
        <button type="button" className="renew-online-open" onClick={() => setOpen(true)}>
            <IonIcon icon={refreshOutline} aria-hidden="true" />
            Renew Online
        </button>

        {open && <ActionDialog title="Renew Online" onClose={() => setOpen(false)}>
        {loading && <p className="renew-online-note">Loading your renewal details...</p>}

        {info && !info.renewable && <p className="renew-online-note">This pawn can no longer be renewed online. Please contact the shop.</p>}

        {info && info.renewable && <>
            <div className="renew-online-amount">
                <span>Renta Due</span>
                <strong>{moneyExact(info.interest_due)}</strong>
                <small>Interest computed to today. Paying it extends your due date by {info.renewal_term_days} days.</small>
            </div>

            <div className="renew-online-gcash">
                <span>Send your GCash payment to</span>
                {/* The QR code is a fixed shop asset. The number beside it is
                    set by the admin, and is the fallback for a customer who
                    cannot scan from the same device they are reading on. */}
                <img className="renew-online-qr" src={GCASH_QR_SRC} alt="The shop's GCash QR code" />
                {info.gcash_payment_info
                    ? <strong>{info.gcash_payment_info}</strong>
                    : <em>Scan the QR code above in your GCash app.</em>}
            </div>

            {pending
                ? <p className="renew-online-sent">
                    Reference <strong>{pending.gcash_reference_number}</strong> is with our staff. They will confirm your renewal once the payment is checked.
                </p>
                : <>
                    <ol className="renew-online-steps">
                        <li>Send {moneyExact(info.interest_due)} to the GCash number above, from your own GCash app.</li>
                        <li>Copy the reference number from your GCash receipt.</li>
                        <li>Enter it below so our staff can check it.</li>
                    </ol>
                    <label className="renew-online-field">
                        <span>GCash reference number</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={reference}
                            maxLength={50}
                            placeholder="e.g. 1234567890123"
                            onChange={(event) => setReference(event.target.value)}
                            disabled={sending}
                        />
                    </label>

                    {/* The receipt is optional: a customer who cannot attach
                        one still gets to submit, and staff fall back to
                        searching the reference number by hand. */}
                    <div className="renew-online-receipt">
                        <span>Receipt screenshot <em>(optional)</em></span>
                        {receipt
                            ? <div className="renew-online-receipt-picked">
                                <img src={receipt.dataUrl} alt="The receipt you attached" />
                                <div>
                                    <strong>{receipt.name}</strong>
                                    <button type="button" onClick={() => setReceipt(null)} disabled={sending}>
                                        <IonIcon icon={trashOutline} aria-hidden="true" />Remove
                                    </button>
                                </div>
                            </div>
                            : <label className="renew-online-receipt-pick">
                                <IonIcon icon={cloudUploadOutline} aria-hidden="true" />
                                {reading ? 'Reading your file...' : 'Attach your GCash receipt'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    disabled={reading || sending}
                                    onChange={(event) => { pickReceipt(event.target.files?.[0]); event.target.value = ''; }}
                                />
                            </label>}
                    </div>
                    <button
                        type="button"
                        className="renew-online-submit"
                        onClick={submit}
                        disabled={sending || reading}
                        aria-busy={sending}
                    >
                        {sending && <Spinner />}
                        {sending ? 'Submitting' : 'Submit renewal payment'}
                    </button>
                </>}
        </>}

        {error && <p className="renew-online-error">{error}</p>}
        </ActionDialog>}
    </div>;
};

const Payments: React.FC<{ active: Item[]; go: (view: View) => void; loaded: boolean; onFlash: (message: string) => void }> = ({ active, go, loaded, onFlash }) => {
    const modal = useModal();
    const [sending, setSending] = useState(false);
    const principal = active.reduce((total, item) => total + item.loanAmount, 0);
    const interest = active.reduce((total, item) => total + item.interestDue, 0);
    const payable = active.reduce((total, item) => total + item.totalPayable, 0);
    const upcoming = nextDue(active);
    const upcomingDue = upcoming ? dueStatus(upcoming.dueIso) : null;

    // The request goes against one loan, and the loan due soonest is the one
    // these buttons are about. The item is named in the dialog so the customer
    // is never guessing which one staff will be told about.
    const requestTarget = upcoming || active[0] || null;
    const { pageRows: activeRows, pager } = usePagedRows(active);

    /**
     * Raises one of the three counter requests.
     *
     * Confirmed first, because staff are told at once and the request cannot be
     * taken back from here.
     */
    const raiseRequest = async (type: CustomerRequestType, copy: { title: string; confirm: string; done: string }) => {
        if (!requestTarget?.transactionId) {
            await modal.info({
                title: copy.title,
                message: 'You have no open pawn to raise this request against.',
            });
            return;
        }

        const confirmed = await modal.confirm({
            title: copy.title,
            message: <>{copy.confirm} Our staff will be notified about <strong>{requestTarget.name}</strong> (Ticket {requestTarget.ticketNumber}).</>,
            confirmLabel: 'Send request',
        });
        if (!confirmed || sending) return;

        setSending(true);
        modal.loading('Sending your request...');
        try {
            await sendCustomerRequest(requestTarget.transactionId, type);
            modal.hideLoading();
            onFlash(copy.done);
        } catch (requestError) {
            modal.hideLoading();
            await modal.error({
                message: requestError instanceof Error ? requestError.message : 'Your request could not be sent. Please try again.',
            });
        } finally {
            setSending(false);
        }
    };

    return <section className="portal-content">
        <div className="portal-intro"><div><small>KEEP YOUR ITEMS SAFE</small><h2>Payments & Redemption</h2><p>Manage your active pawns and redemption requests.</p></div></div>
        <div className="payment-summary">
            <div className="payment-summary-head">
                <div>
                    <small>TOTAL AMOUNT DUE</small>
                    <strong>{loaded ? moneyExact(payable) : '--'}</strong>
                </div>
                {upcoming && <span className={`payment-due-badge ${upcomingDue ? upcomingDue.tone : ''}`}>Due {upcoming.due}</span>}
            </div>

            <div className="payment-summary-grid">
                <div><span>Principal</span><strong>{loaded ? money(principal) : '--'}</strong></div>
                <div><span>Accrued interest</span><strong>{loaded ? moneyExact(interest) : '--'}</strong></div>
                <div><span>Due date</span><strong>{upcoming ? upcoming.due : '-'}</strong></div>
                <div>
                    <span>Pawn status</span>
                    <strong className={`payment-status ${active.length > 0 ? 'is-active' : 'is-clear'}`}>
                        {loaded ? (active.length > 0 ? 'Active' : 'None open') : '--'}
                    </strong>
                </div>
            </div>

            <div className="payment-summary-foot">
                <small>Interest is computed to today. The shop confirms the final figure on redemption.</small>
                <IonButton
                    className="payment-primary-action"
                    disabled={active.length === 0}
                    onClick={() => raiseRequest('redemption_payment', {
                        title: 'Request redemption payment',
                        confirm: 'You are telling the shop you are ready to pay and redeem.',
                        done: 'Redemption payment request submitted. Staff have been notified and will confirm it shortly.',
                    })}
                >
                    <IonIcon icon={cashOutline} slot="start" />
                    Request redemption payment
                </IonButton>
            </div>
        </div>

        <div className="payment-actions">
            <div className="payment-action-card">
                <span className="payment-action-icon"><IonIcon icon={cashOutline} /></span>
                <strong>Redeem your item</strong>
                <p>Pay the amount due and reserve your redemption appointment.</p>
                <IonButton fill="outline" disabled={active.length === 0} onClick={() => raiseRequest('appointment', {
                    title: 'Request appointment',
                    confirm: 'You are asking the shop to set a redemption appointment.',
                    done: 'Redemption appointment requested. Staff have been notified and will contact you.',
                })}>Request appointment</IonButton>
            </div>
            <div className="payment-action-card">
                <span className="payment-action-icon is-gold"><IonIcon icon={refreshOutline} /></span>
                <strong>Renew or extend pawn</strong>
                <p>Need more time? Request a renewal before the maturity date, or open the item and use Renew Online to pay the renta by GCash.</p>
                <IonButton fill="outline" disabled={active.length === 0} onClick={() => raiseRequest('renewal', {
                    title: 'Request renewal or extension',
                    confirm: 'You are asking the shop to renew or extend this pawn.',
                    done: 'Pawn renewal request submitted. Staff have been notified and will contact you.',
                })}>Request renewal / extension</IonButton>
            </div>
        </div>

        <div className="portal-heading"><div><small>ACTIVE PAWNS</small><h3>Items included in this payment</h3></div><button onClick={() => go('items')}>View items</button></div>
        <div className="payment-loan-list">
            {activeRows.map(item => <LoanCard key={item.id} item={item} onClick={() => go('items')} />)}
            {!loaded && <SkeletonList rows={3} />}
            {loaded && active.length === 0 && <p className="notice-empty">You have no active pawns.</p>}
        </div>
        <Pager pager={pager} label="active pawns" />
    </section>;
};

/** One active loan, with its term progress read off the dates it already holds. */
const LoanCard: React.FC<{ item: Item; onClick: () => void }> = ({ item, onClick }) => {
    const progress = loanTermProgress(item.pawnedIso, item.dueIso);
    const due = dueStatus(item.dueIso);

    return (
        <button type="button" className="payment-loan-card" onClick={onClick}>
            <span className="payment-loan-top">
                <i aria-hidden="true">{item.name[0]}</i>
                <span className="payment-loan-id">
                    <strong>{item.name}</strong>
                    <small>{item.ticketNumber}</small>
                </span>
                <span className="payment-loan-figure">
                    <strong>{item.loan}</strong>
                    <small>Pawn amount</small>
                </span>
                <span className={`payment-loan-status ${due ? due.tone : ''}`}>
                    <i aria-hidden="true" />
                    {item.status}
                </span>
            </span>

            {progress && progress.termDays !== null && (
                <span className="payment-loan-term">
                    <span className="payment-loan-term-head">
                        <small>Pawn term</small>
                        <small>
                            {progress.daysLeft < 0
                                ? `${Math.abs(progress.daysLeft)} days overdue`
                                : `${progress.daysLeft} of ${progress.termDays} days remaining`}
                        </small>
                    </span>
                    {/* Same bar as the Home rows and the item details. */}
                    <LoanTermBar className="payment-loan-bar" pawnedIso={item.pawnedIso} dueIso={item.dueIso} />
                </span>
            )}

            <span className="payment-loan-foot">
                <small>Due {item.due}</small>
                <em>View details <IonIcon icon={chevronForwardOutline} /></em>
            </span>
        </button>
    );
};


const Profile: React.FC<{ me: ApiMe | null; logout: () => void; onAccountChanged: () => void; onFlash: (message: string) => void }> = ({ me, logout, onAccountChanged, onFlash }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // An account that was never activated has no password to state. That is
    // every customer who reached the portal by scanning their pawn ticket.
    const isFirstPassword = me !== null && !me.user.is_activated;

    // Fill the form once the account has loaded, and again if it reloads.
    useEffect(() => {
        if (!me) return;
        setName(me.user.name);
        setPhone(me.customer?.contact_number || me.user.contact_number || '');
        setAddress(me.customer?.address || '');
    }, [me]);

    const edit = (apply: () => void) => {
        apply();
        setSaved(false);
        setError('');
    };

    /**
     * Save the details, and the password with them when one was typed.
     *
     * The password fields are part of this form rather than a card of their
     * own, so leaving them empty simply means the password is not being
     * changed today.
     */
    const save = async () => {
        const wantsPassword = password !== '' || confirmPassword !== '';

        if (wantsPassword) {
            if (password.length < 8) {
                setError('Use at least 8 characters for your new password.');
                return;
            }
            if (password !== confirmPassword) {
                setError('The two passwords do not match.');
                return;
            }
        }

        setError('');
        setSaving(true);
        try {
            await updateMe({ name: name.trim(), contact_number: phone.trim(), address: address.trim() });

            if (wantsPassword) {
                await updateMyPassword({
                    current_password: isFirstPassword ? undefined : currentPassword,
                    password,
                    password_confirmation: confirmPassword,
                });
                setCurrentPassword('');
                setPassword('');
                setConfirmPassword('');
                onAccountChanged();
                onFlash(isFirstPassword
                    ? 'Your password is set. You can now sign in with your email address and password.'
                    : 'Your password has been changed. Any other device you were signed in on has been signed out.');
            }

            setSaved(true);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Unable to save your profile.');
        } finally {
            setSaving(false);
        }
    };

    return <section className="portal-content">
        <div className="portal-intro"><div><small>YOUR ACCOUNT</small><h2>Profile</h2><p>Manage your information, account settings, and access.</p></div></div>
        <div className="profile-grid">
            <Panel title="Personal information">
                <IonItem lines="none"><IonLabel position="stacked">FULL NAME</IonLabel><IonInput value={name} onIonInput={event => edit(() => setName(event.detail.value || ''))} /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">EMAIL ADDRESS</IonLabel><IonInput value={me?.user.email || ''} readonly /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">CONTACT NUMBER</IonLabel><IonInput value={phone} onIonInput={event => edit(() => setPhone(event.detail.value || ''))} /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">ADDRESS</IonLabel><IonInput value={address} onIonInput={event => edit(() => setAddress(event.detail.value || ''))} /></IonItem>

                {/* The banner on every other screen already explains why a
                    QR customer is being asked for one, so this says nothing
                    to them and speaks only to a change. */}
                {!isFirstPassword && (
                    <p className="password-lead">Leave these empty unless you are changing your password. Changing it signs out every other device.</p>
                )}
                {/* Somebody who already has a password states it; somebody who
                    has never had one has nothing to state. */}
                {!isFirstPassword && (
                    <IonItem lines="none"><IonLabel position="stacked">CURRENT PASSWORD</IonLabel><IonInput type="password" value={currentPassword} onIonInput={event => edit(() => setCurrentPassword(event.detail.value || ''))} /></IonItem>
                )}
                <IonItem lines="none"><IonLabel position="stacked">NEW PASSWORD</IonLabel><IonInput type="password" value={password} onIonInput={event => edit(() => setPassword(event.detail.value || ''))} /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">CONFIRM NEW PASSWORD</IonLabel><IonInput type="password" value={confirmPassword} onIonInput={event => edit(() => setConfirmPassword(event.detail.value || ''))} /></IonItem>

                <IonButton onClick={save} disabled={saving || !me} aria-busy={saving}>{saving && <Spinner />}{saving ? 'Saving' : 'Save changes'}</IonButton>
                {saved && <small className="saved">Changes saved successfully.</small>}
                {error && <small className="portal-load-error">{error}</small>}
                <IonButton className="profile-logout" fill="outline" color="danger" onClick={logout}><IonIcon icon={logOutOutline} slot="start" />Log out</IonButton>
            </Panel>
        </div>
    </section>;
};

export default CustomerPortal;
