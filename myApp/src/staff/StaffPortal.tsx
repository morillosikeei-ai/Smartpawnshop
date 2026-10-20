import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonPage,
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
  removeOutline,
  searchOutline,
  sparklesOutline,
  trendingDownOutline,
  trendingUpOutline,
  cameraOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { calculateAppraisal, DEFAULT_SILVER_FINENESS, FORFEITED_LABEL, money, moneyExact, purityForKarat, purityForSilver, riskLabel, shortDate, SILVER_PURITIES, statusLabel, timeAgo, purityLabel } from '../data/pawnshopStore';
import { SkeletonList, Spinner } from '../components/Skeleton';
import Pager, { usePagedRows } from '../components/Pager';
import { useModal } from '../components/ModalProvider';
import GoldPriceChart from '../components/GoldPriceChart';
import LoanDetailModal from './LoanDetailModal';
import {
  confirmRedemptionRequest,
  confirmRenewalRequest,
  createCustomer,
  updateCustomer,
  createTransaction,
  getCustomers,
  getDashboard,
  getRenewalRequests,
  getStaffReport,
  getStaffReportBreakdown,
  lockTransaction,
  lookupPickupCode,
  getGoldPrices,
  getSilverPrices,
  getItems,
  getMe,
  getRiskAlerts,
  getCustomerAccessQr,
  getSystemSettings,
  getTransactions,
  markItemForSale,
  markItemSold,
  clearApiCache,
  getReservations,
  cancelReservation,
  isHolding,
  holdEnds,
  type ApiReservation,
  redeemTransaction,
  unlockTransaction,
  rejectRenewalRequest,
  updateItemPhotos,
  searchCustomers,
  updateMe,
  type ApiCustomer,
  type ApiItemDetail,
  type ApiMe,
  type ApiNotification,
  type ApiRenewalRequest,
  type ApiStaffReport,
  type ApiStaffReportRow,
  type StaffReportMetric,
  type ApiRiskAlert,
  type ApiTransaction,
  type MetalType,
  NOTIFICATION_TITLES,
} from '../services/api';
import { useNotifications } from '../components/useNotifications';
import ThemeToggle from '../components/ThemeToggle';
import MotionToggle from '../components/MotionToggle';
import PullToRefresh from '../components/PullToRefresh';
import QRCode from 'qrcode';
import { checkPhotoQuality, ITEM_PHOTO_SCALE, readImageAsScaledDataUrl, type PhotoQuality } from '../services/photoQuality';
import StaffDueCalendar from './StaffDueCalendar';
import CameraCapture from '../components/CameraCapture';
import FaceCheck from '../components/FaceCheck';
import type { FaceCheckResult } from '../services/api';
import Combobox, { ComboOption, resolveComboValue } from '../components/Combobox';
import TypeSelect from '../components/TypeSelect';
import './StaffPortal.css';
import './RedeemBreakdown.css';
import DeviceDetailsFields, { deviceDetailErrors, deviceDetailRows, deviceDetailsPayload, deviceKindFor, type DeviceDetails } from './DeviceDetailsFields';
import { interestBasis, printRedemptionReceipt, type RedemptionReceipt } from './redemptionReceipt';
import './NewTransaction.css';
import { cleanDecimal, readDecimal } from '../utils/decimalInput';
import './StaffDashboard.css';
import './GoldPanel.css';
import './IdPhoto.css';
import { IdAutofillCard, IdNameBadge, IdPhotoQualityWarning, useIdPhotoCheck } from './useIdPhotoCheck';
import type { IdFields } from '../services/idOcr';
import './StaffNav.css';
import '../theme/portal-ui.css';

/**
 * One item photo the staff picked, with the verdict of the client-side quality
 * check. `quality` is null while the check runs and stays null when the browser
 * could not measure the file, which never blocks the photo.
 */
type AttachedPhoto = { id: string; name: string; file: File; quality: PhotoQuality | null; checking: boolean; dismissed: boolean };

/**
 * Jewelry materials, Gold first as the default. Shared by the Pawn Item step
 * and the dashboard's Market Reference toggle.
 */
const METALS: Array<{ value: MetalType; label: string }> = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
];

/** Most photos one item keeps. Matches Item::MAX_PHOTOS in the API. */
const MAX_ITEM_PHOTOS = 4;
// Matches the API limit on weight_grams (10 kg).
const MAX_WEIGHT_GRAMS = 10000;

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

type StaffProfile = { userId: number | null; name: string; role: string };
type View = 'dashboard' | 'transaction' | 'loans' | 'reports' | 'profile';
const menu: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: gridOutline },
  { id: 'transaction', label: 'New Pawn Transaction', icon: walletOutline },
  { id: 'loans', label: 'Pawns', icon: cashOutline },
  { id: 'reports', label: 'My Reports', icon: analyticsOutline },
];

/**
 * How often the Redemption tab reads the list again, in ms.
 *
 * Long enough to be invisible to the person working, short enough that a
 * colleague's claim shows up before two people walk to the same counter.
 */
const REDEMPTION_POLL_MS = 15000;

/**
 * How long a processing claim is honoured, in minutes. Matches
 * Transaction::LOCK_MINUTES on the API: both sides must read a stale claim the
 * same way or a row greys out for one of them and not the other.
 */
const LOCK_MINUTES = 10;

/** Whether a claim taken at this time is still worth honouring. */
const isLockLive = (lockedAt?: string | null) =>
  Boolean(lockedAt) && Date.now() - new Date(lockedAt as string).getTime() < LOCK_MINUTES * 60000;

/** How many rows the bell shows before "View all notifications" is offered. */
const NOTIFICATION_PREVIEW = 5;

/**
 * The icon and color tone each notification type is drawn with.
 *
 * The tone names map onto the .staff-notification-icon classes, so a new type
 * falls back to the neutral bell rather than to no icon at all.
 */
const NOTIFICATION_ICONS: Record<string, { icon: string; tone: 'info' | 'warn' | 'danger' | 'success' | 'neutral' }> = {
  staff_redeem_request: { icon: cashOutline, tone: 'success' },
  staff_appointment_request: { icon: calendarOutline, tone: 'info' },
  staff_renewal_request: { icon: refreshOutline, tone: 'info' },
  staff_renewal_payment: { icon: cashOutline, tone: 'info' },
  staff_high_risk: { icon: warningOutline, tone: 'danger' },
  staff_overdue: { icon: alertCircleOutline, tone: 'warn' },
  staff_forfeited: { icon: cubeOutline, tone: 'neutral' },
  item_created: { icon: cubeOutline, tone: 'info' },
  value_changed: { icon: trendingUpOutline, tone: 'warn' },
  risk_notice: { icon: warningOutline, tone: 'warn' },
  due_soon: { icon: calendarOutline, tone: 'warn' },
  redeem_confirmed: { icon: checkmarkCircle, tone: 'success' },
  redemption_complete: { icon: checkmarkCircle, tone: 'success' },
  forfeited: { icon: cubeOutline, tone: 'neutral' },
  renewal_confirmed: { icon: checkmarkCircle, tone: 'success' },
  renewal_rejected: { icon: alertCircleOutline, tone: 'warn' },
  staff_item_reserved: { icon: cubeOutline, tone: 'info' },
  reservation_expired: { icon: calendarOutline, tone: 'warn' },
  reservation_cancelled: { icon: alertCircleOutline, tone: 'warn' },
};

const StaffPortal: React.FC = () => {
  const navigate = useNavigate();
  const modal = useModal();
  const [view, setView] = useState<View>('dashboard');
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // The bell shows the newest few rows; the footer opens the rest in place.
  const [showAllNotices, setShowAllNotices] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { notifications: notices, unreadCount, loaded: noticesLoaded, reload: reloadNotices, markRead, markAllRead } = useNotifications();
  // Bumped by pull-to-refresh: the open view remounts and fetches again.
  const [refreshKey, setRefreshKey] = useState(0);
  // The item a notification pointed at, so the Loans page can single it out.
  const [focusItemId, setFocusItemId] = useState<number | null>(null);
  // What that notification was about, so the Loans page can name the request.
  const [focusType, setFocusType] = useState<ApiNotification['type'] | null>(null);
  // Set when the dashboard calendar's View button opens a pawn, so the Loans
  // page shows its detail as soon as the rows load.
  const [openFocusedDetail, setOpenFocusedDetail] = useState(false);
  const [appraised, setAppraised] = useState(false);
  const [loanTab, setLoanTab] = useState<'active' | 'payments' | 'renewals' | 'customers' | 'lifecycle'>('active');
  const [loanRiskFilter, setLoanRiskFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [transactionFlash, setTransactionFlash] = useState('');

  const [staffProfile, setStaffProfile] = useState<StaffProfile>({ userId: null, name: '', role: 'staff' });

  // The signed in account and the live notification list both come from the
  // API, so nothing on the shell is a stored or assumed value.
  useEffect(() => {
    let active = true;
    getMe().then(me => { if (active) setStaffProfile({ userId: me.user.users_id, name: me.user.name, role: me.user.role }); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  /**
   * Close the notification dropdown on a click outside it or on Escape.
   *
   * The listener only exists while the dropdown is open, and the list resets to
   * the short preview on close so the next open starts from the top.
   */
  useEffect(() => {
    if (!notificationsOpen) {
      setShowAllNotices(false);
      return;
    }

    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const wrap = notificationsRef.current;
      if (wrap && !wrap.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('touchstart', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('touchstart', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  const go = (next: View) => {
    setView(next);
    setOpen(false);
  };

  /**
   * Open what a notification points at.
   *
   * A redemption request opens the Redemption tab; the risk, overdue, and
   * forfeiture messages open Active Loans/Items. Both land on the Loans page
   * with the item singled out, so the row is the first thing on screen.
   */
  const openNotification = (notice: ApiNotification) => {
    markRead(notice.notifications_id);
    setNotificationsOpen(false);
    setFocusItemId(notice.related_item_id);
    setFocusType(notice.type);
    // A redemption or appointment request is worked on the payments tab, a
    // submitted GCash payment on the renewals tab; anything else is worked
    // against the open loan itself.
    setLoanTab(
      notice.type === 'staff_redeem_request' || notice.type === 'staff_appointment_request'
        ? 'payments'
        : notice.type === 'staff_renewal_payment'
          ? 'renewals'
          : 'active'
    );
    setLoanRiskFilter('All');
    go('loans');
  };

  /** Open one pawn's detail from the dashboard calendar. */
  const openPawnDetail = (itemId: number) => {
    setFocusItemId(itemId);
    setFocusType(null);
    setOpenFocusedDetail(true);
    setLoanTab('active');
    setLoanRiskFilter('All');
    go('loans');
  };

  const logout = async () => {
    const confirmed = await modal.confirm({
      title: 'Sign out of the staff portal?',
      message: 'You will need to sign in again to take payments or open a new pawn.',
      confirmLabel: 'Sign out',
      tone: 'danger',
    });
    if (!confirmed) return;

    localStorage.removeItem('smartpawn_staff');
    navigate('/');
  };

  return (
    <IonPage className="staff-page">
      <IonContent fullscreen>
        <PullToRefresh onRefresh={() => {
          // A half-filled new pawn or profile form is left as it is.
          if (view !== 'transaction' && view !== 'profile') setRefreshKey(key => key + 1);
          return reloadNotices();
        }} />
        <div className="staff-shell">
          <div className={`staff-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

          <aside className={`staff-sidebar ${open ? 'open' : ''}`}>
            <div className="staff-side-brand">
              <img src="/pagasa.png" alt="Pag-Asa Pawnshop" />
            </div>

            <div className="staff-user">
              <IonIcon icon={personCircleOutline} />
              <div>
                <strong>{staffProfile.name}</strong>
                <span>{staffProfile.role}</span>
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

              <div className="staff-header-actions">
                <div className="staff-action-wrap">
                  <MotionToggle className="staff-notification" />
                  <ThemeToggle className="staff-notification" />
                </div>
                <div className="staff-action-wrap" ref={notificationsRef}>
                  <button
                    className="staff-notification"
                    onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }}
                    aria-label="Notifications"
                    aria-haspopup="true"
                    aria-expanded={notificationsOpen}
                  >
                    <IonIcon icon={notificationsOutline} />
                    {unreadCount > 0 && <b className="staff-notification-count">{unreadCount}</b>}
                  </button>

                  {notificationsOpen && (
                    <div className="staff-dropdown staff-notification-dropdown" role="menu" aria-label="Notifications">
                      <div className="staff-dropdown-head">
                        <strong>
                          Notifications
                          {unreadCount > 0 && <span className="staff-notification-tag">{unreadCount} new</span>}
                        </strong>
                        <button onClick={markAllRead} disabled={unreadCount === 0}>Mark all as read</button>
                      </div>

                      <div className="staff-notification-list">
                        {(showAllNotices ? notices : notices.slice(0, NOTIFICATION_PREVIEW)).map(notice => {
                          const badge = NOTIFICATION_ICONS[notice.type] || { icon: notificationsOutline, tone: 'neutral' };
                          return (
                            <button
                              className={`staff-notification-item ${notice.is_read ? 'read' : 'unread'}`}
                              key={notice.notifications_id}
                              onClick={() => openNotification(notice)}
                            >
                              <span className={`staff-notification-icon ${badge.tone}`} aria-hidden="true">
                                <IonIcon icon={badge.icon} />
                              </span>
                              <span className="staff-notification-text">
                                <strong>{NOTIFICATION_TITLES[notice.type] || 'Notification'}</strong>
                                <small>{notice.message}</small>
                                <time>{timeAgo(notice.created_at)}</time>
                              </span>
                              {!notice.is_read && <i className="staff-notification-unread-dot" title="Unread" />}
                            </button>
                          );
                        })}
                        {!noticesLoaded && <SkeletonList rows={3} />}
                        {noticesLoaded && notices.length === 0 && <p className="staff-notification-empty">Nothing needs attention right now.</p>}
                      </div>

                      {notices.length > NOTIFICATION_PREVIEW && (
                        <button className="staff-notification-all" onClick={() => setShowAllNotices(!showAllNotices)}>
                          {showAllNotices ? 'Show recent only' : `View all notifications (${notices.length})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="staff-action-wrap"><button className="staff-top-user" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} aria-expanded={profileOpen}><IonIcon icon={personCircleOutline} />{staffProfile.name}<IonIcon className="profile-chevron" icon={profileOpen ? chevronUpOutline : chevronDownOutline} aria-hidden="true" /></button>{profileOpen && <div className="staff-dropdown staff-profile-dropdown"><button onClick={() => { setProfileOpen(false); go('profile'); }}><IonIcon icon={personCircleOutline} />Profile</button><button onClick={logout}><IonIcon icon={logOutOutline} />Logout</button></div>}</div></div>
            </header>

            {transactionFlash && <div className="staff-transaction-flash" role="status">{transactionFlash}</div>}

            <React.Fragment key={refreshKey}>
            {view === 'dashboard' && (
              <Dashboard
                go={go}
                staffName={staffProfile.name}
                setLoanTab={setLoanTab}
                setLoanRiskFilter={setLoanRiskFilter}
                openPawn={openPawnDetail}
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
                focusItemId={focusItemId}
                setFocusItemId={setFocusItemId}
                focusType={focusType}
                openFocusedDetail={openFocusedDetail}
                onFocusedDetailOpened={() => setOpenFocusedDetail(false)}
                staffUserId={staffProfile.userId}
                staffName={staffProfile.name}
              />
            )}
            {view === 'reports' && <StaffReport go={go} setLoanTab={setLoanTab} />}
            </React.Fragment>
            {view === 'profile' && <Profile logout={logout} />}
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

/**
 * How the gold price is framed wherever it is shown: a starting reference for
 * jewelry valuation, matching the "AI-assisted appraisal" wording, never the
 * final say on an item's value.
 */
const GOLD_REFERENCE_NOTE = "Used as a starting reference for jewelry valuation — final appraisal remains at staff's discretion.";

/** One recorded gold price day, as the dashboard needs it. */
type GoldPoint = { date: string; price: number; predicted: number | null; source: string };

/** History windows the staff can switch between, in days. */
const GOLD_RANGES = [7, 14, 30] as const;
type GoldRange = (typeof GOLD_RANGES)[number];

/** Format a date the way the dashboard header shows it. */
const longDate = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase();

/** Morning, afternoon, or evening, from the browser clock. */
const greetingFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

const Dashboard: React.FC<{
  go: (view: View) => void;
  staffName: string;
  setLoanTab: (value: 'active' | 'payments' | 'renewals' | 'customers' | 'lifecycle') => void;
  setLoanRiskFilter: (value: 'All' | 'Low' | 'Medium' | 'High') => void;
  openPawn: (itemId: number) => void;
}> = ({ go, staffName, setLoanTab, setLoanRiskFilter, openPawn }) => {
  const [riskAlerts, setRiskAlerts] = useState<RiskRow[]>([]);
  const [goldHistory, setGoldHistory] = useState<GoldPoint[]>([]);
  const [silverHistory, setSilverHistory] = useState<GoldPoint[]>([]);
  // Which metal the Market Reference panel shows. Gold on every load.
  const [marketMetal, setMarketMetal] = useState<MetalType>('gold');
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
      const todayKey = new Date().toISOString().slice(0, 10);
      setStats({
        todayCount: transactions.filter(transaction => String((transaction as { created_at?: string }).created_at || '').slice(0, 10) === todayKey).length,
        activeLoans: live.length,
        portfolio: live.reduce((total, transaction) => total + Number(transaction.loan_amount || 0), 0),
      });

      if (dashboard) {
        // The API sends the newest price first, so reverse for a left to right
        // chart. The full window is kept and the range picker trims it. Gold
        // and silver rows share one shape, so one mapping serves both.
        const toHistory = (rows: unknown[]): GoldPoint[] =>
          rows
            .map(row => row as { price_date?: string; price_per_gram?: number; predicted_next_price?: number | null; source?: string })
            .map(row => ({
              date: String(row.price_date || '').slice(0, 10),
              price: Number(row.price_per_gram),
              predicted: row.predicted_next_price == null ? null : Number(row.predicted_next_price),
              source: row.source === 'api' ? 'api' : 'manual',
            }) as GoldPoint)
            .filter(point => point.date && Number.isFinite(point.price) && point.price > 0)
            .reverse();
        setGoldHistory(toHistory(dashboard.gold_prices));
        setSilverHistory(toHistory(dashboard.silver_prices || []));
      }

      setLoaded(true);
    });

    return () => { active = false; };
  }, []);

  const openPawns = (tab: 'active' | 'payments') => {
    setLoanRiskFilter('All');
    setLoanTab(tab);
    go('loans');
  };

  const handleViewAllAlerts = () => {
    setLoanRiskFilter('High');
    setLoanTab('active');
    go('loans');
  };

  const now = new Date();
  // The metal toggle only swaps the data source. Every figure below reads the
  // chosen history, so the layout is the same for gold and silver.
  const marketHistory = marketMetal === 'silver' ? silverHistory : goldHistory;
  const marketName = marketMetal === 'silver' ? 'SILVER' : 'GOLD';
  // Newest last. The range picker keeps the tail of the history.
  const goldWindow = marketHistory.slice(-goldRange);
  const latestPoint = marketHistory.length ? marketHistory[marketHistory.length - 1] : null;
  const latestGold = latestPoint ? latestPoint.price : 0;
  const previousGold = marketHistory.length > 1 ? marketHistory[marketHistory.length - 2].price : latestGold;
  const goldChange = previousGold > 0 ? ((latestGold - previousGold) / previousGold) * 100 : 0;
  // Scale each bar against the range in view, so small moves stay readable.
  const windowPrices = goldWindow.map(point => point.price);
  const goldPeak = windowPrices.length ? Math.max(...windowPrices) : 0;
  const goldFloor = windowPrices.length ? Math.min(...windowPrices) : 0;
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
          <p>Quick Links</p>
        </div>
        <div className="dash-hero-actions">
          <IonButton onClick={() => { setLoanTab('active'); go('transaction'); }}>
            <IonIcon icon={walletOutline} slot="start" />New Pawn Transaction
          </IonButton>
        </div>
      </div>

      <div className="staff-stats dash-stats">
        {/* Quick links: each card opens the Pawns list behind its figure. */}
        <Stat icon={cashOutline} value={loaded ? String(stats.todayCount) : '--'} label="Today's pawn transactions" onClick={() => openPawns('active')} />
        <Stat icon={walletOutline} value={loaded ? String(stats.activeLoans) : '--'} label="Active pawns" onClick={() => openPawns('active')} />
        <Stat icon={warningOutline} value={loaded ? String(riskAlerts.length) : '--'} label="Risk alerts" tone={highRiskCount > 0 ? 'danger' : undefined} onClick={handleViewAllAlerts} />
        <Stat icon={analyticsOutline} value={loaded ? money(stats.portfolio) : '--'} label="Pawn portfolio" onClick={() => openPawns('payments')} />
      </div>

      <div className="staff-panel gold-panel">
        <div className="staff-panel-head">
          <div>
            <small>MARKET WATCH</small>
            <h3>Market Reference</h3>
          </div>
          <div className="gold-head-controls">
            <div className="gold-range gold-metal" role="tablist" aria-label="Metal">
              {METALS.map(metal => (
                <button
                  key={metal.value}
                  role="tab"
                  aria-selected={marketMetal === metal.value}
                  className={marketMetal === metal.value ? 'active' : ''}
                  onClick={() => setMarketMetal(metal.value)}
                >
                  {metal.label}
                </button>
              ))}
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
        </div>

        <div className="gold-body">
          <div className="gold-headline">
            <div className="gold-now">
              <small>TODAY'S {marketName} REFERENCE PRICE</small>
              <strong>{latestGold > 0 ? money(latestGold) : 'No price'}<i>/gram</i></strong>
              <p className="gold-reference-note">{GOLD_REFERENCE_NOTE}</p>

              {marketHistory.length > 1 && (
                <span className={'gold-delta ' + (goldChange > 0 ? 'up' : goldChange < 0 ? 'down' : 'flat')}>
                  <IonIcon
                    icon={goldChange > 0 ? trendingUpOutline : goldChange < 0 ? trendingDownOutline : removeOutline}
                    aria-hidden="true"
                  />
                  {goldChange > 0 ? '+' : ''}{goldChange.toFixed(2)}%
                  <em>vs previous day</em>
                </span>
              )}
            </div>

            <div className="gold-chart-wrap">
              <GoldPriceChart points={goldWindow} loading={!loaded} />
              {loaded && goldPeak > 0 && (
                // The peak and floor the old scale column printed beside the
                // bars, kept as one quiet caption instead of two floating
                // numbers competing with the price.
                <p className="gold-chart-range">
                  {money(goldFloor)} &ndash; {money(goldPeak)} over {goldRange} days
                </p>
              )}
            </div>
          </div>

          <div className="gold-meta">
            <div>
              <span>Forecast next</span>
              <strong>{latestPoint && latestPoint.predicted ? money(latestPoint.predicted) : '--'}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>{latestPoint ? shortDate(latestPoint.date) : '--'}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong className="gold-source">{latestPoint ? latestPoint.source : '--'}</strong>
            </div>
            <div>
              <span>{goldRange}-day average</span>
              <strong>{goldAverage > 0 ? money(goldAverage) : '--'}</strong>
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
            {!loaded && <SkeletonList rows={4} />}
            {loaded && goldRows.length === 0 && <p className="risk-empty">No price history yet.</p>}
          </div>
        </div>
      </div>

      {/* Due calendar and its details panel. Replaces the Best Time to Redeem
          card and the Priority items and Due soon tables: risk alerts now show
          in the panel's default "Today and at risk" view. */}
      <StaffDueCalendar onView={row => openPawn(row.item_id)} />
    </section>
  );
};

const Stat: React.FC<{ icon: string; value: string; label: string; tone?: 'danger'; onClick?: () => void }> = ({ icon, value, label, tone, onClick }) => {
  const className = ['staff-stat', tone, onClick ? 'staff-stat-link' : ''].filter(Boolean).join(' ');
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
  return onClick
    ? <button type="button" className={className} onClick={onClick} aria-label={`${label}: ${value}. Open list`}>{body}</button>
    : <div className={className}>{body}</div>;
};

const getCustomerEmail = (customer: ApiCustomer) => customer.email || customer.user?.email || '';

/**
 * The three families of item the pawnshop accepts. The group decides which
 * fields the staff must fill in, how the item is valued, and which interest
 * rate the loan carries.
 */
const ITEM_GROUPS = [
  { value: 'jewelry', label: 'Jewelry', icon: diamondOutline, hint: 'AI-assisted appraisal' },
  { value: 'watch_phone', label: 'Watch or cellphone', icon: hardwareChipOutline, hint: 'Staff appraised' },
  { value: 'bulky', label: 'Bulky item', icon: cubeOutline, hint: 'Staff appraised' },
];

/**
 * The old catch-all item type. The form no longer offers it, because the Item
 * Type field accepts a custom type directly, but items recorded under it still
 * carry the typed type in custom_item_type and are shown that way.
 */
const OTHER_ITEM_TYPE = 'others';

/**
 * Suggested item types per group, shown in the Item Type combobox. The value is
 * what the API stores in items.category for a suggestion; a custom type the
 * staff types in is stored as typed.
 */
const ITEM_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  jewelry: [
    { value: 'ring', label: 'Ring' },
    { value: 'necklace', label: 'Necklace' },
    { value: 'bracelet', label: 'Bracelet' },
    { value: 'earrings', label: 'Earrings' },
    { value: 'pendant', label: 'Pendant' },
    { value: 'chain', label: 'Chain' },
    { value: 'anklet', label: 'Anklet' },
    { value: 'brooch_pin', label: 'Brooch/Pin' },
    { value: 'cufflinks', label: 'Cufflinks' },
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
 * Suggestions for the other free-text dropdowns. Each field lists these but
 * also accepts a custom value typed in by the staff.
 *
 * Condition values are the keys the API stored before custom text was allowed.
 */
const CONDITION_OPTIONS: ComboOption[] = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'damaged', label: 'Damaged' },
];

// Matches Item::KARAT_PURITY in the API.
const GOLD_KARAT_OPTIONS = ['10k', '14k', '18k', '21k', '22k', '24k'].map((karat) => ({ value: karat, label: karat }));

// Free text typed by staff goes into the printed ticket's HTML, so it is escaped.
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

/** The customer fields staff can correct and save. The email is the sign-in and is not among them. */
const CUSTOMER_DETAIL_FIELDS = ['fullName', 'contactNumber', 'address', 'validIdType', 'validIdNumber', 'validIdPhoto'] as const;
type CustomerDetails = Record<(typeof CUSTOMER_DETAIL_FIELDS)[number], string>;

/** A customer record from the API as the form's saved details. */
const customerDetails = (customer: ApiCustomer): CustomerDetails => ({
  fullName: customer.name,
  contactNumber: customer.contact_number || '',
  address: customer.address || '',
  validIdType: customer.valid_id_type || 'National ID',
  validIdNumber: customer.valid_id_number || '',
  validIdPhoto: customer.valid_id_photo || '',
});

/** ID fields read by OCR, renamed to the customer form's own keys. */
const idFieldsToCustomer = (fields: IdFields) => {
  const patch: Partial<Record<'fullName' | 'validIdType' | 'validIdNumber' | 'address', string>> = {};
  if (fields.fullName) patch.fullName = fields.fullName;
  if (fields.idType) patch.validIdType = fields.idType;
  if (fields.idNumber) patch.validIdNumber = fields.idNumber;
  if (fields.address) patch.address = fields.address;
  return patch;
};

const VALID_ID_TYPE_OPTIONS: ComboOption[] = [
  { value: 'National ID', label: 'National ID' },
  { value: "Driver's License", label: "Driver's License" },
  { value: 'Passport', label: 'Passport' },
];

/** A redemption payment before anything has been typed into it. */
const EMPTY_PAYMENT_DRAFT = {
  amount: '',
  method: 'Cash',
  note: '',
  /** Required for any method other than Cash. */
  reference: '',
  cashReceived: '',
  /** Optional, checked against the pawn when four digits are in. */
  pickupCode: '',
  /** Staff confirming they looked at the item and the customer's ID. */
  verified: false,
};

const PAYMENT_METHOD_OPTIONS: ComboOption[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
];

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

const NewTransaction: React.FC<{
  appraised: boolean;
  setAppraised: (value: boolean) => void;
  go: (view: View) => void;
  onTransactionCreated: (message: string) => void;
}> = ({ go, onTransactionCreated }) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ApiCustomer[]>([]);
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
  /*
    The customer's details as last saved, for a customer picked from search or
    just registered. The form is compared against it to tell staff there are
    unsaved edits. Null while no saved customer is on the form.
  */
  const [savedCustomer, setSavedCustomer] = useState<CustomerDetails | null>(null);
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
    // What is in the Item Type field: a suggestion's label or a custom type
    // typed in by the staff. resolveComboValue turns it into what is sent.
    category: 'Ring',
    itemDescription: '',
    brandModel: '',
    // Jewelry only. Gold is valued by karat from gold_prices; silver by
    // fineness (800, 925, 950, 999) from silver_prices. Each has its own field
    // so a silver fineness is never sent as a karat.
    metalType: 'gold' as MetalType,
    karat: '18k',
    fineness: DEFAULT_SILVER_FINENESS,
    weight: '',
    // Typed in by the staff for the watch_phone and bulky groups, which have no
    // gold price to compute a value from.
    manualAppraisedValue: '',
    condition: 'Good',
    remarks: '',
  });
  // The value the staff actually lends against. Empty means "use the computed
  // or typed appraisal", so it follows that value until the staff changes it.
  const [adjustedValue, setAdjustedValue] = useState('');
  // Jewelry only. A diamond adds the staff's own estimate on top of
  // the AI-assisted gold value; the details are a note for reference only.
  // The shop takes diamonds only, so a ticked box is always sent as one. The
  // gemstone_* names are the database columns and stay as they are.
  const [hasGemstone, setHasGemstone] = useState(false);
  const [gemstoneValue, setGemstoneValue] = useState('');
  const [gemstoneDetails, setGemstoneDetails] = useState('');
  // Watch and cellphone only: the structured details (IMEI, movement, papers...)
  // kept in items.item_details. See DeviceDetailsFields.
  const [deviceDetails, setDeviceDetails] = useState<DeviceDetails>({});
  // Loan-to-Value % and Loan Amount are both editable and kept in sync. Only
  // the field typed in last is stored; the other is derived from it, so they
  // never drift apart. Empty LTV means the shop's suggested default.
  const [ltvInput, setLtvInput] = useState('');
  const [loanAmountInput, setLoanAmountInput] = useState('');
  const [loanEditedLast, setLoanEditedLast] = useState<'ltv' | 'amount'>('ltv');

  // Item photos stay on the client: the quality check is advice for the staff
  // taking the photo, so it runs before anything is sent anywhere.
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [photoLimitNote, setPhotoLimitNote] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Advisory OCR name match and quality check on the valid ID photo, one per
  // form: the customer step and the Add New Customer modal. Never blocks saving.
  const customerIdCheck = useIdPhotoCheck();
  const modalIdCheck = useIdPhotoCheck();
  const modalIdInputRef = useRef<HTMLInputElement>(null);
  // Which form the ID camera is taking a photo for, or null when it is closed.
  const [idCameraFor, setIdCameraFor] = useState<'customer' | 'modal' | null>(null);
  // Face photo of the selected customer, for identity checks at redemption.
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceNote, setFaceNote] = useState('');
  const [itemCameraOpen, setItemCameraOpen] = useState(false);

  // Which of the four steps is on screen. All form state lives above this, so
  // moving back and forth never loses what the staff already typed.
  const [step, setStep] = useState<WizardStep>(1);

  // Set once the transaction is created. Its presence swaps the wizard for the
  // success screen, which still reads the form state so the ticket can be
  // reprinted without another API call.
  const [createdTicket, setCreatedTicket] = useState('');
  // The customer the created ticket belongs to, so a reprint can ask the API
  // for the same portal access QR code.
  const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);

  // Where the printed QR code sends a phone. Shown to the staff only, so a QR
  // that points somewhere a phone cannot reach is caught before the customer
  // leaves with the ticket.
  const [qrNotice, setQrNotice] = useState<{ address: string; networkReady: boolean; source: string } | null>(null);

  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Setting rows keyed by setting_key, as the form reads them.
  const [systemSettings, setSystemSettings] = useState<Record<string, string> | null>(null);
  const [currentGoldPriceOverride, setCurrentGoldPriceOverride] = useState<number | null>(null);
  // Newest recorded silver price. Silver has no configured fallback, so it
  // stays null until the daily job has recorded one.
  const [currentSilverPrice, setCurrentSilverPrice] = useState<number | null>(null);


  // Load the shop settings and the gold price history on mount.
  //
  // The two are fetched independently on purpose. They used to share one
  // Promise.all, so a failure on either request left both unset and the
  // jewelry value silently stayed at zero. Settled results keep whichever
  // request succeeded and report only the one that did not.
  React.useEffect(() => {
    let cancelled = false;

    const loadPricingInputs = async () => {
      const [settingsResult, pricesResult, silverResult] = await Promise.allSettled([
        getSystemSettings(),
        getGoldPrices(),
        getSilverPrices(),
      ]);
      if (cancelled) return;

      if (settingsResult.status === 'fulfilled') {
        // The API returns setting rows; the form reads them by key.
        const rows = Array.isArray(settingsResult.value) ? settingsResult.value : [];
        setSystemSettings(Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value])));
      } else {
        console.warn('Could not load shop settings', settingsResult.reason);
      }

      if (pricesResult.status === 'fulfilled') {
        const prices = Array.isArray(pricesResult.value) ? pricesResult.value : [];
        // Take the newest recorded day rather than the last array element, so
        // the value does not depend on the order the API happened to send.
        const latestPrice = prices
          .filter(row => row && Number(row.price_per_gram) > 0)
          .sort((a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime())
          .pop();
        if (latestPrice) setCurrentGoldPriceOverride(Number(latestPrice.price_per_gram));
      } else {
        console.warn('Could not load gold prices', pricesResult.reason);
      }

      // Same newest-day rule for silver.
      if (silverResult.status === 'fulfilled') {
        const latestSilver = (Array.isArray(silverResult.value) ? silverResult.value : [])
          .filter(row => row && Number(row.price_per_gram) > 0)
          .sort((a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime())
          .pop();
        if (latestSilver) setCurrentSilverPrice(Number(latestSilver.price_per_gram));
      } else {
        console.warn('Could not load silver prices', silverResult.reason);
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
    '10k': purityForKarat('10k'), '14k': purityForKarat('14k'), '18k': purityForKarat('18k'), '21k': purityForKarat('21k'), '22k': purityForKarat('22k'), '24k': purityForKarat('24k'),
  };

  // Only jewelry is valued from the gold price. A watch, cellphone, or bulky
  // item is worth what the appraising staff says it is worth.
  const isJewelry = itemForm.group === 'jewelry';

  // The item type as shown on screen and on the ticket, and as sent to the API.
  const itemTypeOptions = ITEM_CATEGORIES[itemForm.group] || [];
  const itemTypeText = itemForm.category.trim();
  const itemTypeValue = resolveComboValue(itemTypeOptions, itemForm.category);
  // Cellphone or Watch picked from the suggestions gets its own fields, and
  // so does every bulky item; a custom watch_phone type keeps the plain
  // Brand/Model field.
  const deviceKind = deviceKindFor(itemForm.group, itemTypeValue);
  const deviceErrors = deviceDetailErrors(deviceKind, deviceDetails);

  // Today's gold price, from the recorded prices first and the configured
  // fallback second. Nothing is assumed when neither is available.
  const currentGoldPrice = currentGoldPriceOverride ?? Number(systemSettings?.current_gold_price ?? 0);
  const weightValue = Number(itemForm.weight || 0);
  // Jewelry is weighed in grams. A figure far outside the usual range is
  // flagged, not blocked: under 0.1 g usually means kilos were typed, and over
  // 1,000 g is rare enough to deserve a second look.
  const weightNote = !(weightValue > 0) || weightValue > MAX_WEIGHT_GRAMS
    ? null
    : weightValue >= 1000
      ? `= ${(weightValue / 1000).toLocaleString('en-PH', { maximumFractionDigits: 3 })} kg. Over 1 kilo. Check the weight is right.`
      : weightValue < 0.1
        ? 'Under 0.1 g. Weight is in grams, not kilos. Check the weight is right.'
        : null;
  // Silver jewelry follows the same live recompute, from the silver price and
  // the silver fineness instead of the gold price and karat.
  const isSilver = isJewelry && itemForm.metalType === 'silver';
  const metalName = isSilver ? 'Silver' : 'Gold';
  const metalPrice = isSilver ? currentSilverPrice ?? 0 : currentGoldPrice;
  const metalPurity = isSilver ? purityForSilver(itemForm.fineness) : karatPurityMap[itemForm.karat] || 0;
  const purityText = isSilver ? SILVER_PURITIES.find(option => option.value === itemForm.fineness)?.label ?? itemForm.fineness : itemForm.karat;
  const computedValue = isJewelry && weightValue > 0
    ? isSilver ? weightValue * metalPurity * metalPrice : calculateAppraisal(weightValue, itemForm.karat, currentGoldPrice)
    : 0;
  const manualValue = Number(itemForm.manualAppraisedValue || 0);
  // The gemstone portion counts only for jewelry with the box ticked.
  const gemstoneOn = isJewelry && hasGemstone;
  const gemstoneAmount = gemstoneOn ? Number(gemstoneValue || 0) : 0;
  // The one value the loan is worked out from, whichever path produced it:
  // gold (plus any gemstone) for jewelry, the typed value otherwise.
  const itemValue = isJewelry ? computedValue + gemstoneAmount : manualValue;
  // The shop's suggested LTV. Only a starting point; the staff may change it.
  const defaultLtvPercent = Number(systemSettings?.default_loan_to_value ?? 0);
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
  const settingsReady = Boolean(systemSettings) && loanTermDays > 0;
  const effectiveAdjustedValue = Number(adjustedValue || itemValue || 0);
  // True when the staff settled on a value other than metal + gemstone, so the
  // breakdown total and the final value are shown as two separate figures.
  const valueAdjusted = Math.abs(effectiveAdjustedValue - itemValue) >= 0.01;
  const pesoText = (value: number) => `₱${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  // Review and printed ticket: metal + gemstone = total, for jewelry with a stone.
  const gemstoneBreakdown = `${metalName} Value: ${pesoText(computedValue)} + Diamond Value: ${pesoText(gemstoneAmount)} = Total Appraised Value: ${pesoText(itemValue)}`;
  const gemstoneSummary = gemstoneDetails.trim();
  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  const ltvPercent = loanEditedLast === 'amount'
    ? (effectiveAdjustedValue > 0 ? roundMoney((Number(loanAmountInput || 0) / effectiveAdjustedValue) * 100) : 0)
    : Number(ltvInput === '' ? defaultLtvPercent : ltvInput);
  const effectiveLoanAmount = loanEditedLast === 'amount'
    ? Number(loanAmountInput || 0)
    : roundMoney(effectiveAdjustedValue * (ltvPercent / 100));
  const loanExceedsValue = effectiveLoanAmount > effectiveAdjustedValue;

  const editLtv = (value: string) => {
    setLoanEditedLast('ltv');
    setLtvInput(value);
  };
  const editLoanAmount = (value: string) => {
    setLoanEditedLast('amount');
    setLoanAmountInput(value);
  };

  // One monthly interest payment, shown on the Pawn Terms step so the staff
  // can quote it without opening a calculator. The API is still the authority
  // on what is actually owed at redemption.
  const monthlyInterest = effectiveLoanAmount * (interestRatePercent / 100);

  /**
   * Print the pawn ticket, with the customer's portal access QR code on it.
   *
   * The QR holds a random access code and nothing else: no name, no email, no
   * loan detail. Scanning it opens a page that asks for the registered email
   * address before it opens anything, so a ticket left on a counter is not a
   * way into the account. The activation and password reset emails are
   * unchanged; this is only a backup way in for a customer whose email never
   * arrived.
   */
  const printPawnTicket = async (ticketNumber: string, customerId: number | null) => {
    if (typeof window === 'undefined') return;

    // The window is opened before anything is awaited, because a popup opened
    // after an await is no longer tied to the click and browsers block it.
    const printWindow = window.open('', '_blank', 'width=820,height=980');
    if (!printWindow) return;

    printWindow.document.write('<p style="font: 14px Arial, sans-serif; color: #52627b;">Preparing pawn ticket...</p>');

    let qrImage = '';

    try {
      if (customerId) {
        const { url, network_ready, address_source } = await getCustomerAccessQr(customerId);
        const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 220 });
        qrImage = `<img src="${dataUrl}" alt="Customer portal access QR code" />`;
        // Staff facing, never printed: the address a phone will be sent to, so
        // a QR that points at localhost or at a virtual adapter is caught here
        // rather than by a customer holding a printed ticket.
        setQrNotice({ address: new URL(url).origin, networkReady: network_ready, source: address_source });
      }
    } catch {
      // A ticket that cannot reach the API still prints. The box says to ask
      // the shop rather than showing a QR code that opens nothing.
      qrImage = '';
      setQrNotice(null);
    }

    const ticketHtml = `
      <html>
        <head>
          <title>${ticketNumber}</title>
          <style>
            body { font-family: 'Inter Variable', Inter, 'Segoe UI', system-ui, sans-serif; color: #061028; margin: 32px; }
            .ticket { max-width: 680px; margin: 0 auto; border: 2px solid #061028; border-radius: 16px; padding: 24px; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #d4a72c; padding-bottom: 12px; margin-bottom: 16px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
            .meta div { border: 1px solid #dfe7f0; border-radius: 8px; padding: 10px 12px; }
            .label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #52627b; }
            .value { display: block; margin-top: 6px; font-size: 18px; font-weight: 700; }
            .meta .wide { grid-column: 1 / -1; }
            .value.breakdown { font-size: 15px; }
            .access { display: flex; align-items: center; gap: 18px; margin-top: 22px; padding-top: 16px; border-top: 1px solid #dfe7f0; }
            .qr { width: 120px; height: 120px; flex: none; border: 1px solid #061028; border-radius: 8px; display: grid; place-items: center; overflow: hidden; font-size: 11px; font-weight: 700; color: #52627b; text-align: center; padding: 6px; box-sizing: border-box; }
            .qr img { display: block; width: 106px; height: 106px; }
            .access-copy { min-width: 0; }
            .access-title { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #52627b; }
            .access-copy p { margin: 8px 0 0; font-size: 13px; line-height: 1.5; }
            .access-secure { color: #52627b; font-size: 12px; }
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
              <div><span class="label">Item</span><span class="value">${itemForm.itemDescription || itemTypeText}</span></div>
              <div><span class="label">Pawn Amount</span><span class="value">₱${effectiveLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
              <div><span class="label">${gemstoneOn && valueAdjusted ? 'Final Appraised Value (staff adjusted)' : 'Appraised Value'}</span><span class="value">${pesoText(effectiveAdjustedValue)}</span></div>
              <div><span class="label">Due Date</span><span class="value">${dueDateLabel}</span></div>
              ${gemstoneOn ? `
              <div class="wide"><span class="label">Value Breakdown</span><span class="value breakdown">${gemstoneBreakdown}</span></div>
              ${gemstoneSummary ? `<div class="wide"><span class="label">Diamond</span><span class="value">${escapeHtml(gemstoneSummary)}</span></div>` : ''}` : ''}
            </div>

            <div class="access">
              <div class="qr">${qrImage || 'Ask the shop to reprint this ticket for your access QR code.'}</div>
              <div class="access-copy">
                <div class="access-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a72c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                  Customer Access
                </div>
                <p>Scan this QR code to access your Customer Portal.</p>
                <p class="access-secure">Secure verification is required.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

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
    if (!settingsReady) newErrors.submit = 'Shop settings have not loaded yet. Reload before creating a pawn transaction.';
    if (isJewelry && metalPrice <= 0) newErrors.weight = `No ${metalName.toLowerCase()} price recorded yet, so a jewelry value cannot be computed.`;
    // Any text is a valid item type, picked from the list or typed in, but the
    // field cannot be left empty.
    if (!itemTypeText) newErrors.category = 'Item type is required';
    if (!itemForm.condition.trim()) newErrors.condition = 'Condition is required';
    if (isJewelry) {
      if (!itemForm.weight || Number(itemForm.weight) <= 0) newErrors.weight = 'Item weight is required';
      else if (Number(itemForm.weight) > MAX_WEIGHT_GRAMS) newErrors.weight = `Weight cannot exceed ${MAX_WEIGHT_GRAMS.toLocaleString('en-PH')} g (10 kg)`;
      else if (computedValue <= 0) newErrors.weight = 'Could not compute value';
      if (hasGemstone && !(Number(gemstoneValue) > 0)) newErrors.gemstoneValue = 'Enter the diamond value, or untick Has diamond';
    } else {
      // A watch's Brand/Model is built from its Brand field, which reports its own error.
      if (!itemForm.brandModel.trim() && deviceKind !== 'watch') newErrors.brandModel = 'Brand/model is required';
      if (!itemForm.manualAppraisedValue || manualValue <= 0) newErrors.manualAppraisedValue = 'Appraised value is required';
      Object.assign(newErrors, deviceErrors);
    }
    if (effectiveAdjustedValue <= 0) newErrors.adjustedValue = 'Final appraised value must be a positive number';
    if (ltvPercent <= 0) newErrors.ltvPercent = 'Pawn-to-Value % must be a positive number';
    if (effectiveLoanAmount <= 0) newErrors.loanAmount = 'Pawn amount must be a positive number';
    else if (loanExceedsValue) newErrors.loanAmount = 'Pawn amount cannot exceed the final appraised value';

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
          const matched = (existingCustomers || []).find((c) =>
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
            apiCustomerId = newCustomer.customers_id;
            setSuccessMessage('Customer registered — activation email sent to ' + getCustomerEmail(newCustomer));
          }
        } catch (customerError) {
          newErrors.fullName = customerError instanceof Error ? customerError.message : 'Failed to create/find customer';
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
          // Whatever is in the Item Type field: a suggestion's stored key when
          // it matches one, otherwise the custom type exactly as typed.
          // item_type mirrors category, the column the API stores it in.
          category: itemTypeValue,
          item_type: itemTypeValue,
          custom_item_type: null,
          description: itemForm.itemDescription || `${itemTypeText} item`,
          brand_model: isJewelry ? null : itemForm.brandModel.trim(),
          item_details: deviceDetailsPayload(deviceKind, deviceDetails),
          metal_type: isJewelry ? itemForm.metalType : null,
          // Gold sends its karat; silver sends its fineness and no karat.
          karat: isJewelry && !isSilver ? itemForm.karat.toLowerCase() : null,
          fineness: isSilver ? itemForm.fineness : null,
          weight_grams: isJewelry ? Number(itemForm.weight) : null,
          appraised_value: isJewelry ? null : manualValue,
          // A suggested condition is sent as its key; a custom one as typed.
          condition: resolveComboValue(CONDITION_OPTIONS, itemForm.condition),
          loan_amount: effectiveLoanAmount,
          loan_to_value_percent: ltvPercent,
          due_date: dueDate.toISOString().split('T')[0],
          grace_period_days: Number(gracePeriodDays || 7),
          adjusted_value: adjustedValue ? Number(adjustedValue) : null,
          // The API adds gemstone_value to the gold value it computes itself.
          has_gemstone: isJewelry ? hasGemstone : null,
          gemstone_value: gemstoneOn ? Number(gemstoneValue) : null,
          gemstone_type: gemstoneOn ? 'diamond' : null,
          gemstone_details: gemstoneOn ? gemstoneDetails.trim() || null : null,
          // The attached photos, downscaled, in the order they were picked.
          // The customer portal shows the first one as the item's thumbnail.
          photos: await Promise.all(photos.map(photo => readImageAsScaledDataUrl(photo.file, ITEM_PHOTO_SCALE))),
        };
        const createdTransaction = await createTransaction(transactionPayload);
        const ticketNumber = createdTransaction.ticket_number;

        // Generate pawn ticket
        void printPawnTicket(ticketNumber, apiCustomerId ?? null);

        setSuccessMessage('Pawn transaction created successfully!');
        onTransactionCreated(`Pawn transaction ${ticketNumber} created successfully.`);
        // The success screen replaces the wizard and keeps the ticket number on
        // screen, so the staff can print, open the loan, or start the next one.
        setCreatedTicket(ticketNumber);
        setCreatedCustomerId(apiCustomerId ?? null);
      } catch (transactionError) {
        newErrors.submit = transactionError instanceof Error ? transactionError.message : 'Failed to create pawn transaction';
        setErrors(newErrors);
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'An unexpected error occurred' });
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
  const attachPhotos = async (fileList: FileList | File[] | null) => {
    // The API keeps at most MAX_ITEM_PHOTOS per item, so extra picks are dropped
    // here with a note rather than failing the whole transaction at submit.
    const room = Math.max(0, MAX_ITEM_PHOTOS - photos.length);
    const picked = Array.from(fileList || []);
    const files = picked.slice(0, room);
    setPhotoLimitNote(picked.length > files.length ? `Up to ${MAX_ITEM_PHOTOS} photos per item. ${picked.length - files.length} not attached.` : '');
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

  /**
   * Drop the photo and get a new one the same way: the camera for a photo
   * taken with it, the file picker for an uploaded one.
   */
  const retakePhoto = (photoId: string) => {
    const fromCamera = photos.find(photo => photo.id === photoId)?.name.startsWith('item-photo-');
    setPhotos(current => current.filter(photo => photo.id !== photoId));
    setPhotoLimitNote('');
    if (fromCamera) setItemCameraOpen(true);
    else photoInputRef.current?.click();
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

  /** A new ID photo, uploaded or taken with the camera, for either customer form. */
  const applyIdPhoto = (target: 'customer' | 'modal', file: File | undefined) => {
    if (target === 'customer') {
      customerIdCheck.check(file);
      readIdPhoto(file, (dataUrl) => updateCustomerForm('validIdPhoto', dataUrl));
    } else {
      modalIdCheck.check(file);
      readIdPhoto(file, (dataUrl) => setNewCustomerDraft((current) => ({ ...current, validIdPhoto: dataUrl })));
    }
  };

  const handleCancel = () => {
    setErrors({});
    setSuccessMessage('');
    go('loans');
  };

  /** Clear every field and return to step one, for the next walk-in customer. */
  const startNewTransaction = () => {
    customerIdCheck.reset();
    setCustomerForm({ fullName: '', contactNumber: '', address: '', validIdType: 'National ID', validIdNumber: '', email: '', validIdPhoto: '', customersId: undefined });
    setSavedCustomer(null);
    setItemForm({ group: 'jewelry', category: 'Ring', itemDescription: '', brandModel: '', metalType: 'gold', karat: '18k', fineness: DEFAULT_SILVER_FINENESS, weight: '', manualAppraisedValue: '', condition: 'Good', remarks: '' });
    setDeviceDetails({});
    setAdjustedValue('');
    setHasGemstone(false);
    setGemstoneValue('');
    setGemstoneDetails('');
    setLtvInput('');
    setLoanAmountInput('');
    setLoanEditedLast('ltv');
    setPhotos([]);
    setPhotoLimitNote('');
    setCustomerSearch('');
    setSearchResults([]);
    setShowCustomerResults(false);
    setErrors({});
    setSuccessMessage('');
    setCreatedTicket('');
    setCreatedCustomerId(null);
    setStep(1);
  };

  const selectCustomer = (customer: ApiCustomer) => {
    setCustomerForm({
      fullName: customer.name,
      contactNumber: customer.contact_number || '',
      address: customer.address || '',
      validIdType: customer.valid_id_type || 'National ID',
      validIdNumber: customer.valid_id_number || '',
      email: getCustomerEmail(customer),
      validIdPhoto: customer.valid_id_photo || '',
      customersId: customer.customers_id,
    });
    setSavedCustomer(customerDetails(customer));
    setFaceEnrolled(Boolean(customer.has_face_reference));
    setFaceNote('');
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
        customersId: createdCustomer.customers_id,
      });
      setSavedCustomer({ ...customerDetails(createdCustomer), validIdPhoto: createdCustomer.valid_id_photo || validIdPhoto || '' });
      setFaceEnrolled(false);
      setFaceNote('');

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
      modalIdCheck.reset();
      setIsCustomerModalOpen(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to create customer' });
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
      // Each group suggests its own item types, so switching group starts the
      // Item Type field over at the new group's first suggestion.
      if (field === 'group') {
        return { ...current, group: value, category: ITEM_CATEGORIES[value][0].label };
      }
      // Karat and fineness are separate fields, so a metal switch only changes
      // which one the Karat/Purity select edits.
      if (field === 'metalType') {
        return { ...current, metalType: value as MetalType };
      }
      return { ...current, [field]: value };
    });
    // With a gemstone, Final Appraised Value is metal + gemstone and follows
    // the metal inputs live, so a metal, karat or weight change drops any override.
    if (hasGemstone && (field === 'metalType' || field === 'karat' || field === 'fineness' || field === 'weight')) setAdjustedValue('');
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
  // A saved customer whose details were edited here but not saved yet.
  const customerDirty = Boolean(customerForm.customersId && savedCustomer)
    && CUSTOMER_DETAIL_FIELDS.some(field => customerForm[field].trim() !== (savedCustomer?.[field] ?? '').trim());
  // Next waits for Save or Discard, so the ticket never goes out under details
  // that differ from the customer's record.
  const customerStepValid = Boolean(customerForm.fullName.trim())
    && (Boolean(customerForm.customersId) || EMAIL_PATTERN.test(customerForm.email.trim()))
    && !customerDirty;

  const saveCustomerChanges = async () => {
    if (!customerForm.customersId) return;
    const formErrors: Record<string, string> = {};
    if (!customerForm.fullName.trim()) formErrors.fullName = 'Full name is required';
    if (!customerForm.contactNumber.trim()) formErrors.contactNumber = 'Contact number is required';
    if (!customerForm.validIdType.trim()) formErrors.validIdType = 'Valid ID type is required';
    if (!customerForm.validIdNumber.trim()) formErrors.validIdNumber = 'Valid ID number is required';
    if (Object.keys(formErrors).length > 0) { setErrors(formErrors); return; }

    setSavingCustomer(true);
    try {
      const updated = await updateCustomer(customerForm.customersId, {
        name: customerForm.fullName.trim(),
        contact_number: customerForm.contactNumber.trim(),
        address: customerForm.address.trim(),
        valid_id_type: customerForm.validIdType.trim(),
        valid_id_number: customerForm.validIdNumber.trim(),
        valid_id_photo: customerForm.validIdPhoto || null,
      });
      const details = customerDetails(updated);
      setCustomerForm(current => ({ ...current, ...details }));
      setSavedCustomer(details);
      setCustomerSearch(updated.name);
      setErrors({});
      setSuccessMessage('Customer details saved.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Could not save the customer details.' });
    } finally {
      setSavingCustomer(false);
    }
  };

  /** Put the form back to the customer's saved details. */
  const discardCustomerChanges = () => {
    if (!savedCustomer) return;
    setCustomerForm(current => ({ ...current, ...savedCustomer }));
    customerIdCheck.reset();
    setErrors({});
  };
  const itemStepValid =
    settingsReady &&
    itemValue > 0 &&
    effectiveAdjustedValue > 0 &&
    Boolean(itemTypeText) &&
    Boolean(itemForm.condition.trim()) &&
    (isJewelry
      ? metalPrice > 0 && weightValue > 0 && (!hasGemstone || Number(gemstoneValue) > 0)
      : Boolean(itemForm.brandModel.trim()) && manualValue > 0 && Object.keys(deviceErrors).length === 0);
  const loanStepValid = settingsReady && ltvPercent > 0 && effectiveLoanAmount > 0 && !loanExceedsValue;

  const stepValid: Record<WizardStep, boolean> = {
    1: customerStepValid,
    2: itemStepValid,
    3: loanStepValid,
    4: customerStepValid && itemStepValid && loanStepValid,
  };

  const steps: Array<{ id: WizardStep; label: string; hint: string }> = [
    { id: 1, label: 'Customer', hint: 'Who is pawning' },
    { id: 2, label: 'Pawn Item', hint: 'What is pawned' },
    { id: 3, label: 'Pawn Terms', hint: 'Terms & due date' },
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
          <h2>Pawn transaction complete</h2>
          <p>The pawn ticket has been created and the item is now active.</p>

          <div className="tx-success-ticket">
            <small>REFERENCE NUMBER</small>
            <strong>{createdTicket}</strong>
          </div>

          <div className="tx-success-figures">
            <div><span>Customer</span><strong>{customerForm.fullName || 'Walk-in Customer'}</strong></div>
            <div><span>Item</span><strong>{itemForm.itemDescription || itemTypeText}</strong></div>
            <div className="highlight"><span>Pawn amount</span><strong>{money(effectiveLoanAmount)}</strong></div>
            <div><span>Due date</span><strong>{dueDateLabel}</strong></div>
          </div>

          {qrNotice && (
            <p className={`tx-qr-notice ${qrNotice.networkReady ? '' : 'warn'}`}>
              <IonIcon icon={qrNotice.networkReady ? checkmarkCircle : warningOutline} aria-hidden="true" />
              {qrNotice.networkReady
                ? `Ticket QR opens ${qrNotice.address}${qrNotice.source === 'detected' ? ' — detected automatically, check this is the Wi-Fi address of this machine.' : ''}`
                : `Ticket QR opens ${qrNotice.address}, which no phone can reach. Set FRONTEND_URL in the API .env to this machine's Wi-Fi address, run php artisan config:clear, then reprint.`}
            </p>
          )}

          <div className="tx-success-actions">
            <button type="button" className="primary-button" onClick={() => void printPawnTicket(createdTicket, createdCustomerId)}>
              <IonIcon icon={documentTextOutline} />Print Pawn Ticket
            </button>
            <button type="button" className="secondary-button" onClick={() => go('loans')}>
              <IonIcon icon={cashOutline} />View Pawn Transaction
            </button>
            <button type="button" className="secondary-button" onClick={startNewTransaction}>
              <IonIcon icon={personAddOutline} />New Pawn Transaction
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
          <h2>New Pawn Transaction</h2>
        </div>
        <div className="tx-hero-price">
          <small>TODAY'S {metalName.toUpperCase()} REFERENCE PRICE</small>
          <strong>{metalPrice > 0 || !isSilver ? money(metalPrice) : 'No price'}<i>/gram</i></strong>
          <span><IonIcon icon={trendingUpOutline} />{GOLD_REFERENCE_NOTE}</span>
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

              {loadingSearch && <div className="lookup-dropdown"><span style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: '#94a3b8' }}><Spinner />Searching</span></div>}

              {showCustomerResults && searchResults.length > 0 && (
                <div className="lookup-dropdown" role="listbox">
                  {searchResults.map((customer) => (
                    <button
                      key={customer.customers_id}
                      type="button"
                      className="lookup-item"
                      onClick={() => selectCustomer(customer)}
                    >
                      <strong>{customer.name}</strong>
                      <span>{customer.contact_number || getCustomerEmail(customer)}</span>
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
                <div className="id-name-field">
                  <IonItem lines="none" className="tx-field">
                    <IonLabel position="stacked">Full Name</IonLabel>
                    <IonInput
                      value={customerForm.fullName}
                      onIonInput={(event) => updateCustomerForm('fullName', event.detail.value || '')}
                      placeholder="Full Name"
                    />
                  </IonItem>
                  <IdNameBadge check={customerIdCheck.state} fullName={customerForm.fullName} />
                </div>

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

                <Combobox
                  label="Valid ID Type"
                  customHint="Custom ID type:"
                  value={customerForm.validIdType}
                  options={VALID_ID_TYPE_OPTIONS}
                  onChange={(text) => updateCustomerForm('validIdType', text)}
                  placeholder="Pick or type, e.g. UMID"
                />

                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Valid ID Number</IonLabel>
                  <IonInput
                    value={customerForm.validIdNumber}
                    onIonInput={(event) => updateCustomerForm('validIdNumber', event.detail.value || '')}
                    placeholder="Valid ID Number"
                  />
                </IonItem>

                <div className="file-input tx-field">
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
                          onClick={() => { customerIdCheck.reset(); updateCustomerForm('validIdPhoto', ''); }}
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Walk-ins hand the card over, so the camera comes first.
                    <div className="id-photo-source">
                      <button type="button" className="primary" onClick={() => setIdCameraFor('customer')}>
                        <IonIcon icon={cameraOutline} />Take photo
                      </button>
                      <label>
                        <IonIcon icon={cloudUploadOutline} />Upload file
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(event) => { applyIdPhoto('customer', event.target.files?.[0]); event.target.value = ''; }}
                        />
                      </label>
                    </div>
                  )}
                  <IdPhotoQualityWarning
                    check={customerIdCheck.state}
                    onRetake={() => { customerIdCheck.reset(); updateCustomerForm('validIdPhoto', ''); setIdCameraFor('customer'); }}
                    onKeep={customerIdCheck.dismissQuality}
                  />
                </div>

                {/* Beside the ID photo, so the pair lines up under Valid ID Type
                    and Valid ID Number. */}
                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Email{customerForm.customersId ? ' (sign-in, not editable here)' : ''}</IonLabel>
                  {/* A saved customer's email is their sign-in and where password
                      resets go, so it is shown but not changed from this form. */}
                  <IonInput
                    type="email"
                    value={customerForm.email}
                    readonly={Boolean(customerForm.customersId)}
                    onIonInput={(event) => updateCustomerForm('email', event.detail.value || '')}
                    placeholder="customer@email.com"
                  />
                </IonItem>

                <IdAutofillCard
                  className="span-2"
                  check={customerIdCheck.state}
                  current={{ fullName: customerForm.fullName, idType: customerForm.validIdType, idNumber: customerForm.validIdNumber, address: customerForm.address }}
                  onUse={(fields) => Object.entries(idFieldsToCustomer(fields)).forEach(([field, value]) => updateCustomerForm(field as keyof typeof customerForm, value))}
                />

                {/* The face photo is taken once the customer is saved, since it
                    is stored against their record. It is checked against the
                    ID photo, then used to check whoever claims their items. */}
                {customerForm.customersId && (
                  <div className={`tx-face-row span-2${faceEnrolled ? ' is-done' : ''}`}>
                    <IonIcon icon={faceEnrolled ? checkmarkCircle : personCircleOutline} aria-hidden="true" />
                    <div>
                      <strong>{faceEnrolled ? 'Face photo on file' : 'Take a face photo'}</strong>
                      <span>{faceNote || (faceEnrolled
                        ? 'Used to check the person who claims this customer’s items.'
                        : 'Checked against the valid ID, then used to confirm who claims the item later.')}</span>
                    </div>
                    <button type="button" className={faceEnrolled ? 'secondary-button' : 'primary-button'} onClick={() => setFaceOpen(true)}>
                      <IonIcon icon={cameraOutline} aria-hidden="true" />{faceEnrolled ? 'Retake' : 'Take face photo'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {customerDirty && (
              <div className="tx-customer-unsaved" role="status">
                <div>
                  <strong>Unsaved changes to this customer</strong>
                  <span>Save them to the customer's record, or discard them, before going on.</span>
                </div>
                <div className="tx-customer-unsaved-actions">
                  <button type="button" className="secondary-button" onClick={discardCustomerChanges} disabled={savingCustomer}>Discard</button>
                  <button type="button" className="primary-button" onClick={saveCustomerChanges} disabled={savingCustomer} aria-busy={savingCustomer}>
                    {savingCustomer && <Spinner />}{savingCustomer ? 'Saving' : 'Save changes'}
                  </button>
                </div>
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
            <h3><span className="tx-step-badge">2</span>Pawn Item</h3>

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
              {/* Pick a suggestion or type a custom item type. The same field
                  works for all three groups; only the suggestions change. */}
              <Combobox
                key={itemForm.group}
                label="Item Type"
                customHint="Custom item type:"
                value={itemForm.category}
                options={itemTypeOptions}
                onChange={(text) => updateItemForm('category', text)}
                placeholder={isJewelry ? 'Pick or type, e.g. Gold tiara' : itemForm.group === 'bulky' ? 'Pick or type, e.g. Electric bike' : 'Pick or type, e.g. Smart ring'}
                error={errors.category}
              />

              <Combobox
                label="Condition"
                customHint="Custom condition:"
                value={itemForm.condition}
                options={CONDITION_OPTIONS}
                onChange={(text) => updateItemForm('condition', text)}
                placeholder="Pick or type, e.g. Minor scratches"
                error={errors.condition}
              />

              {/* Jewelry fields share the Item Type box (.tx-combobox), so all
                  six line up two by two at one height. Non-jewelry keeps the
                  description full width above its own pair of fields. */}
              <div className={`tx-combobox${isJewelry ? '' : ' span-2'}`}>
                <label className="tx-combobox-label" htmlFor="tx-item-description">Item Description</label>
                <div className="tx-combobox-control">
                  <input
                    id="tx-item-description"
                    type="text"
                    value={itemForm.itemDescription}
                    onChange={(event) => updateItemForm('itemDescription', event.target.value)}
                    placeholder={isJewelry
                      ? 'e.g. Wedding ring with heart design'
                      : deviceKind
                        ? 'Scratches, damage, missing parts, or anything else seen'
                        : 'e.g. With charger and original box'}
                  />
                </div>
              </div>

              {isJewelry ? (
                <>
                  <div className="tx-combobox tx-material">
                    <span className="tx-combobox-label" id="tx-material-label">Material</span>
                    <div className="tx-combobox-control tx-material-picker" role="radiogroup" aria-labelledby="tx-material-label">
                      {METALS.map(metal => (
                        <button
                          key={metal.value}
                          type="button"
                          role="radio"
                          aria-checked={itemForm.metalType === metal.value}
                          className={itemForm.metalType === metal.value ? 'active' : ''}
                          onClick={() => updateItemForm('metalType', metal.value)}
                        >
                          {metal.label}
                        </button>
                      ))}
                    </div>
                    {isSilver && !(currentSilverPrice && currentSilverPrice > 0) && (
                      <small className="tx-field-error">No silver price recorded yet, so a silver value cannot be computed.</small>
                    )}
                  </div>

                  {/* Keyed on the metal so the field starts over with that metal's options.
                      Strict: the value formula needs one of these purities. */}
                  <TypeSelect
                    key={itemForm.metalType}
                    label="Karat/Purity"
                    value={isSilver ? itemForm.fineness : itemForm.karat}
                    options={isSilver ? SILVER_PURITIES : GOLD_KARAT_OPTIONS}
                    onChange={(value) => updateItemForm(isSilver ? 'fineness' : 'karat', value)}
                    placeholder="Pick or type, e.g. 18k"
                  />

                  <div className="tx-field-wrap">
                  <div className={`tx-combobox tx-weight${errors.weight ? ' has-error' : ''}`}>
                    <label className="tx-combobox-label" htmlFor="tx-weight">Weight</label>
                    <div className="tx-combobox-control">
                      {/* Text, not number: a number input still accepts "-", "+"
                          and "e", so the value is cleaned on every keystroke. */}
                      <input
                        id="tx-weight"
                        type="text"
                        inputMode="decimal"
                        value={itemForm.weight}
                        onChange={(event) => updateItemForm('weight', cleanDecimal(event.target.value))}
                        placeholder="e.g. 5.25"
                      />
                      {/* The unit sits in the field itself, not only in the
                          label: a jeweller weighing in kilos would otherwise
                          enter 0.005 and never be told. */}
                      <span className="tx-weight-unit" aria-hidden="true">grams</span>
                    </div>
                  </div>
                  {errors.weight
                    ? <small className="tx-field-error">{errors.weight}</small>
                    : weightNote && <small className="tx-field-warn" role="status">{weightNote}</small>}
                  </div>

                  {/* Optional. Unticked, the gold computation is the whole value. */}
                  <div className="tx-gemstone span-2">
                    <IonCheckbox
                      checked={hasGemstone}
                      labelPlacement="end"
                      justify="start"
                      onIonChange={(event) => {
                        setHasGemstone(event.detail.checked);
                        setAdjustedValue('');
                      }}
                    >
                      Has diamond?
                    </IonCheckbox>
                  </div>

                  {hasGemstone && (
                    <>
                      <IonItem lines="none" className="tx-field">
                        <IonLabel position="stacked">{metalName} Value (AI-assisted)</IonLabel>
                        <IonInput readonly value={money(computedValue)} />
                      </IonItem>

                      <IonItem lines="none" className="tx-field">
                        <IonLabel position="stacked">Diamond Value</IonLabel>
                        <IonInput
                          type="text"
                          inputmode="decimal"
                          value={gemstoneValue}
                          onIonInput={(event) => {
                            setGemstoneValue(readDecimal(event));
                            setAdjustedValue('');
                            setErrors((current) => {
                              const updated = { ...current };
                              delete updated.gemstoneValue;
                              return updated;
                            });
                          }}
                          placeholder="Staff estimate, ₱0.00"
                        />
                        {errors.gemstoneValue && <small className="tx-field-error">{errors.gemstoneValue}</small>}
                      </IonItem>

                      <IonItem lines="none" className="tx-field span-2">
                        <IonLabel position="stacked">Diamond Details (optional)</IonLabel>
                        <IonInput
                          value={gemstoneDetails}
                          maxlength={255}
                          onIonInput={(event) => setGemstoneDetails(event.detail.value || '')}
                          placeholder="e.g. 0.5 carat, round cut"
                        />
                      </IonItem>
                    </>
                  )}
                </>
              ) : deviceKind ? (
                <DeviceDetailsFields
                  kind={deviceKind}
                  itemType={itemTypeValue}
                  details={deviceDetails}
                  onChange={(field, value) => {
                    setDeviceDetails(current => ({ ...current, [field]: value }));
                    setErrors(current => {
                      if (!current[field]) return current;
                      const updated = { ...current };
                      delete updated[field];
                      return updated;
                    });
                  }}
                  brandModel={itemForm.brandModel}
                  onBrandModelChange={(value) => updateItemForm('brandModel', value)}
                  appraisedValue={itemForm.manualAppraisedValue}
                  onAppraisedValueChange={(value) => updateItemForm('manualAppraisedValue', value)}
                  readDecimal={readDecimal}
                  errors={{ ...errors, ...(deviceDetails.imei || deviceDetails.battery_health ? deviceErrors : {}) }}
                />
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
                      type="text"
                      inputmode="decimal"
                      value={itemForm.manualAppraisedValue}
                      onIonInput={(event) => updateItemForm('manualAppraisedValue', readDecimal(event))}
                      placeholder="₱0.00"
                    />
                  </IonItem>
                </>
              )}
            </div>

            <div className={`tx-value-hero ${itemValue > 0 ? 'filled' : ''}`}>
              <div className="tx-value-main">
                <small>{isJewelry ? 'COMPUTED VALUE' : 'APPRAISED VALUE'}</small>
                <strong>{money(isJewelry ? computedValue : itemValue)}</strong>
                {isJewelry ? (
                  <>
                    <span className="tx-value-formula">
                      {itemForm.weight || '0'} g <i>x</i> {purityText} purity {(metalPurity * 100).toFixed(1)}% <i>x</i> {money(metalPrice)}/g
                    </span>
                    {gemstoneOn && (
                      <span className="tx-value-formula">
                        {metalName} {money(computedValue)} <i>+</i> diamond {money(gemstoneAmount)} <i>=</i> {money(itemValue)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="tx-value-formula">Staff appraised · {itemForm.brandModel || itemTypeText}</span>
                )}
              </div>

              <div className="tx-value-split">
                <div>
                  <span>Pawn-to-Value</span>
                  <strong>{ltvPercent}%</strong>
                  <div className="tx-ltv-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ltvPercent)}%` }} /></div>
                </div>
                <div>
                  <span>Pawn Amount</span>
                  <strong className="tx-value-loan">{money(effectiveLoanAmount)}</strong>
                </div>
              </div>
            </div>

            <div className="form-grid two-col value-override-grid">
              <div className="tx-field-stack span-2">
                <IonItem lines="none" className="tx-field">
                  <IonLabel position="stacked">Final Appraised Value</IonLabel>
                  <IonInput
                    type="text"
                    inputmode="decimal"
                    value={adjustedValue || itemValue.toString()}
                    onIonInput={(event) => setAdjustedValue(readDecimal(event))}
                    placeholder="₱0.00"
                  />
                </IonItem>
                <small className="tx-value-note">
                  {isJewelry ? 'Computed value is a reference only. ' : ''}
                  Final appraisal is up to staff, especially for items with diamonds or added value.
                </small>
              </div>

              <div className="tx-field tx-photo-field">
                <div className="file-input tx-photo-picker">
                  <span>Item Photo(s) <small>up to {MAX_ITEM_PHOTOS}</small></span>
                  {/* The item is on the counter, so the camera comes first. Both
                      add to the same list; neither is offered once it is full. */}
                  <div className="id-photo-source">
                    <button type="button" className="primary" onClick={() => setItemCameraOpen(true)} disabled={photos.length >= MAX_ITEM_PHOTOS}>
                      <IonIcon icon={cameraOutline} />Take a photo
                    </button>
                    <label className={photos.length >= MAX_ITEM_PHOTOS ? 'is-disabled' : ''}>
                      <IonIcon icon={cloudUploadOutline} />Upload file
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        multiple
                        disabled={photos.length >= MAX_ITEM_PHOTOS}
                        onChange={(event) => {
                          void attachPhotos(event.target.files);
                          // Clear the picker so re-picking the same file after a
                          // retake still fires a change event.
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                {photoLimitNote && <p className="tx-step-hint" role="status">{photoLimitNote}</p>}

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
            <h3><span className="tx-step-badge">3</span>Pawn Terms</h3>

            <div className="tx-loan-chips">
              <div className="tx-loan-chip gold">
                <IonIcon icon={cashOutline} />
                <span>Pawn amount</span>
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
                <span>Extension Period</span>
                <strong>{gracePeriodDays} days</strong>
              </div>
            </div>

            <div className="form-grid two-col loan-grid">
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Appraised Value</IonLabel>
                <IonInput value={`₱${effectiveAdjustedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Pawn-to-Value %</IonLabel>
                <IonInput
                  type="text"
                  inputmode="decimal"
                  value={loanEditedLast === 'ltv' ? (ltvInput === '' ? String(defaultLtvPercent) : ltvInput) : String(ltvPercent)}
                  onIonInput={(event) => editLtv(readDecimal(event))}
                  placeholder="e.g. 70"
                />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Pawn Amount</IonLabel>
                <IonInput
                  type="text"
                  inputmode="decimal"
                  value={loanEditedLast === 'amount' ? loanAmountInput : String(effectiveLoanAmount)}
                  onIonInput={(event) => editLoanAmount(readDecimal(event))}
                  placeholder="₱0.00"
                />
                {loanExceedsValue && <small className="tx-field-error">Pawn amount cannot exceed the final appraised value.</small>}
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Interest (Renta)</IonLabel>
                <IonInput value={`${interestRatePercent}% / month (${groupLabel(itemForm.group)})`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Monthly Interest</IonLabel>
                <IonInput value={`₱${monthlyInterest.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Pawn Term / Due Date</IonLabel>
                <IonInput value={`${loanTermDays} days · ${dueDateLabel}`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Extension Period</IonLabel>
                <IonInput value={`${gracePeriodDays} days`} readonly />
              </IonItem>

              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Payable on Redemption</IonLabel>
                <IonInput value={`₱${(effectiveLoanAmount + monthlyInterest).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} readonly />
              </IonItem>
            </div>

            <p className="tx-step-hint">
              Pawn-to-Value % and Pawn Amount start from the shop's suggested default and stay in sync;
              change either one as needed. The exact amount owed at
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
                  <div><span>Type</span><strong>{itemTypeText}</strong></div>
                  <div><span>Description</span><strong>{itemForm.itemDescription || 'Not provided'}</strong></div>
                  {isJewelry ? (
                    <div><span>Karat / Weight</span><strong>{isSilver ? `${purityText} · ` : `${itemForm.karat} · `}{itemForm.weight || '0'} g</strong></div>
                  ) : (
                    <div><span>Brand/Model</span><strong>{itemForm.brandModel || 'Not provided'}</strong></div>
                  )}
                  <div><span>Condition</span><strong>{itemForm.condition}</strong></div>
                  {deviceKind && deviceDetailRows(deviceDetailsPayload(deviceKind, deviceDetails)).map(([label, value]) => (
                    <div key={label}><span>{label}</span><strong>{value}</strong></div>
                  ))}
                </div>
              </div>

              <div className="tx-summary-card full-span">
                <div className="tx-summary-title">Value &amp; Pawn Amount</div>
                <div className="tx-summary-list tx-summary-two-col">
                  {isJewelry && <div><span>{metalName} Price</span><strong>₱{metalPrice.toLocaleString()}/gram</strong></div>}
                  {gemstoneOn ? (
                    <>
                      <div className="tx-summary-breakdown"><span>Value Breakdown</span><strong>{gemstoneBreakdown}</strong></div>
                      {gemstoneSummary && <div><span>Diamond</span><strong>{gemstoneSummary}</strong></div>}
                      {valueAdjusted && <div><span>Final Appraised Value (staff adjusted)</span><strong>{pesoText(effectiveAdjustedValue)}</strong></div>}
                    </>
                  ) : (
                    <>
                      <div><span>{isJewelry ? 'Computed Value' : 'Appraised Value'}</span><strong>{pesoText(isJewelry ? computedValue : itemValue)}</strong></div>
                      <div><span>Final Appraised Value</span><strong>{pesoText(effectiveAdjustedValue)}</strong></div>
                    </>
                  )}
                  <div><span>Pawn-to-Value</span><strong>{ltvPercent}%</strong></div>
                  <div><span>Pawn Amount</span><strong>₱{effectiveLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Interest (Renta)</span><strong>{interestRatePercent}% / month</strong></div>
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
            <div className="id-name-field">
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Full Name</IonLabel>
                <IonInput
                  value={newCustomerDraft.fullName}
                  onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, fullName: event.detail.value || '' }))}
                  placeholder="Full Name"
                />
              </IonItem>
              <IdNameBadge check={modalIdCheck.state} fullName={newCustomerDraft.fullName} />
            </div>

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

            <Combobox
              label="Valid ID Type"
              customHint="Custom ID type:"
              value={newCustomerDraft.validIdType}
              options={VALID_ID_TYPE_OPTIONS}
              onChange={(text) => setNewCustomerDraft((current) => ({ ...current, validIdType: text }))}
              placeholder="Pick or type, e.g. UMID"
            />

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Valid ID Number</IonLabel>
              <IonInput
                value={newCustomerDraft.validIdNumber}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, validIdNumber: event.detail.value || '' }))}
                placeholder="Valid ID Number"
              />
            </IonItem>

            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput
                type="email"
                value={newCustomerDraft.email}
                onIonInput={(event) => setNewCustomerDraft((current) => ({ ...current, email: event.detail.value || '' }))}
                placeholder="customer@email.com"
              />
            </IonItem>

            <div className="file-input tx-field">
              <span>Valid ID Photo</span>
              <div className="id-photo-source">
                <button type="button" className="primary" onClick={() => setIdCameraFor('modal')}>
                  <IonIcon icon={cameraOutline} />{newCustomerDraft.validIdPhoto ? 'Retake photo' : 'Take photo'}
                </button>
                <label>
                  <IonIcon icon={cloudUploadOutline} />Upload file
                  <input
                    ref={modalIdInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => { applyIdPhoto('modal', event.target.files?.[0]); event.target.value = ''; }}
                  />
                </label>
              </div>
              <IdPhotoQualityWarning
                check={modalIdCheck.state}
                onRetake={() => {
                  modalIdCheck.reset();
                  setNewCustomerDraft((current) => ({ ...current, validIdPhoto: '' }));
                  setIdCameraFor('modal');
                }}
                onKeep={modalIdCheck.dismissQuality}
              />
              {newCustomerDraft.validIdPhoto && (
                <div className="id-photo-preview">
                  <img src={newCustomerDraft.validIdPhoto} alt="Valid ID preview" />
                  <small><IonIcon icon={checkmarkCircle} />Attached</small>
                </div>
              )}
            </div>

            <IdAutofillCard
              className="span-2"
              check={modalIdCheck.state}
              current={{ fullName: newCustomerDraft.fullName, idType: newCustomerDraft.validIdType, idNumber: newCustomerDraft.validIdNumber, address: newCustomerDraft.address }}
              onUse={(fields) => setNewCustomerDraft((current) => ({ ...current, ...idFieldsToCustomer(fields) }))}
            />
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
              {loading && <Spinner />}{loading ? 'Saving' : 'Save Customer'}
            </button>
          </div>
        </div>
      </IonModal>

      <CameraCapture
        isOpen={idCameraFor !== null}
        onClose={() => setIdCameraFor(null)}
        onCapture={(file) => { if (idCameraFor) applyIdPhoto(idCameraFor, file); }}
      />

      {customerForm.customersId && (
        <FaceCheck
          isOpen={faceOpen}
          mode="enroll"
          customerId={customerForm.customersId}
          customerName={customerForm.fullName}
          onClose={() => setFaceOpen(false)}
          onDone={(result) => {
            setFaceOpen(false);
            setFaceEnrolled(true);
            setFaceNote(result === 'match'
              ? 'Saved. The face matched the valid ID.'
              : result === 'no_reference'
                ? 'Saved. There was no ID photo to compare it with.'
                : 'Saved, but it did not clearly match the ID photo. Check the ID by hand.');
          }}
        />
      )}

      <CameraCapture
        subject="item"
        title="Take item photo"
        isOpen={itemCameraOpen}
        onClose={() => setItemCameraOpen(false)}
        onCapture={(file) => { void attachPhotos([file]); }}
      />

      <div className="tx-actionbar">
        <div className="tx-actionbar-figures">
          <div><span>Appraised</span><strong>{money(effectiveAdjustedValue)}</strong></div>
          <div className="highlight"><span>Pawn amount</span><strong>{money(effectiveLoanAmount)}</strong></div>
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
              {loading && <Spinner />}{loading ? 'Processing' : 'Confirm Pawn Transaction'}
              <IonIcon icon={checkmarkOutline} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

/** One loan on the staff Loans screen, flattened from the API records. */
type WorkflowGroupKey = 'for_sale' | 'redeemed' | 'active' | 'forfeited' | 'sold';

type LoanRow = {
  transactionId: number;
  itemId: number;
  customerId: number;
  ticketNumber: string;
  item: string;
  customer: string;
  specs: string;
  currentValue: number;
  loanAmount: number;
  interestDue: number;
  totalPayable: number;
  /** Monthly interest rate as a percentage, e.g. 5 for 5% a month. */
  interestRatePercent: number;
  /** Days the pawn has run, which the interest is charged on. */
  daysElapsed: number;
  /** Date the pawn was opened. */
  pawnedOn: string;
  dueDate: string;
  daysUntilDue: number;
  risk: 'Low' | 'Medium' | 'High';
  status: 'Active' | 'Overdue' | 'Redeemed' | typeof FORFEITED_LABEL;
  valueHistory: Array<{ date: string; value: number }>;
  /** Set once the customer has asked to redeem this loan. */
  readyToRedeem: boolean;
  /** When they asked, so the counter is worked first come first served. */
  readyToRedeemAt: string | null;
  /** Set once staff has accepted that request. */
  redemptionConfirmed: boolean;
  /** The staff member holding this pawn, when one is, and since when. */
  lockedByName: string | null;
  lockedById: number | null;
  lockedAt: string | null;
};

/** An enum value as the API stores it, rendered for a person to read. */
const readable = (value?: string | null) =>
  (value || '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/**
 * The item type of a saved item. An item recorded under "Others" carries the
 * exact type the staff typed in, and that is what is shown. A stored key such
 * as "brooch_pin" is made readable; a custom type is shown as typed.
 */
const savedItemTypeLabel = (item?: { category?: string | null; custom_item_type?: string | null } | null) =>
  item?.category === OTHER_ITEM_TYPE && item?.custom_item_type?.trim()
    ? item.custom_item_type.trim()
    : /^[a-z0-9_]+$/.test(item?.category || '') ? readable(item?.category) : (item?.category || '').trim();

/**
 * What identifies the item at a glance: karat and weight for jewelry, brand or
 * model for a watch, cellphone, or bulky item.
 */
const specsFor = (item?: ApiItemDetail | null) => {
  if (!item) return '-';
  if (item.group === 'jewelry') {
    return [purityLabel(item), item.weight_grams ? `${item.weight_grams} g` : null, item.has_gemstone ? 'with diamond' : null]
      .filter(Boolean)
      .join(' / ') || '-';
  }
  return item.brand_model || savedItemTypeLabel(item);
};

/**
 * Everything the Loans screen needs, loaded from the API in one place so the
 * tables, the modals, and the lifecycle panel all read the same records.
 */
/**
 * Staff > My Reports. One staff member's own work, never the whole shop.
 *
 * The admin Reports page answers how the business is doing. This one answers
 * what this person has handled: tickets they wrote, redemptions they took,
 * renewals they checked. The API scopes every figure to the caller, so nothing
 * here can be pointed at a colleague.
 */
const StaffReport: React.FC<{ go: (view: View) => void; setLoanTab: (value: 'active' | 'payments' | 'renewals' | 'customers' | 'lifecycle') => void }> = ({ go, setLoanTab }) => {
  const [report, setReport] = useState<ApiStaffReport | null>(null);
  const [error, setError] = useState('');
  // Which stretch of time every figure is read over. One control, so the whole
  // page always reports the same period.
  const [period, setPeriod] = useState<'today' | 'this_month' | 'total'>('this_month');
  // Which tile is open, and so which table is shown under the row. One at a
  // time: two tables would make the counts above them hard to tell apart.
  const [openMetric, setOpenMetric] = useState<StaffReportMetric | null>(null);

  useEffect(() => {
    getStaffReport()
      .then(setReport)
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Your report could not be loaded.'));
  }, []);

  const openRenewals = () => {
    setLoanTab('renewals');
    go('loans');
  };

  return (
    <section className="staff-content staff-report">
      <div className="staff-page-intro">
        <div>
          <small>MY WORK</small>
          <h2>Generate Reports</h2>
          <p>{report ? `Everything ${report.staff_name} has handled. Only your own records are counted here.` : 'Your own pawn tickets, redemptions and renewals.'}</p>
        </div>
      </div>

      {error && <p className="risk-empty">{error}</p>}

      {!report && !error && <SkeletonList rows={4} />}

      {report && (
        <>
          <div className="report-window" role="tablist" aria-label="Report period">
            {REPORT_PERIODS.map(entry => (
              <button
                key={entry.id}
                className={period === entry.id ? 'active' : ''}
                onClick={() => setPeriod(entry.id)}
                role="tab"
                aria-selected={period === entry.id}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="staff-report-grid">
            <ReportTile metric="pawns" open={openMetric} onOpen={setOpenMetric} label="Pawn tickets written" value={String(report.pawns_recorded[period])} detail={`${moneyExact(report.pawn_amount[period])} pawned out`} icon={walletOutline} />
            <ReportTile metric="redemptions" open={openMetric} onOpen={setOpenMetric} label="Redemptions processed" value={String(report.redemptions_processed[period])} detail={`${moneyExact(report.amount_collected[period])} collected`} icon={cashOutline} />
            <ReportTile metric="renewals_confirmed" open={openMetric} onOpen={setOpenMetric} label="Renewals confirmed" value={String(report.renewals_confirmed[period])} detail={`${moneyExact(report.renewal_amount[period])} renta checked`} icon={refreshOutline} />
            <ReportTile metric="renewals_rejected" open={openMetric} onOpen={setOpenMetric} label="Renewals rejected" value={String(report.renewals_rejected)} detail="References you could not match, all time" icon={alertCircleOutline} />
          </div>

          {openMetric && <StaffReportBreakdown metric={openMetric} period={period} onClose={() => setOpenMetric(null)} />}

          <div className="staff-panel staff-report-panel">
            <h3>Still open</h3>
            <div className="staff-report-open">
              <div>
                <span>Your active pawns</span>
                <strong>{report.open_pawns}</strong>
                <small>{report.overdue_pawns} past the due date</small>
              </div>
              <div>
                <span>Customers you registered</span>
                <strong>{report.customers_registered}</strong>
                <small>All time</small>
              </div>
              <div className={report.pending_renewals > 0 ? 'is-work' : ''}>
                <span>Renewal payments to check</span>
                <strong>{report.pending_renewals}</strong>
                <small>Waiting on any staff member</small>
              </div>
            </div>
            {report.pending_renewals > 0 && (
              <button type="button" className="staff-report-action" onClick={openRenewals}>Open Pending Renewals</button>
            )}
          </div>

        </>
      )}
    </section>
  );
};

/** The three periods every figure on the staff report can be read over. */
const REPORT_PERIODS: Array<{ id: 'today' | 'this_month' | 'total'; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'this_month', label: 'This month' },
  { id: 'total', label: 'All time' },
];

/** What each metric's table is headed, and what its amount column means. */
const METRIC_META: Record<StaffReportMetric, { title: string; amount: string; note: string }> = {
  pawns: { title: 'Pawn tickets you wrote', amount: 'Pawn amount', note: 'Status' },
  redemptions: { title: 'Redemptions you processed', amount: 'Collected', note: 'Principal' },
  renewals_confirmed: { title: 'Renewals you confirmed', amount: 'Renta', note: 'Reference' },
  renewals_rejected: { title: 'Renewals you rejected', amount: 'Renta claimed', note: 'Reason' },
};

const ReportTile: React.FC<{
  metric: StaffReportMetric;
  open: StaffReportMetric | null;
  onOpen: (metric: StaffReportMetric | null) => void;
  label: string;
  value: string;
  detail: string;
  icon: string;
}> = ({ metric, open, onOpen, label, value, detail, icon }) => (
  <button
    type="button"
    className={`staff-report-tile ${open === metric ? 'is-open' : ''}`}
    onClick={() => onOpen(open === metric ? null : metric)}
    aria-expanded={open === metric}
  >
    <span className="staff-report-icon"><IonIcon icon={icon} /></span>
    <small>{label}</small>
    <strong>{value}</strong>
    <span className="staff-report-detail">{detail}</span>
    <span className="staff-report-more">{open === metric ? 'Hide list' : 'View list'}<IonIcon icon={open === metric ? chevronUpOutline : chevronForwardOutline} /></span>
  </button>
);

/**
 * The rows behind one tile.
 *
 * The tiles answer how many; this answers which ones. It is fetched when a
 * tile is opened rather than with the report, so the page stays light for the
 * staff member who only wants the counts.
 */
const StaffReportBreakdown: React.FC<{ metric: StaffReportMetric; period: 'today' | 'this_month' | 'total'; onClose: () => void }> = ({ metric, period, onClose }) => {
  const [rows, setRows] = useState<ApiStaffReportRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setRows(null);
    setError('');
    getStaffReportBreakdown(metric, period)
      .then(result => { if (active) setRows(result.rows); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'That list could not be loaded.'); });
    return () => { active = false; };
  }, [metric, period]);

  const meta = METRIC_META[metric];
  const { pageRows, pager } = usePagedRows(rows || []);

  return (
    <div className="staff-panel staff-report-panel staff-report-breakdown">
      <div className="staff-report-breakdown-head">
        <h3>{meta.title}</h3>
        <button type="button" onClick={onClose}>Close<IonIcon icon={closeOutline} /></button>
      </div>

      {error && <p className="risk-empty">{error}</p>}

      <div className="loan-table">
        <div className="loan-table-head breakdown-head">
          <span>Date</span>
          <span>Ticket No.</span>
          <span>Customer</span>
          <span>Item</span>
          <span>{meta.amount}</span>
          <span>{meta.note}</span>
        </div>
        {pageRows.map(row => (
          <div className="loan-table-row breakdown-row" key={`${metric}-${row.id}`}>
            <span>{row.date ? shortDate(row.date) : '-'}</span>
            <span>{row.ticket_number || '-'}</span>
            <span>{row.customer || '-'}</span>
            <span>{row.item || '-'}</span>
            <span>{moneyExact(row.amount)}</span>
            <span>{row.note || '-'}</span>
          </div>
        ))}
        {rows === null && !error && <SkeletonList rows={3} />}
        {rows !== null && rows.length === 0 && <p className="risk-empty">Nothing to show for this period.</p>}
      </div>

      <Pager pager={pager} label="records" />
    </div>
  );
};

const useLoanData = () => {
  const [items, setItems] = useState<ApiItemDetail[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [alerts, setAlerts] = useState<ApiRiskAlert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(token => token + 1), []);

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
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load pawn records.');
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
      customerId: transaction.customer_id,
      ticketNumber: transaction.ticket_number,
      item: item?.description || `Item #${transaction.item_id}`,
      customer: transaction.customer?.name || 'Unknown customer',
      specs: specsFor(item),
      currentValue: Number(item?.adjusted_value ?? item?.total_value ?? item?.appraised_value ?? 0),
      loanAmount: Number(transaction.loan_amount),
      interestDue: Number(transaction.interest_due),
      totalPayable: Number(transaction.total_payable),
      // Stored as a fraction (0.05); shown as a percentage.
      interestRatePercent: Number(transaction.interest_rate) * 100,
      daysElapsed: Number(transaction.days_elapsed) || 0,
      pawnedOn: shortDate(transaction.created_at),
      dueDate: shortDate(transaction.due_date),
      daysUntilDue: transaction.days_until_due,
      risk: riskByItem.get(transaction.item_id) || 'Low',
      status: (overdue ? 'Overdue' : statusLabel(transaction.status)) as LoanRow['status'],
      valueHistory: (item?.value_logs || []).map(log => ({ date: shortDate(log.log_date), value: Number(log.computed_value) })),
      readyToRedeem: Boolean(transaction.ready_to_redeem_at),
      readyToRedeemAt: transaction.ready_to_redeem_at,
      redemptionConfirmed: Boolean(transaction.redemption_confirmed_at),
      // A claim older than the timeout is read as no claim, the same way the
      // API reads it, so a closed browser never holds a row on screen either.
      lockedByName: isLockLive(transaction.locked_at) ? transaction.lock_holder?.name ?? 'another staff member' : null,
      lockedById: isLockLive(transaction.locked_at) ? transaction.locked_by ?? null : null,
      lockedAt: isLockLive(transaction.locked_at) ? transaction.locked_at ?? null : null,
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
  const modal = useModal();
  const [selectedLoan, setSelectedLoan] = useState<LoanRow | null>(null);
  const [salePrices, setSalePrices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Photo editor: the item being edited and its working photo list, saved
  // together so staff can add, remove, and reorder before anything is sent.
  const [photoItem, setPhotoItem] = useState<ApiItemDetail | null>(null);
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [photoNote, setPhotoNote] = useState('');
  // Customers' holds on items for sale, refetched whenever the item list is.
  const [holds, setHolds] = useState<ApiReservation[]>([]);

  useEffect(() => {
    getReservations().then(setHolds).catch(() => setHolds([]));
  }, [items]);

  const holdFor = (itemId: number) => holds.find(hold => hold.item_id === itemId && isHolding(hold)) || null;

  const cancelHold = async (hold: ApiReservation, itemName: string) => {
    const confirmed = await modal.warning({
      title: 'Cancel this reservation?',
      message: <><strong>{hold.customer?.name || 'The customer'}</strong> will be told the shop cancelled their hold on <strong>{itemName}</strong>, and it goes back on sale.</>,
      confirmLabel: 'Cancel reservation',
    });
    if (!confirmed) return;
    await run(() => cancelReservation(hold.item_reservations_id));
  };

  const openPhotoEditor = (item: ApiItemDetail) => {
    setPhotoItem(item);
    setDraftPhotos(item.photo_urls || []);
    setPhotoNote('');
  };

  const addPhotos = async (files: FileList | null) => {
    const picked = Array.from(files || []);
    const room = Math.max(0, MAX_ITEM_PHOTOS - draftPhotos.length);
    setPhotoNote(picked.length > room ? `Up to ${MAX_ITEM_PHOTOS} photos per item. ${picked.length - room} not added.` : '');
    const scaled = await Promise.all(picked.slice(0, room).map(file => readImageAsScaledDataUrl(file, ITEM_PHOTO_SCALE)));
    setDraftPhotos(current => [...current, ...scaled].slice(0, MAX_ITEM_PHOTOS));
  };

  const movePhoto = (index: number, step: number) => setDraftPhotos(current => {
    const target = index + step;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const savePhotos = async () => {
    if (!photoItem) return;
    await run(() => updateItemPhotos(photoItem.items_id, draftPhotos));
    setPhotoItem(null);
  };

  const openLoanFor = (itemId: number) => loans.find(loan => loan.itemId === itemId && (loan.status === 'Active' || loan.status === 'Overdue')) || null;

  // Items are grouped by status and one group is shown at a time. Overdue items
  // still carry an open loan, so they sit with Active. Forfeited and Sold only
  // appear when there is something in them, so no record drops out of view.
  const [groupFilter, setGroupFilter] = useState<WorkflowGroupKey>('for_sale');
  const groups: Array<{ key: WorkflowGroupKey; title: string; items: ApiItemDetail[]; optional?: boolean }> = [
    { key: 'for_sale', title: 'For Sale', items: items.filter(item => item.status === 'for_sale') },
    { key: 'redeemed', title: 'Redeemed', items: items.filter(item => item.status === 'redeemed') },
    { key: 'active', title: 'Active', items: items.filter(item => item.status === 'active' || item.status === 'overdue') },
    { key: 'forfeited', title: FORFEITED_LABEL,items: items.filter(item => item.status === 'forfeited'), optional: true },
    { key: 'sold', title: 'Sold', items: items.filter(item => item.status === 'sold'), optional: true },
  ];
  const visibleGroups = groups.filter(group => !group.optional || group.items.length > 0);
  // An optional group can empty out after an action; fall back to For Sale.
  const shownGroup = visibleGroups.some(group => group.key === groupFilter) ? groupFilter : 'for_sale';

  const latestTransaction = (item: ApiItemDetail, status?: ApiTransaction['status']) =>
    [...(item.transactions || [])]
      .filter(transaction => !status || transaction.status === status)
      .sort((a, b) => b.transactions_id - a.transactions_id)[0];

  /** The day a forfeited loan passed its due date plus grace period. */
  const forfeitureDate = (item: ApiItemDetail) => {
    const transaction = latestTransaction(item, 'forfeited');
    if (!transaction) return '—';
    const date = new Date(transaction.due_date);
    date.setDate(date.getDate() + Number(transaction.grace_period_days || 0));
    return shortDate(date.toISOString());
  };

  /** Value/Price and Date cells, which mean something different in each group. */
  const rowCells = (item: ApiItemDetail, loan: LoanRow | null) => {
    const itemValue = money(Number(item.adjusted_value ?? item.total_value ?? item.appraised_value ?? 0));
    const salePrice = item.sale_price != null ? money(Number(item.sale_price)) : '—';
    switch (item.status) {
      case 'for_sale':
      case 'sold':
        return { value: salePrice, valueLabel: 'Sale price', date: forfeitureDate(item), dateLabel: FORFEITED_LABEL };
      case 'redeemed': {
        const transaction = latestTransaction(item, 'redeemed');
        return {
          value: transaction ? moneyExact(Number(transaction.total_payable)) : '—',
          valueLabel: 'Final amount',
          date: transaction?.redeemed_at ? shortDate(transaction.redeemed_at) : '—',
          dateLabel: 'Redeemed',
        };
      }
      case 'forfeited':
        return { value: itemValue, valueLabel: 'Current value', date: forfeitureDate(item), dateLabel: FORFEITED_LABEL };
      default:
        return { value: itemValue, valueLabel: 'Current value', date: loan?.dueDate || '—', dateLabel: 'Due date' };
    }
  };

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

    const confirmed = await modal.warning({
      title: 'Close this pawn?',
      message: <>Ticket <strong>{ticket}</strong> will be marked redeemed and a receipt for <strong>{moneyExact(payable)}</strong> generated. This cannot be undone.</>,
      confirmLabel: 'Redeem pawn',
    });
    if (!confirmed) return;

    await run(() => redeemTransaction(selectedLoan.transactionId));
    setSelectedLoan(null);
    modal.success({
      title: 'Receipt generated',
      message: <>Ticket <strong>{ticket}</strong> is redeemed for <strong>{moneyExact(payable)}</strong>.</>,
    });
  };

  return (
    <div className="staff-panel workflow-operations-panel">
      <div className="staff-panel-head"><div><small>SHARED WORKFLOW</small><h3>Lifecycle operations</h3></div><button onClick={() => { clearApiCache(); onChanged(); }} disabled={busy}>Refresh</button></div>
      {error && <p className="risk-empty">{error}</p>}
      <div className="workflow-filter" role="group" aria-label="Show items">
        {visibleGroups.map(group => (
          <button
            key={group.key}
            type="button"
            className={shownGroup === group.key ? 'active' : ''}
            aria-pressed={shownGroup === group.key}
            onClick={() => setGroupFilter(group.key)}
          >
            {group.title}{loaded && ` (${group.items.length})`}
          </button>
        ))}
      </div>
      {!loaded && <SkeletonList rows={4} />}
      {loaded && items.length === 0 && <p className="risk-empty">No items on record yet.</p>}
      {loaded && items.length > 0 && visibleGroups
        .filter(group => group.key === shownGroup)
        .map(group => {
          /*
            A group whose rows carry no control drops the column rather than
            filling it with dashes. Redeemed and Sold items are closed: there
            is nothing left to do to them.
          */
          const groupHasActions = group.items.some(item =>
            Boolean(openLoanFor(item.items_id)) || item.status === 'forfeited' || item.status === 'for_sale'
          );

          return (
          <section className="workflow-group" key={group.key} aria-labelledby={`workflow-group-${group.key}`}>
            <h4 className="workflow-group-head" id={`workflow-group-${group.key}`}>{group.title} ({group.items.length})</h4>
            <div className="workflow-table-wrap">
              <table className="workflow-table">
                <thead>
                  <tr><th>Item</th><th>Category</th><th>Customer</th><th>Status</th><th>Value/Price</th><th>Date</th>{groupHasActions && <th>Action</th>}</tr>
                </thead>
                <tbody>
                  {group.items.map(item => {
                    const loan = openLoanFor(item.items_id);
                    const cells = rowCells(item, loan);
                    const hold = item.status === 'for_sale' ? holdFor(item.items_id) : null;

                    return (
                      <tr key={item.items_id}>
                        <td><strong>{item.description}</strong><small>{loan?.ticketNumber || latestTransaction(item)?.ticket_number || savedItemTypeLabel(item)}</small></td>
                        <td>{savedItemTypeLabel(item)}</td>
                        <td>{item.customer?.name || 'Unknown customer'}</td>
                        <td>
                          <span className={`loan-badge ${item.status.replace('_', '-')}`}>{statusLabel(item.status)}</span>
                          {hold && <small className="workflow-hold">Reserved by {hold.customer?.name || 'a customer'}{hold.customer?.contact_number ? ` (${hold.customer.contact_number})` : ''} until {holdEnds(hold.expires_at)}</small>}
                        </td>
                        <td><strong>{cells.value}</strong><small>{cells.valueLabel}</small></td>
                        <td>{cells.date}<small>{cells.dateLabel}</small></td>
                        {groupHasActions && <td>
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
                            {(item.status === 'forfeited' || item.status === 'for_sale') && <button onClick={() => openPhotoEditor(item)} disabled={busy}>Photos ({item.photo_urls?.length || 0})</button>}
                            {hold && <button className="workflow-hold-cancel" onClick={() => cancelHold(hold, item.description)} disabled={busy}>Cancel hold</button>}
                            {item.status === 'for_sale' && <button onClick={() => run(() => markItemSold(item.items_id))} disabled={busy}>Mark Sold</button>}
                            {!loan && item.status !== 'forfeited' && item.status !== 'for_sale' && <span className="workflow-no-action">—</span>}
                          </div>
                        </td>}
                      </tr>
                    );
                  })}
                  {group.items.length === 0 && <tr><td colSpan={groupHasActions ? 7 : 6} className="workflow-empty">No items in this group.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          );
        })}
      <IonModal isOpen={Boolean(photoItem)} onDidDismiss={() => setPhotoItem(null)}>
        <div className="workflow-confirm-modal item-photo-editor">
          <small>ITEM PHOTOS</small><h3>{photoItem?.description}</h3>
          <p>The first photo is the one shown on the landing page. Up to {MAX_ITEM_PHOTOS} photos.</p>
          {error && <p className="risk-empty">{error}</p>}
          <div className="item-photo-grid">
            {draftPhotos.map((photo, index) => (
              <div className="item-photo-tile" key={`${index}-${photo.slice(-24)}`}>
                <img src={photo} alt={`Photo ${index + 1} of ${photoItem?.description}`} />
                {index === 0 && <b>Cover</b>}
                <div className="item-photo-tile-actions">
                  <button type="button" onClick={() => movePhoto(index, -1)} disabled={index === 0} aria-label="Move photo earlier">&lsaquo;</button>
                  <button type="button" onClick={() => setDraftPhotos(current => current.filter((_, i) => i !== index))} aria-label="Remove photo">Remove</button>
                  <button type="button" onClick={() => movePhoto(index, 1)} disabled={index === draftPhotos.length - 1} aria-label="Move photo later">&rsaquo;</button>
                </div>
              </div>
            ))}
            {draftPhotos.length === 0 && <p className="risk-empty">No photos yet.</p>}
          </div>
          {draftPhotos.length < MAX_ITEM_PHOTOS && (
            <label className="secondary-button item-photo-add">
              Add photos
              <input type="file" accept="image/*" multiple hidden onChange={event => { void addPhotos(event.target.files); event.target.value = ''; }} />
            </label>
          )}
          {photoNote && <p>{photoNote}</p>}
          <div className="payment-actions-row"><button className="secondary-button" onClick={() => setPhotoItem(null)}>Cancel</button><button className="primary-button" onClick={savePhotos} disabled={busy} aria-busy={busy}>{busy && <Spinner />}{busy ? 'Saving' : 'Save photos'}</button></div>
        </div>
      </IonModal>
      <IonModal isOpen={Boolean(selectedLoan)} onDidDismiss={() => setSelectedLoan(null)}>
        <div className="workflow-confirm-modal">
          <small>REDEMPTION CONFIRMATION</small><h3>{selectedLoan?.ticketNumber}</h3>
          <p>{selectedLoan?.item} · {selectedLoan?.customer}</p>
          <div className="payment-summary">
            <div><span>Principal</span><strong>{selectedLoan ? money(selectedLoan.loanAmount) : '-'}</strong></div>
            <div><span>Accrued interest</span><strong>{selectedLoan ? moneyExact(selectedLoan.interestDue) : '-'}</strong></div>
            <div><span>Total payable</span><strong>{selectedLoan ? moneyExact(selectedLoan.totalPayable) : '-'}</strong></div>
          </div>
          <div className="payment-actions-row"><button className="secondary-button" onClick={() => setSelectedLoan(null)}>Cancel</button><button className="primary-button" onClick={redeem} disabled={busy} aria-busy={busy}>{busy && <Spinner />}{busy ? 'Processing' : 'Confirm payment & receipt'}</button></div>
        </div>
      </IonModal>
    </div>
  );
};

/**
 * GCash renewal payments waiting to be checked.
 *
 * The shop takes no payment through the system: the customer sent the money
 * from their own GCash app and typed the reference number. Nothing here has
 * touched the pawn yet. A staff member opens the shop's GCash account, finds
 * the reference, and confirms; a reference that cannot be found is rejected,
 * which tells the customer to check it and send it again.
 */
const PendingRenewals: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const modal = useModal();
  const [rows, setRows] = useState<ApiRenewalRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // Pending is the work; 'all' is the record of what was decided, which staff
  // need when a customer asks what happened to a payment they sent.
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  // The claim being confirmed or rejected, so only its own buttons go busy.
  const [working, setWorking] = useState<number | null>(null);
  // The receipt open full size, or null when none is.
  const [receipt, setReceipt] = useState<ApiRenewalRequest | null>(null);
  // The claim whose rejection reason is being picked, or null when none is.
  const [rejecting, setRejecting] = useState<ApiRenewalRequest | null>(null);
  // The claim open for review, or null when none is.
  const [reviewing, setReviewing] = useState<ApiRenewalRequest | null>(null);

  const load = useCallback(() => {
    setError('');
    setLoaded(false);
    getRenewalRequests(scope)
      .then(setRows)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'The renewal payments could not be loaded.'))
      .finally(() => setLoaded(true));
  }, [scope]);

  useEffect(load, [load]);

  const visible = rows.filter((row) =>
    `${row.ticket_number || ''} ${row.customer_name || ''} ${row.item_name || ''} ${row.gcash_reference_number}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const { pageRows, pager } = usePagedRows(visible);

  const confirm = async (row: ApiRenewalRequest) => {
    setReviewing(null);
    const agreed = await modal.confirm({
      title: 'Confirm this renewal payment?',
      message: <>Confirm only after you have found reference <strong>{row.gcash_reference_number}</strong> in the shop's GCash account. This extends the due date on {row.item_name || 'the item'}.</>,
      confirmLabel: 'Confirm payment',
    });
    if (!agreed) return;

    setWorking(row.renewal_requests_id);
    setError('');
    try {
      await confirmRenewalRequest(row.renewal_requests_id);
      load();
      onChanged();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'The renewal could not be confirmed.');
      // The API rejects the claim itself when the pawn is no longer active,
      // so the list is reloaded either way rather than left showing a row
      // that has already been closed.
      load();
    } finally {
      setWorking(null);
    }
  };

  /**
     * Reject a claim, with the reason picked from a list.
     *
     * The reason is sent to the customer word for word, so it is worth getting
     * right; picking from the list means staff write nothing for the cases
     * that come up every day, and the box is there for the ones that do not.
     */
  const reject = async (row: ApiRenewalRequest, reason: string) => {
    setRejecting(null);
    setWorking(row.renewal_requests_id);
    setError('');
    try {
      await rejectRenewalRequest(row.renewal_requests_id, reason);
      load();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'The renewal could not be rejected.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="staff-panel loan-panel">
      <div className="loan-tool-row single-field">
        <IonInput
          value={search}
          placeholder="Search by ticket number, customer name, reference..."
          onIonInput={(event) => setSearch(event.detail.value || '')}
        />
      </div>

      <div className="renewal-scope" role="tablist" aria-label="Which renewal payments to show">
        {(['pending', 'all'] as const).map((entry) => (
          <button
            key={entry}
            className={scope === entry ? 'active' : ''}
            onClick={() => setScope(entry)}
            role="tab"
            aria-selected={scope === entry}
          >
            {entry === 'pending' ? 'Waiting to be checked' : 'All renewals'}
          </button>
        ))}
      </div>

      <p className="renewal-note">
        The customer paid in their own GCash app. Check each reference number against the shop's GCash account before confirming.
      </p>

      {error && <p className="risk-empty">{error}</p>}

      {reviewing && (
        <RenewalReviewModal
          row={reviewing}
          onClose={() => setReviewing(null)}
          onConfirm={() => confirm(reviewing)}
          onReject={() => { setReviewing(null); setRejecting(reviewing); }}
          onOpenReceipt={() => setReceipt(reviewing)}
        />
      )}

      {rejecting && <RejectReasonPicker row={rejecting} onCancel={() => setRejecting(null)} onReject={reason => reject(rejecting, reason)} />}

      {receipt?.receipt_url && (
        <div className="renewal-lightbox" role="dialog" aria-label={`Receipt for ${receipt.gcash_reference_number}`} onClick={() => setReceipt(null)}>
          <img src={receipt.receipt_url} alt={`GCash receipt for reference ${receipt.gcash_reference_number}`} onClick={event => event.stopPropagation()} />
          <button type="button" onClick={() => setReceipt(null)} aria-label="Close receipt"><IonIcon icon={closeOutline} /></button>
        </div>
      )}

      <div className="loan-table">
        <div className="loan-table-head renewals-head">
          <span>#</span>
          <span>Ticket No.</span>
          <span>Customer</span>
          <span>Item</span>
          <span>Amount</span>
          <span>GCash Ref.</span>
          <span>Current Due Date</span>
          <span>Submitted</span>
          <span>{scope === 'pending' ? 'Action' : 'Result'}</span>
        </div>

        {pageRows.map((row, index) => (
          <div className="loan-table-row renewal-row" key={row.renewal_requests_id}>
            <span>{pager.firstShown + index}</span>
            <span>{row.ticket_number || '-'}</span>
            <span>{row.customer_name || '-'}</span>
            <span>{row.item_name || '-'}</span>
            <span>{moneyExact(row.amount)}</span>
            {/* The receipt itself is in the review, which is where the claim
                is decided. The row carries only the reference. */}
            <span className="renewal-reference">{row.gcash_reference_number}</span>
            <span>{row.due_date ? new Date(row.due_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-'}</span>
            <span>{row.submitted_at ? timeAgo(row.submitted_at) : '-'}</span>
            <div className="renewal-row-actions">
              {row.status === 'pending' ? (
                /* One way in. A payment is confirmed after it has been looked
                   at, so both decisions live behind this button rather than
                   beside a row that shows only part of the claim. */
                <button
                  className="review-request-button"
                  onClick={() => setReviewing(row)}
                  disabled={working === row.renewal_requests_id}
                  aria-busy={working === row.renewal_requests_id}
                >
                  {working === row.renewal_requests_id ? 'Working' : 'View'}
                </button>
              ) : (
                <em className={`renewal-status is-${row.status}`} title={row.review_note || undefined}>
                  {row.status === 'confirmed' ? 'Confirmed' : 'Not confirmed'}
                </em>
              )}
            </div>
          </div>
        ))}
        {!loaded && <SkeletonList rows={3} />}
        {loaded && visible.length === 0 && (
          <p className="risk-empty">{scope === 'pending' ? 'No renewal payments are waiting to be checked.' : 'No renewal payments have been recorded yet.'}</p>
        )}
      </div>

      <Pager pager={pager} label="renewal payments" />
    </div>
  );
};

/** A date as the review screens read it, from a plain yyyy-mm-dd string. */
const reviewDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-';

/**
 * One renewal payment, opened for review.
 *
 * The row in the list is a summary; this is the claim itself, receipt and all.
 * Confirming is a decision about money the shop has not seen yet, so it is made
 * here, with everything the customer submitted on screen, rather than from a
 * button beside a row that shows only part of it.
 */
const RenewalReviewModal: React.FC<{
  row: ApiRenewalRequest;
  onClose: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onOpenReceipt: () => void;
}> = ({ row, onClose, onConfirm, onReject, onOpenReceipt }) => (
  <div className="renewal-review-backdrop" role="dialog" aria-modal="true" aria-label="Review renewal payment" onClick={onClose}>
    <div className="renewal-review" onClick={event => event.stopPropagation()}>
      <header className="renewal-review-head">
        <div>
          <small>RENEWAL PAYMENT · {row.ticket_number || 'No ticket'}</small>
          <h3>{row.item_name || 'Pawned item'}</h3>
        </div>
        <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close review">
          <IonIcon icon={closeOutline} />
        </button>
      </header>

      <div className="renewal-review-body">
        <div className="renewal-review-amount">
          <span>Renta claimed</span>
          <strong>{moneyExact(row.amount)}</strong>
          <small>Check this against the amount actually received in GCash.</small>
        </div>

        <dl className="renewal-review-fields">
          <div><dt>Customer</dt><dd>{row.customer_name || '-'}</dd></div>
          <div><dt>GCash reference</dt><dd className="renewal-reference">{row.gcash_reference_number}</dd></div>
          <div><dt>Submitted</dt><dd>{row.submitted_at ? timeAgo(row.submitted_at) : '-'}</dd></div>
          <div><dt>Current due date</dt><dd>{reviewDate(row.due_date)}</dd></div>
          <div className="is-outcome">
            <dt>New due date if confirmed</dt>
            <dd>{reviewDate(row.new_due_date)} <em>(+{row.renewal_term_days} days)</em></dd>
          </div>
        </dl>

        <div className="renewal-review-receipt">
          <span>Receipt</span>
          {row.receipt_url
            ? <button type="button" onClick={onOpenReceipt} aria-label="Open the receipt full size">
                <img src={row.receipt_url} alt={`GCash receipt for reference ${row.gcash_reference_number}`} />
              </button>
            : <p className="renewal-review-noreceipt">The customer attached no receipt. Search the reference number in the shop's GCash account before confirming.</p>}
        </div>
      </div>

      <footer className="renewal-review-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        <button type="button" className="reject-request-button" onClick={onReject}>Reject</button>
        <button type="button" className="confirm-request-button" onClick={onConfirm}>Confirm payment</button>
      </footer>
    </div>
  </div>
);

/**
 * Why a renewal payment was rejected.
 *
 * The chosen line is sent to the customer as written, so these read as
 * something a customer can act on rather than as internal shorthand. The last
 * option is free text, for a case the list does not cover.
 */
const REJECT_REASONS = [
  'We could not find that GCash reference number. Please double-check it and submit again.',
  'The amount sent does not match the renta due on this pawn.',
  'That reference number was already used for another payment.',
  'The receipt you attached does not match the reference number you entered.',
  'The payment was sent to a different GCash account. Please check the number and send it again.',
];

const RejectReasonPicker: React.FC<{ row: ApiRenewalRequest; onCancel: () => void; onReject: (reason: string) => void }> = ({ row, onCancel, onReject }) => {
  const [choice, setChoice] = useState(REJECT_REASONS[0]);
  const [custom, setCustom] = useState('');
  const isCustom = choice === 'other';
  const reason = isCustom ? custom.trim() : choice;

  return (
    <div className="renewal-reject-backdrop" role="dialog" aria-modal="true" aria-label="Reject renewal payment" onClick={onCancel}>
      <div className="renewal-reject" onClick={event => event.stopPropagation()}>
        <h3>Reject this renewal payment?</h3>
        <p className="renewal-reject-lead">
          Reference <strong>{row.gcash_reference_number}</strong> for {row.item_name || 'this item'}. The pawn is left as it is, and the customer is told why.
        </p>

        <div className="renewal-reject-choices">
          {REJECT_REASONS.map(entry => (
            <label key={entry} className={choice === entry ? 'active' : ''}>
              <input type="radio" name="reject-reason" checked={choice === entry} onChange={() => setChoice(entry)} />
              <span>{entry}</span>
            </label>
          ))}
          <label className={isCustom ? 'active' : ''}>
            <input type="radio" name="reject-reason" checked={isCustom} onChange={() => setChoice('other')} />
            <span>Another reason</span>
          </label>
        </div>

        {isCustom && (
          <textarea
            className="renewal-reject-custom"
            value={custom}
            maxLength={255}
            rows={3}
            placeholder="Tell the customer what to fix, in one or two lines."
            onChange={event => setCustom(event.target.value)}
          />
        )}

        <div className="renewal-reject-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="reject-request-button" onClick={() => onReject(reason)} disabled={reason === ''}>Reject and notify customer</button>
        </div>
      </div>
    </div>
  );
};

const LoansPage: React.FC<{
  loanTab: 'active' | 'payments' | 'renewals' | 'customers' | 'lifecycle';
  setLoanTab: (value: 'active' | 'payments' | 'renewals' | 'customers' | 'lifecycle') => void;
  riskFilter: 'All' | 'Low' | 'Medium' | 'High';
  setRiskFilter: (value: 'All' | 'Low' | 'Medium' | 'High') => void;
  /** The item a notification asked for, or null when the page was opened from the menu. */
  focusItemId: number | null;
  setFocusItemId: (value: number | null) => void;
  focusType?: ApiNotification['type'] | null;
  /** Open the focused pawn's detail once the rows load. */
  openFocusedDetail?: boolean;
  onFocusedDetailOpened?: () => void;
  /** Whose claims count as your own, so a row can grey out only other people's. */
  staffUserId: number | null;
  /** Printed on the redemption receipt as the one who processed it. */
  staffName: string;
}> = ({ loanTab, setLoanTab, riskFilter, setRiskFilter, focusItemId, setFocusItemId, focusType = null, openFocusedDetail = false, onFocusedDetailOpened, staffUserId, staffName }) => {
  const modal = useModal();
  const { items, loans, customers, loaded, error, reload } = useLoanData();

  const [statusFilter, setStatusFilter] = useState('All');
  const [activeSearch, setActiveSearch] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  /*
    A typed pickup code is resolved by the API rather than matched against the
    rows already on screen: live codes are never sent to the browser, which is
    what keeps a code worth something. Null means nothing has been looked up,
    and a null transaction_id means the code is unknown, expired or spent.
  */
  const [pickupMatch, setPickupMatch] = useState<{ code: string; transactionId: number | null } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<LoanRow | null>(null);
  // The item record behind the loan being viewed, for the detail modal.
  const selectedLoanItem = selectedLoan ? items.find(entry => entry.items_id === selectedLoan.itemId) || null : null;
  const [selectedCustomer, setSelectedCustomer] = useState<ApiCustomer | null>(null);
  const [selectedRedemption, setSelectedRedemption] = useState<LoanRow | null>(null);
  const [paymentDraft, setPaymentDraft] = useState(EMPTY_PAYMENT_DRAFT);
  /*
    Confirm is two presses. The first arms the button, the second finalises,
    and any edit disarms it again, so an armed button can never finalise a form
    that changed under it.
  */
  const [paymentArmed, setPaymentArmed] = useState(false);
  // What the optional pickup code check came back with.
  const [codeCheck, setCodeCheck] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  // The optional face check of the person claiming the item.
  const [claimantCheckOpen, setClaimantCheckOpen] = useState(false);
  const [claimantCheck, setClaimantCheck] = useState<FaceCheckResult | null>(null);
  // The row whose claim is being asked for, so only its own button waits.
  const [claiming, setClaiming] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [confirmingRequest, setConfirmingRequest] = useState<number | null>(null);

  const filteredActiveLoans = loans.filter((loan) => {
    const matchesStatus = statusFilter === 'All' || loan.status === statusFilter;
    const matchesRisk = riskFilter === 'All' || loan.risk === riskFilter;
    const matchesSearch = `${loan.item} ${loan.customer}`.toLowerCase().includes(activeSearch.toLowerCase());
    const matchesFocus = focusItemId === null || loan.itemId === focusItemId;
    return matchesStatus && matchesRisk && matchesSearch && matchesFocus;
  });

  // Four digits are read as a pickup code. Anything else is the text search
  // the tab has always had.
  const searchTerm = redemptionSearch.trim();
  const searchIsPickupCode = /^[0-9]{4}$/.test(searchTerm);
  const pickupLookedUp = pickupMatch?.code === searchTerm;

  useEffect(() => {
    if (!searchIsPickupCode) {
      setPickupMatch(null);
      return;
    }

    let active = true;
    lookupPickupCode(searchTerm)
      .then(result => { if (active) setPickupMatch({ code: searchTerm, transactionId: result.transaction_id }); })
      // A failed lookup reads as no match, which is what staff act on anyway.
      .catch(() => { if (active) setPickupMatch({ code: searchTerm, transactionId: null }); });
    return () => { active = false; };
  }, [searchIsPickupCode, searchTerm]);

  // Only an open loan can be redeemed, so the Redemption tab lists those.
  const filteredRedemptionRows = loans
    .filter(loan => loan.status === 'Active' || loan.status === 'Overdue')
    .filter(loan => {
      if (!searchIsPickupCode) return `${loan.ticketNumber} ${loan.customer} ${loan.item}`.toLowerCase().includes(searchTerm.toLowerCase());
      // While the lookup is still out, show nothing rather than every row.
      if (!pickupLookedUp) return false;
      return pickupMatch?.transactionId === loan.transactionId;
    })
    .filter(loan => focusItemId === null || loan.itemId === focusItemId)
    /*
      Queue order: somebody who said they are on their way is served before a
      pawn that merely falls due soon, and among those the oldest request goes
      first. Everything else follows by due date, soonest first.
    */
    .sort((left, right) => {
      if (left.readyToRedeemAt && right.readyToRedeemAt) return left.readyToRedeemAt.localeCompare(right.readyToRedeemAt);
      if (left.readyToRedeemAt) return -1;
      if (right.readyToRedeemAt) return 1;
      return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
    });

  const filteredCustomerRows = customers.filter((customer) =>
    `${customer.name} ${customer.contact_number || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const openLoans = loans.filter(loan => loan.status === 'Active' || loan.status === 'Overdue');

  // Each tab keeps its own page, so switching tabs never lands on a page the
  // other list happened to be on.
  const activePage = usePagedRows(filteredActiveLoans);
  const redemptionPage = usePagedRows(filteredRedemptionRows);
  const customerPage = usePagedRows(filteredCustomerRows);

  /*
    The Redemption tab is the one screen two staff work at once, so it reads
    the list again on a timer to pick up claims taken elsewhere. It pauses
    while a payment screen is open: the list must not move under somebody
    counting money, and their own claim is already theirs.
  */
  useEffect(() => {
    if (loanTab !== 'payments' || selectedRedemption) return;
    // A colleague's claim must show, so this skips the quick screen change cache.
    const timer = window.setInterval(() => { clearApiCache(); reload(); }, REDEMPTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loanTab, selectedRedemption, reload]);

  // The pawn a notification pointed at, found once the loans have loaded.
  const focusedLoan = focusItemId === null ? null : loans.find(loan => loan.itemId === focusItemId) || null;
  const focusedIsOpen = focusedLoan !== null && (focusedLoan.status === 'Active' || focusedLoan.status === 'Overdue');

  // Bring the singled out row into view, so staff land on the exact request.
  const focusedTransactionId = focusedLoan?.transactionId ?? null;

  // Opened from the dashboard calendar: show the pawn's detail straight away.
  useEffect(() => {
    if (!openFocusedDetail || !loaded) return;
    if (focusedLoan) setSelectedLoan(focusedLoan);
    onFocusedDetailOpened?.();
  }, [openFocusedDetail, loaded, focusedLoan, onFocusedDetailOpened]);
  useEffect(() => {
    if (!loaded || focusedTransactionId === null) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.staff-page .loan-table-row.focused')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaded, focusedTransactionId, loanTab]);

  /**
   * Open the payment screen, but only after claiming the pawn.
   *
   * The claim is the API's to give: pressing Process at the same moment as a
   * colleague has to end with one screen open, not two.
   */
  const openPayment = async (row: LoanRow) => {
    setLoanTab('payments');
    setClaiming(row.transactionId);
    try {
      await lockTransaction(row.transactionId);
    } catch (lockError) {
      // Somebody else got there first. Their claim is on the row after a
      // reload, so the list explains itself.
      await modal.info({
        title: 'Already being processed',
        message: lockError instanceof Error ? lockError.message : 'Another staff member is processing this pawn.',
      });
      reload();
      return;
    } finally {
      setClaiming(null);
    }

    setSelectedRedemption(row);
    setPaymentDraft({ ...EMPTY_PAYMENT_DRAFT, amount: String(row.totalPayable), cashReceived: String(row.totalPayable) });
    setPaymentArmed(false);
    setCodeCheck('idle');
    setPaymentError('');
  };

  /** Any edit disarms the confirm and clears the last error. */
  const editPayment = (change: Partial<typeof EMPTY_PAYMENT_DRAFT>) => {
    setPaymentDraft(current => ({ ...current, ...change }));
    setPaymentArmed(false);
    setPaymentError('');
  };

  /**
   * Leave the payment screen and give the pawn back.
   *
   * Cancel, the close button, Escape and a backdrop press all arrive here, so
   * every way out of the screen releases the claim. A browser closed outright
   * cannot, which is what the API's timeout is for.
   */
  const closePayment = () => {
    const held = selectedRedemption;
    setSelectedRedemption(null);
    setPaymentArmed(false);
    setCodeCheck('idle');
    setClaimantCheck(null);
    if (held) unlockTransaction(held.transactionId).then(reload).catch(() => reload());
  };

  /**
   * Check an offered pickup code against this pawn.
   *
   * Live codes never reach the browser, so the check goes through the same
   * lookup the search box uses: a code that resolves to another pawn, or to
   * nothing at all, is wrong for this one.
   */
  const checkPickupCode = useCallback(async (code: string, transactionId: number) => {
    if (!/^[0-9]{4}$/.test(code)) {
      setCodeCheck('idle');
      return;
    }

    setCodeCheck('checking');
    try {
      const match = await lookupPickupCode(code);
      setCodeCheck(match.transaction_id === transactionId ? 'ok' : 'bad');
    } catch {
      setCodeCheck('bad');
    }
  }, []);

  const handleConfirmRequest = async (row: LoanRow) => {
    setConfirmingRequest(row.transactionId);
    setPaymentError('');
    try {
      await confirmRedemptionRequest(row.transactionId);
      reload();
    } catch (requestError) {
      setPaymentError(requestError instanceof Error ? requestError.message : 'The request could not be confirmed.');
    } finally {
      setConfirmingRequest(null);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedRedemption) return;

    // First press arms; the second one takes the money.
    if (!paymentArmed) {
      setPaymentArmed(true);
      return;
    }

    setProcessing(true);
    setPaymentError('');
    try {
      const loan = selectedRedemption;
      const collected = Number(paymentDraft.amount || loan.totalPayable);
      const cashReceived = isCashPayment && paymentDraft.cashReceived !== '' ? Number(paymentDraft.cashReceived) : null;
      const reference = isCashPayment ? null : paymentDraft.reference.trim();
      const result = await redeemTransaction(loan.transactionId, {
        payment_method: paymentDraft.method,
        payment_reference: reference,
        amount_collected: collected,
        cash_received: cashReceived,
      }) as { principal?: string | number; interest?: number; total_payable?: number; receipt_number?: string };

      // The figures the API closed the pawn on, so the receipt matches the
      // record even if a day turned over since the screen was opened.
      const receipt: RedemptionReceipt = {
        receiptNumber: result?.receipt_number || `RC-${loan.ticketNumber}`,
        ticketNumber: loan.ticketNumber,
        customer: loan.customer,
        item: loan.item,
        pawnedOn: loan.pawnedOn,
        principal: Number(result?.principal ?? loan.loanAmount),
        ratePercent: loan.interestRatePercent,
        daysElapsed: loan.daysElapsed,
        interest: Number(result?.interest ?? loan.interestDue),
        totalPayable: Number(result?.total_payable ?? loan.totalPayable),
        method: paymentDraft.method,
        reference,
        collected,
        cashReceived,
        staffName,
      };

      // redeem() clears the claim itself, so the screen just closes.
      setSelectedRedemption(null);
      setPaymentArmed(false);
      setCodeCheck('idle');
      setPaymentDraft(EMPTY_PAYMENT_DRAFT);
      reload();

      const wantsReceipt = await modal.confirm({
        title: 'Payment confirmed',
        message: <>Payment of <strong>{moneyExact(collected)}</strong> taken via {receipt.method}. Ticket <strong>{receipt.ticketNumber}</strong> is redeemed and the item can be released.</>,
        confirmLabel: 'Print receipt',
        cancelLabel: 'Done',
      });
      if (wantsReceipt && !printRedemptionReceipt(receipt)) {
        await modal.error({ message: 'The receipt window was blocked by the browser. Allow pop-ups for this site so receipts can print.' });
      }
    } catch (requestError) {
      setPaymentError(requestError instanceof Error ? requestError.message : 'The payment could not be processed.');
      setPaymentArmed(false);
    } finally {
      setProcessing(false);
    }
  };

  // Cash is the only method that involves change; every other one leaves a
  // reference instead.
  const isCashPayment = paymentDraft.method.trim().toLowerCase() === 'cash';
  const collectedAmount = Number(paymentDraft.amount || selectedRedemption?.totalPayable || 0);
  const changeDue = Number(paymentDraft.cashReceived || 0) - collectedAmount;
  const cashShort = isCashPayment && paymentDraft.cashReceived !== '' && changeDue < 0;
  const referenceMissing = !isCashPayment && paymentDraft.reference.trim() === '';
  const canConfirm = paymentDraft.verified && !referenceMissing && !cashShort && codeCheck !== 'bad' && codeCheck !== 'checking';

  return (
    <section className="staff-content">
      <div className="staff-page-intro">
        <div>
          <small>PAWN OPERATIONS</small>
          <h2>List of Pawns</h2>
          <p>Track pawns, redemption requests, and customer payment records.</p>
        </div>
      </div>

      {error && <p className="risk-empty">{error}</p>}

      {focusItemId !== null && (
        <div className="loan-focus-banner" role="status">
          <div className="loan-focus-text">
            <small>{focusType ? NOTIFICATION_TITLES[focusType] : 'Selected pawn'}</small>
            {focusedLoan ? (
              <>
                <strong>{focusedLoan.customer} &middot; {focusedLoan.item}</strong>
                <span>
                  Ticket #{focusedLoan.ticketNumber} &middot; {focusedLoan.status} &middot; Due {focusedLoan.dueDate}
                  {focusedIsOpen && <> &middot; Total payable {moneyExact(focusedLoan.totalPayable)}</>}
                </span>
              </>
            ) : (
              <strong>{loaded ? 'This pawn is no longer on file.' : 'Loading the pawn from your notification...'}</strong>
            )}
          </div>
          <div className="loan-focus-actions">
            {focusedLoan && focusedIsOpen && focusedLoan.readyToRedeem && !focusedLoan.redemptionConfirmed && (
              <button
                className="loan-focus-primary"
                onClick={() => handleConfirmRequest(focusedLoan)}
                disabled={confirmingRequest === focusedLoan.transactionId}
                aria-busy={confirmingRequest === focusedLoan.transactionId}
              >
                {confirmingRequest === focusedLoan.transactionId ? 'Confirming' : 'Confirm request'}
              </button>
            )}
            {focusedLoan && focusedIsOpen && <button className="loan-focus-primary" onClick={() => openPayment(focusedLoan)}>Process payment</button>}
            {focusedLoan && <button onClick={() => setSelectedLoan(focusedLoan)}>View pawn</button>}
            <button onClick={() => setFocusItemId(null)}>Show all</button>
          </div>
        </div>
      )}

      <div className="loan-tabs" role="tablist">
        {(['active', 'payments', 'renewals', 'customers', 'lifecycle'] as const).map((tab) => (
          <button
            key={tab}
            className={loanTab === tab ? 'active' : ''}
            onClick={() => setLoanTab(tab)}
            role="tab"
            aria-selected={loanTab === tab}
          >
            {tab === 'active'
              ? 'Active Pawns/Items'
              : tab === 'payments'
                ? 'Redemption'
                : tab === 'renewals'
                  ? 'Pending Renewals'
                  : tab === 'customers'
                    ? 'Customer Records'
                    : 'Lifecycle Operations'}
          </button>
        ))}
      </div>

      {loanTab === 'active' && (
        <>
          <div className="loan-summary-grid">
            <div>
              <span>Active pawns</span>
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

              <TypeSelect
                ariaLabel="Status"
                value={statusFilter}
                options={[
                  { value: 'All', label: 'Status: All' },
                  { value: 'Active', label: 'Active' },
                  { value: 'Overdue', label: 'Overdue' },
                  { value: 'Redeemed', label: 'Redeemed' },
                  { value: FORFEITED_LABEL, label: FORFEITED_LABEL },
                ]}
                onChange={setStatusFilter}
              />

              <TypeSelect
                ariaLabel="Risk"
                value={riskFilter}
                options={[
                  { value: 'All', label: 'Risk: All' },
                  { value: 'Low', label: 'Low' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'High', label: 'High' },
                ]}
                onChange={(value) => setRiskFilter(value as typeof riskFilter)}
              />
            </div>

            <div className="loan-table">
              <div className="loan-table-head">
                <span>#</span>
                <span>Item</span>
                <span>Customer</span>
                <span>Karat/Weight (g) or Brand</span>
                <span>Current Value</span>
                <span>Pawn Amount</span>
                <span>Due Date</span>
                <span>Risk Status</span>
                <span>Action</span>
              </div>

              {activePage.pageRows.map((loan, index) => (
                <div className={`loan-table-row ${focusItemId === loan.itemId ? 'focused' : ''}`} key={loan.transactionId}>
                  <span>{activePage.pager.firstShown + index}</span>
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
              {!loaded && <SkeletonList rows={4} />}
              {loaded && filteredActiveLoans.length === 0 && <p className="risk-empty">No pawns match these filters.</p>}
            </div>

            <Pager pager={activePage.pager} label="pawns" />
          </div>
        </>
      )}

      {loanTab === 'payments' && (
        <div className="staff-panel loan-panel">
          <div className="loan-tool-row single-field">
            <IonInput
              value={redemptionSearch}
              placeholder="Search by ticket number, customer name, or 4-digit pickup code..."
              onIonInput={(event) => setRedemptionSearch(event.detail.value || '')}
            />
          </div>

          <div className="loan-table">
            <div className="loan-table-head redemptions-head">
              <span>#</span>
              <span>Ticket No.</span>
              <span>Customer</span>
              <span>Item</span>
              <span>Pawn Amount</span>
              <span>Interest Due</span>
              <span>Total Payable</span>
              <span>Due Date</span>
              <span>Action</span>
            </div>

            {redemptionPage.pageRows.map((row, index) => (
              <div className={`loan-table-row redemption-row ${focusItemId === row.itemId ? 'focused' : ''}`} key={row.transactionId}>
                <span>{redemptionPage.pager.firstShown + index}</span>
                <span>{row.ticketNumber}</span>
                <span>{row.customer}</span>
                <span>
                  {row.item}
                  {row.readyToRedeem && <em className={`redeem-request-badge ${row.redemptionConfirmed ? 'confirmed' : 'pending'}`}>{row.redemptionConfirmed ? 'Confirmed' : 'Ready to pick up/pay'}</em>}
                  {/* A walk-in waiting at the counter, told apart from a pawn
                      that is only due soon. */}
                  {row.readyToRedeemAt && <em className="redeem-waiting-badge">Requested {timeAgo(row.readyToRedeemAt)}</em>}
                  {row.lockedByName && <em className="redeem-lock-badge">Being processed by {row.lockedById === staffUserId ? 'you' : row.lockedByName}</em>}
                </span>
                <span>{money(row.loanAmount)}</span>
                <span>{moneyExact(row.interestDue)}</span>
                <span>{moneyExact(row.totalPayable)}</span>
                <span>{row.dueDate}</span>
                <div className="redemption-row-actions">
                  {row.readyToRedeem && !row.redemptionConfirmed && (
                    <button
                      className="confirm-request-button"
                      onClick={() => handleConfirmRequest(row)}
                      disabled={confirmingRequest === row.transactionId}
                      aria-busy={confirmingRequest === row.transactionId}
                    >
                      {confirmingRequest === row.transactionId ? 'Confirming' : 'Confirm request'}
                    </button>
                  )}
                  {/* A pawn somebody else is holding cannot be opened; their
                      claim runs out on its own if they never come back. */}
                  <button
                    onClick={() => openPayment(row)}
                    disabled={claiming === row.transactionId || (row.lockedByName !== null && row.lockedById !== staffUserId)}
                    title={row.lockedByName && row.lockedById !== staffUserId ? `Being processed by ${row.lockedByName}` : undefined}
                  >
                    {claiming === row.transactionId ? 'Opening' : 'Process'}
                  </button>
                </div>
              </div>
            ))}
            {!loaded && <SkeletonList rows={4} />}
            {loaded && filteredRedemptionRows.length === 0 && (
              <p className="risk-empty">
                {searchIsPickupCode
                  ? (pickupLookedUp ? 'That pickup code is not valid. It may have expired, already been used, or been typed wrong.' : 'Checking that pickup code...')
                  : 'No open pawns to redeem.'}
              </p>
            )}
          </div>

          <Pager pager={redemptionPage.pager} label="open pawns" />
        </div>
      )}

      {loanTab === 'renewals' && <PendingRenewals onChanged={reload} />}

      {loanTab === 'lifecycle' && (
        <WorkflowOperations items={items} loans={loans} loaded={loaded} onChanged={reload} />
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

            {customerPage.pageRows.map((customer, index) => (
              <div className="loan-table-row customer-row" key={customer.customers_id}>
                <span>{customerPage.pager.firstShown + index}</span>
                <span>{customer.name}</span>
                <span>{customer.contact_number || '-'}</span>
                <span>{customer.address || '-'}</span>
                <span>{customer.active_items_count ?? 0}</span>
                <span>{customer.total_items_count ?? 0}</span>
                <button onClick={() => setSelectedCustomer(customer)}>View</button>
              </div>
            ))}
            {!loaded && <SkeletonList rows={4} />}
            {loaded && filteredCustomerRows.length === 0 && <p className="risk-empty">No customers match this search.</p>}
          </div>

          <Pager pager={customerPage.pager} label="customers" />
        </div>
      )}

      <LoanDetailModal
        loan={selectedLoan}
        item={selectedLoanItem}
        customer={selectedLoanItem ? customers.find(entry => entry.customers_id === selectedLoanItem.customer_id) || null : null}
        itemTypeLabel={savedItemTypeLabel(selectedLoanItem)}
        onClose={() => setSelectedLoan(null)}
      />

      <IonModal isOpen={Boolean(selectedRedemption)} onDidDismiss={closePayment} className="payment-modal">
        <div className="loan-detail-panel payment-panel">
          <div className="loan-detail-header">
            <div>
              <small>REDEMPTION</small>
              <h3>{selectedRedemption?.ticketNumber}</h3>
            </div>
            <button className="modal-close-button" onClick={closePayment}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>

          {/* Two columns on wide screens: what is owed on the left, the payment
              form and its checks on the right, so nothing needs scrolling. */}
          <div className="payment-columns">
          <div className="payment-col payment-col-summary">
          <div className="payment-summary">
            <div><span>Customer</span><strong>{selectedRedemption?.customer}</strong></div>
            <div><span>Item</span><strong>{selectedRedemption?.item}</strong></div>
            <div><span>Total Payable</span><strong>{selectedRedemption ? moneyExact(selectedRedemption.totalPayable) : '-'}</strong></div>
          </div>

          {/* How the total is made up, and what the counter takes against it.
              The same lines go on the printed receipt. */}
          {selectedRedemption && (
            <div className="redeem-breakdown" aria-label="Payment breakdown">
              <h4>Payment breakdown</h4>
              <div className="redeem-breakdown-row">
                <span>Principal (pawn amount)</span>
                <strong>{moneyExact(selectedRedemption.loanAmount)}</strong>
              </div>
              <div className="redeem-breakdown-row">
                <span>Interest <small>{interestBasis(selectedRedemption.interestRatePercent, selectedRedemption.daysElapsed)}</small></span>
                <strong>{moneyExact(selectedRedemption.interestDue)}</strong>
              </div>
              <div className="redeem-breakdown-row is-total">
                <span>Total payable</span>
                <strong>{moneyExact(selectedRedemption.totalPayable)}</strong>
              </div>
              <div className="redeem-breakdown-row">
                <span>Amount to collect</span>
                <strong>{moneyExact(collectedAmount)}</strong>
              </div>
              {isCashPayment && paymentDraft.cashReceived !== '' && (
                <>
                  <div className="redeem-breakdown-row is-muted">
                    <span>Cash received</span>
                    <strong>{moneyExact(Number(paymentDraft.cashReceived))}</strong>
                  </div>
                  <div className={`redeem-breakdown-row is-muted ${cashShort ? 'is-short' : ''}`}>
                    <span>{cashShort ? 'Short by' : 'Change'}</span>
                    <strong>{moneyExact(Math.abs(changeDue))}</strong>
                  </div>
                </>
              )}
              <small className="redeem-breakdown-note">Pawned {selectedRedemption.pawnedOn}. Interest is the monthly rate for each day the pawn ran (rate × days ÷ 30).</small>
            </div>
          )}

          </div>
          <div className="payment-col payment-col-form">
          <div className="form-grid two-col payment-form-grid">
            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Confirm Payment Amount</IonLabel>
              <IonInput
                type="text"
                inputmode="decimal"
                value={paymentDraft.amount}
                onIonInput={(event) => editPayment({ amount: readDecimal(event) })}
              />
            </IonItem>

            <Combobox
              label="Payment Method"
              customHint="Custom method:"
              value={paymentDraft.method}
              options={PAYMENT_METHOD_OPTIONS}
              onChange={(text) => editPayment({ method: text })}
              placeholder="Pick or type, e.g. Maya"
            />

            {isCashPayment ? (
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">Cash Received</IonLabel>
                <IonInput
                  type="text"
                  inputmode="decimal"
                  value={paymentDraft.cashReceived}
                  onIonInput={(event) => editPayment({ cashReceived: readDecimal(event) })}
                />
              </IonItem>
            ) : (
              <IonItem lines="none" className="tx-field">
                <IonLabel position="stacked">{paymentDraft.method} Reference Number</IonLabel>
                <IonInput
                  value={paymentDraft.reference}
                  maxlength={50}
                  placeholder="From the payment confirmation"
                  onIonInput={(event) => editPayment({ reference: event.detail.value || '' })}
                />
              </IonItem>
            )}

            {/* Offered by the customer, not demanded: a pawn is still redeemed
                at the counter by someone who never made a code. */}
            <IonItem lines="none" className="tx-field">
              <IonLabel position="stacked">Pickup Code (if provided)</IonLabel>
              <IonInput
                inputmode="numeric"
                maxlength={4}
                value={paymentDraft.pickupCode}
                placeholder="4 digits"
                onIonInput={(event) => {
                  const next = (event.detail.value || '').replace(/[^0-9]/g, '');
                  editPayment({ pickupCode: next });
                  setCodeCheck('idle');
                  if (selectedRedemption) checkPickupCode(next, selectedRedemption.transactionId);
                }}
              />
            </IonItem>
          </div>

          {isCashPayment && paymentDraft.cashReceived !== '' && (
            <p className={`payment-change ${cashShort ? 'is-short' : ''}`}>
              {cashShort
                ? `Short by ${moneyExact(Math.abs(changeDue))} — the cash received is less than the amount due.`
                : `Change: ${moneyExact(changeDue)}`}
            </p>
          )}

          {paymentDraft.pickupCode.length === 4 && codeCheck !== 'idle' && (
            <p className={`payment-code-check is-${codeCheck}`}>
              {codeCheck === 'checking' ? 'Checking that code...'
                : codeCheck === 'ok' ? 'Pickup code matches this pawn.'
                : 'That pickup code does not match this pawn. It may have expired, been used, or belong to another item.'}
            </p>
          )}

          {/* Optional: compare the claimant with the customer's face photo.
              It never blocks the payment; staff decide, and the result is logged. */}
          {selectedRedemption && (
            <div className={`payment-face-check${claimantCheck ? ` is-${claimantCheck.replace('_', '-')}` : ''}`}>
              <div>
                <strong>Claimant face check <small>(optional)</small></strong>
                <span>{claimantCheck === 'match' ? 'Looks like the same person.'
                  : claimantCheck === 'unsure' ? 'Not sure. Compare the face with the valid ID yourself.'
                  : claimantCheck === 'no_match' ? 'Did not look like the same person. Check the valid ID carefully.'
                  : claimantCheck === 'no_reference' ? 'No photo on file to compare. Checked by ID only.'
                  : `Compare the person here with ${selectedRedemption.customer}'s photo on file.`}</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => setClaimantCheckOpen(true)}>
                <IonIcon icon={cameraOutline} aria-hidden="true" />{claimantCheck ? 'Check again' : 'Check face'}
              </button>
            </div>
          )}

          <label className="payment-verify">
            <input
              type="checkbox"
              checked={paymentDraft.verified}
              onChange={(event) => editPayment({ verified: event.target.checked })}
            />
            <span>I have verified the item matches this record and confirmed the customer's ID</span>
          </label>

          {paymentError && <p className="risk-empty">{paymentError}</p>}

          <div className="payment-actions-row">
            <button type="button" className="secondary-button" onClick={closePayment}>Cancel</button>
            <button
              type="button"
              className={`primary-button ${paymentArmed ? 'is-armed' : ''}`}
              onClick={handleProcessPayment}
              disabled={processing || !canConfirm}
              aria-busy={processing}
            >
              {processing && <Spinner />}
              {processing ? 'Processing' : paymentArmed ? 'Yes, Confirm' : 'Confirm Payment'}
            </button>
          </div>
          </div>
          </div>
        </div>
      </IonModal>

      {selectedRedemption && (
        <FaceCheck
          isOpen={claimantCheckOpen}
          mode="verify"
          customerId={selectedRedemption.customerId}
          customerName={selectedRedemption.customer}
          transactionId={selectedRedemption.transactionId}
          onClose={() => setClaimantCheckOpen(false)}
          onDone={(result) => { setClaimantCheckOpen(false); setClaimantCheck(result); }}
        />
      )}

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
            {(selectedCustomer?.transactions || []).length === 0 && <p className="risk-empty">No pawn transactions on record for this customer.</p>}
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

        <IonButton onClick={save} disabled={saving || !me} aria-busy={saving}>{saving && <Spinner />}{saving ? 'Saving' : 'Save changes'}</IonButton>
        <IonButton className="staff-logout" fill="outline" color="danger" onClick={logout}>
          <IonIcon icon={logOutOutline} slot="start" />
          Log out
        </IonButton>
      </div>
    </section>
  );
};

export default StaffPortal;
