import React, { useEffect, useRef, useState } from 'react';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonPage,
  IonSelect,
  IonSelectOption,
} from '@ionic/react';
import {
  analyticsOutline,
  cashOutline,
  chevronDownOutline,
  chevronUpOutline,
  closeOutline,
  gridOutline,
  logOutOutline,
  menuOutline,
  notificationsOutline,
  personCircleOutline,
  refreshOutline,
  warningOutline,
  walletOutline,
  alertCircleOutline,
  chevronForwardOutline,
  documentTextOutline,
  calendarOutline,
  checkmarkCircle,
  checkmarkOutline,
  cubeOutline,
  diamondOutline,
  hardwareChipOutline,
  personAddOutline,
  pricetagOutline,
  searchOutline,
  sparklesOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { calculateAppraisal, money, moneyExact, purityForKarat, riskLabel, shortDate, statusLabel, timeAgo } from '../data/pawnshopStore';
import {
  createCustomer,
  createTransaction,
  getCustomers,
  getDashboard,
  getGoldPrices,
  getItems,
  getMe,
  getNotifications,
  getRiskAlerts,
  getSystemSettings,
  getTransactions,
  markItemForSale,
  markItemSold,
  redeemTransaction,
  searchCustomers,
  updateMe,
  type ApiCustomer,
  type ApiItemDetail,
  type ApiMe,
  type ApiNotification,
  type ApiRiskAlert,
  type ApiTransaction,
} from '../services/api';
import { checkPhotoQuality, readImageAsScaledDataUrl, type PhotoQuality } from '../services/photoQuality';
import TrendSuggestionCard from '../components/TrendSuggestionCard';
import './StaffPortal.css';
import './NewTransaction.css';
import './StaffDashboard.css';
import './GoldPanel.css';
import './IdPhoto.css';
import './StaffNav.css';

/**
 * One item photo the staff picked, with the verdict of the client-side quality
 * check. `quality` is null while the check runs and stays null when the browser
 * could not measure the file, which never blocks the photo.
 */
type AttachedPhoto = { id: string; name: string; file: File; quality: PhotoQuality | null; checking: boolean; dismissed: boolean };

/**
 * Shape an address must have before a customer is registered with it.
 *
 * The activation link and every later password reset link go to this address,
 * so an account created with a placeholder can never be signed in to.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A risk alert flattened for the staff dashboard table. */
type RiskRow = { id: string; item: string; customer: string; currentValue: string; loanAmount: string; risk: 'High' | 'Medium' | 'Low' };

/** Map an API risk alert onto the staff dashboard table row. */
const toRiskRow = (alert: ApiRiskAlert): RiskRow => ({
  id: String(alert.risk_alerts_id),
  item: alert.item?.description || `Item #${alert.item_id}`,
  customer: alert.item?.customer?.name || 'Unknown customer',
  currentValue: money(Number(alert.current_value)),
  loanAmount: money(Number(alert.loan_amount)),
  risk: (alert.risk_level.charAt(0).toUpperCase() + alert.risk_level.slice(1)) as RiskRow['risk'],
});

type StaffProfile = { name: string; role: string };
type View = 'dashboard' | 'transaction' | 'loans' | 'profile';
const menu: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: gridOutline },
  { id: 'transaction', label: 'New Transaction', icon: walletOutline },
  { id: 'loans', label: 'Loans', icon: cashOutline },
];

const StaffPortal: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('dashboard');
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notices, setNotices] = useState<ApiNotification[]>([]);
  const [noticesRead, setNoticesRead] = useState(false);
  const [appraised, setAppraised] = useState(false);
  const [loanTab, setLoanTab] = useState<'active' | 'payments' | 'customers'>('active');
  const [loanRiskFilter, setLoanRiskFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [transactionFlash, setTransactionFlash] = useState('');

  const [staffProfile, setStaffProfile] = useState<StaffProfile>({ name: '', role: 'staff' });

  // The signed in account and the live notification list both come from the
  // API, so nothing on the shell is a stored or assumed value.
  useEffect(() => {
    let active = true;
    getMe().then(me => { if (active) setStaffProfile({ name: me.user.name, role: me.user.role }); }).catch(() => undefined);
    getNotifications().then(list => { if (active) setNotices(list); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const go = (next: View) => {
    setView(next);
    setOpen(false);
  };

  const logout = () => {
    localStorage.removeItem('smartpawn_staff');
    navigate('/');
  };

  return (
    <IonPage className="staff-page">
      <IonContent fullscreen>
        <div className="staff-shell">
          <div className={`staff-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

          <aside className={`staff-sidebar ${open ? 'open' : ''}`}>
            <div className="staff-side-brand">
              <img src="/pagasa.png" alt="Pag-Asa Pawnshop" />
              <div>
                <strong>SMARTPAWN</strong>
                <span>Staff Portal</span>
              </div>
            </div>

            <span className="staff-menu-label">OPERATIONS</span>
            <nav className="staff-nav">
              {menu.map((item) => (
                <button
                  key={item.id}
                  className={view === item.id ? 'active' : ''}
                  onClick={() => go(item.id)}
                >
                  <IonIcon icon={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="staff-user">
              <IonIcon icon={personCircleOutline} />
              <div>
                <strong>{staffProfile.name}</strong>
                <span>{staffProfile.role}</span>
              </div>
            </div>
          </aside>

          <main className="staff-main">
            <header className="staff-topbar">
              <div className="staff-title">
                <button
                  className="staff-menu-toggle"
                  onClick={() => setOpen(!open)}
                  aria-label={open ? 'Hide staff navigation' : 'Show staff navigation'}
                >
                  <IonIcon icon={open ? closeOutline : menuOutline} />
                </button>
                <div>
                  <small>STAFF PORTAL</small>
                </div>
              </div>

              <div className="staff-header-actions"><div className="staff-action-wrap"><button className="staff-notification" onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} aria-label="Notifications" aria-expanded={notificationsOpen}><IonIcon icon={notificationsOutline} />{!noticesRead && notices.length > 0 && <span className="staff-notification-dot" />}</button>{notificationsOpen && <div className="staff-dropdown staff-notification-dropdown"><div className="staff-dropdown-head"><strong>Notifications</strong><button onClick={() => setNoticesRead(true)}>Mark all read</button></div>{notices.map(notice => <button className="staff-notification-item" key={notice.id} onClick={() => setNoticesRead(true)}><strong>{notice.title}</strong><small>{notice.reference} · {timeAgo(notice.created_at)}</small></button>)}{notices.length === 0 && <p className="staff-notification-empty">Nothing needs attention right now.</p>}</div>}</div><div className="staff-action-wrap"><button className="staff-top-user" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} aria-expanded={profileOpen}><IonIcon icon={personCircleOutline} />{staffProfile.name}<IonIcon className="profile-chevron" icon={profileOpen ? chevronUpOutline : chevronDownOutline} aria-hidden="true" /></button>{profileOpen && <div className="staff-dropdown staff-profile-dropdown"><button onClick={() => { setProfileOpen(false); go('profile'); }}><IonIcon icon={personCircleOutline} />Profile</button><button onClick={logout}><IonIcon icon={logOutOutline} />Logout</button></div>}</div></div>
            </header>

            {transactionFlash && <div className="staff-transaction-flash" role="status">{transactionFlash}</div>}

            {view === 'dashboard' && (
              <Dashboard
                go={go}
                staffName={staffProfile.name}
                setLoanTab={setLoanTab}
                setLoanRiskFilter={setLoanRiskFilter}
              />
            )}
            {view === 'transaction' && <NewTransaction appraised={appraised} setAppraised={setAppraised} go={go} onTransactionCreated={(message) => {
              setTransactionFlash(message);
              window.setTimeout(() => setTransactionFlash(''), 4000);
            }} />}
            {view === 'loans' && (
              <LoansPage
                loanTab={loanTab}
                setLoanTab={setLoanTab}
                riskFilter={loanRiskFilter}
                setRiskFilter={setLoanRiskFilter}
              />
            )}
            {view === 'profile' && <Profile logout={logout} />}
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

/** One recorded gold price day, as the dashboard needs it. */
type GoldPoint = { date: string; price: number; predicted: number | null; source: string };

/** History windows the staff can switch between, in days. */
const GOLD_RANGES = [7, 14, 30] as const;
type GoldRange = (typeof GOLD_RANGES)[number];

/** Single day initial under each chart bar. */
const dayLabel = (isoDate: string) => new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });

/** Urgency band for a loan due in the given number of days. */
const dueTone = (days: number) => (days < 0 ? 'overdue' : days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'ok');

/** One loan approaching its due date, flattened for the "Due soon" table. */
type DueRow = { id: string; item: string; customer: string; dueDate: string; daysRemaining: number };

/** Format a date the way the dashboard header shows it. */
const longDate = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase();

/** Morning, afternoon, or evening, from the browser clock. */
const greetingFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/** Whole days from today until the given date. Negative once overdue. */
const daysUntil = (isoDate: string) => {
  const due = new Date(isoDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

const Dashboard: React.FC<{
  go: (view: View) => void;
  staffName: string;
  setLoanTab: (value: 'active' | 'payments' | 'customers') => void;
  setLoanRiskFilter: (value: 'All' | 'Low' | 'Medium' | 'High') => void;
}> = ({ go, staffName, setLoanTab, setLoanRiskFilter }) => {
  const [riskAlerts, setRiskAlerts] = useState<RiskRow[]>([]);
  const [upcomingDue, setUpcomingDue] = useState<DueRow[]>([]);
  const [goldHistory, setGoldHistory] = useState<GoldPoint[]>([]);
  const [goldRange, setGoldRange] = useState<GoldRange>(7);
  const [stats, setStats] = useState({ todayCount: 0, activeLoans: 0, portfolio: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      getDashboard('staff').catch(() => null),
      getTransactions().catch(() => [] as ApiTransaction[]),
      getRiskAlerts().catch(() => [] as ApiRiskAlert[]),
    ]).then(([dashboard, transactions, alerts]) => {
      if (!active) return;

      // Only unresolved alerts are live risk. A resolved row is history: the
      // item value recovered above the threshold on a later day.
      setRiskAlerts(alerts.filter(alert => !alert.resolved).map(toRiskRow));

      const live = transactions.filter(transaction => transaction.status === 'active');

      // Soonest due first, so the loans needing attention sit at the top.
      setUpcomingDue(
        live
          .filter(transaction => transaction.due_date)
          .sort((first, second) => first.due_date.localeCompare(second.due_date))
          .slice(0, 5)
          .map(transaction => ({
            id: String(transaction.transactions_id),
            item: String((transaction.item as { description?: string })?.description || 'Item'),
            customer: String((transaction.customer as { name?: string })?.name || 'Unknown customer'),
            dueDate: new Date(transaction.due_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            daysRemaining: daysUntil(transaction.due_date),
          }))
      );

      const todayKey = new Date().toISOString().slice(0, 10);
      setStats({
        todayCount: transactions.filter(transaction => String((transaction as { created_at?: string }).created_at || '').slice(0, 10) === todayKey).length,
        activeLoans: live.length,
        portfolio: live.reduce((total, transaction) => total + Number(transaction.loan_amount || 0), 0),
      });

      if (dashboard) {
        // The API sends the newest price first, so reverse for a left to right
        // chart. The full window is kept and the range picker trims it.
        setGoldHistory(
          dashboard.gold_prices
            .map(row => row as { price_date?: string; price_per_gram?: number; predicted_next_price?: number | null; source?: string })
            .map(row => ({
              date: String(row.price_date || '').slice(0, 10),
              price: Number(row.price_per_gram),
              predicted: row.predicted_next_price == null ? null : Number(row.predicted_next_price),
              source: row.source === 'api' ? 'api' : 'manual',
            }))
            .filter(point => point.date && Number.isFinite(point.price) && point.price > 0)
            .reverse()
        );
      }

      setLoaded(true);
    });

    return () => { active = false; };
  }, []);

  const handleViewAllAlerts = () => {
    setLoanRiskFilter('High');
    setLoanTab('active');
    go('loans');
  };

  const now = new Date();
  // Newest last. The range picker keeps the tail of the history.
  const goldWindow = goldHistory.slice(-goldRange);
  const latestPoint = goldHistory.length ? goldHistory[goldHistory.length - 1] : null;
  const latestGold = latestPoint ? latestPoint.price : 0;
  const previousGold = goldHistory.length > 1 ? goldHistory[goldHistory.length - 2].price : latestGold;
  const goldChange = previousGold > 0 ? ((latestGold - previousGold) / previousGold) * 100 : 0;
  // Scale each bar against the range in view, so small moves stay readable.
  const windowPrices = goldWindow.map(point => point.price);
  const goldPeak = windowPrices.length ? Math.max(...windowPrices) : 0;
  const goldFloor = windowPrices.length ? Math.min(...windowPrices) : 0;
  const goldSpread = goldPeak - goldFloor;
  const goldAverage = windowPrices.length ? windowPrices.reduce((total, value) => total + value, 0) / windowPrices.length : 0;
  // Newest first for the history table, so the most recent day reads at the top.
  const goldRows = goldWindow.slice().reverse();
  const highRiskCount = riskAlerts.filter(alert => alert.risk === 'High').length;

  return (
    <section className="staff-content staff-dashboard dash-page">
      <div className="dash-hero">
        <div className="dash-hero-copy">
          <small>{longDate(now)}</small>
          <h2>{greetingFor(now.getHours())}, {staffName}</h2>
          <p>Here is today operational overview and live pawn activity.</p>
        </div>
        <div className="dash-hero-actions">
          <IonButton onClick={() => { setLoanTab('active'); go('transaction'); }}>
            <IonIcon icon={walletOutline} slot="start" />New Transaction
          </IonButton>
        </div>
      </div>

      <div className="staff-stats dash-stats">
        <Stat icon={cashOutline} value={loaded ? String(stats.todayCount) : '--'} label="Today transactions" />
        <Stat icon={walletOutline} value={loaded ? String(stats.activeLoans) : '--'} label="Active loans" />
        <Stat icon={warningOutline} value={loaded ? String(riskAlerts.length) : '--'} label="Risk alerts" tone={highRiskCount > 0 ? 'danger' : undefined} />
        <Stat icon={analyticsOutline} value={loaded ? money(stats.portfolio) : '--'} label="Loan portfolio" />
      </div>

      <div className="staff-panel gold-panel">
        <div className="staff-panel-head">
          <div>
            <small>MARKET WATCH</small>
            <h3>Gold price</h3>
          </div>
          <div className="gold-range" role="tablist" aria-label="History range">
            {GOLD_RANGES.map(range => (
              <button
                key={range}
                role="tab"
                aria-selected={goldRange === range}
                className={goldRange === range ? 'active' : ''}
                onClick={() => setGoldRange(range)}
              >
                {range}d
              </button>
            ))}
          </div>
        </div>

        <div className="gold-body">
          <div className="gold-now">
            <small>PRICE TODAY</small>
            <strong>{latestGold > 0 ? money(latestGold) : 'No price'}<i>/gram</i></strong>

            {goldHistory.length > 1 && (
              <span className={goldChange >= 0 ? 'gold-delta up' : 'gold-delta down'}>
                {goldChange >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(goldChange).toFixed(2)}% vs previous day
              </span>
            )}

            <div className="gold-meta">
              <div>
                <span>Recorded</span>
                <strong>{latestPoint ? shortDate(latestPoint.date) : '--'}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong className="gold-source">{latestPoint ? latestPoint.source : '--'}</strong>
              </div>
              <div>
                <span>Forecast next</span>
                <strong>{latestPoint && latestPoint.predicted ? money(latestPoint.predicted) : '--'}</strong>
              </div>
              <div>
                <span>{goldRange}-day average</span>
                <strong>{goldAverage > 0 ? money(goldAverage) : '--'}</strong>
              </div>
            </div>
          </div>

          <div className="gold-chart-wrap">
            <div className="gold-chart-scale" aria-hidden="true">
              <span>{goldPeak > 0 ? money(goldPeak) : ''}</span>
              <span>{goldFloor > 0 ? money(goldFloor) : ''}</span>
            </div>
            <div className="gold-chart" role="img" aria-label={'Gold price over the last ' + goldRange + ' days'}>
              {goldWindow.map(point => (
                <div className="gold-bar" key={point.date} title={shortDate(point.date) + ' - ' + money(point.price)}>
                  <i style={{ height: (goldSpread > 0 ? 14 + ((point.price - goldFloor) / goldSpread) * 82 : 60) + '%' }} />
                  <small>{dayLabel(point.date)}</small>
                </div>
              ))}
              {goldWindow.length === 0 && <p className="risk-empty">{loaded ? 'No gold prices recorded yet.' : 'Loading gold prices...'}</p>}
            </div>
          </div>
        </div>

        <div className="gold-history">
          <div className="gold-history-head">
            <span>Date</span>
            <span>Price / gram</span>
            <span>Change</span>
            <span>Forecast</span>
            <span>Source</span>
          </div>
          <div className="gold-history-scroll">
            {goldRows.map((point, index) => {
              // goldRows is newest first, so the older day sits one index later.
              const earlier = goldRows[index + 1];
              const delta = earlier ? ((point.price - earlier.price) / earlier.price) * 100 : null;
              return (
                <div className="gold-history-row" key={point.date}>
                  <span>{shortDate(point.date)}</span>
                  <strong>{money(point.price)}</strong>
                  {delta === null
                    ? <em className="gold-delta-pill flat">--</em>
                    : <em className={delta >= 0 ? 'gold-delta-pill up' : 'gold-delta-pill down'}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%
                      </em>}
                  <span>{point.predicted ? money(point.predicted) : '--'}</span>
                  <em className={'gold-source-pill ' + point.source}>{point.source}</em>
                </div>
              );
            })}
            {goldRows.length === 0 && <p className="risk-empty">{loaded ? 'No price history yet.' : 'Loading history...'}</p>}
          </div>
        </div>
      </div>

      <TrendSuggestionCard />

      <div className="dashboard-grid">
        <div className="staff-panel dashboard-panel">
          <div className="staff-panel-head">
            <div>
              <small>RISK ALERTS</small>
              <h3>Priority items</h3>
            </div>
            <button onClick={handleViewAllAlerts}>View All</button>
          </div>

          <div className="risk-legend">
            <span><i className="risk-dot high" />High &middot; value below the loan</span>
            <span><i className="risk-dot medium" />Medium &middot; within the safety margin</span>
          </div>

          <div className="dashboard-table">
            <div className="dashboard-table-head">
              <span>Item</span>
              <span>Customer</span>
              <span>Current Value</span>
              <span>Loan Amount</span>
              <span>Risk Level</span>
            </div>

            {riskAlerts.map((alert) => (
              <div className="dashboard-table-row" key={alert.id}>
                <span>{alert.item}</span>
                <span>{alert.customer}</span>
                <span>{alert.currentValue}</span>
                <span>{alert.loanAmount}</span>
                <em className={'risk-pill ' + alert.risk.toLowerCase()}>{alert.risk}</em>
              </div>
            ))}
            {riskAlerts.length === 0 && <p className="risk-empty">{loaded ? 'No unresolved risk alerts. Every active item is above its loan amount plus the safety margin.' : 'Loading risk alerts...'}</p>}
          </div>
        </div>

        <div className="staff-panel dashboard-panel">
          <div className="staff-panel-head">
            <div>
              <small>UPCOMING</small>
              <h3>Due soon</h3>
            </div>
            <button onClick={() => { setLoanRiskFilter('All'); setLoanTab('active'); go('loans'); }}>View All</button>
          </div>

          <div className="dashboard-table compact-table">
            <div className="dashboard-table-head">
              <span>Item</span>
              <span>Customer</span>
              <span>Due Date</span>
              <span>Days</span>
            </div>

            {upcomingDue.map((row) => (
              <div className="dashboard-table-row" key={row.id}>
                <span>{row.item}</span>
                <span>{row.customer}</span>
                <span>{row.dueDate}</span>
                <em className={'due-pill ' + dueTone(row.daysRemaining)}>
                  {row.daysRemaining < 0 ? Math.abs(row.daysRemaining) + 'd late' : row.daysRemaining + 'd'}
                </em>
              </div>
            ))}
            {upcomingDue.length === 0 && <p className="risk-empty">{loaded ? 'No active loans with a due date yet.' : 'Loading loans...'}</p>}
          </div>
        </div>
      </div>
    </section>
  );
};

const Stat: React.FC<{ icon: string; value: string; label: string; tone?: 'danger' }> = ({ icon, value, label, tone }) => (
  <div className={tone ? `staff-stat ${tone}` : 'staff-stat'}>
    <IonIcon icon={icon} />
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  </div>
);

const getCustomerEmail = (customer: any) => customer.email || customer.user?.email || '';

/**
 * The three families of item the pawnshop accepts. The group decides which
 * fields the staff must fill in, how the item is valued, and which interest
 * rate the loan carries.
 */
const ITEM_GROUPS = [
  { value: 'jewelry', label: 'Jewelry', icon: diamondOutline, hint: 'Valued from gold price' },
  { value: 'watch_phone', label: 'Watch or cellphone', icon: hardwareChipOutline, hint: 'Staff appraised' },
  { value: 'bulky', label: 'Bulky item', icon: cubeOutline, hint: 'Staff appraised' },
];

/**
 * Item types per group. The value is what the API stores in items.category.
 */
const ITEM_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  jewelry: [
    { value: 'ring', label: 'Ring' },
    { value: 'necklace', label: 'Necklace' },
    { value: 'bracelet', label: 'Bracelet' },
    { value: 'earrings', label: 'Earrings' },
    { value: 'pendant', label: 'Pendant' },
    { value: 'others', label: 'Others' },
  ],
  watch_phone: [
    { value: 'watch', label: 'Watch' },
    { value: 'cellphone', label: 'Cellphone' },
  ],
  bulky: [
    { value: 'tablet', label: 'Tablet' },
    { value: 'digital_camera', label: 'Digital camera' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'desktop_computer', label: 'Desktop computer' },
    { value: 'notebook_netbook', label: 'Notebook / netbook' },
    { value: 'game_console', label: 'Game console' },
    { value: 'tv', label: 'TV' },
    { value: 'refrigerator', label: 'Refrigerator' },
    { value: 'aircon', label: 'Aircon' },
    { value: 'home_theater', label: 'Home theater' },
    { value: 'karaoke_machine', label: 'Karaoke machine' },
    { value: 'electric_fan', label: 'Electric fan' },
    { value: 'washing_machine', label: 'Washing machine' },
    { value: 'gas_stove', label: 'Gas stove' },
    { value: 'sewing_machine', label: 'Sewing machine' },
    { value: 'oven_toaster', label: 'Oven toaster' },
    { value: 'mixer_blender', label: 'Mixer / blender' },
    { value: 'water_dispenser', label: 'Water dispenser' },
    { value: 'nebulizer', label: 'Nebulizer' },
    { value: 'power_tool', label: 'Power tool' },
  ],
};

/**
 * system_settings key holding the monthly interest rate for a group, in
 * percent. Jewelry and watches or cellphones share one rate; bulky items carry
 * a higher one. These keys and defaults mirror the API.
 */
const INTEREST_RATE_SETTING_KEY: Record<string, string> = {
  jewelry: 'jewelry_watch_phone_rate',
  watch_phone: 'jewelry_watch_phone_rate',
  bulky: 'bulky_item_rate',
};

const DEFAULT_INTEREST_RATE_PERCENT: Record<string, number> = {
  jewelry_watch_phone_rate: 5,
  bulky_item_rate: 6,
};

const groupLabel = (group: string) => ITEM_GROUPS.find(entry => entry.value === group)?.label || group;

/** The four steps of the New Transaction wizard, in order. */
type WizardStep = 1 | 2 | 3 | 4;

const categoryLabel = (group: string, category: string) =>
  (ITEM_CATEGORIES[group] || []).find(entry => entry.value === category)?.label || category;

const NewTransaction: React.FC<{
  appraised: boolean;
  setAppraised: (value: boolean) => void;
  go: (view: View) => void;
  onTransactionCreated: (message: string) => void;
}> = ({ go, onTransactionCreated }) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [newCustomerDraft, setNewCustomerDraft] = useState({
    fullName: '',
    contactNumber: '',
    address: '',
    validIdType: 'National ID',
    validIdNumber: '',
    email: '',
    // Data URL of the picked ID, so it survives into the saved customer.
    validIdPhoto: '',
  });
  const [customerForm, setCustomerForm] = useState({
    fullName: '',
    contactNumber: '',
    address: '',
    validIdType: 'National ID',
    validIdNumber: '',
    email: '',
    validIdPhoto: '',
    customersId: undefined as number | undefined,
  });
  const [itemForm, setItemForm] = useState({
    group: 'jewelry',
    category: 'ring',
    itemDescription: '',
    brandModel: '',
    karat: '18k',
    weight: '',
    // Typed in by the staff for the watch_phone and bulky groups, which have no
    // gold price to compute a value from.
    manualAppraisedValue: '',
    condition: 'Good',
    remarks: '',
  });
  const [adjustedValue, setAdjustedValue] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // Item photos stay on the client: the quality check is advice for the staff
  // taking the photo, so it runs before anything is sent anywhere.
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Which of the four steps is on screen. All form state lives above this, so
  // moving back and forth never loses what the staff already typed.
  const [step, setStep] = useState<WizardStep>(1);

  // Set once the transaction is created. Its presence swaps the wizard for the
  // success screen, which still reads the form state so the ticket can be
  // reprinted without another API call.
  const [createdTicket, setCreatedTicket] = useState('');

  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [systemSettings, setSystemSettings] = useState<any>(null);
  const [currentGoldPriceOverride, setCurrentGoldPriceOverride] = useState<number | null>(null);


  // Load the shop settings and the gold price history on mount.
  //
  // The two are fetched independently on purpose. They used to share one
  // Promise.all, so a failure on either request left both unset and the
  // jewelry value silently stayed at zero. Settled results keep whichever
  // request succeeded and report only the one that did not.
  React.useEffect(() => {
    let cancelled = false;

    const loadPricingInputs = async () => {
      const [settingsResult, pricesResult] = await Promise.allSettled([
        getSystemSettings(),
        getGoldPrices(),
      ]);
      if (cancelled) return;

      if (settingsResult.status === 'fulfilled') {
        const response = settingsResult.value as any;
        // The API returns setting rows; the form reads them by key.
        const settings = Array.isArray(response)
          ? Object.fromEntries(response.map((row: any) => [row.setting_key, row.setting_value]))
          : response;
        setSystemSettings(settings);
      } else {
        console.warn('Could not load shop settings', settingsResult.reason);
      }

      if (pricesResult.status === 'fulfilled') {
        const response = pricesResult.value as any;
        const prices = Array.isArray(response) ? response : [response];
        // Take the newest recorded day rather than the last array element, so
        // the value does not depend on the order the API happened to send.
        const latestPrice = prices
          .filter((row: any) => row && Number(row.price_per_gram) > 0)
          .sort((a: any, b: any) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime())
          .pop();
        if (latestPrice) setCurrentGoldPriceOverride(Number(latestPrice.price_per_gram));
      } else {
        console.warn('Could not load gold prices', pricesResult.reason);
      }
    };

    loadPricingInputs();
    return () => { cancelled = true; };
  }, []);

  // Customer search handler
  const handleCustomerSearch = async (searchTerm: string) => {
    setCustomerSearch(searchTerm);
    if (searchTerm.trim().length < 2) {
      setShowCustomerResults(false);
      setSearchResults([]);
      return;
    }

    setLoadingSearch(true);
    try {
      const results = await searchCustomers(searchTerm);
      setSearchResults(Array.isArray(results) ? results : [results]);
      setShowCustomerResults(true);
    } catch (error) {
      console.warn('Could not search customers', error);
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const karatPurityMap: Record<string, number> = {
    '10k': purityForKarat('10k'), '14k': purityForKarat('14k'), '18k': purityForKarat('18k'), '21k': purityForKarat('21k'), '24k': purityForKarat('24k'),
  };

  // Only jewelry is valued from the gold price. A watch, cellphone, or bulky
  // item is worth what the appraising staff says it is worth.
  const isJewelry = itemForm.group === 'jewelry';

  // Today's gold price, from the recorded prices first and the configured
  // fallback second. Nothing is assumed when neither is available.
  const currentGoldPrice = currentGoldPriceOverride ?? Number(systemSettings?.current_gold_price ?? 0);
  const weightValue = Number(itemForm.weight || 0);
  const computedValue = isJewelry && weightValue > 0 ? calculateAppraisal(weightValue, itemForm.karat, currentGoldPrice) : 0;
  const manualValue = Number(itemForm.manualAppraisedValue || 0);
  // The one value the loan is worked out from, whichever path produced it.
  const itemValue = isJewelry ? computedValue : manualValue;
  const ltvPercent = Number(systemSettings?.default_loan_to_value ?? 0);
  const loanAmount = itemValue > 0 ? itemValue * (ltvPercent / 100) : 0;
  const dueDate = new Date();
  const loanTermDays = Number(systemSettings?.loan_term_days ?? 0);
  dueDate.setDate(dueDate.getDate() + Number(loanTermDays));
  const dueDateLabel = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const gracePeriodDays = Number(systemSettings?.grace_period_days ?? 0);
  // The rate follows the item group, so the staff never types it in. Jewelry
  // and watches or cellphones share the lower rate, bulky items the higher one.
  const interestRateSettingKey = INTEREST_RATE_SETTING_KEY[itemForm.group];
  const interestRatePercent = Number(
    systemSettings?.[interestRateSettingKey] ?? DEFAULT_INTEREST_RATE_PERCENT[interestRateSettingKey]
  );
  // Every policy number above comes from system_settings. Until those load
  // the form has nothing to compute with, so it says so instead of guessing.
  const settingsReady = Boolean(systemSettings) && ltvPercent > 0 && loanTermDays > 0;
  const effectiveAdjustedValue = Number(adjustedValue || itemValue || 0);
  const effectiveLoanAmount = effectiveAdjustedValue > 0 ? effectiveAdjustedValue * (ltvPercent / 100) : loanAmount;

  // One monthly interest payment, shown on the Loan Details step so the staff
  // can quote it without opening a calculator. The API is still the authority
  // on what is actually owed at redemption.
  const monthlyInterest = effectiveLoanAmount * (interestRatePercent / 100);

  const printPawnTicket = (ticketNumber: string) => {
    if (typeof window === 'undefined') return;

    const ticketHtml = `
      <html>
        <head>
          <title>${ticketNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #061028; margin: 32px; }
            .ticket { max-width: 680px; margin: 0 auto; border: 2px solid #061028; border-radius: 16px; padding: 24px; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #d4a72c; padding-bottom: 12px; margin-bottom: 16px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
            .meta div { border: 1px solid #dfe7f0; border-radius: 8px; padding: 10px 12px; }
            .label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #52627b; }
            .value { display: block; margin-top: 6px; font-size: 18px; font-weight: 700; }
            .qr { width: 120px; height: 120px; border: 1px solid #061028; display: grid; place-items: center; margin-top: 16px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <div>
                <div style="font-size: 12px; letter-spacing: .2em; font-weight: 800; color: #52627b;">SMARTPAWN</div>
                <div style="font-size: 28px; font-weight: 800; margin-top: 6px;">PAWN TICKET</div>
              </div>
              <div style="text-align: right;">
                <div class="label">Ticket</div>
                <div style="font-size: 24px; font-weight: 800;">${ticketNumber}</div>
              </div>
            </div>

            <div class="meta">
              <div><span class="label">Customer</span><span class="value">${customerForm.fullName || 'Walk-in Customer'}</span></div>
              <div><span class="label">Status</span><span class="value">Active</span></div>
              <div><span class="label">Item</span><span class="value">${itemForm.itemDescription || categoryLabel(itemForm.group, itemForm.category)}</span></div>
              <div><span class="label">Loan Amount</span><span class="value">₱${effectiveLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
              <div><span class="label">Appraised Value</span><span class="value">₱${effectiveAdjustedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
              <div><span class="label">Due Date</span><span class="value">${dueDateLabel}</span></div>
            </div>

            <div class="qr">QR</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=820,height=980');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const handleConfirmAndGenerate = async () => {
    setErrors({});
    const newErrors: Record<string, string> = {};

    // Validation
    if (!customerForm.fullName.trim()) newErrors.fullName = 'Customer name is required';
    // A customer registered here receives the activation link, and later every
    // password reset link, at this address. A missing or malformed one leaves
    // an account nobody can ever sign in to or recover.
    if (!customerForm.customersId && !EMAIL_PATTERN.test(customerForm.email.trim())) {
      newErrors.email = 'A working email address is required. Activation and password reset links are sent to it.';
    }
    if (!settingsReady) newErrors.submit = 'Shop settings have not loaded yet. Reload before creating a transaction.';
    if (isJewelry && currentGoldPrice <= 0) newErrors.weight = 'No gold price recorded yet, so a jewelry value cannot be computed.';
    if (isJewelry) {
      if (!itemForm.weight || Number(itemForm.weight) <= 0) newErrors.weight = 'Item weight is required';
      else if (computedValue <= 0) newErrors.weight = 'Could not compute value';
    } else {
      if (!itemForm.brandModel.trim()) newErrors.brandModel = 'Brand/model is required';
      if (!itemForm.manualAppraisedValue || manualValue <= 0) newErrors.manualAppraisedValue = 'Appraised value is required';
    }
    if (adjustedValue && Number(adjustedValue) !== itemValue && !adjustmentReason.trim()) {
      newErrors.adjustmentReason = 'Reason is required when adjusting value';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setSuccessMessage('');

    try {
      let apiCustomerId: number | undefined;

      // Check if customer already exists or create new one
      if (customerForm.customersId) {
        apiCustomerId = customerForm.customersId;
      } else {
        // Try to find existing customer by email or create new one
        try {
          const existingCustomers = await getCustomers();
          const matched = (existingCustomers || []).find((c: any) =>
            c.name.toLowerCase() === customerForm.fullName.toLowerCase() ||
            (getCustomerEmail(c) && customerForm.email && getCustomerEmail(c).toLowerCase() === customerForm.email.toLowerCase())
          );

          if (matched) {
            apiCustomerId = matched.customers_id;
          } else {
            // Create new customer
            const newCustomer = await createCustomer({
              name: customerForm.fullName.trim(),
              email: customerForm.email.trim(),
              contact_number: customerForm.contactNumber.trim(),
              address: customerForm.address.trim(),
              valid_id_type: customerForm.validIdType,
              valid_id_number: customerForm.validIdNumber.trim(),
            });
            apiCustomerId = (newCustomer as any).customers_id;
            setSuccessMessage('Customer registered — activation email sent to ' + getCustomerEmail(newCustomer));
          }
        } catch (customerError: any) {
          newErrors.fullName = customerError?.message || 'Failed to create/find customer';
          setErrors(newErrors);
          setLoading(false);
          // Send the staff back to the step that owns the failing field.
          setStep(1);
          return;
        }
      }

      // The API creates the item and transaction together.
      try {
        // The API resolves the interest rate from the item group itself, so it
        // is not part of the payload. Gold fields are sent for jewelry only;
        // brand/model and the typed value are sent for the other two groups.
        const transactionPayload = {
          customer_id: apiCustomerId,
          group: itemForm.group,
          category: itemForm.category,
          description: itemForm.itemDescription || `${categoryLabel(itemForm.group, itemForm.category)} item`,
          brand_model: isJewelry ? null : itemForm.brandModel.trim(),
          karat: isJewelry ? itemForm.karat.toLowerCase() : null,
          weight_grams: isJewelry ? Number(itemForm.weight) : null,
          appraised_value: isJewelry ? null : manualValue,
          condition: itemForm.condition.toLowerCase(),
          loan_amount: Number(adjustedValue || itemValue) * (ltvPercent / 100),
          loan_to_value_percent: ltvPercent,
          due_date: dueDate.toISOString().split('T')[0],
          grace_period_days: Number(gracePeriodDays || 7),
          adjusted_value: adjustedValue ? Number(adjustedValue) : null,
          adjustment_reason: adjustmentReason.trim() || null,
        };
        const createdTransaction = await createTransaction(transactionPayload);
        const ticketNumber = (createdTransaction as any).ticket_number;

        // Generate pawn ticket
        printPawnTicket(ticketNumber);

        setSuccessMessage('Transaction created successfully!');
        onTransactionCreated(`Transaction ${ticketNumber} created successfully.`);
        // The success screen replaces the wizard and keeps the ticket number on
        // screen, so the staff can print, open the loan, or start the next one.
        setCreatedTicket(ticketNumber);
      } catch (transactionError: any) {
        newErrors.submit = transactionError?.message || 'Failed to create transaction';
        setErrors(newErrors);
      }
    } catch (error: any) {
      setErrors({ submit: error?.message || 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check every picked photo, then attach it whatever the verdict.
   *
   * The check is advice. A blurry photo still attaches, because a walk-in
   * transaction must not wait on a retake.
   */
  const attachPhotos = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const attached: AttachedPhoto[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      file,
      quality: null,
      checking: true,
      dismissed: false,
    }));

    setPhotos(current => [...current, ...attached]);

    await Promise.all(attached.map(async (photo) => {
      const quality = await checkPhotoQuality(photo.file);
      setPhotos(current => current.map(entry => (entry.id === photo.id ? { ...entry, quality, checking: false } : entry)));
    }));
  };

  /** Drop the photo and reopen the picker, which is what the retake prompt does. */
  const retakePhoto = (photoId: string) => {
    setPhotos(current => current.filter(photo => photo.id !== photoId));
    photoInputRef.current?.click();
  };

  /** Keep a photo the check complained about, and stop showing the warning. */
  const keepPhoto = (photoId: string) => {
    setPhotos(current => current.map(photo => (photo.id === photoId ? { ...photo, dismissed: true } : photo)));
  };

  /**
   * Read a picked ID photo into a downscaled data URL.
   *
   * The API stores valid_id_photo as a plain string, so the file travels as
   * text rather than as multipart form data. A full size phone photo would run
   * to several megabytes of base64, so it is scaled down before it is sent.
   */
  const readIdPhoto = (file: File | undefined, apply: (dataUrl: string) => void) => {
    if (!file) return;
    void readImageAsScaledDataUrl(file).then(apply).catch(() => undefined);
  };

  const handleCancel = () => {
    setErrors({});
    setSuccessMessage('');
    go('loans');
  };

  /** Clear every field and return to step one, for the next walk-in customer. */
  const startNewTransaction = () => {
    setCustomerForm({ fullName: '', contactNumber: '', address: '', validIdType: 'National ID', validIdNumber: '', email: '', validIdPhoto: '', customersId: undefined });
    setItemForm({ group: 'jewelry', category: 'ring', itemDescription: '', brandModel: '', karat: '18k', weight: '', manualAppraisedValue: '', condition: 'Good', remarks: '' });
    setAdjustedValue('');
    setAdjustmentReason('');
    setPhotos([]);
    setCustomerSearch('');
    setSearchResults([]);
    setShowCustomerResults(false);
    setErrors({});
    setSuccessMessage('');
    setCreatedTicket('');
    setStep(1);
  };

  const selectCustomer = (customer: any) => {
    setCustomerForm({
      fullName: customer.name,
      contactNumber: customer.contact_number || customer.contact || '',
      address: customer.address || '',
      validIdType: customer.valid_id_type || 'National ID',
      validIdNumber: customer.valid_id_number || customer.validIdNumber || '',
      email: getCustomerEmail(customer),
      validIdPhoto: customer.valid_id_photo || '',
      customersId: customer.customers_id,
    });
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  const saveNewCustomer = async () => {
    const { fullName, contactNumber, address, validIdType, validIdNumber, email, validIdPhoto } = newCustomerDraft;
    const formErrors: Record<string, string> = {};

    if (!fullName.trim()) formErrors.fullName = 'Full name is required';
    if (!email.trim()) formErrors.email = 'Email is required';

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setLoading(true);
    try {
      const createdCustomer = await createCustomer({
        name: fullName.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
        address: address.trim(),
        valid_id_type: validIdType,
        valid_id_number: validIdNumber.trim(),
        valid_id_photo: validIdPhoto || null,
      });

      setCustomerForm({
        fullName: createdCustomer.name,
        contactNumber: createdCustomer.contact_number || '',
        address: createdCustomer.address || '',
        validIdType: createdCustomer.valid_id_type || 'National ID',
        validIdNumber: createdCustomer.valid_id_number || '',
        email: getCustomerEmail(createdCustomer),
        // Carry the photo just uploaded, so the main form shows it already filled.
        validIdPhoto: createdCustomer.valid_id_photo || validIdPhoto || '',
        customersId: (createdCustomer as any).customers_id,
      });

      setSuccessMessage(createdCustomer.activation_email_sent === false
        ? 'Customer registered, but the activation email could not be sent. Check the API mail log.'
        : `Customer registered — activation email sent to ${getCustomerEmail(createdCustomer)}`);
      setCustomerSearch(createdCustomer.name);
      setShowCustomerResults(false);
      setNewCustomerDraft({
        fullName: '',
        contactNumber: '',
        address: '',
        validIdType: 'National ID',
        validIdNumber: '',
        email: '',
        validIdPhoto: '',
      });
      setIsCustomerModalOpen(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrors({ submit: error?.message || 'Failed to create customer' });
    } finally {
      setLoading(false);
    }
  };

  const updateCustomerForm = (field: keyof typeof customerForm, value: string) => {
    setCustomerForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const updated = { ...current };
        delete updated[field];
        return updated;
      });
    }
  };

  const updateItemForm = (field: keyof typeof itemForm, value: string) => {
    setItemForm((current) => {
      // Each group has its own item types, so a category from the previous
      // group would no longer be valid. Fall back to the new group's first type.
      if (field === 'group') {
        return { ...current, group: value, category: ITEM_CATEGORIES[value][0].value };
      }
      return { ...current, [field]: value };
    });
    if (errors[field]) {
      setErrors((current) => {
        const updated = { ...current };
        delete updated[field];
        return updated;
      });
    }
  };

  // What each step needs before Next is allowed. The same conditions are
  // re-checked by handleConfirmAndGenerate, which stays the last word.
  const customerStepValid = Boolean(customerForm.fullName.trim()) && (Boolean(customerForm.customersId) || EMAIL_PATTERN.test(customerForm.email.trim()));
  const adjustmentNeedsReason = Boolean(adjustedValue) && Number(adjustedValue) !== itemValue && !adjustmentReason.trim();
  const itemStepValid =
    settingsReady &&
    itemValue > 0 &&
    !adjustmentNeedsReason &&
    (isJewelry
      ? currentGoldPrice > 0 && weightValue > 0
      : Boolean(itemForm.brandModel.trim()) && manualValue > 0);
  const loanStepValid = settingsReady && effectiveLoanAmount > 0;

  const stepValid: Record<WizardStep, boolean> = {
    1: customerStepValid,
    2: itemStepValid,
    3: loanStepValid,
    4: customerStepValid && itemStepValid && loanStepValid,
  };

  const steps: Array<{ id: WizardStep; label: string; hint: string }> = [
    { id: 1, label: 'Customer', hint: 'Who is pawning' },
    { id: 2, label: 'Item & Value', hint: 'What is pawned' },
    { id: 3, label: 'Loan Details', hint: 'Terms & due date' },
    { id: 4, label: 'Review', hint: 'Confirm & print' },
  ];

  const goNext = () => setStep((current) => (current < 4 ? ((current + 1) as WizardStep) : current));
  const goBack = () => setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current));

  // Every validation error, collected once instead of a banner per field.
  const errorList = Object.entries(errors).map(([field, message]) => ({ field, message }));

  // ---------------------------------------------------------------- success --
  if (createdTicket) {
    return (
      <section className="staff-content tx-page">
        <div className="tx-success">
          <span className="tx-success-mark"><IonIcon icon={checkmarkCircle} /></span>
          <h2>Transaction complete</h2>
          <p>The pawn ticket has been created and the item is now active.</p>

          <div className="tx-success-ticket">
            <small>REFERENCE NUMBER</small>
            <strong>{createdTicket}</strong>
          </div>

          <div className="tx-success-figures">
            <div><span>Customer</span><strong>{customerForm.fullName || 'Walk-in Customer'}</strong></div>
            <div><span>Item</span><strong>{itemForm.itemDescription || categoryLabel(itemForm.group, itemForm.category)}</strong></div>
            <div className="highlight"><span>Loan amount</span><strong>{money(effectiveLoanAmount)}</strong></div>
            <div><span>Due date</span><strong>{dueDateLabel}</strong></div>
          </div>

          <div className="tx-success-actions">
            <button type="button" className="primary-button" onClick={() => printPawnTicket(createdTicket)}>
              <IonIcon icon={documentTextOutline} />Print Pawn Ticket
            </button>
            <button type="button" className="secondary-button" onClick={() => go('loans')}>
              <IonIcon icon={cashOutline} />View Transaction
            </button>
            <button type="button" className="secondary-button" onClick={startNewTransaction}>
              <IonIcon icon={personAddOutline} />New Transaction
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ----------------------------------------------------------------- wizard --
  return (
    <section className="staff-content tx-page tx-wizard">
      <div className="tx-hero compact">
        <div className="tx-hero-copy">
          <span className="tx-hero-eyebrow"><IonIcon icon={sparklesOutline} />OPERATIONS</span>
          <h2>New Transaction</h2>
        </div>
        <div className="tx-hero-price">
          <small>GOLD PRICE TODAY</small>
          <strong>{money(currentGoldPrice)}<i>/gram</i></strong>
          <span><IonIcon icon={trendingUpOutline} />Used for jewelry valuation</span>
        </div>
      </div>

      <ol className="tx-steps compact">
        {steps.map((entry) => (
          <li
            key={entry.id}
            className={`${entry.id < step ? 'done' : ''} ${entry.id === step ? 'active' : ''}`}
          >
            <span className="tx-step-node">{entry.id < step ? <IonIcon icon={checkmarkOutline} /> : entry.id}</span>
            <span className="tx-step-text"><strong>{entry.label}</strong><small>{entry.hint}</small></span>
          </li>
        ))}
      </ol>

      {errorList.length > 0 && (
        <div className="tx-alert error" role="alert">
          <IonIcon icon={alertCircleOutline} />
          <div>
            <strong>Fix {errorList.length} {errorList.length === 1 ? 'item' : 'items'} before continuing</strong>
            <ul>{errorList.map((entry) => <li key={entry.field}>{entry.message}</li>)}</ul>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="tx-alert success" role="status">
          <IonIcon icon={checkmarkCircle} />
          <div><strong>{successMessage}</strong></div>
        </div>
      )}

      <div className="staff-panel tx-compact-form tx-step-panel">
        {/* ---------------------------------------------- step 1: customer -- */}
        {step === 1 && (
          <div className="form-section">
            <div className="section-title-row">
              <h3><span className="tx-step-badge">1</span>Customer</h3>
              <button type="button" className="mini-flat-button" onClick={() => setIsCustomerModalOpen(true)}>
                <IonIcon icon={personAddOutline} />Add New Customer
              </button>
            </div>

            <div className="search-field-wrap tx-search">
              <IonIcon className="tx-search-icon" icon={searchOutline} aria-hidden="true" />
              <IonInput
                value={customerSearch}
                placeholder="Search customer by name/contact number"
                onIonInput={(event) => handleCustomerSearch(event.detail.value || '')}
              />

              {loadingSearch && <div className="lookup-dropdown"><span style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>Searching...</span></div>}

              {showCustomerResults && searchResults.length > 0 && (
                <div className="lookup-dropdown" role="listbox">
                  {searchResults.map((customer) => (
                    <button
                      key={customer.customers_id || customer.id}
                      type="button"
                      className="lookup-item"
                      onClick={() => selectCustomer(customer)}
                    >
                      <strong>{customer.name}</strong>
                      <span>{customer.contact_number || customer.contact || customer.email}</span>
                    </button>
                  ))}
                </div>
              )}

              {showCustomerResults && searchResults.length === 0 && !loadingSearch && customerSearch.trim().length > 0 && (
                <div className="lookup-dropdown"><span style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>No customers found</span></div>
              )}
            </div>

            {customerForm.fullName && (
              <div className="tx-selected-chip">
                <IonIcon icon={checkmarkCircle} />
                <div><strong>{customerForm.fullName}</strong><small>{customerForm.contactNumber || 'No contact number on file'}</small></div>
              </div>
            )}

            {customerForm.fullName && (
              <div className="form-grid two-col">
                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Full Name</IonLabel>
                  <IonInput
                    value={customerForm.fullName}
                    onIonInput={(event) => updateCustomerForm('fullName', event.detail.value || '')}
                    placeholder="Full Name"
                  />
                </IonItem>

                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Contact Number</IonLabel>
                  <IonInput
                    type="tel"
                    value={customerForm.contactNumber}
                    onIonInput={(event) => updateCustomerForm('contactNumber', event.detail.value || '')}
                    placeholder="09XXXXXXXXX"
                  />
                </IonItem>

                <IonItem lines="none" className="tx-field span-2">
                  <IonLabel position="stacked">Address</IonLabel>
                  <IonInput
                    value={customerForm.address}
                    onIonInput={(event) => updateCustomerForm('address', event.detail.value || '')}
                    placeholder="Full address"
                  />
                </IonItem>

                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Valid ID Type</IonLabel>
                  <IonSelect
                    interface="popover"
                    value={customerForm.validIdType}
                    onIonChange={(event) => updateCustomerForm('validIdType', event.detail.value)}
                  >
                    <IonSelectOption value="National ID">National ID</IonSelectOption>
                    <IonSelectOption value="Driver's License">Driver's License</IonSelectOption>
                    <IonSelectOption value="Passport">Passport</IonSelectOption>
                  </IonSelect>
                </IonItem>

                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Valid ID Number</IonLabel>
                  <IonInput
                    value={customerForm.validIdNumber}
                    onIonInput={(event) => updateCustomerForm('validIdNumber', event.detail.value || '')}
                    placeholder="Valid ID Number"
                  />
                </IonItem>

                <label className="file-input tx-field">
                  <span>Valid ID Photo</span>
                  {customerForm.validIdPhoto ? (
                    // Filled in from the customer just added, or from the one
                    // picked in search. Staff can still replace it here.
                    <div className="id-photo-filled">
                      <img src={customerForm.validIdPhoto} alt="Valid ID on file" />
                      <div>
                        <strong><IonIcon icon={checkmarkCircle} />On file</strong>
                        <button
                          type="button"
                          onClick={() => updateCustomerForm('validIdPhoto', '')}
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) => readIdPhoto(
                        event.target.files?.[0],
                        (dataUrl) => updateCustomerForm('validIdPhoto', dataUrl)
                      )}
                    />
                  )}
                </label>

                <IonItem lines="none" className="tx-field span-2">
                  <IonLabel position="stacked">Email</IonLabel>
                  <IonInput
                    type="email"
                    value={customerForm.email}
                    onIonInput={(event) => updateCustomerForm('email', event.detail.value || '')}
                    placeholder="customer@email.com"
                  />
                </IonItem>
              </div>
            )}

            {!customerForm.fullName && (
              <p className="tx-step-hint">Search for an existing customer, or add a new one to continue.</p>
            )}

            {!!customerForm.fullName && !customerForm.customersId && !EMAIL_PATTERN.test(customerForm.email.trim()) && (
              <p className="tx-step-hint">An email address is required. The activation link, and every later password reset link, is sent to it.</p>
            )}
          </div>
        )}

        {/* ------------------------------------------- step 2: item & value -- */}
        {step === 2 && (
          <div className="form-section">
            <h3><span className="tx-step-badge">2</span>Item &amp; Value</h3>

            <div className="tx-group-picker" role="radiogroup" aria-label="Item group">
              {ITEM_GROUPS.map(group => (
                <button
                  key={group.value}
                  type="button"
                  role="radio"
                  aria-checked={itemForm.group === group.value}
                  className={itemForm.group === group.value ? 'active' : ''}
                  onClick={() => updateItemForm('group', group.value)}
                >
                  <IonIcon icon={group.icon} />
                  <strong>{group.label}</strong>
                  <small>{group.hint}</small>
                </button>
              ))}
            </div>

            <div className="form-grid two-col">
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Item Type</IonLabel>
                <IonSelect
                  interface="popover"
                  value={itemForm.category}
                  onIonChange={(event) => updateItemForm('category', event.detail.value)}
                >
                  {(ITEM_CATEGORIES[itemForm.group] || []).map(category => (
                    <IonSelectOption key={category.value} value={category.value}>{category.label}</IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Condition</IonLabel>
                <IonSelect
                  interface="popover"
                  value={itemForm.condition}
                  onIonChange={(event) => updateItemForm('condition', event.detail.value)}
                >
                  <IonSelectOption value="Good">Good</IonSelectOption>
                  <IonSelectOption value="Fair">Fair</IonSelectOption>
                  <IonSelectOption value="Damaged">Damaged</IonSelectOption>
                </IonSelect>
              </IonItem>

              <IonItem lines="none" className="tx-field span-2">
                <IonLabel position="stacked">Item Description</IonLabel>
                <IonInput
                  value={itemForm.itemDescription}
                  onIonInput={(event) => updateItemForm('itemDescription', event.detail.value || '')}
                  placeholder={isJewelry ? 'e.g. Wedding ring with heart design' : 'e.g. With charger and original box'}
                />
              </IonItem>

              {isJewelry ? (
                <>
                  <IonItem lines="none" className="tx-field">
                    <IonLabel position="stacked">Karat/Purity</IonLabel>
                    <IonSelect
                      interface="popover"
                      value={itemForm.karat}
                      onIonChange={(event) => updateItemForm('karat', event.detail.value)}
                    >
                      <IonSelectOption value="10k">10k</IonSelectOption>
                      <IonSelectOption value="14k">14k</IonSelectOption>
                      <IonSelectOption value="18k">18k</IonSelectOption>
                      <IonSelectOption value="21k">21k</IonSelectOption>
                      <IonSelectOption value="24k">24k</IonSelectOption>
                    </IonSelect>
                  </IonItem>

                  <IonItem lines="none" className="tx-field">
                    <IonLabel position="stacked">Weight</IonLabel>
                    <IonInput
                      type="number"
                      value={itemForm.weight}
                      onIonInput={(event) => updateItemForm('weight', event.detail.value || '')}
                      placeholder="e.g. 5.25"
                    />
                  </IonItem>
                </>
              ) : (
                <>
                  <IonItem lines="none" className="tx-field">
                    <IonLabel position="stacked">Brand/Model</IonLabel>
                    <IonInput
                      value={itemForm.brandModel}
                      onIonInput={(event) => updateItemForm('brandModel', event.detail.value || '')}
                      placeholder={itemForm.group === 'bulky' ? 'e.g. LG 1.5HP' : 'e.g. Samsung A54'}
                    />
                  </IonItem>

                  <IonItem lines="none" className="tx-field">
                    <IonLabel position="stacked">Appraised Value</IonLabel>
                    <IonInput
                      type="number"
                      value={itemForm.manualAppraisedValue}
                      onIonInput={(event) => updateItemForm('manualAppraisedValue', event.detail.value || '')}
                      placeholder="₱0.00"
                    />
                  </IonItem>
                </>
              )}
            </div>

            <div className={`tx-value-hero ${itemValue > 0 ? 'filled' : ''}`}>
              <div className="tx-value-main">
                <small>{isJewelry ? 'COMPUTED VALUE' : 'APPRAISED VALUE'}</small>
                <strong>{money(itemValue)}</strong>
                {isJewelry ? (
                  <span className="tx-value-formula">
                    {itemForm.weight || '0'} g <i>x</i> {itemForm.karat} purity {((karatPurityMap[itemForm.karat] || 0) * 100).toFixed(1)}% <i>x</i> {money(currentGoldPrice)}/g
                  </span>
                ) : (
                  <span className="tx-value-formula">Staff appraised · {itemForm.brandModel || categoryLabel(itemForm.group, itemForm.category)}</span>
                )}
              </div>

              <div className="tx-value-split">
                <div>
                  <span>Loan-to-Value</span>
                  <strong>{ltvPercent}%</strong>
                  <div className="tx-ltv-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ltvPercent)}%` }} /></div>
                </div>
                <div>
                  <span>Loan Amount</span>
                  <strong className="tx-value-loan">{money(effectiveLoanAmount)}</strong>
                </div>
              </div>
            </div>

            <div className="form-grid two-col value-override-grid">
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Adjusted Value</IonLabel>
                <IonInput
                  type="number"
                  value={adjustedValue || itemValue.toString()}
                  onIonInput={(event) => setAdjustedValue(event.detail.value || '')}
                  placeholder="₱0.00"
                />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Reason for Adjustment</IonLabel>
                <IonInput
                  value={adjustmentReason}
                  onIonInput={(event) => setAdjustmentReason(event.detail.value || '')}
                  placeholder="Item has scratches, deducted 5%"
                />
              </IonItem>

              <div className="tx-field tx-photo-field">
                <label className="file-input">
                  <span>Item Photo(s)</span>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    onChange={(event) => {
                      void attachPhotos(event.target.files);
                      // Clear the picker so re-picking the same file after a
                      // retake still fires a change event.
                      event.target.value = '';
                    }}
                  />
                </label>

                {photos.map((photo) => {
                  const failed = !!photo.quality && !photo.quality.ok;

                  return (
                    <div className={`tx-photo-row ${failed && !photo.dismissed ? 'warn' : ''}`} key={photo.id}>
                      <div className="tx-photo-name">
                        <strong>{photo.name}</strong>
                        <small>
                          {photo.checking
                            ? 'Checking photo quality...'
                            : photo.quality
                              ? `Brightness ${Math.round(photo.quality.brightness * 100)}% · Sharpness ${Math.round(photo.quality.sharpness)}`
                              : 'Attached. This browser could not check the photo.'}
                        </small>
                      </div>

                      {failed && !photo.dismissed && (
                        <div className="tx-photo-warning">
                          <p>{photo.quality?.warning}</p>
                          <div className="tx-photo-actions">
                            <button type="button" className="secondary-button" onClick={() => retakePhoto(photo.id)}>Retake photo</button>
                            <button type="button" className="tx-photo-keep" onClick={() => keepPhoto(photo.id)}>Attach anyway</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Remarks</IonLabel>
                <IonInput
                  value={itemForm.remarks}
                  onIonInput={(event) => updateItemForm('remarks', event.detail.value || '')}
                  placeholder="Optional notes sa staff"
                />
              </IonItem>
            </div>

            {!settingsReady && <p className="tx-step-hint">Shop settings are still loading. Values cannot be computed yet.</p>}
          </div>
        )}

        {/* ------------------------------------------ step 3: loan details -- */}
        {step === 3 && (
          <div className="form-section">
            <h3><span className="tx-step-badge">3</span>Loan Details</h3>

            <div className="tx-loan-chips">
              <div className="tx-loan-chip gold">
                <IonIcon icon={cashOutline} />
                <span>Loan amount</span>
                <strong>{money(effectiveLoanAmount)}</strong>
              </div>
              <div className="tx-loan-chip">
                <IonIcon icon={pricetagOutline} />
                <span>Interest</span>
                <strong>{interestRatePercent}% / month</strong>
              </div>
              <div className="tx-loan-chip">
                <IonIcon icon={calendarOutline} />
                <span>Due date</span>
                <strong>{dueDateLabel}</strong>
              </div>
              <div className="tx-loan-chip">
                <IonIcon icon={refreshOutline} />
                <span>Grace period</span>
                <strong>{gracePeriodDays} days</strong>
              </div>
            </div>

            <div className="form-grid two-col loan-grid">
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Appraised Value</IonLabel>
                <IonInput value={`₱${effectiveAdjustedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Loan-to-Value %</IonLabel>
                <IonInput value={`${ltvPercent}%`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Loan Amount</IonLabel>
                <IonInput value={`₱${effectiveLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Interest Rate</IonLabel>
                <IonInput value={`${interestRatePercent}% / month (${groupLabel(itemForm.group)})`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Monthly Interest</IonLabel>
                <IonInput value={`₱${monthlyInterest.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Loan Term / Due Date</IonLabel>
                <IonInput value={`${loanTermDays} days · ${dueDateLabel}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Grace Period</IonLabel>
                <IonInput value={`${gracePeriodDays} days`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Payable on Redemption</IonLabel>
                <IonInput value={`₱${(effectiveLoanAmount + monthlyInterest).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>
            </div>

            <p className="tx-step-hint">
              These terms come from the shop settings and the item group. The exact amount owed at
              redemption is computed by the system on the day the customer pays.
            </p>
          </div>
        )}

        {/* ------------------------------------------------ step 4: review -- */}
        {step === 4 && (
          <div className="form-section">
            <h3><span className="tx-step-badge">4</span>Review</h3>

            <div className="tx-summary-grid">
              <div className="tx-summary-card">
                <div className="tx-summary-title">Customer</div>
                <div className="tx-summary-list">
                  <div><span>Name</span><strong>{customerForm.fullName || 'Walk-in Customer'}</strong></div>
                  <div><span>Contact</span><strong>{customerForm.contactNumber || 'N/A'}</strong></div>
                  <div><span>Address</span><strong>{customerForm.address || 'N/A'}</strong></div>
                  <div><span>Valid ID</span><strong>{customerForm.validIdType} · {customerForm.validIdNumber || 'N/A'}</strong></div>
                </div>
              </div>

              <div className="tx-summary-card">
                <div className="tx-summary-title">Item</div>
                <div className="tx-summary-list">
                  <div><span>Group</span><strong>{groupLabel(itemForm.group)}</strong></div>
                  <div><span>Type</span><strong>{categoryLabel(itemForm.group, itemForm.category)}</strong></div>
                  <div><span>Description</span><strong>{itemForm.itemDescription || 'Not provided'}</strong></div>
                  {isJewelry ? (
                    <div><span>Karat / Weight</span><strong>{itemForm.karat} · {itemForm.weight || '0'} g</strong></div>
                  ) : (
                    <div><span>Brand/Model</span><strong>{itemForm.brandModel || 'Not provided'}</strong></div>
                  )}
                  <div><span>Condition</span><strong>{itemForm.condition}</strong></div>
                </div>
              </div>

              <div className="tx-summary-card full-span">
                <div className="tx-summary-title">Value &amp; Loan</div>
                <div className="tx-summary-list tx-summary-two-col">
                  {isJewelry && <div><span>Gold Price</span><strong>₱{currentGoldPrice.toLocaleString()}/gram</strong></div>}
                  <div><span>{isJewelry ? 'Computed Value' : 'Appraised Value'}</span><strong>₱{itemValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Adjusted Value</span><strong>₱{effectiveAdjustedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Adjustment Reason</span><strong>{adjustmentReason || 'None'}</strong></div>
                  <div><span>Loan-to-Value</span><strong>{ltvPercent}%</strong></div>
                  <div><span>Loan Amount</span><strong>₱{effectiveLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Interest Rate</span><strong>{interestRatePercent}% / month</strong></div>
                  <div><span>Due Date</span><strong>{dueDateLabel}</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <IonModal isOpen={isCustomerModalOpen} onDidDismiss={() => setIsCustomerModalOpen(false)} className="tx-customer-modal">
        <div className="tx-customer-modal-box">
          <div className="tx-customer-modal-header">
            <div>
              <small>QUICK ACTION</small>
              <h3>Add New Customer</h3>
            </div>
            <button type="button" className="tx-close-button" onClick={() => setIsCustomerModalOpen(false)}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          <div className="form-grid two-col modal-grid">
            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Full Name</IonLabel>
              <IonInput
                value={newCustomerDraft.fullName}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, fullName: event.detail.value || '' }))}
                placeholder="Full Name"
              />
            </IonItem>

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Contact Number</IonLabel>
              <IonInput
                type="tel"
                value={newCustomerDraft.contactNumber}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, contactNumber: event.detail.value || '' }))}
                placeholder="09XXXXXXXXX"
              />
            </IonItem>

            <IonItem lines="none" className="tx-field span-2">
              <IonLabel position="stacked">Address</IonLabel>
              <IonInput
                value={newCustomerDraft.address}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, address: event.detail.value || '' }))}
                placeholder="Full address"
              />
            </IonItem>

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Valid ID Type</IonLabel>
              <IonSelect
                interface="popover"
                value={newCustomerDraft.validIdType}
                onIonChange={(event) => setNewCustomerDraft((current) => ({ ...current, validIdType: event.detail.value }))}
              >
                <IonSelectOption value="National ID">National ID</IonSelectOption>
                <IonSelectOption value="Driver's License">Driver's License</IonSelectOption>
                <IonSelectOption value="Passport">Passport</IonSelectOption>
              </IonSelect>
            </IonItem>

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Valid ID Number</IonLabel>
              <IonInput
                value={newCustomerDraft.validIdNumber}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, validIdNumber: event.detail.value || '' }))}
                placeholder="Valid ID Number"
              />
            </IonItem>

            <IonItem lines="none" className="tx-field span-2">
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput
                type="email"
                value={newCustomerDraft.email}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, email: event.detail.value || '' }))}
                placeholder="customer@email.com"
              />
            </IonItem>

            <label className="file-input tx-field span-2">
              <span>Valid ID Photo</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => readIdPhoto(
                  event.target.files?.[0],
                  (dataUrl) => setNewCustomerDraft((current) => ({ ...current, validIdPhoto: dataUrl }))
                )}
              />
              {newCustomerDraft.validIdPhoto && (
                <div className="id-photo-preview">
                  <img src={newCustomerDraft.validIdPhoto} alt="Valid ID preview" />
                  <small><IonIcon icon={checkmarkCircle} />Attached</small>
                </div>
              )}
            </label>
          </div>

          {errorList.length > 0 && (
            <div className="tx-alert error" role="alert">
              <IonIcon icon={alertCircleOutline} />
              <div><ul>{errorList.map((entry) => <li key={entry.field}>{entry.message}</li>)}</ul></div>
            </div>
          )}

          <div className="tx-customer-modal-actions">
            <button type="button" className="secondary-button" onClick={() => { setIsCustomerModalOpen(false); setErrors({}); }}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={saveNewCustomer} disabled={loading}>
              {loading ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </div>
      </IonModal>

      <div className="tx-actionbar">
        <div className="tx-actionbar-figures">
          <div><span>Appraised</span><strong>{money(effectiveAdjustedValue)}</strong></div>
          <div className="highlight"><span>Loan amount</span><strong>{money(effectiveLoanAmount)}</strong></div>
          <div><span>Due</span><strong>{dueDateLabel}</strong></div>
        </div>
        <div className="tx-actionbar-buttons">
          <button type="button" className="secondary-button" onClick={step === 1 ? handleCancel : goBack} disabled={loading}>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button type="button" className="primary-button" onClick={goNext} disabled={!stepValid[step] || loading}>
              Next
              <IonIcon icon={chevronForwardOutline} />
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={handleConfirmAndGenerate} disabled={!stepValid[4] || loading}>
              {loading ? 'Processing...' : 'Confirm Transaction'}
              <IonIcon icon={checkmarkOutline} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

/** One loan on the staff Loans screen, flattened from the API records. */
type LoanRow = {
  transactionId: number;
  itemId: number;
  ticketNumber: string;
  item: string;
  customer: string;
  specs: string;
  currentValue: number;
  loanAmount: number;
  interestDue: number;
  totalPayable: number;
  dueDate: string;
  daysUntilDue: number;
  risk: 'Low' | 'Medium' | 'High';
  status: 'Active' | 'Overdue' | 'Redeemed' | 'Forfeited';
  valueHistory: Array<{ date: string; value: number }>;
};

/** An enum value as the API stores it, rendered for a person to read. */
const readable = (value?: string | null) =>
  (value || '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/**
 * What identifies the item at a glance: karat and weight for jewelry, brand or
 * model for a watch, cellphone, or bulky item.
 */
const specsFor = (item?: ApiItemDetail | null) => {
  if (!item) return '-';
  if (item.group === 'jewelry') {
    return [item.karat ? String(item.karat).toUpperCase() : null, item.weight_grams ? `${item.weight_grams} g` : null]
      .filter(Boolean)
      .join(' / ') || '-';
  }
  return item.brand_model || readable(item.category);
};

/**
 * Everything the Loans screen needs, loaded from the API in one place so the
 * tables, the modals, and the lifecycle panel all read the same records.
 */
const useLoanData = () => {
  const [items, setItems] = useState<ApiItemDetail[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [alerts, setAlerts] = useState<ApiRiskAlert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const reload = () => setReloadToken(token => token + 1);

  useEffect(() => {
    let active = true;
    setLoaded(false);

    Promise.all([getItems(), getTransactions(), getCustomers(), getRiskAlerts()])
      .then(([apiItems, apiTransactions, apiCustomers, apiAlerts]) => {
        if (!active) return;
        setItems(apiItems);
        setTransactions(apiTransactions);
        setCustomers(apiCustomers);
        setAlerts(apiAlerts);
        setError('');
      })
      .catch(requestError => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load loan records.');
      })
      .finally(() => { if (active) setLoaded(true); });

    return () => { active = false; };
  }, [reloadToken]);

  const itemsById = new Map(items.map(item => [item.items_id, item]));

  // An item's open risk alert sets its risk level. No open alert means the
  // item is comfortably above its loan, which is the Low band.
  const riskByItem = new Map<number, 'Low' | 'Medium' | 'High'>();
  alerts.filter(alert => !alert.resolved).forEach(alert => riskByItem.set(alert.item_id, riskLabel(alert.risk_level)));

  const loans: LoanRow[] = transactions.map(transaction => {
    const item = itemsById.get(transaction.item_id) || null;
    const overdue = transaction.status === 'active' && transaction.days_until_due < 0;

    return {
      transactionId: transaction.transactions_id,
      itemId: transaction.item_id,
      ticketNumber: transaction.ticket_number,
      item: item?.description || `Item #${transaction.item_id}`,
      customer: transaction.customer?.name || 'Unknown customer',
      specs: specsFor(item),
      currentValue: Number(item?.adjusted_value ?? item?.appraised_value ?? 0),
      loanAmount: Number(transaction.loan_amount),
      interestDue: Number(transaction.interest_due),
      totalPayable: Number(transaction.total_payable),
      dueDate: shortDate(transaction.due_date),
      daysUntilDue: transaction.days_until_due,
      risk: riskByItem.get(transaction.item_id) || 'Low',
      status: (overdue ? 'Overdue' : statusLabel(transaction.status)) as LoanRow['status'],
      valueHistory: (item?.value_logs || []).map(log => ({ date: shortDate(log.log_date), value: Number(log.computed_value) })),
    };
  });

  return { items, loans, customers, loaded, error, reload };
};

/**
 * Item lifecycle actions: redeem an open loan, list a forfeited item for sale,
 * and mark a listed item sold. Every action calls the API and reloads, so the
 * panel always shows what the shop's records actually say.
 */
const WorkflowOperations: React.FC<{ items: ApiItemDetail[]; loans: LoanRow[]; loaded: boolean; onChanged: () => void }> = ({ items, loans, loaded, onChanged }) => {
  const [selectedLoan, setSelectedLoan] = useState<LoanRow | null>(null);
  const [salePrices, setSalePrices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openLoanFor = (itemId: number) => loans.find(loan => loan.itemId === itemId && (loan.status === 'Active' || loan.status === 'Overdue')) || null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (!selectedLoan) return;
    const ticket = selectedLoan.ticketNumber;
    const payable = selectedLoan.totalPayable;
    await run(() => redeemTransaction(selectedLoan.transactionId));
    setSelectedLoan(null);
    alert(`Receipt generated for ${ticket}: ${moneyExact(payable)}`);
  };

  return (
    <div className="staff-panel workflow-operations-panel">
      <div className="staff-panel-head"><div><small>SHARED WORKFLOW</small><h3>Lifecycle operations</h3></div><button onClick={onChanged} disabled={busy}>Refresh</button></div>
      {error && <p className="risk-empty">{error}</p>}
      <div className="workflow-ticket-list">
        {items.map(item => {
          const loan = openLoanFor(item.items_id);
          const status = statusLabel(item.status);

          return (
            <div className="workflow-ticket-row" key={item.items_id}>
              <div><strong>{item.description}</strong><span>{loan?.ticketNumber || readable(item.category)} · {item.customer?.name || 'Unknown customer'}</span></div>
              <span className={`loan-badge ${item.status.replace('_', '-')}`}>{status}</span>
              <strong>{money(Number(item.adjusted_value ?? item.appraised_value ?? 0))}</strong>
              <div className="workflow-actions">
                {loan && <button onClick={() => setSelectedLoan(loan)} disabled={busy}>Redeem</button>}
                {item.status === 'forfeited' && <>
                  <input
                    aria-label={`Sale price for ${item.description}`}
                    value={salePrices[item.items_id] || ''}
                    onChange={event => setSalePrices(current => ({ ...current, [item.items_id]: event.target.value }))}
                    placeholder="Sale price"
                  />
                  <button
                    disabled={busy}
                    onClick={() => run(() => markItemForSale(item.items_id, Number(salePrices[item.items_id] || item.appraised_value)))}
                  >For Sale</button>
                </>}
                {item.status === 'for_sale' && <button onClick={() => run(() => markItemSold(item.items_id))} disabled={busy}>Mark Sold</button>}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="risk-empty">{loaded ? 'No items on record yet.' : 'Loading items...'}</p>}
      </div>
      <IonModal isOpen={Boolean(selectedLoan)} onDidDismiss={() => setSelectedLoan(null)}>
        <div className="workflow-confirm-modal">
          <small>REDEMPTION CONFIRMATION</small><h3>{selectedLoan?.ticketNumber}</h3>
          <p>{selectedLoan?.item} · {selectedLoan?.customer}</p>
          <div className="payment-summary">
            <div><span>Principal</span><strong>{selectedLoan ? money(selectedLoan.loanAmount) : '-'}</strong></div>
            <div><span>Accrued interest</span><strong>{selectedLoan ? moneyExact(selectedLoan.interestDue) : '-'}</strong></div>
            <div><span>Total payable</span><strong>{selectedLoan ? moneyExact(selectedLoan.totalPayable) : '-'}</strong></div>
          </div>
          <div className="payment-actions-row"><button className="secondary-button" onClick={() => setSelectedLoan(null)}>Cancel</button><button className="primary-button" onClick={redeem} disabled={busy}>{busy ? 'Processing...' : 'Confirm payment & receipt'}</button></div>
        </div>
      </IonModal>
    </div>
  );
};

const LoansPage: React.FC<{
  loanTab: 'active' | 'payments' | 'customers';
  setLoanTab: (value: 'active' | 'payments' | 'customers') => void;
  riskFilter: 'All' | 'Low' | 'Medium' | 'High';
  setRiskFilter: (value: 'All' | 'Low' | 'Medium' | 'High') => void;
}> = ({ loanTab, setLoanTab, riskFilter, setRiskFilter }) => {
  const { items, loans, customers, loaded, error, reload } = useLoanData();

  const [statusFilter, setStatusFilter] = useState('All');
  const [activeSearch, setActiveSearch] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<LoanRow | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<ApiCustomer | null>(null);
  const [selectedRedemption, setSelectedRedemption] = useState<LoanRow | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ amount: '', method: 'Cash', note: '' });
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const filteredActiveLoans = loans.filter((loan) => {
    const matchesStatus = statusFilter === 'All' || loan.status === statusFilter;
    const matchesRisk = riskFilter === 'All' || loan.risk === riskFilter;
    const matchesSearch = `${loan.item} ${loan.customer}`.toLowerCase().includes(activeSearch.toLowerCase());
    return matchesStatus && matchesRisk && matchesSearch;
  });

  // Only an open loan can be redeemed, so the Redemption tab lists those.
  const filteredRedemptionRows = loans
    .filter(loan => loan.status === 'Active' || loan.status === 'Overdue')
    .filter(loan => `${loan.ticketNumber} ${loan.customer} ${loan.item}`.toLowerCase().includes(redemptionSearch.toLowerCase()));

  const filteredCustomerRows = customers.filter((customer) =>
    `${customer.name} ${customer.contact_number || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const openLoans = loans.filter(loan => loan.status === 'Active' || loan.status === 'Overdue');

  const handleProcessPayment = async () => {
    if (!selectedRedemption) return;

    setProcessing(true);
    setPaymentError('');
    try {
      const receipt = await redeemTransaction(selectedRedemption.transactionId) as { total_payable?: number };
      const collected = Number(paymentDraft.amount || receipt?.total_payable || selectedRedemption.totalPayable);
      alert(`Payment of ${moneyExact(collected)} confirmed via ${paymentDraft.method}. Receipt generated and item status set to Redeemed.`);
      setSelectedRedemption(null);
      setPaymentDraft({ amount: '', method: 'Cash', note: '' });
      reload();
    } catch (requestError) {
      setPaymentError(requestError instanceof Error ? requestError.message : 'The payment could not be processed.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="staff-content">
      <div className="staff-page-intro">
        <div>
          <small>LOAN OPERATIONS</small>
          <h2>Loans</h2>
          <p>Track loans, redemption requests, and customer payment records.</p>
        </div>
      </div>

      {error && <p className="risk-empty">{error}</p>}

      <WorkflowOperations items={items} loans={loans} loaded={loaded} onChanged={reload} />

      <div className="loan-tabs" role="tablist">
        {(['active', 'payments', 'customers'] as const).map((tab) => (
          <button
            key={tab}
            className={loanTab === tab ? 'active' : ''}
            onClick={() => setLoanTab(tab)}
            role="tab"
            aria-selected={loanTab === tab}
          >
            {tab === 'active'
              ? 'Active Loans/Items'
              : tab === 'payments'
                ? 'Redemption'
                : 'Customer Records'}
          </button>
        ))}
      </div>

      {loanTab === 'active' && (
        <>
          <div className="loan-summary-grid">
            <div>
              <span>Active loans</span>
              <strong>{loaded ? openLoans.length : '--'}</strong>
              <small>Currently outstanding</small>
            </div>
            <div>
              <span>Total principal</span>
              <strong>{loaded ? money(openLoans.reduce((sum, loan) => sum + loan.loanAmount, 0)) : '--'}</strong>
              <small>Across all current items</small>
            </div>
            <div>
              <span>High-risk items</span>
              <strong>{loaded ? openLoans.filter(loan => loan.risk === 'High').length : '--'}</strong>
              <small>Needs review today</small>
            </div>
          </div>

          <div className="staff-panel loan-panel">
            <div className="loan-tool-row">
              <IonInput
                value={activeSearch}
                placeholder="Search item, customer name..."
                onIonInput={(event) => setActiveSearch(event.detail.value || '')}
              />

              <IonSelect
                interface="popover"
                value={statusFilter}
                onIonChange={(event) => setStatusFilter(event.detail.value)}
              >
                <IonSelectOption value="All">Status: All</IonSelectOption>
                <IonSelectOption value="Active">Active</IonSelectOption>
                <IonSelectOption value="Overdue">Overdue</IonSelectOption>
                <IonSelectOption value="Redeemed">Redeemed</IonSelectOption>
                <IonSelectOption value="Forfeited">Forfeited</IonSelectOption>
              </IonSelect>

              <IonSelect
                interface="popover"
                value={riskFilter}
                onIonChange={(event) => setRiskFilter(event.detail.value)}
              >
                <IonSelectOption value="All">Risk: All</IonSelectOption>
                <IonSelectOption value="Low">Low</IonSelectOption>
                <IonSelectOption value="Medium">Medium</IonSelectOption>
                <IonSelectOption value="High">High</IonSelectOption>
              </IonSelect>
            </div>

            <div className="loan-table">
              <div className="loan-table-head">
                <span>#</span>
                <span>Item</span>
                <span>Customer</span>
                <span>Karat/Weight or Brand</span>
                <span>Current Value</span>
                <span>Loan Amount</span>
                <span>Due Date</span>
                <span>Risk Status</span>
                <span>Action</span>
              </div>

              {filteredActiveLoans.map((loan, index) => (
                <div className="loan-table-row" key={loan.transactionId}>
                  <span>{index + 1}</span>
                  <span>{loan.item}</span>
                  <span>{loan.customer}</span>
                  <span>{loan.specs}</span>
                  <span>{money(loan.currentValue)}</span>
                  <span>{money(loan.loanAmount)}</span>
                  <span>{loan.dueDate}</span>
                  <span>
                    <em className={`loan-badge ${loan.risk.toLowerCase()}`}>{loan.risk}</em>
                  </span>
                  <button onClick={() => setSelectedLoan(loan)}>View</button>
                </div>
              ))}
              {filteredActiveLoans.length === 0 && <p className="risk-empty">{loaded ? 'No loans match these filters.' : 'Loading loans...'}</p>}
            </div>
          </div>
        </>
      )}

      {loanTab === 'payments' && (
        <div className="staff-panel loan-panel">
          <div className="loan-tool-row single-field">
            <IonInput
              value={redemptionSearch}
              placeholder="Search by ticket number, customer name..."
              onIonInput={(event) => setRedemptionSearch(event.detail.value || '')}
            />
          </div>

          <div className="loan-table">
            <div className="loan-table-head redemptions-head">
              <span>#</span>
              <span>Ticket No.</span>
              <span>Customer</span>
              <span>Item</span>
              <span>Loan Amount</span>
              <span>Interest Due</span>
              <span>Total Payable</span>
              <span>Due Date</span>
              <span>Action</span>
            </div>

            {filteredRedemptionRows.map((row, index) => (
              <div className="loan-table-row redemption-row" key={row.transactionId}>
                <span>{index + 1}</span>
                <span>{row.ticketNumber}</span>
                <span>{row.customer}</span>
                <span>{row.item}</span>
                <span>{money(row.loanAmount)}</span>
                <span>{moneyExact(row.interestDue)}</span>
                <span>{moneyExact(row.totalPayable)}</span>
                <span>{row.dueDate}</span>
                <button onClick={() => {
                  setSelectedRedemption(row);
                  setPaymentDraft({ amount: String(row.totalPayable), method: 'Cash', note: '' });
                }}>
                  Process
                </button>
              </div>
            ))}
            {filteredRedemptionRows.length === 0 && <p className="risk-empty">{loaded ? 'No open loans to redeem.' : 'Loading loans...'}</p>}
          </div>
        </div>
      )}

      {loanTab === 'customers' && (
        <div className="staff-panel loan-panel">
          <div className="loan-tool-row single-field">
            <IonInput
              value={customerSearch}
              placeholder="Search customer name, contact..."
              onIonInput={(event) => setCustomerSearch(event.detail.value || '')}
            />
          </div>

          <div className="loan-table">
            <div className="loan-table-head customer-head">
              <span>#</span>
              <span>Name</span>
              <span>Contact Number</span>
              <span>Address</span>
              <span>Total Items (Active)</span>
              <span>Total Items (History)</span>
              <span>Action</span>
            </div>

            {filteredCustomerRows.map((customer, index) => (
              <div className="loan-table-row customer-row" key={customer.customers_id}>
                <span>{index + 1}</span>
                <span>{customer.name}</span>
                <span>{customer.contact_number || '-'}</span>
                <span>{customer.address || '-'}</span>
                <span>{customer.active_items_count ?? 0}</span>
                <span>{customer.total_items_count ?? 0}</span>
                <button onClick={() => setSelectedCustomer(customer)}>View</button>
              </div>
            ))}
            {filteredCustomerRows.length === 0 && <p className="risk-empty">{loaded ? 'No customers match this search.' : 'Loading customers...'}</p>}
          </div>
        </div>
      )}

      <IonModal isOpen={Boolean(selectedLoan)} onDidDismiss={() => setSelectedLoan(null)} className="loan-detail-modal">
        <div className="loan-detail-panel">
          <div className="loan-detail-header">
            <div>
              <small>ITEM DETAIL · {selectedLoan?.ticketNumber}</small>
              <h3>{selectedLoan?.item}</h3>
            </div>
            <button className="modal-close-button" onClick={() => setSelectedLoan(null)}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          <div className="loan-detail-grid">
            <div className="loan-detail-box">
              <span>Customer</span>
              <strong>{selectedLoan?.customer}</strong>
            </div>
            <div className="loan-detail-box">
              <span>Status</span>
              <strong>{selectedLoan?.status}</strong>
            </div>
            <div className="loan-detail-box">
              <span>Current Value</span>
              <strong>{selectedLoan ? money(selectedLoan.currentValue) : '-'}</strong>
            </div>
            <div className="loan-detail-box">
              <span>Loan Amount</span>
              <strong>{selectedLoan ? money(selectedLoan.loanAmount) : '-'}</strong>
            </div>
          </div>

          {/* Jewelry is revalued daily against the gold price, so only jewelry
              has a recorded value history to chart. */}
          {selectedLoan && selectedLoan.valueHistory.length > 1 && (() => {
            const peak = Math.max(...selectedLoan.valueHistory.map(point => point.value));
            return (
              <div className="loan-detail-chart">
                {selectedLoan.valueHistory.map((point) => (
                  <span key={point.date} title={`${point.date} · ${money(point.value)}`} style={{ height: `${peak > 0 ? Math.max(20, (point.value / peak) * 100) : 20}%` }} />
                ))}
              </div>
            );
          })()}

          <div className="loan-history-table">
            <div className="loan-history-head">
              <span>Date</span>
              <span>Event</span>
              <span>Value</span>
            </div>
            {(selectedLoan?.valueHistory || []).map((row) => (
              <div className="loan-history-row" key={row.date}>
                <span>{row.date}</span>
                <span>Daily gold price revaluation</span>
                <span>{money(row.value)}</span>
              </div>
            ))}
            {(selectedLoan?.valueHistory || []).length === 0 && <p className="risk-empty">No recorded value history. This item is not revalued from the gold price.</p>}
          </div>
        </div>
      </IonModal>

      <IonModal isOpen={Boolean(selectedRedemption)} onDidDismiss={() => setSelectedRedemption(null)} className="payment-modal">
        <div className="loan-detail-panel payment-panel">
          <div className="loan-detail-header">
            <div>
              <small>REDEMPTION</small>
              <h3>{selectedRedemption?.ticketNumber}</h3>
            </div>
            <button className="modal-close-button" onClick={() => setSelectedRedemption(null)}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          <div className="payment-summary">
            <div><span>Customer</span><strong>{selectedRedemption?.customer}</strong></div>
            <div><span>Item</span><strong>{selectedRedemption?.item}</strong></div>
            <div><span>Total Payable</span><strong>{selectedRedemption ? moneyExact(selectedRedemption.totalPayable) : '-'}</strong></div>
          </div>

          <div className="form-grid two-col payment-form-grid">
            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Confirm Payment Amount</IonLabel>
              <IonInput
                type="number"
                value={paymentDraft.amount}
                onIonInput={(event) => setPaymentDraft((current) => ({ ...current, amount: event.detail.value || '' }))}
              />
            </IonItem>

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Payment Method</IonLabel>
              <IonSelect
                interface="popover"
                value={paymentDraft.method}
                onIonChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.detail.value }))}
              >
                <IonSelectOption value="Cash">Cash</IonSelectOption>
                <IonSelectOption value="GCash">GCash</IonSelectOption>
                <IonSelectOption value="Bank Transfer">Bank Transfer</IonSelectOption>
              </IonSelect>
            </IonItem>
          </div>

          {paymentError && <p className="risk-empty">{paymentError}</p>}

          <div className="payment-actions-row">
            <button type="button" className="secondary-button" onClick={() => setSelectedRedemption(null)}>Cancel</button>
            <button type="button" className="primary-button" onClick={handleProcessPayment} disabled={processing}>{processing ? 'Processing...' : 'Confirm Payment'}</button>
          </div>
        </div>
      </IonModal>

      <IonModal isOpen={Boolean(selectedCustomer)} onDidDismiss={() => setSelectedCustomer(null)} className="customer-profile-modal">
        <div className="loan-detail-panel customer-profile-panel">
          <div className="loan-detail-header">
            <div>
              <small>CUSTOMER PROFILE</small>
              <h3>{selectedCustomer?.name}</h3>
            </div>
            <button className="modal-close-button" onClick={() => setSelectedCustomer(null)}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          <div className="customer-profile-grid">
            <div className="loan-detail-box"><span>Contact</span><strong>{selectedCustomer?.contact_number || '-'}</strong></div>
            <div className="loan-detail-box"><span>Address</span><strong>{selectedCustomer?.address || '-'}</strong></div>
            <div className="loan-detail-box"><span>Active Items</span><strong>{selectedCustomer?.active_items_count ?? 0}</strong></div>
            <div className="loan-detail-box"><span>History</span><strong>{selectedCustomer?.total_items_count ?? 0}</strong></div>
          </div>

          <div className="customer-history-table">
            <div className="loan-history-head">
              <span>Item</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Due Date</span>
            </div>
            {(selectedCustomer?.transactions || []).map((entry) => (
              <div className="loan-history-row customer-history-row" key={entry.transactions_id}>
                <span>{entry.item?.description || `Item #${entry.item_id}`}</span>
                <span>{statusLabel(entry.status)}</span>
                <span>{money(Number(entry.loan_amount))}</span>
                <span>{shortDate(entry.due_date)}</span>
              </div>
            ))}
            {(selectedCustomer?.transactions || []).length === 0 && <p className="risk-empty">No transactions on record for this customer.</p>}
          </div>
        </div>
      </IonModal>
    </section>
  );
};

const Profile: React.FC<{ logout: () => void }> = ({ logout }) => {
  const [me, setMe] = useState<ApiMe | null>(null);
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMe()
      .then(account => {
        if (!active) return;
        setMe(account);
        setName(account.user.name);
        setContactNumber(account.user.contact_number || '');
      })
      .catch(requestError => { if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load your account.'); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const updated = await updateMe({ name: name.trim(), contact_number: contactNumber.trim() });
      setMe(updated);
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="staff-content">
      <div className="staff-page-intro">
        <div>
          <small>ACCOUNT</small>
          <h2>Profile</h2>
          <p>Update staff account information and manage access.</p>
        </div>
      </div>

      <div className="staff-panel">
        <IonItem lines="none">
          <IonLabel position="stacked">FULL NAME</IonLabel>
          <IonInput value={name} onIonInput={event => { setName(event.detail.value || ''); setSaved(false); }} />
        </IonItem>

        <IonItem lines="none">
          <IonLabel position="stacked">EMAIL ADDRESS</IonLabel>
          <IonInput value={me?.user.email || ''} readonly />
        </IonItem>

        <IonItem lines="none">
          <IonLabel position="stacked">CONTACT NUMBER</IonLabel>
          <IonInput value={contactNumber} onIonInput={event => { setContactNumber(event.detail.value || ''); setSaved(false); }} />
        </IonItem>

        {error && <p className="risk-empty">{error}</p>}
        {saved && <small className="policy-saved">Changes saved successfully.</small>}

        <IonButton onClick={save} disabled={saving || !me}>{saving ? 'Saving...' : 'Save changes'}</IonButton>
        <IonButton className="staff-logout" fill="outline" color="danger" onClick={logout}>
          <IonIcon icon={logOutOutline} slot="start" />
          Log out
        </IonButton>
      </div>
    </section>
  );
};

export default StaffPortal;
