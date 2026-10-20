import React, { useCallback, useEffect, useState } from 'react';
import { IonButton, IonContent, IonIcon, IonModal, IonPage } from '@ionic/react';
import {
  analyticsOutline,
  calendarOutline,
  cashOutline,
  chevronDownOutline,
  chevronUpOutline,
  closeOutline,
  documentTextOutline,
  downloadOutline,
  folderOpenOutline,
  eyeOffOutline,
  eyeOutline,
  gridOutline,
  menuOutline,
  notificationsOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  pulseOutline,
  searchOutline,
  shieldCheckmarkOutline,
  removeOutline,
  trendingDownOutline,
  trendingUpOutline,
  warningOutline,
  starOutline,
  star as starFilled,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { money, moneyExact, shortDate, timeAgo } from '../data/pawnshopStore';
import { createUser, updateUser, getAuditLogs, getCustomers, deleteShopClosure, getDashboard, getFeedbackList, getShopSchedule, saveShopClosure, getModelMetrics, getReportSummary, getRiskAlerts, getSystemSettings, getTransactions, getUsers, saveSystemSetting, NOTIFICATION_TITLES, type ApiFeedbackList, type ApiNotification, type ApiShopClosure, type ApiReportSummary, type ApiRiskAlert, type ApiSystemSetting, type ApiTransaction, type ApiUser } from '../services/api';
import RevenueTrendChart, { type RevenuePoint } from '../components/RevenueTrendChart';
import GoldPriceChart, { type GoldPricePoint } from '../components/GoldPriceChart';
import { useNotifications } from '../components/useNotifications';
import ThemeToggle from '../components/ThemeToggle';
import MotionToggle from '../components/MotionToggle';
import PullToRefresh from '../components/PullToRefresh';
import GoldPriceTracking from './GoldPriceTracking';
import ModelMonitoring from './ModelMonitoring';
import RiskManagement from './RiskManagement';
import AdminRecords, { type RecordsTab } from './AdminRecords';
import StaffDueCalendar from '../staff/StaffDueCalendar';
import { activityCsv, customersCsv, isOverdue, isPayment, overdueCsv, paymentsCsv, transactionsCsv } from './recordsExport';
import { Skeleton, SkeletonList, SkeletonStat, SkeletonText, Spinner } from '../components/Skeleton';
import Pager, { usePagedRows } from '../components/Pager';
import { useModal } from '../components/ModalProvider';
import './AdminPortal.css';
import './AdminPolish.css';
import './AccountsTable.css';
import TypeSelect from '../components/TypeSelect';

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

type AdminView = 'dashboard' | 'manage' | 'records' | 'monitoring' | 'reports' | 'profile';
type Tab = 'users' | 'settings' | 'models' | 'gold' | 'risk' | 'activity' | 'analytics' | 'feedback' | 'exports';

const navigation: Array<{ id: AdminView; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: gridOutline },
  { id: 'manage', label: 'Manage', icon: peopleOutline },
  { id: 'records', label: 'Records', icon: folderOpenOutline },
  { id: 'monitoring', label: 'Monitoring', icon: pulseOutline },
  { id: 'reports', label: 'Reports', icon: analyticsOutline },
];

/**
 * Where a notification opens, by type.
 *
 * An admin receives the staff side messages, and every one of them is about a
 * loan or an item, so each opens the Monitoring tab that holds those records.
 */
const NOTIFICATION_TAB: Partial<Record<ApiNotification['type'], Tab>> = {
  staff_high_risk: 'risk',
};

/** Notifications about a pawn's due date or payment open the matching Records tab. */
const NOTIFICATION_RECORDS: Partial<Record<ApiNotification['type'], RecordsTab>> = {
  staff_redeem_request: 'transactions',
  staff_appointment_request: 'transactions',
  staff_renewal_request: 'transactions',
  staff_overdue: 'overdue',
  staff_forfeited: 'overdue',
};

const overviewStats = [
  { icon: cashOutline, value: '42', label: 'Total active pawns', tone: 'primary' },
  { icon: peopleOutline, value: '128', label: 'Total customers', tone: 'success' },
  { icon: warningOutline, value: '7', label: 'Total risk alerts', tone: 'warning' },
  { icon: analyticsOutline, value: '₱48.6K', label: "Today's revenue", tone: 'success' },
];

/** A risk alert flattened for the dashboard table. */
type RiskRow = { id: string; customer: string; item: string; currentValue: string; amount: string; risk: 'High' | 'Medium' | 'Low' };

/** Map an API risk alert onto the dashboard table row. */
const toRiskRow = (alert: ApiRiskAlert): RiskRow => ({
  id: String(alert.risk_alerts_id),
  customer: alert.item?.customer?.name || 'Unknown customer',
  item: alert.item?.description || `Item #${alert.item_id}`,
  currentValue: money(Number(alert.current_value)),
  amount: money(Number(alert.loan_amount)),
  risk: (alert.risk_level.charAt(0).toUpperCase() + alert.risk_level.slice(1)) as RiskRow['risk'],
});

/** Midnight of the given day, so day buckets compare on the date alone. */
const startOfDay = (value: Date) => {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
};

const DAY_MS = 86400000;

/**
 * Revenue collected in the seven days before the charted week.
 *
 * The dashboard endpoint sends revenue_trend for the current seven days only,
 * so the comparison baseline is summed on the client from the redeemed
 * transactions that same response already carries. total_payable is computed
 * by the API and frozen at the redemption date, which is exactly what
 * revenue_trend buckets, so both sides of the percentage use the same figure.
 */
const previousWeekRevenue = (transactions: ApiTransaction[]) => {
  const todayStart = startOfDay(new Date()).getTime();
  const windowStart = todayStart - 13 * DAY_MS;
  const windowEnd = todayStart - 7 * DAY_MS;

  return transactions.reduce((total, transaction) => {
    if (transaction.status !== 'redeemed' || !transaction.redeemed_at) return total;
    const redeemedDay = startOfDay(new Date(transaction.redeemed_at)).getTime();
    if (redeemedDay < windowStart || redeemedDay > windowEnd) return total;
    return total + Number(transaction.total_payable || 0);
  }, 0);
};

const AdminPortal: React.FC = () => {
  const navigate = useNavigate();
  const modal = useModal();
  const [view, setView] = useState<AdminView>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [monitoringTab, setMonitoringTab] = useState<Tab>('models');
  const [recordsTab, setRecordsTab] = useState<RecordsTab>('customers');
  // Ticket number a notification opened Records with, prefilled in the search.
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsVisit, setRecordsVisit] = useState(0);

  // Stored rows, polled, so the badge stays current without a page reload.
  const { notifications, unreadCount, loaded: noticesLoaded, reload: reloadNotices, markRead, markAllRead } = useNotifications();
  // Bumped by pull-to-refresh: the open view remounts and fetches again.
  const [refreshKey, setRefreshKey] = useState(0);

  const go = (next: AdminView) => {
    setView(next);
    setMenuOpen(false);
  };

  /** Mark the row read, then open the records it is about. */
  const openNotification = (notice: ApiNotification) => {
    markRead(notice.notifications_id);
    setNotificationsOpen(false);
    const recordsTarget = NOTIFICATION_RECORDS[notice.type];
    if (recordsTarget) {
      // Every staff message names its ticket as "Ticket #PS-...", so the list
      // opens filtered to that one pawn and its customer.
      openRecords(recordsTarget, notice.message.match(/Ticket #([A-Za-z0-9-]+)/)?.[1] ?? '');
      return;
    }
    setMonitoringTab(NOTIFICATION_TAB[notice.type] ?? 'risk');
    go('monitoring');
  };

  const openRecords = (tab: RecordsTab, search = '') => {
    setRecordsTab(tab);
    setRecordsSearch(search);
    setRecordsVisit(visit => visit + 1);
    go('records');
  };

  const logout = async () => {
    setProfileOpen(false);
    const confirmed = await modal.confirm({
      title: 'Sign out of the admin portal?',
      message: 'You will need to sign in again to manage accounts, policies, and reports.',
      confirmLabel: 'Sign out',
      tone: 'danger',
    });
    if (!confirmed) return;

    navigate('/');
  };

  return (
    <IonPage className="admin-page">
      <IonContent fullscreen>
        <PullToRefresh onRefresh={() => {
          // Settings and profile forms being edited are left as they are.
          if (view !== 'manage' && view !== 'profile') setRefreshKey(key => key + 1);
          return reloadNotices();
        }} />
        <div className="admin-shell">
          <div className={`admin-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />
          <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
            <div className="admin-brand">
              <img src="/pagasa.png" alt="Pag-Asa Pawnshop" />
            </div>
            <div className="admin-account">
              <IonIcon icon={personCircleOutline} />
              <div>
                <strong>System Admin</strong>
                <span>Administrator</span>
              </div>
            </div>
            <small className="admin-label">ADMINISTRATION</small>
            <nav className="admin-nav">
              {navigation.map((item) => (
                <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}>
                  <IonIcon icon={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="admin-main">
            <header className="admin-topbar">
              <div className="admin-heading">
                <button className="admin-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle admin navigation">
                  <IonIcon icon={menuOpen ? closeOutline : menuOutline} />
                </button>
                <div><small>ADMIN PORTAL</small></div>
              </div>

              <div className="admin-header-actions">
                <div className="admin-action-wrap">
                  <MotionToggle className="admin-notification" />
                  <ThemeToggle className="admin-notification" />
                </div>
                <div className="admin-action-wrap">
                  <button
                    className="admin-notification"
                    aria-label="Notifications"
                    aria-expanded={notificationsOpen}
                    onClick={() => {
                      setNotificationsOpen(!notificationsOpen);
                      setProfileOpen(false);
                    }}
                  >
                    <IonIcon icon={notificationsOutline} />
                    {unreadCount > 0 && <b className="notification-count" aria-label={`${unreadCount} unread notifications`}>{unreadCount}</b>}
                  </button>

                  {notificationsOpen && (
                    <div className="admin-dropdown notification-dropdown">
                      <div className="admin-dropdown-head">
                        <strong>Notifications</strong>
                        <button onClick={markAllRead}>Mark all read</button>
                      </div>
                      {notifications.map((notice) => (
                        <button
                          className={`notification-item ${notice.is_read ? 'read' : 'unread'}`}
                          key={notice.notifications_id}
                          onClick={() => openNotification(notice)}
                        >
                          <strong>{NOTIFICATION_TITLES[notice.type] || 'Notification'}</strong>
                          <small>{notice.message} &middot; {timeAgo(notice.created_at)}</small>
                        </button>
                      ))}
                      {!noticesLoaded && <SkeletonList rows={3} />}
                      {noticesLoaded && notifications.length === 0 && <p className="notification-empty">Nothing needs your attention right now.</p>}
                    </div>
                  )}
                </div>

                <div className="admin-action-wrap">
                  <button
                    className="admin-user-menu"
                    onClick={() => {
                      setProfileOpen(!profileOpen);
                      setNotificationsOpen(false);
                    }}
                    aria-expanded={profileOpen}
                  >
                    <IonIcon icon={personCircleOutline} />
                    <span>PAGASA Admin</span>
                    <IonIcon className="profile-chevron" icon={profileOpen ? chevronUpOutline : chevronDownOutline} aria-hidden="true" />
                  </button>

                  {profileOpen && (
                    <div className="admin-dropdown profile-dropdown">
                      <button onClick={() => { setProfileOpen(false); go('profile'); }}>
                        <IonIcon icon={personCircleOutline} /> Profile
                      </button>
                      <button onClick={logout}>
                        <IonIcon icon={closeOutline} /> Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <React.Fragment key={refreshKey}>
            {view === 'dashboard' && <Dashboard go={go} onOpenRecords={openRecords} onViewRiskAlerts={() => { setMonitoringTab('risk'); go('monitoring'); }} />}
            {view === 'manage' && <Manage />}
            {view === 'records' && <AdminRecords key={`${recordsTab}-${recordsVisit}`} initialTab={recordsTab} initialSearch={recordsSearch} />}
            {view === 'monitoring' && <Monitoring key={monitoringTab} initialTab={monitoringTab} />}
            {view === 'reports' && <Reports />}
            </React.Fragment>
            {view === 'profile' && <AdminProfile />}
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

const Dashboard: React.FC<{ go: (view: AdminView) => void; onOpenRecords: (tab: RecordsTab, search?: string) => void; onViewRiskAlerts: () => void }> = ({ go, onOpenRecords, onViewRiskAlerts }) => {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Empty until the API answers: the dashboard shows placeholders rather than
  // a set of demo figures that would be read as real for a moment.
  const [liveStats, setLiveStats] = useState<typeof overviewStats>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [goldOnlySeries, setGoldOnlySeries] = useState<GoldPricePoint[]>([]);
  const [silverSeries, setSilverSeries] = useState<GoldPricePoint[]>([]);
  // Which metal the Market Reference card shows. Gold on every load.
  const [marketMetal, setMarketMetal] = useState<'gold' | 'silver'>('gold');
  const goldSeries = marketMetal === 'silver' ? silverSeries : goldOnlySeries;
  const marketName = marketMetal === 'silver' ? 'Silver' : 'Gold';
  const [goldLoaded, setGoldLoaded] = useState(false);
  const [predictionAccuracy, setPredictionAccuracy] = useState<number | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [priorWeekRevenue, setPriorWeekRevenue] = useState(0);
  const [revenueLoaded, setRevenueLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getDashboard('admin').then(dashboard => {
      // The API computes these counts, so each card matches the list it opens.
      setLiveStats([
        { icon: cashOutline, value: String(dashboard.stats.active_loans), label: 'Total active pawns', tone: 'primary' },
        { icon: peopleOutline, value: String(dashboard.stats.total_customers), label: 'Total customers', tone: 'success' },
        { icon: warningOutline, value: String(dashboard.stats.open_risk_alerts), label: 'Total risk alerts', tone: 'warning' },
        { icon: analyticsOutline, value: money(Number(dashboard.stats.revenue_today)), label: "Today's revenue", tone: 'success' },
      ]);
      setStatsLoaded(true);
      // gold_prices arrives newest first, so it is sorted back into date order
      // before the most recent week is taken. Whatever days exist are charted;
      // nothing is padded out to seven.
      // Silver rows share the gold shape, so both go through the same steps.
      const lastWeek = (rows: Array<{ price_date: string; price_per_gram: string | number }>) =>
        rows
          .map(price => ({ date: price.price_date, price: Number(price.price_per_gram) }))
          .filter(point => point.date && Number.isFinite(point.price) && point.price > 0)
          .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
          .slice(-7);
      setGoldOnlySeries(lastWeek(dashboard.gold_prices || []));
      setSilverSeries(lastWeek(dashboard.silver_prices || []));
      setGoldLoaded(true);
      // The seven day series comes straight from the API. Nothing is invented
      // on the client, so a quiet week charts as a quiet week.
      setRevenueSeries((dashboard.revenue_trend || []).map((day) => ({ date: day.date, revenue: Number(day.revenue) || 0 })));
      setPriorWeekRevenue(previousWeekRevenue(dashboard.transactions || []));
      setRevenueLoaded(true);
    }).catch(error => setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.'));

    // The forecast accuracy is a footnote on the gold card, so it is fetched on
    // its own: if this endpoint is unavailable the card still shows the price.
    getModelMetrics()
      .then(metrics => setPredictionAccuracy(metrics.prediction_accuracy_percent))
      .catch(() => setPredictionAccuracy(null));
  }, []);

  // Quick links, in card order: each opens the full list behind the figure.
  const statLinks = [
    () => onOpenRecords('transactions'),
    () => onOpenRecords('customers'),
    onViewRiskAlerts,
    () => onOpenRecords('payments'),
  ];

  // A card is ready once its request has answered. On failure it is ready too:
  // the panel shows the error rather than sweeping placeholders forever.
  const goldReady = goldLoaded || Boolean(loadError);
  const revenueReady = revenueLoaded || Boolean(loadError);

  // Headline figures for the gold card, read off the charted series itself.
  const latestGoldPrice = goldSeries.length ? goldSeries[goldSeries.length - 1].price : 0;
  const previousGoldPrice = goldSeries.length > 1 ? goldSeries[goldSeries.length - 2].price : 0;

  // Movement against the previous recorded price. One lone record has nothing
  // to compare against, so the badge is left off rather than shown as zero.
  const goldChangePercent = previousGoldPrice > 0
    ? ((latestGoldPrice - previousGoldPrice) / previousGoldPrice) * 100
    : null;
  const goldIsFlat = goldChangePercent === null || Math.abs(goldChangePercent) < 0.005;
  const goldChangeTone = goldIsFlat ? 'is-flat' : goldChangePercent! > 0 ? 'is-up' : 'is-down';
  const goldChangeIcon = goldIsFlat ? removeOutline : goldChangePercent! > 0 ? trendingUpOutline : trendingDownOutline;
  const goldChangeLabel = goldChangePercent === null
    ? ''
    : goldIsFlat
      ? 'No change'
      : `${goldChangePercent > 0 ? '+' : '-'}${Math.abs(goldChangePercent).toFixed(2)}%`;

  // Headline figures for the revenue card, all derived from the charted series.
  const revenueTotal = revenueSeries.reduce((total, day) => total + day.revenue, 0);
  const bestRevenueDay = revenueSeries.reduce((best, day) => Math.max(best, day.revenue), 0);

  // Week on week movement. A previous week with no collections has no base to
  // take a percentage of, so the badge is left off rather than shown as a
  // meaningless figure.
  const revenueChangePercent = priorWeekRevenue > 0
    ? ((revenueTotal - priorWeekRevenue) / priorWeekRevenue) * 100
    : null;
  const revenueChangeTone = revenueChangePercent === null || Math.abs(revenueChangePercent) < 0.05
    ? 'is-flat'
    : revenueChangePercent > 0 ? 'is-up' : 'is-down';
  const revenueChangeLabel = revenueChangePercent === null
    ? ''
    : Math.abs(revenueChangePercent) < 0.05
      ? 'No change from last week'
      : `${revenueChangePercent > 0 ? '↑' : '↓'} ${Math.abs(revenueChangePercent).toFixed(1)}% from last week`;

  return (
  <section className="admin-content">
    <div className="admin-intro admin-dashboard-intro">
      <div>
        <small>THURSDAY, SEPTEMBER 03, 2026</small>
        <h2>Quick links</h2>
        <p>Review shop performance, risk posture, and recent operational events.</p>
      </div>
      <IonButton onClick={() => go('reports')}>Open reports</IonButton>
    </div>
    {loadError && <p className="admin-load-error">{loadError}</p>}

    <div className="admin-stats overview-grid" aria-busy={!statsLoaded}>
      {statsLoaded
        ? liveStats.map((stat, index) => (
            <Stat key={stat.label} icon={stat.icon} value={stat.value} label={stat.label} tone={stat.tone} onClick={statLinks[index]} />
          ))
        : overviewStats.map((stat) => <SkeletonStat key={stat.label} />)}
    </div>

    <div className="dashboard-insight-grid">
      <div className="admin-panel dashboard-widget gold-dashboard-widget">
        <PanelHead title="Market Reference" eyebrow="MARKET UPDATE" />
        <div className="gold-metal-toggle" role="tablist" aria-label="Metal">
          {(['gold', 'silver'] as const).map(metal => (
            <button
              key={metal}
              type="button"
              role="tab"
              aria-selected={marketMetal === metal}
              className={marketMetal === metal ? 'active' : ''}
              onClick={() => setMarketMetal(metal)}
            >
              {metal === 'gold' ? 'Gold' : 'Silver'}
            </button>
          ))}
        </div>
        <small className="gold-price-caption">Today's {marketName} Reference Price</small>
        <div className="gold-price-summary">
          {goldReady ? (
            <>
              <strong className="gold-price-current">
                {latestGoldPrice > 0 ? <>{money(latestGoldPrice)} <i>/ gram</i></> : 'No price recorded'}
              </strong>
              {goldChangeLabel && (
                <span className={`gold-price-delta ${goldChangeTone}`}>
                  <IonIcon icon={goldChangeIcon} aria-hidden="true" />
                  {goldChangeLabel}
                </span>
              )}
            </>
          ) : (
            <>
              <Skeleton width="46%" height="1.6rem" radius="8px" />
              <Skeleton width="72px" height="1.1rem" radius="999px" />
            </>
          )}
        </div>
        <GoldPriceChart
          points={goldSeries}
          loading={!goldLoaded && !loadError}
          error={loadError ? `${marketName} price history is unavailable right now.` : ''}
        />
        <small className="gold-price-caption">Recent {marketName.toLowerCase()} price movement</small>
        <small className="gold-price-caption">Used as a starting reference for jewelry valuation — final appraisal remains at staff's discretion.</small>
        {/* The accuracy figure is measured on the gold forecast only. */}
        {marketMetal === 'gold' && predictionAccuracy !== null && (
          <small className="gold-price-accuracy">AI predicted price accuracy: {predictionAccuracy}%</small>
        )}
      </div>

      <div className="admin-panel dashboard-widget revenue-widget">
        <PanelHead title="Revenue trend" eyebrow="LAST 7 DAYS" />
        <div className="revenue-summary">
          {revenueReady ? (
            <>
              <strong className="revenue-summary-total">{moneyExact(revenueTotal)}</strong>
              {revenueChangeLabel && <span className={`revenue-summary-delta ${revenueChangeTone}`}>{revenueChangeLabel}</span>}
            </>
          ) : (
            <>
              <Skeleton width="46%" height="1.6rem" radius="8px" />
              <Skeleton width="96px" height="1.1rem" radius="999px" />
            </>
          )}
        </div>
        {revenueReady && (
          <small className="revenue-summary-caption">
            Collected over the last 7 days
            {bestRevenueDay > 0 && ` · Best day ${moneyExact(bestRevenueDay)}`}
          </small>
        )}
        <RevenueTrendChart
          points={revenueSeries}
          loading={!revenueLoaded && !loadError}
          error={loadError ? 'Revenue data is unavailable right now.' : ''}
        />
      </div>
    </div>

    {/* Due calendar and its details panel, the same view the staff
        dashboard has. Replaces the Risk alerts and Recent activity panels:
        risk alerts show in the panel's default "Today and at risk" view. */}
    <StaffDueCalendar
      variant="admin"
      onView={row => onOpenRecords('transactions', row.ticket_number)}
      headerAction={(
        <button type="button" className="due-calendar-action" onClick={() => setScheduleOpen(true)}>
          <IonIcon icon={calendarOutline} aria-hidden="true" />
          Shop schedule
        </button>
      )}
    />
    <ShopScheduleModal isOpen={scheduleOpen} onClose={() => setScheduleOpen(false)} />
  </section>
  );
};

const Stat: React.FC<{ icon: string; value: string; label: string; tone?: string; onClick?: () => void }> = ({ icon, value, label, tone = 'primary', onClick }) => {
  const body = (
    <>
      <IonIcon icon={icon} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </>
  );

  // With a handler the card is a quick link to the list behind its figure.
  return onClick ? (
    <button type="button" className={`admin-stat admin-stat-link ${tone}`} onClick={onClick} aria-label={`${label}: ${value}. Open list`}>
      {body}
    </button>
  ) : (
    <div className={`admin-stat ${tone}`}>{body}</div>
  );
};

const Tabs: React.FC<{ tabs: Array<{ id: Tab; label: string }>; active: Tab; onChange: (tab: Tab) => void }> = ({ tabs, active, onChange }) => (
  <div className="admin-tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        className={active === tab.id ? 'active' : ''}
        onClick={() => onChange(tab.id)}
        role="tab"
        aria-selected={active === tab.id}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

/** The two account lists the Manage page switches between. */
type AccountTab = 'staff' | 'customer';
const ACCOUNT_TABS: Array<{ id: AccountTab; label: string; icon: string }> = [
  { id: 'staff', label: 'Staff', icon: shieldCheckmarkOutline },
  { id: 'customer', label: 'Customers', icon: peopleOutline },
];

const Manage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('users');
  const [accountTab, setAccountTab] = useState<AccountTab>('staff');
  const [search, setSearch] = useState('');
  const modal = useModal();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The account currently open in the update dialog, plus its editable copy.
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<ApiUser | null>(null);
  const [updateForm, setUpdateForm] = useState({ status: 'active' as ApiUser['status'], password: '' });
  const [updateError, setUpdateError] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const addUser = async () => {
    setError('');
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setError('Enter a name, valid email, and password with at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      const created = await createUser({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      setUsers((current) => [created, ...current]);
      setForm({ name: '', email: '', password: '' });
      setShowAddUser(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  const openUpdate = (user: ApiUser) => {
    setUpdateError('');
    setUpdateTarget(user);
    setUpdateForm({ status: user.status, password: '' });
  };

  const submitUpdate = async () => {
    if (!updateTarget) return;
    setUpdateError('');
    if (updateForm.password && updateForm.password.length < 8) {
      setUpdateError('A new password needs at least 8 characters.');
      return;
    }

    /*
      Turning an account off locks a person out of the system. It is one click
      away from a password reset in the same dialog, so it is worth stopping to
      say out loud which account, and what happens to it.
    */
    if (updateTarget.status === 'active' && updateForm.status === 'inactive') {
      const agreed = await modal.confirm({
        title: 'Deactivate this account?',
        message: <>
          <strong>{updateTarget.name}</strong> ({updateTarget.email}) will be signed out of every device and will not be able to sign in again until an admin turns the account back on.
          {updateTarget.role === 'customer'
            ? ' Their pawns and records stay exactly as they are.'
            : ' Their recorded work stays exactly as it is.'}
        </>,
        confirmLabel: 'Deactivate account',
        tone: 'danger',
      });
      if (!agreed) return;
    }

    setUpdating(true);
    try {
      const saved = await updateUser(updateTarget.users_id, {
        status: updateForm.status,
        ...(updateForm.password ? { password: updateForm.password } : {}),
      });
      setUsers((current) => current.map((user) => (user.users_id === saved.users_id ? saved : user)));
      setUpdateTarget(null);
    } catch (requestError) {
      setUpdateError(requestError instanceof Error ? requestError.message : 'Unable to update user.');
    } finally {
      setUpdating(false);
    }
  };

  const staffCount = users.filter((user) => user.role === 'staff').length;
  const customerCount = users.filter((user) => user.role === 'customer').length;

  // One tab shows one role, narrowed further by the search box.
  const term = search.trim().toLowerCase();
  const visibleUsers = users
    .filter((user) => user.role === accountTab)
    .filter((user) => !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term));
  const userPage = usePagedRows(visibleUsers);

  return (
    <section className="admin-content">
      <PageIntro eyebrow="ADMINISTRATION" title="List of User Information" text="Manage staff and customer accounts, then configure system-wide policies." />
      <Tabs
        tabs={[{ id: 'users', label: 'Staff & Customer Accounts' }, { id: 'settings', label: 'System Settings' }]}
        active={tab}
        onChange={setTab}
      />

      <div className="admin-panel">
        {tab === 'users' ? (
          <>
            {loading && <SkeletonList rows={5} />}
            {!loading && <>
              <PanelHead
                title="Accounts"
                eyebrow="USER MANAGEMENT"
                action={accountTab === 'staff' ? 'Add staff' : undefined}
                onAction={() => { setError(''); setShowAddUser(true); }}
              />

              <div className="acct-toolbar">
                <div className="acct-tabs" role="tablist" aria-label="Account type">
                  {ACCOUNT_TABS.map((entry) => (
                    <button
                      key={entry.id}
                      role="tab"
                      aria-selected={accountTab === entry.id}
                      className={accountTab === entry.id ? 'active' : ''}
                      onClick={() => setAccountTab(entry.id)}
                    >
                      <IonIcon icon={entry.icon} />
                      {entry.label}
                      <b>{entry.id === 'staff' ? staffCount : customerCount}</b>
                    </button>
                  ))}
                </div>

                <label className="acct-search">
                  <IonIcon icon={searchOutline} aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={accountTab === 'staff' ? 'Search staff by name or email' : 'Search customers by name or email'}
                    aria-label="Search accounts"
                  />
                </label>
              </div>

              <div className="acct-table">
                <div className="acct-head">
                  <span>User</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {userPage.pageRows.map((user) => (
                  <div className="acct-row" key={user.users_id}>
                    <div className="acct-user">
                      <i aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</i>
                      <strong>{user.name}</strong>
                    </div>
                    <span className="acct-email">{user.email}</span>
                    <em className={`acct-role ${user.role}`}>{user.role}</em>
                    <em className={user.status === 'active' ? 'acct-status active' : 'acct-status inactive'}>
                      {user.status === 'active' ? 'Active' : 'Inactive'}
                    </em>
                    <button type="button" className="acct-action" onClick={() => openUpdate(user)}>Update</button>
                  </div>
                ))}

                {visibleUsers.length === 0 && (
                  <p className="admin-inline-message acct-empty">
                    {search.trim()
                      ? 'No accounts match that search.'
                      : accountTab === 'staff' ? 'No staff accounts found.' : 'No customer accounts found.'}
                  </p>
                )}
              </div>

              <Pager pager={userPage.pager} label="accounts" />
            </>}
          </>
        ) : (
          <SystemSettingsForm />
        )}
      </div>

      <IonModal isOpen={showAddUser} onDidDismiss={() => { setShowAddUser(false); setShowNewPassword(false); }} className="admin-user-modal">
        <div className="admin-user-modal-box">
          <div className="admin-user-modal-head">
            <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={personAddOutline} /></span>
            <div>
              <small>STAFF MANAGEMENT</small>
              <h3>Add staff</h3>
              <p className="admin-modal-sub">The account is created active, with the staff role and the password you set here.</p>
            </div>
            <button type="button" onClick={() => setShowAddUser(false)} aria-label="Close add user dialog"><IonIcon icon={closeOutline} /></button>
          </div>

          <div className="admin-modal-fields">
            <label>Full name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="User full name" /></label>
            <label>Email address<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="user@smartpawn.ph" /></label>
            <label>
              Password
              <span className="admin-modal-password">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                  <IonIcon icon={showNewPassword ? eyeOffOutline : eyeOutline} />
                </button>
              </span>
              <small className="admin-modal-hint">Eight characters or more. The staff member can change it later from their profile.</small>
            </label>
          </div>

          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <div className="admin-user-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setShowAddUser(false)}>Cancel</button><button type="button" className="admin-primary-button" onClick={addUser} disabled={saving} aria-busy={saving}>{saving && <Spinner />}{saving ? 'Saving' : 'Create user'}</button></div>
        </div>
      </IonModal>

      <IonModal isOpen={updateTarget !== null} onDidDismiss={() => { setUpdateTarget(null); setShowUpdatePassword(false); }} className="admin-user-modal">
        <div className="admin-user-modal-box">
          <div className="admin-user-modal-head">
            <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={personCircleOutline} /></span>
            <div>
              <small>{updateTarget?.role === 'customer' ? 'CUSTOMER MANAGEMENT' : 'STAFF MANAGEMENT'}</small>
              <h3>Update account</h3>
              <p className="admin-modal-sub">Status and password only. The name and email stay as the account holder set them.</p>
            </div>
            <button type="button" onClick={() => setUpdateTarget(null)} aria-label="Close update user dialog"><IonIcon icon={closeOutline} /></button>
          </div>

          <div className="admin-user-modal-summary">
            <i aria-hidden="true">{(updateTarget?.name || '?').trim().charAt(0).toUpperCase()}</i>
            <div>
              <strong>{updateTarget?.name}</strong>
              <span>{updateTarget?.email}</span>
            </div>
            <div className="admin-modal-badges">
              {updateTarget && <em className={`acct-role ${updateTarget.role}`}>{updateTarget.role}</em>}
              {updateTarget && <em className={updateTarget.status === 'active' ? 'acct-status active' : 'acct-status inactive'}>{updateTarget.status === 'active' ? 'Active' : 'Inactive'}</em>}
            </div>
          </div>

          <div className="admin-modal-fields">
            <label>Status
              <TypeSelect
                ariaLabel="Status"
                value={updateForm.status}
                options={ACCOUNT_STATUS_OPTIONS}
                onChange={(value) => setUpdateForm((current) => ({ ...current, status: value as ApiUser['status'] }))}
              />
              <small className="admin-modal-hint">An inactive account keeps its records but cannot sign in.</small>
            </label>
            <label>
              New password
              <span className="admin-modal-password">
                <input
                  type={showUpdatePassword ? 'text' : 'password'}
                  value={updateForm.password}
                  onChange={(event) => setUpdateForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Leave blank to keep current password"
                />
                <button type="button" onClick={() => setShowUpdatePassword(!showUpdatePassword)} aria-label={showUpdatePassword ? 'Hide password' : 'Show password'}>
                  <IonIcon icon={showUpdatePassword ? eyeOffOutline : eyeOutline} />
                </button>
              </span>
              <small className="admin-modal-hint">Leave blank to keep the current password, or set eight characters or more.</small>
            </label>
          </div>

          {updateError && <p className="admin-form-error" role="alert">{updateError}</p>}
          <div className="admin-user-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setUpdateTarget(null)}>Cancel</button><button type="button" className="admin-primary-button" onClick={submitUpdate} disabled={updating} aria-busy={updating}>{updating && <Spinner />}{updating ? 'Saving' : 'Save changes'}</button></div>
        </div>
      </IonModal>
    </section>
  );
};

/**
 * Shop schedule dialog, opened from the dashboard calendar.
 *
 * The weekly pattern is three ordinary settings, edited with the rest of them.
 * What needs its own screen is the exceptions: the holidays and short days a
 * customer has to know about before they travel to the branch.
 */
const ShopScheduleModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const modal = useModal();
  const [closures, setClosures] = useState<ApiShopClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ closure_date: '', label: '', kind: 'closed' as 'closed' | 'half_day', opens_at: '09:00', closes_at: '12:00' });

  /*
    Three months at a time, starting with this one: a shop announces a holiday
    weeks ahead, not a year.
  */
  const load = useCallback(() => {
    setError('');
    setLoading(true);
    const now = new Date();
    const months = [0, 1, 2].map(step => {
      const date = new Date(now.getFullYear(), now.getMonth() + step, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });

    Promise.all(months.map(month => getShopSchedule(month)))
      .then(results => setClosures(results.flatMap(result => result.closures)))
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load the shop schedule.'))
      .finally(() => setLoading(false));
  }, []);

  // Loaded each time the dialog opens, so a notice another admin added since
  // the last visit is listed.
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const save = async () => {
    if (!draft.closure_date || draft.label.trim() === '') {
      setError('Pick a date and say what it is.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveShopClosure({
        closure_date: draft.closure_date,
        label: draft.label.trim(),
        kind: draft.kind,
        opens_at: draft.kind === 'half_day' ? draft.opens_at : undefined,
        closes_at: draft.kind === 'half_day' ? draft.closes_at : undefined,
      });
      setDraft({ closure_date: '', label: '', kind: 'closed', opens_at: '09:00', closes_at: '12:00' });
      load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'That date could not be announced.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (closure: ApiShopClosure) => {
    const agreed = await modal.confirm({
      title: 'Remove this notice?',
      message: <>Customers will stop seeing <strong>{closure.label}</strong> on {closure.closure_date}. The branch will show as open that day.</>,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!agreed) return;

    try {
      await deleteShopClosure(closure.shop_closures_id);
      load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'That notice could not be removed.');
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="admin-user-modal admin-schedule-modal">
      <div className="admin-user-modal-box sched-panel">
        <div className="admin-user-modal-head">
          <span className="admin-modal-icon" aria-hidden="true"><IonIcon icon={calendarOutline} /></span>
          <div>
            <small>WHAT CUSTOMERS SEE ON THEIR CALENDAR</small>
            <h3>Holiday and closure notices</h3>
            <p className="admin-modal-sub">Opening days and hours are set with the rest of the system settings. This is for the days that break the pattern.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close shop schedule dialog"><IonIcon icon={closeOutline} /></button>
        </div>

        <div className="admin-modal-scroll">
          <div className="sched-form">
            <label>
              Date
              <input type="date" value={draft.closure_date} onChange={event => { setDraft(current => ({ ...current, closure_date: event.target.value })); setError(''); }} />
            </label>
            <label>
              What is it
              <input value={draft.label} maxLength={120} placeholder="e.g. All Saints' Day" onChange={event => { setDraft(current => ({ ...current, label: event.target.value })); setError(''); }} />
            </label>
            <label>
              Kind
              <select value={draft.kind} onChange={event => setDraft(current => ({ ...current, kind: event.target.value as 'closed' | 'half_day' }))}>
                <option value="closed">Closed all day</option>
                <option value="half_day">Shorter hours</option>
              </select>
            </label>
            {draft.kind === 'half_day' && (
              <>
                <label>
                  Opens
                  <input type="time" value={draft.opens_at} onChange={event => setDraft(current => ({ ...current, opens_at: event.target.value }))} />
                </label>
                <label>
                  Closes
                  <input type="time" value={draft.closes_at} onChange={event => setDraft(current => ({ ...current, closes_at: event.target.value }))} />
                </label>
              </>
            )}
          </div>

          {error && <p className="admin-form-error" role="alert">{error}</p>}

          <div className="sched-actions">
            <button type="button" className="admin-primary-button" onClick={save} disabled={saving} aria-busy={saving}>{saving && <Spinner />}{saving ? 'Saving' : 'Announce this day'}</button>
          </div>

          <div className="sched-list">
            <div className="sched-head">
              <span>Date</span>
              <span>What it is</span>
              <span>Hours</span>
              <span className="col-sr">Action</span>
            </div>

            {loading && <SkeletonText lines={3} />}

            {!loading && closures.map(closure => (
              <div className="sched-row" key={closure.shop_closures_id}>
                <span>{closure.closure_date}</span>
                <span>{closure.label}</span>
                <span>{closure.kind === 'closed' ? <em className="sched-closed">Closed all day</em> : `${closure.opens_at} - ${closure.closes_at}`}</span>
                <button type="button" className="sched-remove" onClick={() => remove(closure)}>Remove</button>
              </div>
            ))}

            {!loading && closures.length === 0 && (
              <p className="sched-empty">Nothing announced for the next three months. Customers see the usual week.</p>
            )}
          </div>
        </div>
      </div>
    </IonModal>
  );
};

/** Human readable label for a system_settings key. */
const SETTING_LABEL: Record<string, string> = {
  current_gold_price: 'Fallback gold price per gram',
  risk_threshold_percent: 'Risk safety margin (%)',
  jewelry_watch_phone_rate: 'Monthly Interest (Renta) — jewelry, watch, cellphone (%)',
  bulky_item_rate: 'Monthly Interest (Renta) — bulky items (%)',
  default_loan_to_value: 'Default pawn-to-value (%)',
  loan_term_days: 'Pawn term (days)',
  grace_period_days: 'Extension period (days)',
  due_soon_notice_days: 'Due date reminder (days before)',
  value_change_notice_percent: 'Value change notice (%)',
  redemption_visit_days: 'Redemption hold (days)',
  renewal_term_days: 'Online renewal extension (days)',
  gcash_payment_info: 'GCash number/account shown to customers',
  shop_open_days: 'Open days (1 = Monday … 7 = Sunday)',
  shop_opens_at: 'Opening time (24h, e.g. 09:00)',
  shop_closes_at: 'Closing time (24h, e.g. 18:00)',
};

const settingLabel = (key: string) => SETTING_LABEL[key] || key.split('_').join(' ');

/**
 * Edits the shop's system_settings rows. The list is whatever the API returns,
 * so a new setting appears here without a code change and nothing on the form
 * is a value the shop never configured.
 */
const SystemSettingsForm: React.FC<{ only?: string[]; title?: string }> = ({ only, title = 'System settings' }) => {
  const [settings, setSettings] = useState<ApiSystemSetting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSystemSettings()
      .then((rows) => {
        const visible = only ? rows.filter((row) => only.includes(row.setting_key)) : rows;
        setSettings(visible);
        setDraft(Object.fromEntries(visible.map((row) => [row.setting_key, row.setting_value])));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load settings.'))
      .finally(() => setLoading(false));
  }, [only]);

  const update = (key: string, value: string) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // Only the rows the admin actually changed are sent back.
  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const changed = settings.filter((row) => draft[row.setting_key] !== row.setting_value);
      await Promise.all(changed.map((row) => saveSystemSetting(row.setting_key, draft[row.setting_key])));
      setSettings((current) => current.map((row) => ({ ...row, setting_value: draft[row.setting_key] ?? row.setting_value })));
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = settings.some((row) => draft[row.setting_key] !== row.setting_value);

  if (loading) return <div className="settings-grid" aria-busy="true"><SkeletonText lines={4} /><SkeletonText lines={4} /></div>;

  return (
    <>
      <PanelHead title={title} action="Save settings" busy={saving} onAction={save} />
      {error && <p className="admin-form-error">{error}</p>}
      {saved && !dirty && <p className="admin-inline-message">Settings saved.</p>}
      {settings.length === 0 && !error && <p className="admin-inline-message">No settings returned by the API.</p>}
      <div className="settings-grid">
        {settings.map((row) => (
          <label key={row.setting_key}>
            {settingLabel(row.setting_key)}
            <input
              value={draft[row.setting_key] ?? ''}
              onChange={(event) => update(row.setting_key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </>
  );
};

const Monitoring: React.FC<{ initialTab?: Tab }> = ({ initialTab = 'models' }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  // The risk tab owns its own alert request, so it can refresh in place.
  const [policySaved, setPolicySaved] = useState(false);

  return (
    <section className="admin-content">
      <PageIntro eyebrow="OPERATIONS CONTROL" title="AI Monitoring" text="Monitor AI performance, commodity pricing, risk policies, and all platform activity." />
      <Tabs
        tabs={[
          { id: 'models', label: 'AI Model Monitoring' },
          { id: 'gold', label: 'Gold Price Tracking' },
          { id: 'risk', label: 'Risk Management' },
          { id: 'activity', label: 'Open Risk List' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="admin-panel">
        {tab === 'models' && (
          <>
            <div className="admin-stats monitor-stats">
              <Stat icon={pulseOutline} value="98.2%" label="Model availability" />
              <Stat icon={analyticsOutline} value="92%" label="Average confidence" />
              <Stat icon={shieldCheckmarkOutline} value="97.9%" label="Prediction accuracy" />
            </div>
            <ModelMonitoring />
          </>
        )}

        {tab === 'gold' && <GoldPriceTracking />}

        {tab === 'risk' && (
          <RiskManagement
            policySaved={policySaved}
            onSavePolicy={() => setPolicySaved(true)}
            onPolicyEdited={() => setPolicySaved(false)}
          />
        )}

        {tab === 'activity' && <Activity />}
      </div>
    </section>
  );
};

const Activity: React.FC = () => {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getRiskAlerts()
      .then(alerts => setRows(alerts.filter(alert => !alert.resolved).map(toRiskRow)))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="activity-list">
      <div className="admin-table-head activity-table-head">
        <span>Customer / Item</span>
        <span>Pawn amount</span>
        <span>Risk</span>
      </div>

      {rows.map((alert) => (
        <div className="activity-row" key={alert.id}>
          <div>
            <strong>{alert.customer}</strong>
            <small>{alert.item} &middot; {alert.id}</small>
          </div>
          <strong>{alert.amount}</strong>
          <em className={alert.risk.toLowerCase()}>{alert.risk}</em>
        </div>
      ))}
      {rows.length === 0 && <p className="risk-empty">{loaded ? 'No unresolved risk alerts.' : 'Loading risk alerts...'}</p>}
    </div>
  );
};

/** One export in Reports > Exports: what it holds and how its rows are fetched. */
const EXPORTS: Array<{ id: string; title: string; detail: string; run: () => Promise<number> }> = [
  { id: 'transactions', title: 'All pawn transactions', detail: 'Every ticket with amounts, due date and status.', run: async () => { const rows = await getTransactions(); transactionsCsv(rows); return rows.length; } },
  { id: 'payments', title: 'Payments collected', detail: 'Redemptions with principal, interest and total paid.', run: async () => { const rows = (await getTransactions()).filter(isPayment); paymentsCsv(rows); return rows.length; } },
  { id: 'overdue', title: 'Overdue and expired/unclaimed', detail: 'Active pawns past due, plus forfeited pawns.', run: async () => { const rows = (await getTransactions()).filter(row => isOverdue(row) || row.status === 'forfeited'); overdueCsv(rows); return rows.length; } },
  { id: 'customers', title: 'Customer records', detail: 'Profile, valid ID and pawn counts per customer.', run: async () => { const rows = await getCustomers(); customersCsv(rows); return rows.length; } },
  { id: 'activity', title: 'Staff activity log', detail: 'The latest 200 recorded staff and admin actions.', run: async () => { const rows = await getAuditLogs(200); activityCsv(rows); return rows.length; } },
];

const percent = (value: number | null) => (value === null ? '-' : `${value}%`);

/** A rating drawn as five stars, for a table row or a headline figure. */
const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="fb-stars" aria-label={`${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map(star => (
      <IonIcon key={star} icon={star <= Math.round(rating) ? starFilled : starOutline} className={star <= Math.round(rating) ? 'is-on' : ''} />
    ))}
  </span>
);

/**
 * Reports > Customer Feedback.
 *
 * The average and the count sit together on purpose: a 5.0 from one customer
 * is a different shop from a 4.6 from ninety, and either number alone invites
 * the wrong conclusion. The spread underneath says what the average hides.
 */
const FeedbackPanel: React.FC = () => {
  const [data, setData] = useState<ApiFeedbackList | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getFeedbackList()
      .then(setData)
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load customer feedback.'));
  }, []);

  if (error) return <p className="admin-form-error">{error}</p>;
  if (!data) return <SkeletonText lines={4} />;

  const highest = Math.max(1, ...Object.values(data.rating_counts));

  return (
    <div className="fb-panel">
      <div className="report-grid fb-summary">
        <Metric
          label="Average rating"
          value={data.average_rating === null ? '-' : `${data.average_rating.toFixed(2)} / 5`}
          detail={data.total === 0 ? 'No responses yet' : `Across ${data.total} ${data.total === 1 ? 'response' : 'responses'}`}
        />
        <Metric label="Total responses" value={String(data.total)} detail="Redeemed pawns rated by the customer" />
      </div>

      {data.total > 0 && (
        <div className="fb-spread">
          {[5, 4, 3, 2, 1].map(star => {
            const count = data.rating_counts[String(star)] || 0;
            return (
              <div className="fb-spread-row" key={star}>
                <span>{star} star{star === 1 ? '' : 's'}</span>
                <i aria-hidden="true"><b style={{ width: `${(count / highest) * 100}%` }} /></i>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      )}

      <div className="admin-table-head fb-head">
        <span>Date</span>
        <span>Customer</span>
        <span>Ticket No.</span>
        <span>Rating</span>
        <span>Comment</span>
      </div>

      {data.feedback.map(row => (
        <div className="fb-row" key={row.feedback_id}>
          <span>{row.submitted_at ? shortDate(row.submitted_at) : '-'}</span>
          <span>{row.customer_name || '-'}</span>
          <span>{row.ticket_number || '-'}</span>
          <span><Stars rating={row.rating} /></span>
          <span className="fb-comment">{row.comment || <em>No comment</em>}</span>
        </div>
      ))}

      {data.feedback.length === 0 && (
        <p className="admin-inline-message acct-empty">No customer feedback yet. Customers are asked once after each pawn is redeemed.</p>
      )}
    </div>
  );
};

const Reports: React.FC = () => {
  const modal = useModal();
  const [tab, setTab] = useState<Tab>('analytics');
  const [summary, setSummary] = useState<ApiReportSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    getReportSummary()
      .then(setSummary)
      .catch(error => setSummaryError(error instanceof Error ? error.message : 'Unable to load the report summary.'));
  }, []);

  const runExport = async (entry: typeof EXPORTS[number]) => {
    setExporting(entry.id);
    try {
      const count = await entry.run();
      if (count === 0) modal.info({ title: 'Nothing to export', message: <><strong>{entry.title}</strong> has no rows yet. An empty file with headers was downloaded.</> });
    } catch (error) {
      modal.info({ title: 'Export failed', message: error instanceof Error ? error.message : 'Unable to export this report.' });
    } finally {
      setExporting('');
    }
  };

  const change = summary?.monthly_loan_volume_change_percent;

  return (
    <section className="admin-content">
      <PageIntro eyebrow="BUSINESS INTELLIGENCE" title="Generate Reports" text="Review live shop figures and download records as CSV files." />
      <Tabs tabs={[{ id: 'analytics', label: 'Analytics' }, { id: 'feedback', label: 'Customer Feedback' }, { id: 'exports', label: 'Exports' }]} active={tab} onChange={setTab} />

      <div className="admin-panel">
        {tab === 'feedback' ? <FeedbackPanel /> : tab === 'analytics' ? (
          summaryError ? <p className="admin-form-error">{summaryError}</p> : !summary ? <SkeletonText lines={4} /> : (
            <div className="report-grid">
              <Metric label="Monthly pawn volume" value={money(summary.monthly_loan_volume)} detail={change === null || change === undefined ? 'No pawns last month to compare' : `${change > 0 ? '+' : ''}${change}% vs last month`} />
              <Metric label="Redemption rate" value={percent(summary.redemption_rate_percent)} detail="Redeemed out of all closed pawns" />
              <Metric label="Average pawn amount" value={money(summary.average_loan)} detail={`Across ${summary.active_loans} active pawns`} />
              <Metric label="Risk alerts" value={String(summary.open_risk_alerts)} detail={`${summary.high_risk_alerts} high risk`} />
              <Metric label="Total collected" value={money(summary.total_collected)} detail="Principal plus interest from redemptions" />
              <Metric label="Inventory value" value={money(summary.inventory_value)} detail={`For-sale items: ${money(summary.items_for_sale_value)}`} />
              {/* Renewals are renta collected without the pawn closing, so
                  they are counted apart from redemptions rather than folded
                  into Total collected. */}
              <Metric label="Renewals this month" value={String(summary.renewals_this_month)} detail={`${summary.pending_renewals} waiting to be checked`} />
              <Metric label="Renewal income" value={money(summary.renewal_income_this_month)} detail={`${money(summary.renewal_income_total)} since the shop opened`} />
            </div>
          )
        ) : (
          <div className="export-list">
            <div className="admin-table-head export-table-head">
              <span>Report</span>
              <span>Contents</span>
              <span>Action</span>
            </div>

            {EXPORTS.map((entry) => (
              <div className="export-row" key={entry.id}>
                <IonIcon icon={documentTextOutline} />
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </div>
                <IonButton fill="outline" onClick={() => runExport(entry)} disabled={exporting !== ''} aria-busy={exporting === entry.id}>
                  {exporting === entry.id ? <Spinner /> : <IonIcon slot="start" icon={downloadOutline} />}
                  Export CSV
                </IonButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const PageIntro: React.FC<{ eyebrow: string; title: string; text: string }> = ({ eyebrow, title, text }) => (
  <div className="admin-page-intro">
    <small>{eyebrow}</small>
    <h2>{title}</h2>
    <p>{text}</p>
  </div>
);

const PanelHead: React.FC<{ title: string; action?: string; eyebrow?: string; busy?: boolean; onAction?: () => void }> = ({ title, action, eyebrow, busy = false, onAction }) => (
  <div className="admin-panel-head">
    <div>{eyebrow && <small>{eyebrow}</small>}<h3>{title}</h3></div>
    {action && (
      // The label stays put while the action runs, so the button keeps its
      // width and the reader keeps their place.
      <IonButton onClick={onAction} disabled={busy} aria-busy={busy}>{busy && <Spinner />}{action}</IonButton>
    )}
  </div>
);

const Metric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div className="metric">
    <small>{label}</small>
    <strong>{value}</strong>
    <span>{detail}</span>
  </div>
);

const AdminProfile: React.FC = () => {
  const [name, setName] = useState('System Admin');
  const [saved, setSaved] = useState(false);

  return (
    <section className="admin-content">
      <PageIntro eyebrow="ACCOUNT" title="Profile" text="Update administrator information and review account access." />
      <div className="admin-panel admin-profile-panel">
        <PanelHead title="Administrator profile" action="Save changes" />
        <div className="settings-grid">
          <label>
            Full name
            <input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} />
          </label>
          <label>
            Email address
            <input value="admin@smartpawn.ph" readOnly />
          </label>
          <label>
            Role
            <input value="System Administrator" readOnly />
          </label>
          <label>
            Account status
            <input value="Active" readOnly />
          </label>
        </div>
        {saved && <small className="profile-saved">Changes saved successfully.</small>}
        <IonButton onClick={() => setSaved(true)}>Save changes</IonButton>
      </div>
    </section>
  );
};

export default AdminPortal;
