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
  banOutline,
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
import PurityPriceTable from '../components/PurityPriceTable';
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
  staff_pawn_extended: 'transactions',
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
 * transactions that same response already carries. amount_paid is what was
 * collected at the counter, which is exactly what revenue_trend buckets, so
 * both sides of the percentage use the same figure.
 */
const previousWeekRevenue = (transactions: ApiTransaction[]) => {
  const todayStart = startOfDay(new Date()).getTime();
  const windowStart = todayStart - 13 * DAY_MS;
  const windowEnd = todayStart - 7 * DAY_MS;

  return transactions.reduce((total, transaction) => {
    if (transaction.status !== 'redeemed' || !transaction.redeemed_at) return total;
    const redeemedDay = startOfDay(new Date(transaction.redeemed_at)).getTime();
    if (redeemedDay < windowStart || redeemedDay > windowEnd) return total;
    return total + Number(transaction.amount_paid ?? transaction.total_payable ?? 0);
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
        <small>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase()}</small>
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
        <PurityPriceTable metal={marketMetal} compact />
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

/**
 * The account lists the Manage page switches between: active staff, active
 * customers, and every inactive account of either role in its own tab, so a
 * deactivated account is easy to find and turn back on.
 */
type AccountTab = 'staff' | 'customer' | 'inactive';
const ACCOUNT_TABS: Array<{ id: AccountTab; label: string; icon: string }> = [
  { id: 'staff', label: 'Staff', icon: shieldCheckmarkOutline },
  { id: 'customer', label: 'Customers', icon: peopleOutline },
  { id: 'inactive', label: 'Inactive', icon: banOutline },
];

/** Whether an account belongs on a tab. */
const onAccountTab = (user: ApiUser, tab: AccountTab) =>
  tab === 'inactive' ? user.status !== 'active' : user.status === 'active' && user.role === tab;

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

  const tabCount = (tab: AccountTab) => users.filter((user) => onAccountTab(user, tab)).length;

  // One tab shows one role, narrowed further by the search box.
  const term = search.trim().toLowerCase();
  const visibleUsers = users
    .filter((user) => onAccountTab(user, accountTab))
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
                      <b>{tabCount(entry.id)}</b>
                    </button>
                  ))}
                </div>

                <label className="acct-search">
                  <IonIcon icon={searchOutline} aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={accountTab === 'staff' ? 'Search staff by name or email' : accountTab === 'customer' ? 'Search customers by name or email' : 'Search inactive accounts by name or email'}
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
                      : accountTab === 'staff' ? 'No active staff accounts.' : accountTab === 'customer' ? 'No active customer accounts.' : 'No inactive accounts. Accounts set to Inactive with Update show here.'}
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

/** How one system setting is shown: its label, a hint, and the input to use. */
type SettingMeta = { label: string; hint?: string; type?: 'number' | 'time' | 'text'; min?: number; max?: number; step?: number };

const SETTING_META: Record<string, SettingMeta> = {
  loan_term_days: { label: 'Pawn term (days)', hint: 'Days from the pawn date to the due date of a new pawn.', type: 'number', min: 1, max: 365, step: 1 },
  default_loan_to_value: { label: 'Default pawn-to-value (%)', hint: 'Pawn amount as a share of the appraised value, suggested on new pawns.', type: 'number', min: 1, max: 100, step: 0.1 },
  jewelry_watch_phone_rate: { label: 'Monthly interest (renta): jewelry, watch, cellphone (%)', type: 'number', min: 0, max: 100, step: 0.1 },
  bulky_item_rate: { label: 'Monthly interest (renta): bulky items (%)', type: 'number', min: 0, max: 100, step: 0.1 },
  minimum_interest_days: { label: 'Minimum interest charged (days)', hint: 'Redeemed or renewed sooner still pays this many days. 0 turns it off.', type: 'number', min: 0, max: 999, step: 1 },
  renewal_term_days: { label: 'Online renewal extension (days)', hint: 'Days a confirmed GCash renewal adds to the due date.', type: 'number', min: 1, max: 365, step: 1 },
  grace_period_days: { label: 'Redemption period after the due date (days)', hint: 'P.D. 114 requires at least 90 days. Applies to new pawns.', type: 'number', min: 90, max: 365, step: 1 },
  auction_notice_days: { label: 'Auction notice (days before the period ends)', hint: 'When the written notice of public auction goes out.', type: 'number', min: 1, max: 60, step: 1 },
  due_soon_notice_days: { label: 'Due date reminder (days before)', type: 'number', min: 0, max: 60, step: 1 },
  redemption_visit_days: { label: 'Ready-for-pickup hold (days)', hint: 'How long an item set aside for pickup waits before going back to the vault.', type: 'number', min: 0, max: 30, step: 1 },
  current_gold_price: { label: 'Fallback gold price per gram (₱)', hint: 'Used only when no market price has ever been recorded.', type: 'number', min: 1, step: 0.01 },
  natural_diamond_1ct_price: { label: 'Natural diamond reference price, 1 carat (₱)', hint: '0 = not set.', type: 'number', min: 0, step: 0.01 },
  pearl_price_per_gram: { label: 'Pearl reference price, per gram (₱)', hint: '0 = not set.', type: 'number', min: 0, step: 0.01 },
  risk_threshold_percent: { label: 'Risk safety margin (%)', hint: 'Warn once an item is worth less than this much above its pawn amount.', type: 'number', min: 0, max: 100, step: 0.1 },
  value_change_notice_percent: { label: 'Value change notice (%)', hint: 'Tell the customer when their item’s value moves this much.', type: 'number', min: 0, max: 100, step: 0.1 },
  shop_open_days: { label: 'Open days', hint: '1 = Monday … 7 = Sunday, separated by commas, e.g. 1,2,3,4,5,6.', type: 'text' },
  shop_opens_at: { label: 'Opening time', type: 'time' },
  shop_closes_at: { label: 'Closing time', type: 'time' },
  gcash_payment_info: { label: 'GCash number or account shown to customers', hint: 'Shown on the Renew Online panel.', type: 'text' },
  unusual_activity_threshold: { label: 'Unusual activity: pawns per customer', hint: 'Flag a customer who pawns this many items within the window.', type: 'number', min: 1, max: 100, step: 1 },
  unusual_activity_window_days: { label: 'Unusual activity: window (days)', type: 'number', min: 1, max: 90, step: 1 },
};

/** The Settings page, in sections. A setting not listed here shows under Other. */
const SETTING_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Pawn terms and interest', keys: ['loan_term_days', 'default_loan_to_value', 'jewelry_watch_phone_rate', 'bulky_item_rate', 'minimum_interest_days', 'renewal_term_days'] },
  { title: 'After the due date (P.D. 114)', keys: ['grace_period_days', 'auction_notice_days', 'due_soon_notice_days', 'redemption_visit_days'] },
  { title: 'Prices and risk', keys: ['current_gold_price', 'natural_diamond_1ct_price', 'pearl_price_per_gram', 'risk_threshold_percent', 'value_change_notice_percent'] },
  { title: 'Shop hours', keys: ['shop_open_days', 'shop_opens_at', 'shop_closes_at'] },
  { title: 'Payments and safety', keys: ['gcash_payment_info', 'unusual_activity_threshold', 'unusual_activity_window_days'] },
];

const settingLabel = (key: string) => SETTING_META[key]?.label || key.split('_').join(' ');

/**
 * Edits the shop's system_settings rows, in sections. The list is whatever
 * the API returns, so a new setting appears (under Other) without a code
 * change. Each changed setting is saved on its own, and a value the API
 * refuses shows its message under that field while the others still save.
 */
const SystemSettingsForm: React.FC<{ only?: string[]; title?: string }> = ({ only, title = 'System settings' }) => {
  const [settings, setSettings] = useState<ApiSystemSetting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
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
    setNotice('');
    setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // Only the rows the admin changed are sent, one at a time, so each refusal
  // is matched to its own field.
  const save = async () => {
    setError('');
    setNotice('');
    setSaving(true);
    const current = Object.fromEntries(settings.map((row) => [row.setting_key, row.setting_value]));
    let changed = settings.filter((row) => draft[row.setting_key] !== row.setting_value);
    // Moving the hours later: save closing time first, so the API never sees
    // an opening time after the old closing time (and the reverse).
    if ((draft.shop_opens_at ?? '') >= (current.shop_closes_at ?? '')) {
      changed = [...changed].sort((a) => (a.setting_key === 'shop_closes_at' ? -1 : 0));
    }
    const errors: Record<string, string> = {};
    const savedValues: Record<string, string> = {};
    for (const row of changed) {
      try {
        const result = await saveSystemSetting(row.setting_key, draft[row.setting_key]);
        savedValues[row.setting_key] = result.setting_value;
      } catch (requestError) {
        errors[row.setting_key] = requestError instanceof Error ? requestError.message : 'Could not save this setting.';
      }
    }
    // The API tidies some values (e.g. "1, 2" becomes "1,2"); show what was saved.
    setSettings((rows) => rows.map((row) => (row.setting_key in savedValues ? { ...row, setting_value: savedValues[row.setting_key] } : row)));
    setDraft((values) => ({ ...values, ...savedValues }));
    setFieldErrors(errors);
    const savedCount = Object.keys(savedValues).length;
    const failedCount = Object.keys(errors).length;
    setNotice(failedCount
      ? `${savedCount ? `${savedCount} saved. ` : ''}${failedCount} ${failedCount === 1 ? 'setting needs' : 'settings need'} fixing.`
      : savedCount ? 'Settings saved.' : 'Nothing to save.');
    setSaving(false);
  };

  const dirty = settings.some((row) => draft[row.setting_key] !== row.setting_value);

  if (loading) return <div className="settings-grid" aria-busy="true"><SkeletonText lines={4} /><SkeletonText lines={4} /></div>;

  const keys = new Set(settings.map((row) => row.setting_key));
  const listed = new Set(SETTING_GROUPS.flatMap((group) => group.keys));
  const groups = [
    ...SETTING_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => keys.has(key)) })),
    { title: 'Other', keys: settings.map((row) => row.setting_key).filter((key) => !listed.has(key)) },
  ].filter((group) => group.keys.length > 0);

  return (
    <>
      <PanelHead title={title} action={dirty ? 'Save settings' : 'Saved'} busy={saving} onAction={save} />
      {error && <p className="admin-form-error">{error}</p>}
      {notice && <p className={Object.keys(fieldErrors).length ? 'admin-form-error' : 'admin-inline-message'} role="status">{notice}</p>}
      {settings.length === 0 && !error && <p className="admin-inline-message">No settings returned by the API.</p>}
      {groups.map((group) => (
        <section key={group.title} className="settings-group">
          <h4>{group.title}</h4>
          <div className="settings-grid">
            {group.keys.map((key) => {
              const meta = SETTING_META[key] || {};
              const changed = draft[key] !== settings.find((row) => row.setting_key === key)?.setting_value;
              return (
                <label key={key} className={`${fieldErrors[key] ? 'has-error' : ''} ${changed ? 'is-changed' : ''}`}>
                  {settingLabel(key)}
                  <input
                    type={meta.type === 'number' ? 'number' : meta.type === 'time' ? 'time' : 'text'}
                    inputMode={meta.type === 'number' ? 'decimal' : undefined}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    value={draft[key] ?? ''}
                    onChange={(event) => update(key, event.target.value)}
                    aria-invalid={Boolean(fieldErrors[key])}
                  />
                  {fieldErrors[key] ? <small className="settings-error">{fieldErrors[key]}</small> : meta.hint && <small className="settings-hint">{meta.hint}</small>}
                </label>
              );
            })}
          </div>
        </section>
      ))}
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
  { id: 'overdue', title: 'Overdue and for auction', detail: 'Active pawns past due, plus pawns set for public auction.', run: async () => { const rows = (await getTransactions()).filter(row => isOverdue(row) || row.status === 'forfeited'); overdueCsv(rows); return rows.length; } },
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

/** The report summary as grouped table rows: what each figure is, and what it means. */
const REPORT_GROUPS = (summary: ApiReportSummary): Array<{ title: string; rows: Array<{ label: string; value: string; note: string }> }> => {
  const change = summary.monthly_loan_volume_change_percent;
  return [
    {
      title: 'Pawns',
      rows: [
        { label: 'Monthly pawn volume', value: money(summary.monthly_loan_volume), note: change === null || change === undefined ? 'No pawns last month to compare' : `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs last month` },
        { label: 'Active pawns', value: String(summary.active_loans), note: 'Pawns open today' },
        { label: 'Average pawn amount', value: money(summary.average_loan), note: `Across ${summary.active_loans} active pawns` },
        { label: 'Redemption rate', value: percent(summary.redemption_rate_percent), note: 'Redeemed out of all closed pawns' },
      ],
    },
    {
      title: 'Collections',
      rows: [
        { label: 'Total collected', value: money(summary.total_collected), note: 'Principal plus interest from redemptions' },
        { label: 'Renewal income this month', value: money(summary.renewal_income_this_month), note: `${money(summary.renewal_income_total)} since the shop opened` },
        { label: 'Renewals this month', value: String(summary.renewals_this_month), note: `${summary.pending_renewals} waiting to be checked` },
      ],
    },
    {
      title: 'Inventory and risk',
      rows: [
        { label: 'Inventory value', value: money(summary.inventory_value), note: 'Current value of items the shop holds' },
        { label: 'Items for sale value', value: money(summary.items_for_sale_value), note: 'Asking price of listed items' },
        { label: 'Open risk alerts', value: String(summary.open_risk_alerts), note: `${summary.high_risk_alerts} high risk` },
      ],
    },
  ];
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
            <>
              {/* The four figures the shop is run on, then everything in one
                  table grouped by what it measures, so it reads top to bottom. */}
              <div className="report-kpis">
                <Metric label="Monthly pawn volume" value={money(summary.monthly_loan_volume)} detail={change === null || change === undefined ? 'No pawns last month to compare' : `${change > 0 ? '+' : ''}${change}% vs last month`} />
                <Metric label="Total collected" value={money(summary.total_collected)} detail="Principal plus interest from redemptions" />
                <Metric label="Redemption rate" value={percent(summary.redemption_rate_percent)} detail="Redeemed out of all closed pawns" />
                <Metric label="Inventory value" value={money(summary.inventory_value)} detail={`For-sale items: ${money(summary.items_for_sale_value)}`} />
              </div>

              <div className="report-table-wrap">
                <table className="report-table">
                  <caption>Shop summary</caption>
                  <thead>
                    <tr><th scope="col">Measure</th><th scope="col" className="is-num">Value</th><th scope="col">What it means</th></tr>
                  </thead>
                  {REPORT_GROUPS(summary).map(group => (
                    <tbody key={group.title}>
                      <tr className="report-group"><th scope="rowgroup" colSpan={3}>{group.title}</th></tr>
                      {group.rows.map(row => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          <td className="is-num">{row.value}</td>
                          <td className="report-note">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </>
          )
        ) : (
          <div className="report-table-wrap">
            <table className="report-table export-table">
              <caption>Downloads</caption>
              <thead>
                <tr><th scope="col">Report</th><th scope="col">Contents</th><th scope="col" className="is-action">Action</th></tr>
              </thead>
              <tbody>
                {EXPORTS.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      <span className="export-name"><IonIcon icon={documentTextOutline} aria-hidden="true" />{entry.title}</span>
                    </th>
                    <td className="report-note">{entry.detail}</td>
                    <td className="is-action">
                      <IonButton fill="outline" size="small" onClick={() => runExport(entry)} disabled={exporting !== ''} aria-busy={exporting === entry.id}>
                        {exporting === entry.id ? <Spinner /> : <IonIcon slot="start" icon={downloadOutline} />}
                        Export CSV
                      </IonButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
