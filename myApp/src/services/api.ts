const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

export type ApiUser = { users_id: number; name: string; email: string; role: 'admin' | 'staff' | 'customer'; status: 'active' | 'inactive' };
export type ItemGroup = 'jewelry' | 'watch_phone' | 'bulky';
export type SaleItem = { items_id: number; group: ItemGroup; category: string; description: string; brand_model?: string | null; photo_path?: string | null; sale_price: string | number };
export type ApiTransaction = {
  transactions_id: number;
  ticket_number: string;
  item_id: number;
  customer_id: number;
  item: ApiItem | null;
  customer: ApiCustomer | null;
  loan_amount: string | number;
  interest_rate: string | number;
  loan_to_value_percent: string | number;
  due_date: string;
  grace_period_days: number;
  status: 'active' | 'redeemed' | 'forfeited';
  redeemed_at: string | null;
  created_at: string;
  /** Payoff figures computed by the API, so no client re-derives interest. */
  days_elapsed: number;
  interest_due: number;
  total_payable: number;
  days_until_due: number;
};
export type ApiDashboardStats = {
  active_loans: number;
  overdue_loans: number;
  total_customers: number;
  open_risk_alerts: number;
  loan_portfolio: number;
  amount_due: number;
  transactions_today: number;
  revenue_today: number;
};

export type ApiDashboard = {
  items: ApiItem[];
  transactions: ApiTransaction[];
  risk_alerts: number;
  gold_prices: ApiGoldPrice[];
  revenue: number;
  stats: ApiDashboardStats;
  revenue_trend: Array<{ date: string; revenue: number }>;
};
export type ApiCustomer = {
  customers_id: number;
  name: string;
  email?: string;
  contact_number?: string;
  address?: string;
  valid_id_type?: string;
  valid_id_number?: string;
  /** Data URL of the scanned ID, stored as a string by the API. */
  valid_id_photo?: string | null;
  is_activated?: boolean;
  activation_email_sent?: boolean;
  user?: { users_id: number; name: string; email: string } | null;
  active_items_count?: number;
  total_items_count?: number;
  transactions?: ApiTransaction[];
};
export type ApiGoldPrice = { gold_prices_id: number; price_date: string; price_per_gram: string | number; predicted_next_price: string | number | null; source: 'api' | 'manual' };
export type ApiItem = { items_id: number; group: ItemGroup; category: string; description: string; brand_model?: string | null; karat?: string | null; weight_grams?: number | null; condition?: string; appraised_value: number; status: string };
export type ApiNotification = {
  id: string;
  type: 'due' | 'overdue' | 'risk';
  title: string;
  message: string;
  reference: string;
  created_at: string;
};

export type ApiAuditLog = {
  audit_logs_id: number;
  action: string;
  ticket_number: string | null;
  reason: string | null;
  created_at: string;
  user: { users_id: number; name: string; role: string } | null;
};

export type ApiMe = {
  user: { users_id: number; name: string; email: string; role: ApiUser['role']; contact_number: string | null; status: string; is_activated: boolean };
  customer: ApiCustomer | null;
};

export type ApiReportSummary = {
  monthly_loan_volume: number;
  monthly_loan_volume_change_percent: number | null;
  redemption_rate_percent: number | null;
  average_loan: number;
  active_loans: number;
  open_risk_alerts: number;
  high_risk_alerts: number;
  total_collected: number;
  inventory_value: number;
  items_for_sale_value: number;
};

export type ApiModelMetrics = {
  sample_size: number;
  mean_absolute_percent_error: number | null;
  prediction_accuracy_percent: number | null;
  window_size: number;
  recorded_days: number;
  latest_prediction: string | number | null;
  latest_price: string | number | null;
  latest_price_date: string | null;
};

export type ApiSystemSetting = { setting_key: string; setting_value: string };

/** One day's recorded value for an item, from item_value_logs. */
export type ApiItemValueLog = {
  item_value_logs_id: number;
  log_date: string;
  computed_value: string | number;
  gold_price_used: string | number;
};

/** An item as /items returns it, with its loans, value history, and alerts. */
export type ApiItemDetail = ApiItem & {
  customer_id: number;
  adjusted_value?: string | number | null;
  adjustment_reason?: string | null;
  sale_price?: string | number | null;
  photo_path?: string | null;
  created_at: string;
  customer?: ApiCustomer | null;
  transactions?: ApiTransaction[];
  value_logs?: ApiItemValueLog[];
  risk_alerts?: ApiRiskAlert[];
};

/** Trend reading returned by /gold-prices/suggestion. */
export type ApiRedemptionSuggestion = {
  trend: 'up' | 'down' | 'stable';
  message: string;
  disclaimer: string;
  current_price: number;
  predicted_price: number;
  average_price: number;
  change_percent: number;
  sample_size: number;
};
export type ApiRiskAlert = {
  risk_alerts_id: number;
  item_id: number;
  risk_level: 'low' | 'medium' | 'high';
  current_value: string | number;
  loan_amount: string | number;
  triggered_at: string;
  resolved: boolean;
  item?: { items_id: number; description?: string; category?: string; group?: string; customer?: { name?: string } | null } | null;
};

/**
 * One customer flagged by the transaction frequency heuristic. It marks a
 * customer for review, and it is not a fraud finding.
 */
export type ApiActivityFlag = {
  activity_flags_id: number;
  customer_id: number;
  reason: string;
  transaction_count: number;
  window_days: number;
  flagged_at: string;
  resolved: boolean;
  customer?: { customers_id: number; name: string; contact_number?: string | null } | null;
};

const token = () => localStorage.getItem('smartpawn_api_token');

async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated && token()) headers.set('Authorization', `Bearer ${token()}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    // fetch only rejects when the request never completed: the API is down,
    // the URL is wrong, or the browser blocked the response for CORS.
    throw new Error(`Cannot reach the SmartPawn API at ${API_BASE_URL}. Check that the backend is running and that this address is allowed by CORS.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `The API request failed (HTTP ${response.status}).`);
  return body as T;
}

export async function login(email: string, password: string) {
  const result = await request<{ token: string; role: ApiUser['role']; user: ApiUser }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  localStorage.setItem('smartpawn_api_token', result.token);
  localStorage.setItem(`smartpawn_${result.role}`, JSON.stringify(result.user));
  return result;
}

export async function logout() { await request('/logout', { method: 'POST' }).catch(() => undefined); localStorage.removeItem('smartpawn_api_token'); }

export async function activate(token: string, password: string, passwordConfirmation: string) {
  return request<{ message: string }>('/activate', { method: 'POST', body: JSON.stringify({ activation_token: token, password, password_confirmation: passwordConfirmation }) }, false);
}

/** Ask the API to email a reset link. The reply never says whether the address has an account. */
export async function requestPasswordReset(email: string) {
  return request<{ message: string }>('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }, false);
}

/** Set a new password using the token from the reset email. */
export async function resetPassword(token: string, password: string, passwordConfirmation: string) {
  return request<{ message: string }>('/reset-password', { method: 'POST', body: JSON.stringify({ token, password, password_confirmation: passwordConfirmation }) }, false);
}

export async function searchCustomers(searchTerm: string) { return request<ApiCustomer[]>(`/customers?search=${encodeURIComponent(searchTerm)}`); }
export async function getCustomers() { return request<ApiCustomer[]>('/customers'); }
export async function createCustomer(payload: Record<string, unknown>) { return request<ApiCustomer>('/customers', { method: 'POST', body: JSON.stringify(payload) }); }
export async function getUsers() { return request<ApiUser[]>('/users'); }
export async function createUser(payload: { name: string; email: string; password: string }) { return request<ApiUser>('/users', { method: 'POST', body: JSON.stringify(payload) }); }

export async function createItem(payload: Record<string, unknown>) { return request<ApiItem>('/items', { method: 'POST', body: JSON.stringify(payload) }); }
export async function getItems() { return request<ApiItemDetail[]>('/items'); }
export async function getForSaleItems() { return request<SaleItem[]>('/items/for-sale', {}, false); }
export async function markItemForSale(itemId: number, salePrice: number) { return request(`/items/${itemId}/for-sale`, { method: 'POST', body: JSON.stringify({ sale_price: salePrice }) }); }
export async function markItemSold(itemId: number) { return request(`/items/${itemId}/sold`, { method: 'POST' }); }

export async function getTransactions() { return request<ApiTransaction[]>('/transactions'); }
export async function createTransaction(payload: Record<string, unknown>) { return request<ApiTransaction>('/transactions', { method: 'POST', body: JSON.stringify(payload) }); }
export async function redeemTransaction(transactionId: number) { return request(`/transactions/${transactionId}/redeem`, { method: 'POST' }); }

export async function getGoldPrices() { return request<ApiGoldPrice[]>('/gold-prices'); }
export async function saveGoldPrice(pricePerGram: number) { return request('/gold-prices', { method: 'POST', body: JSON.stringify({ price_per_gram: pricePerGram }) }); }

export async function getRiskAlerts() { return request<ApiRiskAlert[]>('/risk-alerts'); }
export async function getActivityFlags() { return request<ApiActivityFlag[]>('/activity-flags'); }
export async function resolveActivityFlag(flagId: number) { return request<ApiActivityFlag>(`/activity-flags/${flagId}/resolve`, { method: 'POST' }); }
export async function getRedemptionSuggestion() { return request<ApiRedemptionSuggestion>('/gold-prices/suggestion'); }
export async function getDashboard(role: 'admin' | 'staff' | 'customer') { return request<ApiDashboard>(`/dashboard/${role}`); }

export async function getNotifications() { return request<ApiNotification[]>('/notifications'); }
export async function getAuditLogs(limit = 50) { return request<ApiAuditLog[]>(`/audit-logs?limit=${limit}`); }
export async function getMe() { return request<ApiMe>('/me'); }
export async function updateMe(payload: { name: string; contact_number?: string; address?: string }) { return request<ApiMe>('/me', { method: 'PUT', body: JSON.stringify(payload) }); }
export async function getReportSummary() { return request<ApiReportSummary>('/reports/summary'); }
export async function getModelMetrics() { return request<ApiModelMetrics>('/model-metrics'); }

export async function getSystemSettings() { return request<ApiSystemSetting[]>('/system-settings'); }
export async function saveSystemSetting(settingKey: string, settingValue: string) { return request('/system-settings', { method: 'PUT', body: JSON.stringify({ setting_key: settingKey, setting_value: settingValue }) }); }
