import React, { useEffect, useState } from 'react';
import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonPage } from '@ionic/react';
import { alertCircleOutline, cashOutline, chevronDownOutline, chevronForwardOutline, chevronUpOutline, closeOutline, homeOutline, logOutOutline, menuOutline, notificationsOutline, personCircleOutline, timeOutline, walletOutline } from 'ionicons/icons';
import { trendingUpOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { daysUntil, longDate, money, moneyExact, statusLabel, timeAgo } from '../data/pawnshopStore';
import {
    getDashboard,
    getItems,
    getMe,
    getNotifications,
    updateMe,
    type ApiDashboard,
    type ApiItemDetail,
    type ApiMe,
    type ApiNotification,
    type ApiTransaction,
} from '../services/api';
import FaqChatbot from '../components/FaqChatbot';
import TrendSuggestionCard from '../components/TrendSuggestionCard';
import './CustomerPortal.css';

type Status = 'Active' | 'Overdue' | 'Redeemed' | 'Forfeited' | 'For Sale' | 'Sold';
type View = 'dashboard' | 'items' | 'payments' | 'profile';

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
    totalPayable: number;
    interestDue: number;
    pawned: string;
    due: string;
    dueIso: string;
    status: Status;
    trend: number[];
};

/** An enum value as the pawnshop stores it, rendered for a person to read. */
const readable = (value?: string | null) =>
    (value || '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/**
 * What identifies the item at a glance: karat and weight for jewelry, brand or
 * model for a watch, cellphone, or bulky item.
 */
const specsFor = (item: ApiItemDetail) =>
    item.group === 'jewelry'
        ? [item.karat ? String(item.karat).toUpperCase() : null, item.weight_grams ? `${item.weight_grams} g` : null].filter(Boolean).join(' · ')
        : item.brand_model || readable(item.category);

/** The loan that matters for this item: the open one, else the most recent. */
const currentLoan = (item: ApiItemDetail): ApiTransaction | null => {
    const loans = item.transactions || [];
    return loans.find((loan) => loan.status === 'active') || loans[loans.length - 1] || null;
};

const toItem = (item: ApiItemDetail): Item => {
    const loan = currentLoan(item);
    const valueAmount = Number(item.adjusted_value ?? item.appraised_value ?? 0);

    return {
        id: String(item.items_id),
        ticketNumber: loan?.ticket_number || '-',
        name: item.description,
        group: readable(item.group),
        category: readable(item.category),
        specs: specsFor(item),
        description: item.description,
        value: money(valueAmount),
        valueAmount,
        loan: loan ? money(Number(loan.loan_amount)) : '-',
        loanAmount: loan ? Number(loan.loan_amount) : 0,
        interest: loan ? `${(Number(loan.interest_rate) * 100).toFixed(2)}% monthly` : '-',
        totalPayable: loan ? Number(loan.total_payable) : 0,
        interestDue: loan ? Number(loan.interest_due) : 0,
        pawned: longDate(loan?.created_at),
        due: longDate(loan?.due_date),
        dueIso: loan?.due_date || '',
        status: statusLabel(item.status) as Status,
        // Only jewelry is revalued daily against the gold price, so only
        // jewelry has a value history to chart.
        trend: (item.value_logs || []).map((log) => Number(log.computed_value)).filter((value) => Number.isFinite(value)),
    };
};

const CustomerPortal: React.FC = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<View>('dashboard');
    const [filter, setFilter] = useState<'All' | Status>('All');
    const [selected, setSelected] = useState<Item | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [readNotifications, setReadNotifications] = useState(false);

    const [items, setItems] = useState<Item[]>([]);
    const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
    const [notices, setNotices] = useState<ApiNotification[]>([]);
    const [me, setMe] = useState<ApiMe | null>(null);
    const [apiError, setApiError] = useState('');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;

        Promise.all([getItems(), getDashboard('customer'), getNotifications(), getMe()])
            .then(([apiItems, apiDashboard, apiNotifications, apiMe]) => {
                if (!active) return;
                setItems(apiItems.map(toItem));
                setDashboard(apiDashboard);
                setNotices(apiNotifications);
                setMe(apiMe);
            })
            .catch((error) => {
                if (active) setApiError(error instanceof Error ? error.message : 'Unable to load your account data.');
            })
            .finally(() => { if (active) setLoaded(true); });

        return () => { active = false; };
    }, []);

    const active = items.filter((item) => item.status === 'Active' || item.status === 'Overdue');
    const visible = filter === 'All' ? items : items.filter((item) => item.status === filter);
    const unreadCount = readNotifications ? 0 : notices.length;
    const displayName = me?.user.name || 'Customer';

    const logout = () => { localStorage.removeItem('smartpawn_customer'); localStorage.removeItem('smartpawn_api_token'); navigate('/'); };

    const menu: Array<{ id: View; label: string; icon: string }> = [
        { id: 'dashboard', label: 'Home', icon: homeOutline }, { id: 'items', label: 'My Items', icon: walletOutline },
        { id: 'payments', label: 'Payments', icon: cashOutline },
    ];
    const go = (next: View) => { setView(next); setSelected(null); setMobileMenuOpen(false); };

    return <IonPage className="portal-page"><IonContent fullscreen><div className="portal-shell">
        <div className={`portal-mobile-backdrop ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div><aside className={`portal-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}><div className="portal-brand"><img src="/logo.png" alt="SmartPawn" /><div><strong>SMARTPAWN</strong><span>Customer Portal</span></div></div><span className="portal-menu-label">CUSTOMER MENU</span><nav className="portal-nav">{menu.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><IonIcon icon={item.icon} /><span>{item.label}</span></button>)}</nav><div className="portal-user"><IonIcon icon={personCircleOutline} /><div><strong>{displayName}</strong><span>Customer</span></div></div></aside>
        <main className="portal-main"><header className="portal-topbar"><div className="portal-title-group"><button className="portal-mobile-menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Hide navigation' : 'Show navigation'}><IonIcon icon={mobileMenuOpen ? closeOutline : menuOutline} /></button><div><small>CUSTOMER PORTAL</small></div></div><div className="portal-header-actions"><div className="portal-action-wrap"><button className="portal-notice-button" onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} aria-label="Notifications" aria-expanded={notificationsOpen}><IonIcon icon={notificationsOutline} />{unreadCount > 0 && <b>{unreadCount}</b>}</button>{notificationsOpen && <div className="portal-dropdown portal-notification-dropdown"><div className="portal-dropdown-head"><strong>Notifications</strong><button onClick={() => setReadNotifications(true)}>Mark all read</button></div>{notices.map(notice => <button className="portal-notification-item" key={notice.id} onClick={() => setReadNotifications(true)}><strong>{notice.title}</strong><small>{notice.message} · {timeAgo(notice.created_at)}</small></button>)}{notices.length === 0 && <p className="portal-notification-empty">{loaded ? 'Nothing needs your attention right now.' : 'Loading notifications...'}</p>}</div>}</div><div className="portal-action-wrap"><button className="portal-profile-button" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} aria-expanded={profileOpen}><IonIcon icon={personCircleOutline} /><span>{displayName}</span><IonIcon className="profile-chevron" icon={profileOpen ? chevronUpOutline : chevronDownOutline} aria-hidden="true" /></button>{profileOpen && <div className="portal-dropdown portal-profile-dropdown"><button onClick={() => { setProfileOpen(false); go('profile'); }}><IonIcon icon={personCircleOutline} />Profile</button><button onClick={logout}><IonIcon icon={logOutOutline} />Logout</button></div>}</div></div></header>
            {apiError && <p className="portal-load-error">{apiError}</p>}
            {view === 'dashboard' && <Dashboard active={active} items={items} notices={notices} dashboard={dashboard} name={displayName} loaded={loaded} go={go} />}
            {view === 'items' && <Items items={items} visible={visible} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} loaded={loaded} />}
            {view === 'payments' && <Payments active={active} go={go} loaded={loaded} />}
            {view === 'profile' && <Profile me={me} items={items} logout={logout} />}
        </main>
        <FaqChatbot />
    </div></IonContent></IonPage>;
};

/** Soonest due date among the customer's open loans. */
const nextDue = (active: Item[]) =>
    active.filter(item => item.dueIso).sort((first, second) => first.dueIso.localeCompare(second.dueIso))[0] || null;

const Dashboard: React.FC<{ active: Item[]; items: Item[]; notices: ApiNotification[]; dashboard: ApiDashboard | null; name: string; loaded: boolean; go: (view: View) => void }> = ({ active, items, notices, dashboard, name, loaded, go }) => {
    const upcoming = nextDue(active);
    const daysLeft = upcoming ? daysUntil(upcoming.dueIso) : null;
    const goldPrices = (dashboard?.gold_prices || []).map(price => Number(price.price_per_gram)).filter(value => Number.isFinite(value) && value > 0);
    const latestGold = goldPrices[0] || 0;
    const previousGold = goldPrices[1] || latestGold;
    const goldChange = previousGold > 0 ? ((latestGold - previousGold) / previousGold) * 100 : 0;

    return <section className="portal-content dashboard-content">
        <div className="dashboard-welcome"><small>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase()}</small><h2>Welcome back, {name}!</h2><p>Here is the latest update on your pawned items.</p></div>
        <div className="portal-stats dashboard-stats">
            <Stat icon={walletOutline} value={loaded ? String(active.length) : '--'} label="Active items" />
            <Stat icon={timeOutline} value={daysLeft === null ? '--' : daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`} label="Upcoming due date" />
            <Stat icon={cashOutline} value={loaded ? money(dashboard?.stats.amount_due || 0) : '--'} label="Total amount due" />
        </div>
        <div className="dashboard-columns">
            <div className="dashboard-section notifications-section">
                <div className="portal-heading"><div><small>ACCOUNT UPDATES</small><h3>Notifications</h3></div><span className="notice-count">{notices.length} recent</span></div>
                <div className="notice-list dashboard-notice-list">
                    {notices.slice(0, 3).map(notice => <Notice key={notice.id} icon={notice.type === 'risk' ? alertCircleOutline : timeOutline} title={notice.title} text={notice.message} time={timeAgo(notice.created_at)} />)}
                    {notices.length === 0 && <p className="notice-empty">{loaded ? 'Nothing needs your attention right now.' : 'Loading notifications...'}</p>}
                </div>
            </div>
            <div className="dashboard-section">
                <div className="portal-heading"><div><small>PAWN RECORDS</small><h3>My Items</h3></div><button onClick={() => go('items')}>View all <IonIcon icon={chevronForwardOutline} /></button></div>
                <div className="dashboard-items">{items.slice(0, 3).map(item => <button className="dashboard-item" key={item.id} onClick={() => go('items')}><i aria-hidden="true">{item.name[0]}</i><span><strong>{item.name}</strong><small>{item.value} · Due {item.due}</small></span><IonIcon icon={chevronForwardOutline} /></button>)}
                    {items.length === 0 && <p className="notice-empty">{loaded ? 'You have no pawned items on record.' : 'Loading items...'}</p>}
                </div>
                <button className="dashboard-view-all" onClick={() => go('items')}>View All Items <IonIcon icon={chevronForwardOutline} /></button>
                <div className="gold-widget"><div className="gold-widget-icon"><IonIcon icon={cashOutline} /></div><div><small>MARKET WATCH</small><strong>Today's Gold Price</strong><span>{latestGold > 0 ? `${money(latestGold)} / gram` : 'No price recorded'}</span></div>{goldPrices.length > 1 && <div className="gold-trend"><IonIcon icon={trendingUpOutline} /><span>{goldChange >= 0 ? '+' : ''}{goldChange.toFixed(1)}%</span></div>}</div>
            </div>
        </div>
    </section>;
};

const Stat: React.FC<{ icon: string; value: string; label: string }> = ({ icon, value, label }) => <div className="portal-stat"><IonIcon icon={icon} /><strong>{value}</strong><span>{label}</span></div>;
const ItemRow: React.FC<{ item: Item; onClick: () => void }> = ({ item, onClick }) => <button className="item-row" onClick={onClick}><i>{item.name[0]}</i><div><strong>{item.name}</strong><span>{item.description}</span></div><div className="row-data"><span>Loan amount</span><strong>{item.loan}</strong></div><div className="row-data"><span>Due date</span><strong>{item.due}</strong></div><em className={`pill ${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</em><IonIcon icon={chevronForwardOutline} /></button>;
const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <div className="portal-panel"><h3>{title}</h3>{children}</div>;

const Items: React.FC<{ items: Item[]; visible: Item[]; filter: 'All' | Status; setFilter: (value: 'All' | Status) => void; selected: Item | null; setSelected: (item: Item | null) => void; loaded: boolean }> = ({ items, visible, filter, setFilter, selected, setSelected, loaded }) => <section className="portal-content"><div className="portal-intro"><div><small>PAWN RECORDS</small><h2>My Items</h2><p>Review every item connected to your account.</p></div></div><div className="item-tabs" role="tablist">{(['All', 'Active', 'Redeemed', 'Forfeited'] as const).map(tab => <button key={tab} className={filter === tab ? 'active' : ''} onClick={() => setFilter(tab)} role="tab" aria-selected={filter === tab}>{tab} <span>{tab === 'All' ? items.length : items.filter(item => item.status === tab).length}</span></button>)}</div><div className="items-table-wrap"><table className="items-table"><thead><tr><th>Item</th><th>Loan amount</th><th>Date pawned</th><th>Due date</th><th>Status</th><th></th></tr></thead><tbody>{visible.map(item => <tr key={item.id} onClick={() => setSelected(item)}><td><div className="table-item"><i>{item.name[0]}</i><span><strong>{item.name}</strong><small>{item.description}</small></span></div></td><td>{item.loan}</td><td>{item.pawned}</td><td>{item.due}</td><td><em className={`pill ${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</em></td><td><IonIcon icon={chevronForwardOutline} /></td></tr>)}</tbody></table>{visible.length === 0 && <p className="notice-empty">{loaded ? 'No items match this filter.' : 'Loading items...'}</p>}</div>{selected && <ItemDetail item={selected} onClose={() => setSelected(null)} />}</section>;

/** The expanded card for one item, built entirely from that item's own record. */
const ItemDetail: React.FC<{ item: Item; onClose: () => void }> = ({ item, onClose }) => {
    const trend = item.trend;
    const peak = trend.length ? Math.max(...trend) : 0;
    const first = trend.length ? trend[0] : 0;
    const last = trend.length ? trend[trend.length - 1] : 0;
    const trendChange = first > 0 ? ((last - first) / first) * 100 : 0;
    const coverage = item.loanAmount > 0 ? (item.valueAmount / item.loanAmount) * 100 : 0;

    return <div className="detail-card">
        <div className="portal-heading"><div><small>TICKET {item.ticketNumber}</small><h3>{item.name}</h3></div><button onClick={onClose}>Close</button></div>
        <p>{item.description}</p>
        <div className="detail-grid">
            <div><span>Appraised value</span><strong>{item.value}</strong></div>
            <div><span>Loan amount</span><strong>{item.loan}</strong></div>
            <div><span>Interest rate</span><strong>{item.interest}</strong></div>
            <div><span>Date pawned</span><strong>{item.pawned}</strong></div>
            <div><span>Due date</span><strong>{item.due}</strong></div>
            <div><span>Status</span><strong>{item.status}</strong></div>
        </div>
        <div className="detail-wide item-spec-grid">
            <div><span>Group</span><strong>{item.group}</strong></div>
            <div><span>Type</span><strong>{item.category}</strong></div>
            <div><span>Details</span><strong>{item.specs || '-'}</strong></div>
        </div>
        {trend.length > 1 && <div className="detail-wide value-trend">
            <div className="trend-heading"><div><span>Daily value trend</span><strong>Gold market movement · last {trend.length} days</strong></div><small>{money(first)} → {money(last)}</small></div>
            <div className="trend-bars" aria-label="Daily item value trend">{trend.map((value, index) => <div className="trend-point" key={`${index}-${value}`}><i style={{ height: `${peak > 0 ? Math.max(24, (value / peak) * 100) : 24}%` }} /><small>{index + 1}</small></div>)}</div>
        </div>}
        {item.loanAmount > 0 && <div className="detail-wide value-comparison">
            <div><span>Current value</span><strong>{item.value}</strong></div>
            <div className="comparison-track"><i style={{ width: `${Math.min(100, coverage)}%` }} /><b>Loan amount · {item.loan}</b></div>
            <span>Current value is {Math.abs(Math.round(coverage - 100))}% {coverage >= 100 ? 'above' : 'below'} the loan amount.</span>
        </div>}
        {trend.length > 1 && <div className="trend"><span>Value trend</span><strong>{trendChange >= 0 ? '+' : ''}{trendChange.toFixed(1)}%</strong><small>Recorded movement since the first logged value.</small></div>}
        <TrendSuggestionCard />
    </div>;
};

const Payments: React.FC<{ active: Item[]; go: (view: View) => void; loaded: boolean }> = ({ active, go, loaded }) => {
    const principal = active.reduce((total, item) => total + item.loanAmount, 0);
    const interest = active.reduce((total, item) => total + item.interestDue, 0);
    const payable = active.reduce((total, item) => total + item.totalPayable, 0);
    const upcoming = nextDue(active);

    return <section className="portal-content">
        <div className="portal-intro"><div><small>KEEP YOUR ITEMS SAFE</small><h2>Payments & Redemption</h2><p>Manage your active loans and redemption requests.</p></div></div>
        <div className="payment-total"><div><span>Total amount due today</span><strong>{loaded ? moneyExact(payable) : '--'}</strong><small>Principal {money(principal)} + interest {moneyExact(interest)} · computed to date</small></div><IonButton disabled={active.length === 0} onClick={() => alert('Redemption payment request submitted.')}>Request redemption payment</IonButton></div>
        <div className="payment-breakdown"><div><span>Principal</span><strong>{money(principal)}</strong></div><div><span>Accrued interest</span><strong>{moneyExact(interest)}</strong></div><div><span>Due date</span><strong>{upcoming ? upcoming.due : '-'}</strong></div></div>
        <div className="portal-panels"><Panel title="Redemption payment"><p>Submit a payment request and reserve your redemption appointment.</p><IonButton fill="outline" onClick={() => alert('Redemption appointment requested.')}>Request appointment</IonButton></Panel><Panel title="Renew or extend loan"><p>Need more time? Request a renewal before the maturity date.</p><IonButton fill="outline" onClick={() => alert('Loan renewal request submitted.')}>Request renewal / extension</IonButton></Panel></div>
        <div className="portal-heading"><div><small>ACTIVE LOANS</small><h3>Items included in this payment</h3></div><button onClick={() => go('items')}>View items</button></div>
        <div className="portal-list">{active.map(item => <ItemRow key={item.id} item={item} onClick={() => go('items')} />)}{active.length === 0 && <p className="notice-empty">{loaded ? 'You have no active loans.' : 'Loading loans...'}</p>}</div>
    </section>;
};

const Notice: React.FC<{ icon: string; title: string; text: string; time: string }> = ({ icon, title, text, time }) => <div className="notice"><IonIcon icon={icon} /><div><strong>{title}</strong><p>{text}</p><small>{time}</small></div></div>;

const Profile: React.FC<{ me: ApiMe | null; items: Item[]; logout: () => void }> = ({ me, items, logout }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Fill the form once the account has loaded, and again if it reloads.
    useEffect(() => {
        if (!me) return;
        setName(me.user.name);
        setPhone(me.customer?.contact_number || me.user.contact_number || '');
        setAddress(me.customer?.address || '');
    }, [me]);

    const save = async () => {
        setError('');
        setSaving(true);
        try {
            await updateMe({ name: name.trim(), contact_number: phone.trim(), address: address.trim() });
            setSaved(true);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Unable to save your profile.');
        } finally {
            setSaving(false);
        }
    };

    // Every loan the customer has ever had, newest first.
    const history = items.filter(item => item.ticketNumber !== '-');

    return <section className="portal-content">
        <div className="portal-intro"><div><small>YOUR ACCOUNT</small><h2>Profile</h2><p>Manage your information, account settings, and access.</p></div></div>
        <div className="profile-grid">
            <Panel title="Personal information">
                <IonItem lines="none"><IonLabel position="stacked">FULL NAME</IonLabel><IonInput value={name} onIonInput={event => { setName(event.detail.value || ''); setSaved(false); }} /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">EMAIL ADDRESS</IonLabel><IonInput value={me?.user.email || ''} readonly /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">CONTACT NUMBER</IonLabel><IonInput value={phone} onIonInput={event => { setPhone(event.detail.value || ''); setSaved(false); }} /></IonItem>
                <IonItem lines="none"><IonLabel position="stacked">ADDRESS</IonLabel><IonInput value={address} onIonInput={event => { setAddress(event.detail.value || ''); setSaved(false); }} /></IonItem>
                <IonButton onClick={save} disabled={saving || !me}>{saving ? 'Saving...' : 'Save changes'}</IonButton>
                {saved && <small className="saved">Changes saved successfully.</small>}
                {error && <small className="portal-load-error">{error}</small>}
                <IonButton className="profile-logout" fill="outline" color="danger" onClick={logout}><IonIcon icon={logOutOutline} slot="start" />Log out</IonButton>
            </Panel>
            <Panel title="Transaction history">
                {history.map(item => <div className="history" key={item.id}><span>{item.status} · {item.name}</span><strong>{item.loan}</strong><small>{item.pawned}</small></div>)}
                {history.length === 0 && <p className="notice-empty">No transactions on record yet.</p>}
            </Panel>
        </div>
    </section>;
};

export default CustomerPortal;
