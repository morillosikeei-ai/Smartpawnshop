import React, { useEffect, useState } from 'react';
import { IonButton, IonContent, IonIcon, IonModal, IonPage } from '@ionic/react';
import {
  analyticsOutline,
  cashOutline,
  chevronDownOutline,
  chevronUpOutline,
  closeOutline,
  documentTextOutline,
  gridOutline,
  menuOutline,
  notificationsOutline,
  peopleOutline,
  personCircleOutline,
  pulseOutline,
  searchOutline,
  shieldCheckmarkOutline,
  trendingUpOutline,
  warningOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { money, shortDate } from '../data/pawnshopStore';
import { createUser, getActivityFlags, getDashboard, getRiskAlerts, getSystemSettings, getUsers, resolveActivityFlag, saveSystemSetting, type ApiActivityFlag, type ApiRiskAlert, type ApiSystemSetting, type ApiUser } from '../services/api';
import TrendSuggestionCard from '../components/TrendSuggestionCard';
import './AdminPortal.css';
import './AdminPolish.css';
import './AccountsTable.css';

type AdminView = 'dashboard' | 'manage' | 'monitoring' | 'reports' | 'profile';
type Tab = 'users' | 'settings' | 'models' | 'gold' | 'risk' | 'unusual' | 'activity' | 'analytics' | 'exports';

type AuditItem = {
  time: string;
  actor: string;
  action: string;
  category: string;
};

const navigation: Array<{ id: AdminView; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: gridOutline },
  { id: 'manage', label: 'Manage', icon: peopleOutline },
  { id: 'monitoring', label: 'Monitoring', icon: pulseOutline },
  { id: 'reports', label: 'Reports', icon: analyticsOutline },
];

const auditLog: AuditItem[] = [
  { time: '09:42 AM', actor: 'Admin Staff', action: 'Updated risk management settings', category: 'Monitoring' },
  { time: '09:18 AM', actor: 'Maria Santos', action: 'Completed loan redemption SP-1042', category: 'Transaction' },
  { time: '08:56 AM', actor: 'Admin Staff', action: 'Exported September loan report', category: 'Reports' },
  { time: '08:31 AM', actor: 'John Dela Cruz', action: 'Updated customer profile information', category: 'Account' },
];

const notifications = [
  ['High-risk loan needs review', 'SP-1031 · 5 minutes ago'],
  ['Monthly report is ready', 'September 2026 · 1 hour ago'],
  ['Gold price spike detected', 'Today · 12 minutes ago'],
];

const overviewStats = [
  { icon: cashOutline, value: '42', label: 'Total active loans', tone: 'primary' },
  { icon: peopleOutline, value: '128', label: 'Total customers', tone: 'success' },
  { icon: warningOutline, value: '7', label: 'Total risk alerts', tone: 'warning' },
  { icon: analyticsOutline, value: '₱48.6K', label: "Today's revenue", tone: 'success' },
];

const goldPriceTrend = [
  { label: 'Mon', value: 3410 },
  { label: 'Tue', value: 3442 },
  { label: 'Wed', value: 3468 },
  { label: 'Thu', value: 3495 },
  { label: 'Fri', value: 3518 },
  { label: 'Sat', value: 3542 },
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

const revenueTrend = [42000, 46500, 38200, 51200, 44800, 48600, 53800];

const AdminPortal: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<AdminView>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);
  const [monitoringTab, setMonitoringTab] = useState<Tab>('models');

  const go = (next: AdminView) => {
    setView(next);
    setMenuOpen(false);
  };

  return (
    <IonPage className="admin-page">
      <IonContent fullscreen>
        <div className="admin-shell">
          <div className={`admin-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />
          <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
            <div className="admin-brand">
              <img src="/pagasa.png" alt="Pag-Asa Pawnshop" />
              <span>Admin Portal</span>
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
            <div className="admin-account">
              <IonIcon icon={personCircleOutline} />
              <div>
                <strong>System Admin</strong>
                <span>Administrator</span>
              </div>
            </div>
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
                    {hasUnreadNotifications && <span className="notification-dot" aria-label="Unread notifications" />}
                  </button>

                  {notificationsOpen && (
                    <div className="admin-dropdown notification-dropdown">
                      <div className="admin-dropdown-head">
                        <strong>Notifications</strong>
                        <button onClick={() => setHasUnreadNotifications(false)}>Mark all read</button>
                      </div>
                      {notifications.map(([title, detail]) => (
                        <button className="notification-item" key={title} onClick={() => setHasUnreadNotifications(false)}>
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </button>
                      ))}
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
                      <button onClick={() => navigate('/')}>
                        <IonIcon icon={closeOutline} /> Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {view === 'dashboard' && <Dashboard go={go} onViewRiskAlerts={() => { setMonitoringTab('risk'); go('monitoring'); }} />}
            {view === 'manage' && <Manage />}
            {view === 'monitoring' && <Monitoring initialTab={monitoringTab} />}
            {view === 'reports' && <Reports />}
            {view === 'profile' && <AdminProfile />}
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

const Dashboard: React.FC<{ go: (view: AdminView) => void; onViewRiskAlerts: () => void }> = ({ go, onViewRiskAlerts }) => {
  const [liveStats, setLiveStats] = useState(overviewStats);
  const [liveGoldTrend, setLiveGoldTrend] = useState(goldPriceTrend);
  const [liveRevenue, setLiveRevenue] = useState(revenueTrend);
  const [liveRiskAlerts, setLiveRiskAlerts] = useState<RiskRow[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([getDashboard('admin'), getRiskAlerts()]).then(([dashboard, alerts]) => {
      setLiveStats([
        { icon: cashOutline, value: String(dashboard.items.length), label: 'Total active loans', tone: 'primary' },
        { icon: peopleOutline, value: String(new Set(dashboard.transactions.map(transaction => String((transaction as { customer_id?: number }).customer_id))).size), label: 'Total customers', tone: 'success' },
        { icon: warningOutline, value: String(dashboard.risk_alerts), label: 'Total risk alerts', tone: 'warning' },
        { icon: analyticsOutline, value: money(Number(dashboard.revenue)), label: "Today's revenue", tone: 'success' },
      ]);
      const prices = dashboard.gold_prices.map(price => Number((price as { price_per_gram?: number }).price_per_gram)).filter(Boolean).slice(-7);
      if (prices.length) setLiveGoldTrend(prices.map((value, index) => ({ label: String(index + 1), value })));
      if (dashboard.revenue) setLiveRevenue([...revenueTrend.slice(1), Number(dashboard.revenue)]);
      // Only unresolved alerts are live risk. A resolved row is history: the
      // item's value recovered above the threshold on a later day.
      setLiveRiskAlerts(alerts.filter(alert => !alert.resolved).map(toRiskRow));
      setAlertsLoaded(true);
    }).catch(error => setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.'));
  }, []);

  return (
  <section className="admin-content">
    <div className="admin-intro admin-dashboard-intro">
      <div>
        <small>THURSDAY, SEPTEMBER 03, 2026</small>
        <h2>System overview</h2>
        <p>Review shop performance, risk posture, and recent operational events.</p>
      </div>
      <IonButton onClick={() => go('reports')}>Open reports</IonButton>
    </div>
    {loadError && <p className="admin-load-error">{loadError}</p>}

    <div className="admin-stats overview-grid">
      {liveStats.map((stat) => (
        <Stat key={stat.label} icon={stat.icon} value={stat.value} label={stat.label} tone={stat.tone} />
      ))}
    </div>

    <div className="dashboard-insight-grid">
      <div className="admin-panel dashboard-widget gold-dashboard-widget">
        <PanelHead title="Gold price" eyebrow="MARKET UPDATE" />
        <div className="dashboard-price-line"><strong>₱3,542 / gram</strong><span><IonIcon icon={trendingUpOutline} /> +2.6% from yesterday</span></div>
        <div className="dashboard-sparkline" aria-label="Seven day gold price trend">
          {liveGoldTrend.map((point) => <span key={point.label} style={{ height: `${(point.value / 3600) * 100}%` }}><b>{point.label}</b></span>)}
        </div>
        <small className="dashboard-widget-note">AI Predicted Price Accuracy: 97.9%</small>
      </div>

      <div className="admin-panel dashboard-widget revenue-widget">
        <PanelHead title="Revenue trend" eyebrow="LAST 7 DAYS" />
        <div className="revenue-total"><strong>₱53,800</strong><span>Best daily collection</span></div>
        <div className="dashboard-revenue-chart" aria-label="Seven day revenue trend">
          {liveRevenue.map((value, index) => <span key={`${value}-${index}`} style={{ height: `${(value / 60000) * 100}%` }}><b>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</b></span>)}
        </div>
      </div>
    </div>

    <div className="dashboard-lower-grid">
      <div className="admin-panel dashboard-risk-panel">
        <div className="admin-panel-head">
          <div><small>TOP PRIORITY ITEMS</small><h3>Risk alerts</h3></div>
          <button onClick={onViewRiskAlerts}>View all</button>
        </div>
        <div className="risk-legend">
          <span><i className="risk-dot high" />High &middot; value below the loan</span>
          <span><i className="risk-dot medium" />Medium &middot; within the safety margin</span>
        </div>
        <div className="dashboard-risk-table-wrap">
          <table className="dashboard-risk-table"><thead><tr><th>Item</th><th>Customer</th><th>Current value</th><th>Loan amount</th><th>Risk</th></tr></thead><tbody>
            {liveRiskAlerts.map((alert) => <tr key={alert.id}><td><strong>{alert.item}</strong><small>{alert.id}</small></td><td>{alert.customer}</td><td>{alert.currentValue}</td><td>{alert.amount}</td><td><em className={`risk-pill ${alert.risk.toLowerCase()}`}>{alert.risk}</em></td></tr>)}
          </tbody></table>
          {liveRiskAlerts.length === 0 && <p className="risk-empty">{alertsLoaded ? 'No unresolved risk alerts. Every active item is above its loan amount plus the safety margin.' : 'Loading risk alerts...'}</p>}
        </div>
      </div>

      <div className="admin-panel dashboard-audit-panel">
        <div className="admin-panel-head">
          <div><small>OPERATIONAL SUMMARY</small><h3>Recent activity</h3></div>
          <button onClick={() => go('monitoring')}>View all</button>
        </div>
        <div className="dashboard-audit-list">{auditLog.map((item) => <div className="dashboard-audit-item" key={`${item.time}-${item.action}`}><IonIcon icon={documentTextOutline} /><div><strong>{item.action}</strong><span>{item.actor} · {item.time}</span></div></div>)}</div>
      </div>
    </div>
  </section>
  );
};

const Stat: React.FC<{ icon: string; value: string; label: string; tone?: string }> = ({ icon, value, label, tone = 'primary' }) => (
  <div className={`admin-stat ${tone}`}>
    <IonIcon icon={icon} />
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  </div>
);

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
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const staffCount = users.filter((user) => user.role === 'staff').length;
  const customerCount = users.filter((user) => user.role === 'customer').length;

  // One tab shows one role, narrowed further by the search box.
  const term = search.trim().toLowerCase();
  const visibleUsers = users
    .filter((user) => user.role === accountTab)
    .filter((user) => !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term));

  return (
    <section className="admin-content">
      <PageIntro eyebrow="ADMINISTRATION" title="Manage" text="Manage staff and customer accounts, then configure system-wide policies." />
      <Tabs
        tabs={[{ id: 'users', label: 'User Management' }, { id: 'settings', label: 'System Settings' }]}
        active={tab}
        onChange={setTab}
      />

      <div className="admin-panel">
        {tab === 'users' ? (
          <>
            {loading && <p className="admin-inline-message">Loading users...</p>}
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

                {visibleUsers.map((user) => (
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
                    <button type="button" className="acct-action">Edit</button>
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
            </>}
          </>
        ) : (
          <SystemSettingsForm />
        )}
      </div>

      <IonModal isOpen={showAddUser} onDidDismiss={() => setShowAddUser(false)} className="admin-user-modal">
        <div className="admin-user-modal-box">
          <div className="admin-user-modal-head">
            <div><small>STAFF MANAGEMENT</small><h3>Add staff</h3></div>
            <button type="button" onClick={() => setShowAddUser(false)} aria-label="Close add user dialog"><IonIcon icon={closeOutline} /></button>
          </div>
          <label>Full name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="User full name" /></label>
          <label>Email address<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="user@smartpawn.ph" /></label>
          <label>Password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" /></label>
          {error && <p className="admin-form-error">{error}</p>}
          <div className="admin-user-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setShowAddUser(false)}>Cancel</button><button type="button" className="admin-primary-button" onClick={addUser} disabled={saving}>{saving ? 'Saving...' : 'Create user'}</button></div>
        </div>
      </IonModal>
    </section>
  );
};

/** Human readable label for a system_settings key. */
const SETTING_LABEL: Record<string, string> = {
  current_gold_price: 'Fallback gold price per gram',
  risk_threshold_percent: 'Risk safety margin (%)',
  jewelry_watch_phone_rate: 'Monthly interest — jewelry, watch, cellphone (%)',
  bulky_item_rate: 'Monthly interest — bulky items (%)',
  default_loan_to_value: 'Default loan-to-value (%)',
  loan_term_days: 'Loan term (days)',
  grace_period_days: 'Grace period (days)',
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

  if (loading) return <p className="admin-inline-message">Loading settings...</p>;

  return (
    <>
      <PanelHead title={title} action={saving ? 'Saving...' : 'Save settings'} onAction={save} />
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
  const [policySaved, setPolicySaved] = useState(false);
  const [goldPrice, setGoldPrice] = useState(0);
  const [goldRecordedAt, setGoldRecordedAt] = useState('');
  const [monitorAlerts, setMonitorAlerts] = useState<RiskRow[]>([]);
  const [monitorLoaded, setMonitorLoaded] = useState(false);

  useEffect(() => {
    // The gold price and the open alerts both come from the API now, so the
    // monitoring tabs show the same numbers as the rest of the portal.
    Promise.all([
      getDashboard('admin').catch(() => null),
      getRiskAlerts().catch(() => [] as ApiRiskAlert[]),
    ]).then(([dashboard, alerts]) => {
      const latest = dashboard?.gold_prices?.[0] as { price_per_gram?: number; price_date?: string } | undefined;
      if (latest?.price_per_gram) {
        setGoldPrice(Number(latest.price_per_gram));
        setGoldRecordedAt(shortDate(latest.price_date));
      }
      setMonitorAlerts(alerts.filter(alert => !alert.resolved).map(toRiskRow));
      setMonitorLoaded(true);
    });
  }, []);

  const clearSavedState = () => setPolicySaved(false);

  return (
    <section className="admin-content">
      <PageIntro eyebrow="OPERATIONS CONTROL" title="Monitoring" text="Monitor AI performance, commodity pricing, risk policies, and all platform activity." />
      <Tabs
        tabs={[
          { id: 'models', label: 'AI Model Monitoring' },
          { id: 'gold', label: 'Gold Price Tracking' },
          { id: 'risk', label: 'Risk Management' },
          { id: 'unusual', label: 'Unusual Activity' },
          { id: 'activity', label: 'Loans & Transactions' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="admin-panel">
        {tab === 'models' && (
          <div className="admin-stats monitor-stats">
            <Stat icon={pulseOutline} value="98.2%" label="Model availability" />
            <Stat icon={analyticsOutline} value="92%" label="Average confidence" />
            <Stat icon={shieldCheckmarkOutline} value="97.9%" label="Prediction accuracy" />
          </div>
        )}

        {tab === 'gold' && (
          <div className="monitor-layout">
            <div className="mini-panel">
              <div className="section-heading">
                <div>
                  <small>LIVE TREND</small>
                  <h3>Gold price</h3>
                </div>
                <span className="chip success">+2.6%</span>
              </div>

              <div className="gold-price-header">
                <strong>{goldPrice > 0 ? `${money(goldPrice)} / gram` : 'No price recorded'}</strong>
                <small>{goldRecordedAt ? `Recorded ${goldRecordedAt}` : 'Loading...'}</small>
              </div>


              <TrendSuggestionCard />

              <div className="bar-chart" aria-label="Gold price trend chart">
                {goldPriceTrend.map((point) => (
                  <div key={point.label} className="bar-group">
                    <span className="bar" style={{ height: `${(point.value / 3600) * 100}%` }} />
                    <small>{point.label}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="mini-panel">
              <div className="section-heading">
                <div>
                  <small>PRICE ALERT</small>
                  <h3>Valuation review</h3>
                </div>
              </div>
              <ul className="inline-list">
                <li>Jewelry items revalued at 2.8% above prior benchmark.</li>
                <li>High-demand 18K inventory is trending above projection.</li>
                <li>Risk team recommended slight tightening for high-ticket collateral.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === 'risk' && (
          <>
            <div className="admin-panel monitor-risk-list">
              <PanelHead title="Live risk alerts" action="Refresh" onAction={() => window.location.reload()} />
              {monitorAlerts.map(alert => <div className="activity-row" key={alert.id}><div><strong>{alert.item}</strong><small>{alert.customer} &middot; {alert.currentValue} against {alert.amount}</small></div><em className={alert.risk.toLowerCase()}>{alert.risk}</em></div>)}
              {monitorAlerts.length === 0 && <p className="risk-empty">{monitorLoaded ? 'No unresolved risk alerts.' : 'Loading risk alerts...'}</p>}
            </div>
            <PanelHead title="Risk management settings" action="Save policy" onAction={() => setPolicySaved(true)} />
            <div className="settings-grid">
              <label>
                High-risk threshold
                <input defaultValue="₱75,000" onChange={clearSavedState} />
              </label>
              <label>
                Medium-risk threshold
                <input defaultValue="₱30,000" onChange={clearSavedState} />
              </label>
              <label>
                Review window
                <input defaultValue="14 days" onChange={clearSavedState} />
              </label>
              <label>
                Auto-escalation
                <select defaultValue="Enabled" onChange={clearSavedState}>
                  <option>Enabled</option>
                  <option>Disabled</option>
                </select>
              </label>
            </div>
            {policySaved && <small className="policy-saved">Risk management policy saved successfully.</small>}
          </>
        )}

        {tab === 'unusual' && <UnusualActivity />}

        {tab === 'activity' && <Activity />}
      </div>
    </section>
  );
};

/** Date only, which is all the review list needs from the flag timestamp. */
const flagDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Customers the frequency heuristic put up for review.
 *
 * The wording stays "for review" everywhere: the check counts pawns in a
 * rolling window, so a busy customer is not a fraudulent one.
 */
const UnusualActivity: React.FC = () => {
  const [flags, setFlags] = useState<ApiActivityFlag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  useEffect(() => {
    getActivityFlags()
      .then(setFlags)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoaded(true));
  }, []);

  const markReviewed = async (flagId: number) => {
    setResolvingId(flagId);
    setError('');
    try {
      await resolveActivityFlag(flagId);
      setFlags(current => current.filter(flag => flag.activity_flags_id !== flagId));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="activity-list">
      <PanelHead title="Unusual activity (for review)" />
      <p className="risk-empty">Customers with more pawns in the window than the threshold allows. This is a frequency check for review, not a fraud finding.</p>

      {flags.map((flag) => (
        <div className="activity-row" key={flag.activity_flags_id}>
          <div>
            <strong>{flag.customer?.name || `Customer #${flag.customer_id}`}</strong>
            <small>{flag.reason} &middot; {flagDate(flag.flagged_at)}</small>
          </div>
          <button
            className="admin-secondary-button"
            onClick={() => markReviewed(flag.activity_flags_id)}
            disabled={resolvingId === flag.activity_flags_id}
          >
            {resolvingId === flag.activity_flags_id ? 'Saving...' : 'Mark reviewed'}
          </button>
        </div>
      ))}

      {error && <p className="admin-form-error">{error}</p>}
      {flags.length === 0 && <p className="risk-empty">{loaded ? 'No customers are flagged for review.' : 'Loading flags...'}</p>}
    </div>
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
        <span>Loan amount</span>
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

const Reports: React.FC = () => {
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <section className="admin-content">
      <PageIntro eyebrow="BUSINESS INTELLIGENCE" title="Reports" text="Review analytics and export reliable operational records." />
      <Tabs tabs={[{ id: 'analytics', label: 'Analytics' }, { id: 'exports', label: 'Exports' }]} active={tab} onChange={setTab} />

      <div className="admin-panel">
        {tab === 'analytics' ? (
          <div className="report-grid">
            <Metric label="Monthly loan volume" value="₱1.24M" detail="+12.8% vs last month" />
            <Metric label="Redemption rate" value="76.4%" detail="+4.2% vs last month" />
            <Metric label="Average loan" value="₱28,600" detail="Across 184 active loans" />
            <Metric label="Risk alerts" value="7" detail="3 require escalation" />
            <Metric label="Revenue summary" value="₱486K" detail="Net collections processed" />
            <Metric label="Gold inventory" value="₱612K" detail="Based on current benchmark" />
          </div>
        ) : (
          <div className="export-list">
            <div className="admin-table-head export-table-head">
              <span>Report</span>
              <span>Last updated</span>
              <span>Action</span>
            </div>

            {['Monthly loan performance', 'Loans nearing due date', 'Transaction audit log', 'AI appraisal accuracy', 'Gold price benchmark'].map((report) => (
              <div className="export-row" key={report}>
                <IonIcon icon={documentTextOutline} />
                <div>
                  <strong>{report}</strong>
                  <small>Updated September 03, 2026</small>
                </div>
                <IonButton fill="outline" onClick={() => alert(`${report} exported.`)}>
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

const PanelHead: React.FC<{ title: string; action?: string; eyebrow?: string; onAction?: () => void }> = ({ title, action, eyebrow, onAction }) => (
  <div className="admin-panel-head">
    <div>{eyebrow && <small>{eyebrow}</small>}<h3>{title}</h3></div>
    {action && <IonButton onClick={onAction}>{action}</IonButton>}
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
