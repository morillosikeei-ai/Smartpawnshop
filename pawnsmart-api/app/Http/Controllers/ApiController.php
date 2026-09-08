<?php

namespace App\Http\Controllers;

use App\Models\ActivityFlag;
use App\Models\Customer;
use App\Models\AuditLog;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\RiskAlert;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Services\GoldPriceService;
use App\Mail\ActivationMail;
use App\Mail\PasswordResetMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Throwable;

class ApiController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::where('email', strtolower($data['email']))->where('status', 'active')->first();
        abort_unless($user && Hash::check($data['password'], $user->password), 422, 'Invalid credentials.');
        return response()->json(['token' => $user->createToken('ionic-app')->plainTextToken, 'role' => $user->role, 'user' => $user]);
    }

    public function activate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'activation_token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = User::where('activation_token', $data['activation_token'])
            ->where('is_activated', false)
            ->where('status', 'active')
            ->first();

        abort_unless($user, 422, 'Invalid or expired token.');

        $user->forceFill([
            'password' => Hash::make($data['password']),
            'activation_token' => null,
            'is_activated' => true,
        ])->save();

        return response()->json(['message' => 'Account activated successfully.']);
    }

    /**
     * How long a password reset link stays usable, in minutes.
     */
    private const PASSWORD_RESET_EXPIRY_MINUTES = 60;

    /**
     * Email a password reset link to the account that owns the address.
     *
     * The reply never says whether the address is registered. Telling an
     * anonymous caller which emails have accounts would hand them a list of
     * the shop's customers, so every request gets the same answer.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc,dns']]);
        $email = strtolower($data['email']);

        $genericResponse = response()->json([
            'message' => 'If that email address has an account, a password reset link is on its way to it.',
        ]);

        $user = User::where('email', $email)->where('status', 'active')->first();

        if (!$user) {
            // The caller is told nothing, because the reply would otherwise say
            // which addresses have accounts. It is logged so that "the reset
            // email never arrived" can be told apart from a typed address that
            // no account uses.
            Log::warning('Password reset requested for an address with no active account.', ['email' => $email]);

            return $genericResponse;
        }

        // The plain token goes in the email; only its hash is stored, so a
        // leaked database still cannot be used to reset anyone's password.
        $token = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            ['token' => Hash::make($token), 'created_at' => now()]
        );

        // A mail server that is down or misconfigured must not be reported back
        // to an anonymous caller, because the reply would then reveal which
        // addresses have accounts. It is logged instead, so a failed reset is
        // findable in storage/logs rather than silent.
        try {
            Mail::to($user->email)->send(new PasswordResetMail($token, $user->name, self::PASSWORD_RESET_EXPIRY_MINUTES));
        } catch (Throwable $exception) {
            Log::error('Password reset email could not be sent.', [
                'user_id' => $user->users_id,
                'mailer' => config('mail.default'),
                'error' => $exception->getMessage(),
            ]);
        }

        return $genericResponse;
    }

    /**
     * Set a new password using the token from the reset email.
     *
     * The token is the proof that the caller can read the account's mail. It
     * is single use: the row is deleted once the password changes, so the same
     * link cannot be replayed.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $expiresAfter = now()->subMinutes(self::PASSWORD_RESET_EXPIRY_MINUTES);

        // The token is stored hashed, so it cannot be looked up directly. Only
        // rows still inside the expiry window are worth checking.
        $record = DB::table('password_reset_tokens')
            ->where('created_at', '>=', $expiresAfter)
            ->get()
            ->first(fn ($row) => Hash::check($data['token'], $row->token));

        abort_unless($record, 422, 'This password reset link is invalid or has expired. Request a new one.');

        $user = User::where('email', $record->email)->where('status', 'active')->first();

        abort_unless($user, 422, 'This password reset link is invalid or has expired. Request a new one.');

        DB::transaction(function () use ($user, $data, $record) {
            $user->forceFill([
                'password' => Hash::make($data['password']),
                // A customer who resets their password has proved they own the
                // inbox, which is exactly what activation checks for.
                'activation_token' => null,
                'is_activated' => true,
            ])->save();

            DB::table('password_reset_tokens')->where('email', $record->email)->delete();
        });

        // Any session opened before the reset should not survive it.
        $user->tokens()->delete();

        return response()->json(['message' => 'Password updated successfully. You can now log in.']);
    }

    /**
     * Customers, each with the item counts and transaction history the staff
     * Customer Records tab lists. A customer only ever sees their own row.
     */
    public function customers(Request $request): JsonResponse
    {
        $query = Customer::with(['user', 'transactions.item'])
            ->withCount([
                'items as active_items_count' => fn ($q) => $q->whereIn('status', ['active', 'overdue']),
                'items as total_items_count',
            ])
            ->latest('customers_id');

        if ($request->user()->role === 'customer') $query->where('user_id', $request->user()->users_id);

        if ($search = trim((string) $request->query('search'))) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('contact_number', 'like', "%{$search}%"));
        }

        return response()->json($query->get());
    }

    public function users(): JsonResponse
    {
        return response()->json(User::query()->whereIn('role', ['staff', 'customer'])->latest('users_id')->get(['users_id', 'name', 'email', 'role', 'status']));
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => $data['password'],
            'role' => 'staff',
            'status' => 'active',
            'is_activated' => true,
        ]);

        return response()->json($user->only(['users_id', 'name', 'email', 'role', 'status']), 201);
    }

    public function storeCustomer(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string'], 'email' => ['required', 'email:rfc,dns', 'unique:users,email'], 'password' => ['nullable', 'string', 'min:8'], 'contact_number' => ['required', 'string'], 'address' => ['nullable', 'string'], 'valid_id_type' => ['required', 'string'], 'valid_id_number' => ['required', 'string'], 'valid_id_photo' => ['nullable', 'string', 'max:8000000']]);
        $customer = DB::transaction(function () use ($data, $request) {
            $activationToken = Str::random(64);
            $activationEmailSent = false;
            $user = User::create([
                'name' => $data['name'],
                'email' => strtolower($data['email']),
                'password' => $data['password'] ?? Str::random(32),
                'role' => 'customer',
                'contact_number' => $data['contact_number'],
                'status' => 'active',
                'activation_token' => $activationToken,
                'is_activated' => false,
            ]);
            $customer = Customer::create([
                ...$data,
                'user_id' => $user->users_id,
                'registered_by_staff_id' => $request->user()->users_id,
            ]);
            try {
                Mail::to($user->email)->send(new ActivationMail($activationToken, $user->name));
                $activationEmailSent = true;
            } catch (Throwable $exception) {
                // The customer is registered either way. Losing the whole
                // registration because the mail server hiccuped would be worse
                // than an activation link the staff can resend.
                Log::error('Activation email could not be sent.', [
                    'user_id' => $user->users_id,
                    'mailer' => config('mail.default'),
                    'error' => $exception->getMessage(),
                ]);
            }

            $customer->setAttribute('activation_email_sent', $activationEmailSent);

            return $customer->load('user');
        });

        return response()->json($customer, 201);
    }

    public function items(Request $request): JsonResponse
    {
        $query = Item::with(['customer', 'transactions', 'valueLogs', 'riskAlerts'])->latest('items_id');
        if ($request->user()->role === 'customer') $query->where('customer_id', optional($request->user()->customerProfile)->customers_id);
        return response()->json($query->get());
    }

    public function forSale(): JsonResponse
    {
        return response()->json(Item::where('status', 'for_sale')->get(['items_id', 'group', 'category', 'description', 'brand_model', 'photo_path', 'sale_price']));
    }

    public function transactions(Request $request): JsonResponse
    {
        $query = Transaction::with(['item', 'customer'])->latest('transactions_id');
        if ($request->user()->role === 'customer') $query->where('customer_id', optional($request->user()->customerProfile)->customers_id);
        return response()->json($query->get());
    }

    /**
     * Create an item and its pawn ticket in one call.
     *
     * The item group decides both how the item is valued and which interest
     * rate the ticket carries:
     *
     *   jewelry              - karat and weight are required. The value is
     *                          computed from today's gold price. Rate comes
     *                          from jewelry_watch_phone_rate.
     *   watch_phone          - brand or model, condition, and an appraised
     *                          value typed by the staff are required. Rate also
     *                          comes from jewelry_watch_phone_rate.
     *   bulky                - same fields as watch_phone, but the rate comes
     *                          from bulky_item_rate, which is higher.
     *
     * The client never sends the interest rate. It is always resolved here from
     * system_settings so the two groups cannot be billed at the same rate by a
     * stale or hand edited request.
     */
    public function storeTransaction(Request $request): JsonResponse
    {
        $group = $request->input('group', Item::GROUP_JEWELRY);
        $isJewelry = $group === Item::GROUP_JEWELRY;

        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,customers_id'],
            'group' => ['required', Rule::in([Item::GROUP_JEWELRY, Item::GROUP_WATCH_PHONE, Item::GROUP_BULKY])],
            // Each group accepts its own item types, so the allowed list depends
            // on the group that was submitted.
            'category' => ['required', Rule::in(Item::categoriesForGroup($group))],
            'description' => ['required', 'string'],
            // Brand or model identifies a watch, cellphone, or bulky item the
            // way karat and weight identify jewelry.
            'brand_model' => [$isJewelry ? 'nullable' : 'required', 'string'],
            'karat' => [$isJewelry ? 'required' : 'nullable', 'in:10k,14k,18k,21k,24k'],
            'weight_grams' => [$isJewelry ? 'required' : 'nullable', 'numeric', 'gt:0'],
            'condition' => ['required', 'in:good,fair,damaged'],
            // Non jewelry has no gold price to compute from, so the appraising
            // staff must type the value in.
            'appraised_value' => [$isJewelry ? 'nullable' : 'required', 'numeric', 'gt:0'],
            'photo_path' => ['nullable', 'string'],
            'adjusted_value' => ['nullable', 'numeric'],
            'adjustment_reason' => ['required_with:adjusted_value', 'nullable', 'string'],
            'loan_amount' => ['required', 'numeric', 'gt:0'],
            'loan_to_value_percent' => ['required', 'numeric'],
            'due_date' => ['required', 'date'],
            'grace_period_days' => ['required', 'integer', 'min:0'],
        ]);

        // Only jewelry is worth what its gold content is worth today. For the
        // other two groups the staff entered value is the item's value.
        if ($isJewelry) {
            $price = GoldPrice::latest('price_date')->firstOrFail()->price_per_gram;
            $purity = Item::KARAT_PURITY[$data['karat']];
            $appraisedValue = $data['weight_grams'] * $purity * $price;
        } else {
            $appraisedValue = $data['appraised_value'];
        }

        // interest_rate is stored as a fraction per month, matching how redeem()
        // multiplies it against the loan amount. The setting holds percent.
        $interestRate = Item::interestRatePercentForGroup($group) / 100;

        $item = Item::create([...$data, 'staff_id' => $request->user()->users_id, 'appraised_value' => $appraisedValue, 'status' => 'active']);
        $transaction = Transaction::create(['item_id' => $item->items_id, 'customer_id' => $data['customer_id'], 'ticket_number' => 'PT-'.now()->format('YmdHis').random_int(10, 99), 'loan_amount' => $data['loan_amount'], 'interest_rate' => $interestRate, 'loan_to_value_percent' => $data['loan_to_value_percent'], 'due_date' => $data['due_date'], 'grace_period_days' => $data['grace_period_days'], 'status' => 'active']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Created pawn ticket', 'ticket_number' => $transaction->ticket_number, 'reason' => $data['adjustment_reason'] ?? null]);
        return response()->json($transaction->load('item', 'customer'), 201);
    }

    public function redeem(Request $request, Transaction $transaction): JsonResponse
    {
        abort_unless($transaction->status === 'active' && $request->user()->role === 'staff', 422, 'Transaction cannot be redeemed.');
        $interest = $transaction->interestDue();
        $totalPayable = $transaction->totalPayable();
        $transaction->update(['status' => 'redeemed', 'redeemed_at' => now()]);
        $transaction->item()->update(['status' => 'redeemed']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Processed redemption', 'ticket_number' => $transaction->ticket_number]);
        return response()->json(['transaction' => $transaction->fresh()->load('item', 'customer'), 'principal' => $transaction->loan_amount, 'interest' => $interest, 'total_payable' => $totalPayable, 'receipt_number' => 'RC-'.now()->format('YmdHis')]);
    }

    public function goldPrices(): JsonResponse { return response()->json(GoldPrice::orderBy('price_date')->get()); }
    public function storeGoldPrice(Request $request): JsonResponse { $data = $request->validate(['price_per_gram' => ['required', 'numeric', 'gt:0']]); return response()->json(GoldPrice::updateOrCreate(['price_date' => today()], ['price_per_gram' => $data['price_per_gram'], 'source' => 'manual'])); }
    /**
     * Trend reading for the redeem or renew timing hint. Read only, so any
     * signed in role can call it.
     */
    public function goldPriceSuggestion(GoldPriceService $goldPriceService): JsonResponse
    {
        return response()->json($goldPriceService->getRedemptionSuggestion());
    }

    public function riskAlerts(Request $request): JsonResponse { $query = RiskAlert::with('item.customer')->latest('triggered_at'); if ($request->user()->role === 'customer') $query->whereHas('item', fn ($q) => $q->where('customer_id', optional($request->user()->customerProfile)->customers_id)); return response()->json($query->get()); }

    /**
     * Everything a portal home screen shows, in one call.
     *
     * A customer only ever sees their own items and loans. Staff and admin see
     * the whole shop. "Revenue" here means money actually collected on
     * redemption: principal plus the interest that had accrued that day.
     */
    public function dashboard(Request $request, string $role): JsonResponse
    {
        abort_unless($request->user()->role === $role || $request->user()->role === 'admin', 403);

        $customerId = optional($request->user()->customerProfile)->customers_id;
        $ownRows = $role === 'customer';

        $items = Item::with('customer')
            ->when($ownRows, fn ($query) => $query->where('customer_id', $customerId))
            ->get();
        $transactions = Transaction::with(['item', 'customer'])
            ->when($ownRows, fn ($query) => $query->where('customer_id', $customerId))
            ->get();

        $redeemed = $transactions->where('status', 'redeemed')->filter(fn ($transaction) => $transaction->redeemed_at);
        $revenueToday = $redeemed
            ->filter(fn ($transaction) => $transaction->redeemed_at->isSameDay(now()))
            ->sum(fn ($transaction) => $transaction->totalPayable());

        // One bucket per day for the last week, oldest first, so a chart can
        // render the series without filling the gaps itself.
        $revenueTrend = collect(range(6, 0))->map(function (int $daysAgo) use ($redeemed) {
            $day = today()->subDays($daysAgo);

            return [
                'date' => $day->toDateString(),
                'revenue' => round($redeemed->filter(fn ($transaction) => $transaction->redeemed_at->isSameDay($day))->sum(fn ($transaction) => $transaction->totalPayable()), 2),
            ];
        })->values();

        $openRiskAlerts = RiskAlert::where('resolved', false)
            ->when($ownRows, fn ($query) => $query->whereHas('item', fn ($itemQuery) => $itemQuery->where('customer_id', $customerId)))
            ->count();

        $activeTransactions = $transactions->where('status', 'active');

        return response()->json([
            'items' => $items,
            'transactions' => $transactions,
            'risk_alerts' => $openRiskAlerts,
            'gold_prices' => GoldPrice::orderByDesc('price_date')->limit(30)->get(),
            'revenue' => round($redeemed->sum(fn ($transaction) => $transaction->totalPayable()), 2),
            'stats' => [
                'active_loans' => $activeTransactions->count(),
                'overdue_loans' => $activeTransactions->filter(fn ($transaction) => $transaction->days_until_due < 0)->count(),
                'total_customers' => $ownRows ? 1 : Customer::count(),
                'open_risk_alerts' => $openRiskAlerts,
                'loan_portfolio' => round($activeTransactions->sum(fn ($transaction) => (float) $transaction->loan_amount), 2),
                'amount_due' => round($activeTransactions->sum(fn ($transaction) => $transaction->totalPayable()), 2),
                'transactions_today' => $transactions->filter(fn ($transaction) => $transaction->created_at->isSameDay(now()))->count(),
                'revenue_today' => round($revenueToday, 2),
            ],
            'revenue_trend' => $revenueTrend,
        ]);
    }

    /**
     * Recorded staff and system actions, newest first. Feeds the admin
     * "Recent activity" panel.
     */
    public function auditLogs(Request $request): JsonResponse
    {
        $limit = min(200, max(1, (int) $request->query('limit', 50)));

        return response()->json(AuditLog::with('user:users_id,name,role')->latest('audit_logs_id')->limit($limit)->get());
    }

    /**
     * Notifications built from live data rather than stored rows.
     *
     * There is no notifications table: everything worth telling someone about
     * already sits in the loans and the risk alerts. Building the list on read
     * keeps it true without a delivery job that could fall behind.
     */
    public function notifications(Request $request): JsonResponse
    {
        $user = $request->user();
        $ownRows = $user->role === 'customer';
        $customerId = optional($user->customerProfile)->customers_id;
        $dueSoonWindowDays = 7;

        $notifications = collect();

        Transaction::with(['item', 'customer'])
            ->where('status', 'active')
            ->when($ownRows, fn ($query) => $query->where('customer_id', $customerId))
            ->whereDate('due_date', '<=', today()->addDays($dueSoonWindowDays))
            ->orderBy('due_date')
            ->get()
            ->each(function (Transaction $transaction) use ($notifications) {
                $days = $transaction->days_until_due;
                $label = $transaction->item?->description ?: $transaction->ticket_number;

                $notifications->push([
                    'id' => 'due-'.$transaction->transactions_id,
                    'type' => $days < 0 ? 'overdue' : 'due',
                    'title' => $days < 0 ? 'Loan is past due' : 'Payment due soon',
                    'message' => $days < 0
                        ? $label.' is '.abs($days).' day(s) past its due date.'
                        : $label.' is due in '.$days.' day(s).',
                    'reference' => $transaction->ticket_number,
                    'created_at' => $transaction->updated_at,
                ]);
            });

        RiskAlert::with('item.customer')
            ->where('resolved', false)
            ->when($ownRows, fn ($query) => $query->whereHas('item', fn ($itemQuery) => $itemQuery->where('customer_id', $customerId)))
            ->latest('triggered_at')
            ->get()
            ->each(function (RiskAlert $alert) use ($notifications) {
                $label = $alert->item?->description ?: 'Item #'.$alert->item_id;

                $notifications->push([
                    'id' => 'risk-'.$alert->risk_alerts_id,
                    'type' => 'risk',
                    'title' => $alert->risk_level === 'high' ? 'High risk item needs review' : 'Item value within the safety margin',
                    'message' => $label.' is now worth '.number_format((float) $alert->current_value, 2).' against a loan of '.number_format((float) $alert->loan_amount, 2).'.',
                    'reference' => $label,
                    'created_at' => $alert->triggered_at,
                ]);
            });

        return response()->json($notifications->sortByDesc('created_at')->values());
    }

    /**
     * The signed in account, with the customer profile when there is one.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $user->only(['users_id', 'name', 'email', 'role', 'contact_number', 'status', 'is_activated']),
            'customer' => $user->customerProfile,
        ]);
    }

    /**
     * Update the signed in account's own details. Email and role are fixed:
     * only an admin changes those, through user management.
     */
    public function updateMe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $user->update(['name' => $data['name'], 'contact_number' => $data['contact_number'] ?? $user->contact_number]);

        if ($profile = $user->customerProfile) {
            $profile->update(array_filter([
                'name' => $data['name'],
                'contact_number' => $data['contact_number'] ?? null,
                'address' => $data['address'] ?? null,
            ], fn ($value) => $value !== null));
        }

        return $this->me($request);
    }

    /**
     * Headline numbers for the admin Reports screen, all computed from the
     * live tables so nothing on that screen is a fixed figure.
     */
    public function reportSummary(): JsonResponse
    {
        $monthStart = now()->startOfMonth();
        $previousMonthStart = now()->subMonthNoOverflow()->startOfMonth();

        $volumeThisMonth = (float) Transaction::where('created_at', '>=', $monthStart)->sum('loan_amount');
        $volumePreviousMonth = (float) Transaction::whereBetween('created_at', [$previousMonthStart, $monthStart])->sum('loan_amount');

        $closed = Transaction::whereIn('status', ['redeemed', 'forfeited'])->count();
        $redeemedCount = Transaction::where('status', 'redeemed')->count();

        $activeTransactions = Transaction::where('status', 'active')->get();
        $collected = Transaction::where('status', 'redeemed')->get()->sum(fn (Transaction $transaction) => $transaction->totalPayable());

        return response()->json([
            'monthly_loan_volume' => round($volumeThisMonth, 2),
            'monthly_loan_volume_change_percent' => $volumePreviousMonth > 0
                ? round((($volumeThisMonth - $volumePreviousMonth) / $volumePreviousMonth) * 100, 1)
                : null,
            'redemption_rate_percent' => $closed > 0 ? round(($redeemedCount / $closed) * 100, 1) : null,
            'average_loan' => $activeTransactions->count() > 0
                ? round($activeTransactions->avg(fn (Transaction $transaction) => (float) $transaction->loan_amount), 2)
                : 0.0,
            'active_loans' => $activeTransactions->count(),
            'open_risk_alerts' => RiskAlert::where('resolved', false)->count(),
            'high_risk_alerts' => RiskAlert::where('resolved', false)->where('risk_level', 'high')->count(),
            'total_collected' => round($collected, 2),
            'inventory_value' => round((float) Item::whereIn('status', ['active', 'overdue'])->sum('appraised_value'), 2),
            'items_for_sale_value' => round((float) Item::where('status', 'for_sale')->sum('sale_price'), 2),
        ]);
    }

    /**
     * How well the gold price forecast has actually done.
     *
     * Each row stores the price observed that day and the price predicted for
     * the next day. Pairing a day's prediction with the following day's
     * observed price gives the error the forecast really made. Accuracy is
     * 100 percent minus the mean absolute percentage error over those pairs.
     */
    public function modelMetrics(): JsonResponse
    {
        $prices = GoldPrice::orderBy('price_date')->get(['price_date', 'price_per_gram', 'predicted_next_price']);

        $errors = [];
        foreach ($prices as $index => $price) {
            $next = $prices[$index + 1] ?? null;
            if (!$next || !$price->predicted_next_price || (float) $next->price_per_gram <= 0) {
                continue;
            }
            $errors[] = abs((float) $next->price_per_gram - (float) $price->predicted_next_price) / (float) $next->price_per_gram;
        }

        $sampleSize = count($errors);
        $meanAbsolutePercentError = $sampleSize > 0 ? (array_sum($errors) / $sampleSize) * 100 : null;

        return response()->json([
            'sample_size' => $sampleSize,
            'mean_absolute_percent_error' => $meanAbsolutePercentError !== null ? round($meanAbsolutePercentError, 2) : null,
            'prediction_accuracy_percent' => $meanAbsolutePercentError !== null ? round(max(0, 100 - $meanAbsolutePercentError), 2) : null,
            'window_size' => GoldPriceService::WINDOW_SIZE,
            'recorded_days' => $prices->count(),
            'latest_prediction' => $prices->last()?->predicted_next_price,
            'latest_price' => $prices->last()?->price_per_gram,
            'latest_price_date' => $prices->last()?->price_date?->toDateString(),
        ]);
    }

    public function settings(): JsonResponse { return response()->json(SystemSetting::orderBy('setting_key')->get()); }
    public function saveSetting(Request $request): JsonResponse { $data = $request->validate(['setting_key' => ['required', 'string'], 'setting_value' => ['required', 'string']]); return response()->json(SystemSetting::updateOrCreate(['setting_key' => $data['setting_key']], ['setting_value' => $data['setting_value']])); }

    /**
     * Open unusual activity flags, newest first.
     *
     * These come from a transaction frequency heuristic, not from a fraud
     * decision. The list is for review, so staff and admin see it and a
     * customer never does.
     */
    public function activityFlags(Request $request): JsonResponse
    {
        $query = ActivityFlag::with('customer:customers_id,name,contact_number')->latest('flagged_at');

        if (!$request->boolean('include_resolved')) {
            $query->where('resolved', false);
        }

        return response()->json($query->get());
    }

    /**
     * Mark a flag reviewed. The row stays for the record; only its state moves.
     */
    public function resolveActivityFlag(Request $request, ActivityFlag $activityFlag): JsonResponse
    {
        abort_if($activityFlag->resolved, 422, 'This flag is already marked reviewed.');

        $activityFlag->update(['resolved' => true]);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Marked unusual activity flag reviewed', 'reason' => $activityFlag->reason]);

        return response()->json($activityFlag->fresh()->load('customer:customers_id,name,contact_number'));
    }

    public function markForSale(Request $request, Item $item): JsonResponse
    {
        abort_unless($item->status === 'forfeited', 422, 'Only forfeited items can be listed for sale.');
        $data = $request->validate(['sale_price' => ['required', 'numeric', 'gt:0']]);
        $item->update(['sale_price' => $data['sale_price'], 'status' => 'for_sale']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Listed forfeited item for sale']);
        return response()->json($item->fresh());
    }

    public function markSold(Request $request, Item $item): JsonResponse
    {
        abort_unless($item->status === 'for_sale', 422, 'Only listed items can be sold.');
        $item->update(['status' => 'sold']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Marked resale item sold']);
        return response()->json($item->fresh());
    }
}