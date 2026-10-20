/**
 * The address of the API.
 *
 * 1. `VITE_API_URL`, when set, wins: a deployment where the API sits elsewhere.
 * 2. By default the app calls the relative path `/api`. The Vite dev server
 *    proxies it to Laravel on port 8000 (see vite.config.ts), so the API shares
 *    the app's origin. One ngrok tunnel on the Vite port then serves both, and
 *    the browser needs no CORS for it.
 * 3. `VITE_API_MODE=direct` restores the older behaviour: port 8000 on the host
 *    the browser used to open the app, for a setup without the proxy, such as a
 *    static build served on its own.
 */
function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (import.meta.env.VITE_API_MODE !== 'direct') {
    return '/api';
  }

  // A phone on the same Wi-Fi opens the app on the machine's LAN address, so
  // the API lives on that same address on port 8000.
  // `hostname` is empty when there is no browser, as in unit tests.
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
  const isLoopback = hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';

  return isLoopback ? 'http://127.0.0.1:8000/api' : `http://${hostname}:8000/api`;
}

const API_BASE_URL = resolveApiBaseUrl();

export type ApiUser = { users_id: number; name: string; email: string; role: 'admin' | 'staff' | 'customer'; status: 'active' | 'inactive' };
export type ItemGroup = 'jewelry' | 'watch_phone' | 'bulky';
export type SaleItem = { items_id: number; group: ItemGroup; category: string; custom_item_type?: string | null; description: string; brand_model?: string | null; /** Stored item photos, first one first. Empty when none were taken. */ photo_urls?: string[]; sale_price: string | number; /** When a customer's hold on the item runs out, or null when it is free to reserve. */ reserved_until?: string | null };
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
  /** The staff member who took the redemption payment. Null on a pawn nobody has closed. */
  redeemed_by?: number | null;
  /** When the customer said they are ready to redeem, if they have. */
  ready_to_redeem_at: string | null;
  /** When staff accepted that request, if they have. */
  redemption_confirmed_at: string | null;
  /** The staff member currently taking this payment, while a claim is held. */
  locked_by?: number | null;
  locked_at?: string | null;
  lock_holder?: { users_id: number; name: string } | null;
  /** When a confirmed renewal last settled the renta, if one has. Interest accrues from here. */
  interest_paid_until?: string | null;
  /** Every GCash renewal raised against this pawn, oldest first. Absent from an older API. */
  renewal_requests?: ApiRenewalRequest[];
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
  /** Same shape as gold_prices, newest first. Absent from an older API. */
  silver_prices?: ApiSilverPrice[];
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
  /** Whether staff have a face reference on file for identity checks at redemption. */
  has_face_reference?: boolean;
  is_activated?: boolean;
  activation_email_sent?: boolean;
  user?: { users_id: number; name: string; email: string } | null;
  active_items_count?: number;
  total_items_count?: number;
  transactions?: ApiTransaction[];
};
export type ApiGoldPrice = { gold_prices_id: number; price_date: string; price_per_gram: string | number; predicted_next_price: string | number | null; source: 'api' | 'manual' };
export type ApiSilverPrice = Omit<ApiGoldPrice, 'gold_prices_id'> & { silver_prices_id: number };
export type ApiItem = { items_id: number; group: ItemGroup; category: string; custom_item_type?: string | null; description: string; brand_model?: string | null; /** Watch or cellphone only: IMEI, movement, papers and the like. Null for other items. */ item_details?: Record<string, string | number | boolean | null> | null; /** Gold karat ("18k"). Empty for silver. */ karat?: string | null; metal_type?: 'gold' | 'silver'; /** Silver fineness ("925"). Empty for gold. */ fineness?: string | null; weight_grams?: number | null; condition?: string; appraised_value: number; status: string;
  /** Jewelry only: whether it carries a gemstone or diamond. */
  has_gemstone?: boolean | null;
  /** Staff estimate for the gemstone, entered once at intake. */
  gemstone_value?: string | number | null;
  /** Diamond, ruby, sapphire, emerald, pearl, or other. Empty without a stone. */
  gemstone_type?: string | null;
  /** Reference note such as "0.5 carat, round cut". Not used in any value. */
  gemstone_details?: string | null;
  /** Gold (or staff) value plus any gemstone value, computed by the API. */
  total_value?: string | number | null;
};
/**
 * One stored in app notification for the signed in account.
 *
 * `type` says which screen the bell should open, and `related_item_id` says
 * which record on that screen. Both portals read the same shape.
 */
export type NotificationType =
  | 'staff_redeem_request'
  | 'staff_appointment_request'
  | 'staff_renewal_request'
  | 'staff_renewal_payment'
  | 'staff_high_risk'
  | 'staff_overdue'
  | 'staff_forfeited'
  | 'item_created'
  | 'value_changed'
  | 'risk_notice'
  | 'due_soon'
  | 'redeem_confirmed'
  | 'redemption_complete'
  | 'forfeited'
  | 'renewal_confirmed'
  | 'renewal_rejected'
  | 'staff_item_reserved'
  | 'reservation_expired'
  | 'reservation_cancelled';

export type ApiNotification = {
  notifications_id: number;
  type: NotificationType;
  message: string;
  related_item_id: number | null;
  is_read: boolean;
  created_at: string;
};

export type ApiNotificationList = { notifications: ApiNotification[]; unread_count: number };

/** The heading shown above a notification's message in the bell. */
export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  staff_redeem_request: 'Ready to pick up/pay',
  staff_appointment_request: 'Appointment requested',
  staff_renewal_request: 'Renewal requested',
  staff_renewal_payment: 'GCash renewal payment',
  staff_high_risk: 'High risk item',
  staff_overdue: 'Pawn is overdue',
  staff_forfeited: 'Item expired/unclaimed',
  item_created: 'Item recorded',
  value_changed: 'Item value changed',
  risk_notice: 'Value close to your pawn amount',
  due_soon: 'Payment due soon',
  redeem_confirmed: 'Redemption confirmed',
  redemption_complete: 'Redemption complete',
  forfeited: 'Item expired/unclaimed',
  renewal_confirmed: 'Renewal confirmed',
  renewal_rejected: 'Renewal not confirmed',
  staff_item_reserved: 'Item reserved',
  reservation_expired: 'Reservation expired',
  reservation_cancelled: 'Reservation cancelled',
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
  renewals_this_month: number;
  renewal_income_this_month: number;
  renewal_income_total: number;
  pending_renewals: number;
};

/** A figure counted over three windows, as the staff report shows it. */
export type StaffReportWindow = { today: number; this_month: number; total: number };

/**
 * One staff member's own work. Every figure is scoped to the signed in
 * account, so this is never a view of the whole shop or of a colleague.
 */
export type ApiStaffReport = {
  staff_name: string;
  pawns_recorded: StaffReportWindow;
  pawn_amount: StaffReportWindow;
  redemptions_processed: StaffReportWindow;
  amount_collected: StaffReportWindow;
  renewals_confirmed: StaffReportWindow;
  renewal_amount: StaffReportWindow;
  renewals_rejected: number;
  customers_registered: number;
  open_pawns: number;
  overdue_pawns: number;
  /** Renewal payments waiting on any staff member, not only this one. */
  pending_renewals: number;
};

/** Which figure on the staff report a breakdown is for. */
export type StaffReportMetric = 'pawns' | 'redemptions' | 'renewals_confirmed' | 'renewals_rejected';

/** One row behind a figure on the staff report. */
export type ApiStaffReportRow = {
  id: number;
  date: string | null;
  ticket_number: string | null;
  customer: string | null;
  item: string | null;
  amount: number;
  /** What the row adds beyond the amount: a status, a principal, a reference or a rejection reason. */
  note: string | null;
};

export type ApiStaffReportBreakdown = {
  metric: StaffReportMetric;
  period: 'today' | 'this_month' | 'total';
  rows: ApiStaffReportRow[];
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
  /** Photos taken at intake, first one first. Empty when none were taken. */
  photo_urls?: string[];
  created_at: string;
  customer?: ApiCustomer | null;
  transactions?: ApiTransaction[];
  value_logs?: ApiItemValueLog[];
  risk_alerts?: ApiRiskAlert[];
};

/** Trend reading returned by /gold-prices/suggestion. */
/** One recorded market day behind the suggestion. */
export type ApiSuggestionDay = {
  date: string;
  price: number;
  /** Move against the day before. Null on the oldest row, which has nothing to compare to. */
  change_percent: number | null;
  /** The dearest day in the window: when an item was worth the most. */
  is_best: boolean;
};

export type ApiRedemptionSuggestion = {
  /** What the suggestion was read from, newest first. Absent from an older API. */
  history?: ApiSuggestionDay[];
  trend: 'up' | 'down' | 'stable';
  message: string;
  disclaimer: string;
  current_price: number;
  predicted_price: number;
  average_price: number;
  change_percent: number;
  sample_size: number;
  /** How much weight the forecast carries, in percent (10-95). */
  confidence: number;
  /** The same figure as a word: High, Moderate, or Low. */
  confidence_label: 'High' | 'Moderate' | 'Low';
};
export type ApiRiskAlert = {
  risk_alerts_id: number;
  item_id: number;
  risk_level: 'low' | 'medium' | 'high';
  current_value: string | number;
  loan_amount: string | number;
  triggered_at: string;
  resolved: boolean;
  item?: { items_id: number; description?: string; category?: string; custom_item_type?: string | null; group?: string; customer?: { name?: string } | null } | null;
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

/**
 * How long a GET answer is reused, in ms. Moving between screens remounts
 * them, and each one used to fetch everything again behind a loading
 * skeleton; within this window the last answer shows at once instead.
 */
const GET_CACHE_MS = 30_000;

/** Paths always fetched fresh: the bell polls them to stay live. */
const NEVER_CACHED = ['/notifications'];

const getCache = new Map<string, { at: number; promise: Promise<unknown> }>();

/**
 * Forget every cached answer, so the next screen fetches fresh data. Any
 * change sent to the API does this itself; pull-to-refresh calls it too.
 */
export function clearApiCache() {
  getCache.clear();
}

/**
 * Every API call. GETs are shared and reused for GET_CACHE_MS: two screens
 * asking for the same list at once send one request, and coming back to a
 * screen shows its data without waiting. The key includes the sign in token,
 * so one account never sees another's answers. Anything other than a GET
 * changes data, so it clears the cache once it completes.
 */
function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  if (method !== 'GET') {
    return sendRequest<T>(path, options, authenticated).finally(clearApiCache);
  }

  if (NEVER_CACHED.some(prefix => path.startsWith(prefix))) {
    return sendRequest<T>(path, options, authenticated);
  }

  const key = `${authenticated ? token() || '' : ''}|${path}`;
  const cached = getCache.get(key);
  if (cached && Date.now() - cached.at < GET_CACHE_MS) {
    return cached.promise as Promise<T>;
  }

  const promise = sendRequest<T>(path, options, authenticated);
  getCache.set(key, { at: Date.now(), promise });
  // A failed request is not kept, so the next visit tries again.
  promise.catch(() => {
    if (getCache.get(key)?.promise === promise) getCache.delete(key);
  });
  return promise;
}

async function sendRequest<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
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
  const body = await response.text().then(text => JSON.parse(withMediaBase(text))).catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `The API request failed (HTTP ${response.status}).`);
  return body as T;
}

/**
 * Photos arrive as links relative to the app ("/api/media/..."), which is
 * where the API sits behind the dev proxy. When the API is reached at another
 * address (VITE_API_URL, or VITE_API_MODE=direct), the links are pointed there.
 * JSON from Laravel escapes the slashes, so both spellings are rewritten.
 */
function withMediaBase(text: string): string {
  if (API_BASE_URL === '/api') return text;
  const base = `${API_BASE_URL}/media/`;
  return text
    .replace(/"\/api\/media\//g, `"${base}`)
    .replace(/"\\\/api\\\/media\\\//g, `"${base.replace(/\//g, '\\/')}`);
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

/**
 * Whether the code from a scanned pawn ticket QR is still one the API accepts.
 *
 * The reply is a bare true or false. Nothing about the customer comes back
 * until the registered email address has been entered.
 */
export async function checkQrAccessCode(code: string) {
  return request<{ valid: boolean }>(`/qr-access/${encodeURIComponent(code)}`, {}, false);
}

/**
 * Open the customer portal from a scanned QR code plus the registered email.
 *
 * On success this signs the customer in exactly as `login` does, so the rest of
 * the app sees an ordinary customer session. The password is never involved,
 * and the email password reset is unaffected.
 */
export async function verifyQrAccess(code: string, email: string) {
  const result = await request<{ token: string; role: ApiUser['role']; user: ApiUser }>(
    '/qr-access/verify',
    { method: 'POST', body: JSON.stringify({ code, email }) },
    false,
  );
  localStorage.setItem('smartpawn_api_token', result.token);
  localStorage.setItem(`smartpawn_${result.role}`, JSON.stringify(result.user));
  return result;
}

/**
 * The scan URL for the QR code printed on a customer's pawn ticket.
 *
 * `network_ready` is false when the API could only build a loopback address,
 * which no phone can open, and `address_source` says where the address came
 * from: `config` is FRONTEND_URL, `detected` is a guess from the machine's own
 * network adapters and is worth checking on a machine with virtual adapters.
 */
export async function getCustomerAccessQr(customerId: number) {
  return request<{
    url: string;
    network_ready: boolean;
    address_source: 'config' | 'origin' | 'request-host' | 'detected' | 'loopback';
  }>(`/customers/${customerId}/access-qr`, { method: 'POST' });
}

export async function searchCustomers(searchTerm: string) { return request<ApiCustomer[]>(`/customers?search=${encodeURIComponent(searchTerm)}`); }
export async function getCustomers() { return request<ApiCustomer[]>('/customers'); }
export async function createCustomer(payload: Record<string, unknown>) { return request<ApiCustomer>('/customers', { method: 'POST', body: JSON.stringify(payload) }); }
/** Staff correcting a customer's details. The email is the sign-in and is not sent. */
export async function updateCustomer(id: number, payload: { name: string; contact_number: string; address: string; valid_id_type: string; valid_id_number: string; valid_id_photo: string | null }) {
  return request<ApiCustomer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
/** A customer's face reference, with the ID photo as fallback. Staff only. */
export type ApiCustomerFace = { customers_id: number; face_photo: string | null; face_descriptor: number[] | null; face_enrolled_at: string | null; valid_id_photo: string | null };
export type FaceCheckResult = 'match' | 'unsure' | 'no_match' | 'no_reference' | 'skipped';
export async function getCustomerFace(customerId: number) { return request<ApiCustomerFace>(`/customers/${customerId}/face`); }
/** Save a face photo and its descriptor. `consent` must be true: the customer agreed to it being kept. */
export async function saveCustomerFace(customerId: number, facePhoto: string, descriptor: number[], idMatch: FaceCheckResult | null) {
  return request<ApiCustomer>(`/customers/${customerId}/face`, { method: 'PUT', body: JSON.stringify({ face_photo: facePhoto, face_descriptor: descriptor, consent: true, id_match: idMatch }) });
}
export async function deleteCustomerFace(customerId: number) { return request<ApiCustomer>(`/customers/${customerId}/face`, { method: 'DELETE' }); }
/** Log how the claimant's face compared at redemption. Informational: it never blocks the payment. */
export async function recordFaceCheck(transactionId: number, result: FaceCheckResult, distance: number | null) {
  return request<{ recorded: boolean }>(`/transactions/${transactionId}/face-check`, { method: 'POST', body: JSON.stringify({ result, distance }) });
}
export async function getUsers() { return request<ApiUser[]>('/users'); }
export async function createUser(payload: { name: string; email: string; password: string }) { return request<ApiUser>('/users', { method: 'POST', body: JSON.stringify(payload) }); }
export async function updateUser(id: number, payload: { status: ApiUser['status']; password?: string }) { return request<ApiUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }

export async function createItem(payload: Record<string, unknown>) { return request<ApiItem>('/items', { method: 'POST', body: JSON.stringify(payload) }); }
export async function getItems() { return request<ApiItemDetail[]>('/items'); }
/** One line of the FAQ chat, in the shape the chat endpoint takes. */
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
/**
 * Ask the AI assistant to answer the FAQ chat. Resolves to null when the server
 * has no answer (no API key, free quota used up), so the caller falls back to its
 * offline keyword answer.
 */
export async function askChatAssistant(messages: ChatTurn[]) { return (await request<{ reply: string | null }>('/chat', { method: 'POST', body: JSON.stringify({ messages }) }, false)).reply; }
/** A public gold value estimate. Computed from the latest gold price; nothing is saved. */
export type MetalType = 'gold' | 'silver';
export type ApiEstimate = { metal_type: MetalType; karat: string; weight_grams: number; purity: number; price_per_gram: number; price_date: string; estimate_date: string; estimated_value: number };
/** karat is a gold karat ("18k") for gold, or a silver fineness ("925") for silver. */
export async function getEstimate(karat: string, weightGrams: number, metalType: MetalType = 'gold') { return request<ApiEstimate>('/estimate', { method: 'POST', body: JSON.stringify({ metal_type: metalType, karat, weight_grams: weightGrams }) }, false); }
export async function getForSaleItems() { return request<SaleItem[]>('/items/for-sale', {}, false); }
export async function markItemForSale(itemId: number, salePrice: number) { return request(`/items/${itemId}/for-sale`, { method: 'POST', body: JSON.stringify({ sale_price: salePrice }) }); }
/** Replace an item's photos with `photos`, in order. An empty list removes them all. */
export async function updateItemPhotos(itemId: number, photos: string[]) { return request<ApiItemDetail>(`/items/${itemId}/photos`, { method: 'PUT', body: JSON.stringify({ photos }) }); }
export async function markItemSold(itemId: number) { return request(`/items/${itemId}/sold`, { method: 'POST' }); }

/**
 * A customer's hold on an item for sale. It lasts until closing time on the
 * shop's second open day; `status` stays 'active' until it is claimed (the
 * item was sold), cancelled, or expired. An active row whose expires_at has
 * passed no longer holds the item.
 */
export type ApiReservation = {
  item_reservations_id: number;
  item_id: number;
  customer_id: number;
  expires_at: string;
  status: 'active' | 'claimed' | 'cancelled' | 'expired';
  created_at: string;
  item: (Pick<ApiItem, 'items_id' | 'description'> & { sale_price: string | number | null; photo_urls?: string[] }) | null;
  /** Sent to staff only. */
  customer?: { customers_id: number; name: string; contact_number: string | null } | null;
};
/** Most items one customer may hold at once. Matches ItemReservation::MAX_ACTIVE_PER_CUSTOMER. */
export const MAX_RESERVATIONS = 2;
export async function reserveItem(itemId: number) { return request<ApiReservation>(`/items/${itemId}/reserve`, { method: 'POST' }); }
/** A customer's own holds from the last 30 days, or for staff every hold still in effect. */
export async function getReservations() { return request<ApiReservation[]>('/reservations'); }
export async function cancelReservation(reservationId: number) { return request<ApiReservation>(`/reservations/${reservationId}/cancel`, { method: 'POST' }); }
/** Whether an active hold still holds its item: the hourly expiry job may not have run yet. */
export const isHolding = (reservation: ApiReservation) => reservation.status === 'active' && new Date(reservation.expires_at).getTime() > Date.now();
/** A hold's end in the shop's words, e.g. "Tue, Oct 13, 6:00 PM". */
export const holdEnds = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function getTransactions() { return request<ApiTransaction[]>('/transactions'); }
export async function createTransaction(payload: Record<string, unknown>) { return request<ApiTransaction>('/transactions', { method: 'POST', body: JSON.stringify(payload) }); }
/** How a redemption was paid. Recorded with the transaction, not just shown once. */
export type RedemptionPayment = {
  payment_method: string;
  /** Required for any method other than Cash: the shop's only record it arrived. */
  payment_reference?: string | null;
  amount_collected?: number | null;
  /** Cash handed over, for the change given. Null for every other method. */
  cash_received?: number | null;
};

export async function redeemTransaction(transactionId: number, payment?: RedemptionPayment) {
  return request(`/transactions/${transactionId}/redeem`, {
    method: 'POST',
    body: JSON.stringify(payment || {}),
  });
}

export async function getGoldPrices() { return request<ApiGoldPrice[]>('/gold-prices'); }
export async function getSilverPrices() { return request<ApiSilverPrice[]>('/silver-prices'); }
export async function saveGoldPrice(pricePerGram: number) { return request('/gold-prices', { method: 'POST', body: JSON.stringify({ price_per_gram: pricePerGram }) }); }

export async function getRiskAlerts() { return request<ApiRiskAlert[]>('/risk-alerts'); }
export async function getActivityFlags() { return request<ApiActivityFlag[]>('/activity-flags'); }
export async function resolveActivityFlag(flagId: number) { return request<ApiActivityFlag>(`/activity-flags/${flagId}/resolve`, { method: 'POST' }); }
export async function getRedemptionSuggestion() { return request<ApiRedemptionSuggestion>('/gold-prices/suggestion'); }
export async function getDashboard(role: 'admin' | 'staff' | 'customer') { return request<ApiDashboard>(`/dashboard/${role}`); }

export async function getNotifications() { return request<ApiNotificationList>('/notifications'); }
export async function markNotificationRead(notificationId: number) { return request<{ notification: ApiNotification; unread_count: number }>(`/notifications/${notificationId}/read`, { method: 'POST' }); }
export async function requestRedemption(transactionId: number) { return request<ApiTransaction>(`/transactions/${transactionId}/ready-to-redeem`, { method: 'POST' }); }

/** One GCash renewal payment a customer has claimed, as both portals read it. */
export type ApiRenewalRequest = {
  renewal_requests_id: number;
  transaction_id: number;
  customer_id: number;
  customer_name: string | null;
  ticket_number: string | null;
  item_id: number | null;
  item_name: string | null;
  due_date: string | null;
  /** The due date this claim produces if it is confirmed. */
  new_due_date: string | null;
  renewal_term_days: number;
  amount: number;
  gcash_reference_number: string;
  /** The GCash receipt the customer attached, as an image URL. Null when none was. */
  receipt_url: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  /** Why staff rejected it. Null while pending or once confirmed. */
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

/** What the Renew Online panel shows before the customer pays. */
export type ApiOnlineRenewalInfo = {
  transaction_id: number;
  ticket_number: string;
  /** False once the pawn stops being open, which is when renewal is refused. */
  renewable: boolean;
  /** The renta owed today, computed by the API. */
  interest_due: number;
  due_date: string;
  renewal_term_days: number;
  /** The shop's GCash number or account name, empty until an admin sets it. */
  gcash_payment_info: string;
  /** The claim already waiting on this pawn, when there is one. */
  pending_request: ApiRenewalRequest | null;
};

export async function getOnlineRenewalInfo(transactionId: number) {
  return request<ApiOnlineRenewalInfo>(`/transactions/${transactionId}/renew-online`);
}

/**
 * Records a GCash payment the customer has already sent from their own app.
 * Nothing about the pawn changes until staff confirm the reference number.
 */
export async function submitOnlineRenewal(transactionId: number, gcashReferenceNumber: string, receipt?: string | null) {
  return request<ApiRenewalRequest>(`/transactions/${transactionId}/renew-online`, {
    method: 'POST',
    body: JSON.stringify({ gcash_reference_number: gcashReferenceNumber, receipt: receipt || null }),
  });
}

/** Pending claims by default; 'all' adds the confirmed and rejected ones, newest first. */
/** The customer's own pickup code for one pawn. Null once it has run out. */
export type ApiPickupCode = {
  pickup_code: string | null;
  expires_at: string | null;
  /** How long a freshly made code lasts, in hours. */
  valid_hours: number;
};

/** What a typed pickup code resolves to. Every field is null when nothing matches. */
export type ApiPickupCodeMatch = {
  transaction_id: number | null;
  ticket_number: string | null;
  item_id?: number | null;
  customer_name?: string | null;
  expires_at?: string | null;
};

export async function getPickupCode(transactionId: number) {
  return request<ApiPickupCode>(`/transactions/${transactionId}/pickup-code`);
}

/** Makes a code, replacing any the pawn already has. */
export async function generatePickupCode(transactionId: number) {
  return request<ApiPickupCode>(`/transactions/${transactionId}/pickup-code`, { method: 'POST' });
}

/** Staff resolve a code they have been read. Codes are never listed, only looked up. */
export async function lookupPickupCode(pickupCode: string) {
  return request<ApiPickupCodeMatch>(`/pickup-code/lookup?pickup_code=${encodeURIComponent(pickupCode)}`);
}

export async function getRenewalRequests(status: 'pending' | 'confirmed' | 'rejected' | 'all' = 'pending') {
  return request<ApiRenewalRequest[]>(`/renewal-requests?status=${status}`);
}

/** Staff matched the reference against the shop's GCash account: extends the due date. */
export async function confirmRenewalRequest(renewalRequestId: number) {
  return request<{ renewal_request: ApiRenewalRequest; transaction: ApiTransaction }>(`/renewal-requests/${renewalRequestId}/confirm`, { method: 'POST' });
}

/** Staff could not match the reference. The pawn is untouched. */
export async function rejectRenewalRequest(renewalRequestId: number, reason?: string) {
  return request<ApiRenewalRequest>(`/renewal-requests/${renewalRequestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
}

/** The answer to a claim. A 409 carries the same shape, naming who holds it. */
export type ApiTransactionLock = {
  locked: boolean;
  locked_by_you: boolean;
  locked_by_name: string | null;
  message?: string;
};

/**
 * Claim a pawn so one staff member can take its payment.
 *
 * Rejects with the API's 409 when somebody else is already holding it, so the
 * caller opens the payment screen only on success.
 */
export async function lockTransaction(transactionId: number) {
  return request<ApiTransactionLock>(`/transactions/${transactionId}/lock`, { method: 'POST' });
}

/** Give up a claim. Releases only the caller's own. */
export async function unlockTransaction(transactionId: number) {
  return request<ApiTransactionLock>(`/transactions/${transactionId}/unlock`, { method: 'POST' });
}

export async function confirmRedemptionRequest(transactionId: number) { return request<ApiTransaction>(`/transactions/${transactionId}/confirm-redemption`, { method: 'POST' }); }
export async function getAuditLogs(limit = 50) { return request<ApiAuditLog[]>(`/audit-logs?limit=${limit}`); }
export async function getMe() { return request<ApiMe>('/me'); }
export async function updateMe(payload: { name: string; contact_number?: string; address?: string }) { return request<ApiMe>('/me', { method: 'PUT', body: JSON.stringify(payload) }); }
/**
 * Set or change your own password.
 *
 * current_password is left out by a customer who has never had one: they
 * reached the portal by scanning their pawn ticket, so there is nothing for
 * them to state.
 */
export async function updateMyPassword(payload: { current_password?: string; password: string; password_confirmation: string }) {
  return request<ApiMe>('/me/password', { method: 'PUT', body: JSON.stringify(payload) });
}

/** A redeemed pawn the customer has not rated yet. */
export type ApiPendingFeedback = {
  transaction: { transaction_id: number; ticket_number: string; item_name: string | null; redeemed_at: string | null } | null;
};

/** One rating, as both portals read it. */
export type ApiFeedback = {
  feedback_id: number;
  transaction_id: number;
  ticket_number: string | null;
  item_name: string | null;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  submitted_at: string | null;
};

export type ApiFeedbackList = {
  feedback: ApiFeedback[];
  total: number;
  /** Null until somebody has rated something. */
  average_rating: number | null;
  rating_counts: Record<string, number>;
};

/** One announced exception to the shop's usual week. */
export type ApiShopClosure = {
  shop_closures_id: number;
  closure_date: string;
  label: string;
  kind: 'closed' | 'half_day';
  opens_at: string | null;
  closes_at: string | null;
};

export type ApiShopSchedule = {
  month: string;
  /** ISO weekday numbers the branch opens on: 1 is Monday, 7 Sunday. */
  open_days: number[];
  opens_at: string;
  closes_at: string;
  closures: ApiShopClosure[];
  /** The next shut day from today, whichever month it falls in. */
  next_closure: ApiShopClosure | null;
};

export async function getShopSchedule(month?: string) {
  return request<ApiShopSchedule>(`/shop-schedule${month ? `?month=${month}` : ''}`);
}

/** One active pawn on the staff due calendar. */
export type ApiCalendarItem = {
  transaction_id: number;
  item_id: number;
  ticket_number: string;
  item: string;
  customer: string;
  loan_amount: number;
  /** yyyy-mm-dd. */
  due_date: string;
  /** Whole days until due. Negative once overdue. */
  days_left: number;
  overdue: boolean;
  /** The item's open risk alert, or "low" when it has none. */
  risk: 'high' | 'medium' | 'low';
};

export type ApiCalendar = {
  month: string;
  today: string;
  /** Only days with at least one active pawn due. */
  days: Array<{ date: string; count: number; level: 'normal' | 'medium' | 'high' }>;
  items: ApiCalendarItem[];
  /** Due today, whichever month is requested. */
  today_items: ApiCalendarItem[];
  /** Every active pawn with an open high or medium alert, high first. */
  at_risk: ApiCalendarItem[];
};

/** Active pawns by due date for one month (yyyy-mm). Staff and admin only. */
export async function getCalendar(month?: string) {
  return request<ApiCalendar>(`/calendar${month ? `?month=${month}` : ''}`);
}

export async function saveShopClosure(payload: { closure_date: string; label: string; kind: 'closed' | 'half_day'; opens_at?: string; closes_at?: string }) {
  return request<ApiShopClosure>('/shop-closures', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteShopClosure(closureId: number) {
  return request<{ deleted: boolean }>(`/shop-closures/${closureId}`, { method: 'DELETE' });
}

export async function getPendingFeedback() { return request<ApiPendingFeedback>('/feedback/pending'); }

export async function submitFeedback(transactionId: number, rating: number, comment?: string) {
  return request<ApiFeedback>(`/transactions/${transactionId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment: comment?.trim() || null }),
  });
}

export async function getFeedbackList() { return request<ApiFeedbackList>('/feedback'); }

export async function getReportSummary() { return request<ApiReportSummary>('/reports/summary'); }
export async function getModelMetrics() { return request<ApiModelMetrics>('/model-metrics'); }

/** The signed in staff member's own figures. Takes no id: the caller is the subject. */
export async function getStaffReport() { return request<ApiStaffReport>('/reports/staff'); }

/** The rows behind one of those figures. Same scoping: always the caller's own work. */
export async function getStaffReportBreakdown(metric: StaffReportMetric, period: 'today' | 'this_month' | 'total') {
  return request<ApiStaffReportBreakdown>(`/reports/staff/breakdown?metric=${metric}&period=${period}`);
}

export async function getSystemSettings() { return request<ApiSystemSetting[]>('/system-settings'); }
export async function saveSystemSetting(settingKey: string, settingValue: string) { return request('/system-settings', { method: 'PUT', body: JSON.stringify({ setting_key: settingKey, setting_value: settingValue }) }); }
