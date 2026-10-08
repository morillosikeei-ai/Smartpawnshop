<?php

namespace App\Http\Controllers;

use App\Models\ActivityFlag;
use App\Models\Customer;
use App\Models\CustomerAccessToken;
use App\Models\AuditLog;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\Notification;
use App\Models\RenewalRequest;
use App\Models\RiskAlert;
use App\Models\SilverPrice;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Services\ChatAssistantService;
use App\Services\GoldPriceService;
use App\Services\MailDelivery;
use App\Services\NotificationService;
use App\Mail\ActivationMail;
use App\Mail\PasswordResetMail;
use App\Support\FrontendUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
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

    /** Most rows one staff report breakdown returns. The tiles carry the counts; this is the reading list. */
    private const REPORT_BREAKDOWN_LIMIT = 100;

    /** Longest single item photo data URL accepted, in characters (about 225 KB of JPEG). */
    private const ITEM_PHOTO_MAX_CHARS = 300000;

    /**
     * Longest GCash receipt data URL accepted, in characters. A screenshot only
     * has to be readable, so it is held to the same size as one item photo.
     */
    private const RECEIPT_MAX_CHARS = 300000;

    /** Longest all item photos may be together, kept under MySQL's 1 MB packet. */
    private const ITEM_PHOTOS_TOTAL_MAX_CHARS = 850000;

    /** Most notification rows the bell asks for in one call. */
    private const NOTIFICATION_LIST_LIMIT = 50;

    /**
     * Email a password reset link to the account that owns the address.
     *
     * The reply never says whether the address is registered. Telling an
     * anonymous caller which emails have accounts would hand them a list of
     * the shop's customers, so every request gets the same answer.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        // No DNS check on the address: a slow or offline DNS lookup rejected
        // real addresses at random, which looked like the email never sent.
        $data = $request->validate(['email' => ['required', 'email:rfc']]);
        $email = strtolower(trim($data['email']));

        $genericResponse = response()->json([
            'message' => 'If that email address has an account, a password reset link is on its way. It can take a minute to arrive, so check your spam or promotions folder too.',
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
        // addresses have accounts. MailDelivery retries and logs instead, so a
        // failed reset is findable in storage/logs rather than silent.
        MailDelivery::send(
            $user->email,
            new PasswordResetMail($token, $user->name, self::PASSWORD_RESET_EXPIRY_MINUTES),
            'Password reset',
            ['user_id' => $user->users_id]
        );

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
     * How many wrong email addresses one QR code accepts before it locks, and
     * how long the lock lasts.
     */
    private const QR_MAX_FAILED_ATTEMPTS = 5;
    private const QR_LOCK_MINUTES = 15;

    /**
     * The scan URL for the QR code printed on a customer's pawn ticket.
     *
     * This is a backup way into the portal for a customer who never received
     * the activation or password reset email. It replaces neither: both still
     * work exactly as before.
     *
     * The URL carries a random token and nothing else, so a ticket that is
     * lost or photographed gives away no name, email, or loan. The token on
     * its own opens nothing either, because the page it lands on asks for the
     * registered email address before any session is issued.
     */
    public function customerAccessQr(Request $request, Customer $customer): JsonResponse
    {
        $record = CustomerAccessToken::where('customer_id', $customer->customers_id)
            ->whereNull('revoked_at')
            ->latest('customer_access_tokens_id')
            ->first();

        $plain = null;

        if ($record) {
            try {
                // The same code the customer already has, so reprinting a
                // ticket does not silently kill the QR on the first one.
                $plain = Crypt::decryptString($record->token_ciphertext);
            } catch (Throwable $exception) {
                // The row cannot be read back under the current application
                // key, so it can never be printed again. Retire it rather than
                // print a QR code that opens nothing.
                Log::warning('A customer QR access token could not be decrypted. Issuing a new one.', [
                    'customer_id' => $customer->customers_id,
                    'error' => $exception->getMessage(),
                ]);

                $record->forceFill(['revoked_at' => now()])->save();
                $record = null;
            }
        }

        if (!$record) {
            $plain = Str::random(64);

            CustomerAccessToken::create([
                'customer_id' => $customer->customers_id,
                'token_hash' => hash('sha256', $plain),
                'token_ciphertext' => Crypt::encryptString($plain),
            ]);
        }

        // A phone reads this code, so the address has to be one the phone can
        // open. FrontendUrl::forDevice skips every loopback address for that
        // reason; when only a loopback one exists the ticket still prints and
        // network_ready tells the staff screen to say what to fix.
        $base = FrontendUrl::forDevice();

        return response()->json([
            'url' => rtrim($base['url'], '/').'/portal-access?code='.$plain,
            'network_ready' => FrontendUrl::isReachableByDevice($base['url']),
            'address_source' => $base['source'],
        ]);
    }

    /**
     * Whether a scanned code is one the portal still accepts.
     *
     * The reply is a bare true or false. It names no customer, because the
     * caller has done nothing yet but scan a piece of paper.
     */
    public function qrAccessCheck(string $code): JsonResponse
    {
        $record = $this->qrAccessRecord($code);

        return response()->json(['valid' => $record !== null && !$record->isLocked()]);
    }

    /**
     * Open the portal for a scanned QR code, once the email address matches.
     *
     * The code says which customer is being claimed; the email address proves
     * it. Only both together issue a session, and the password is neither
     * asked for nor touched, so the ordinary login and the Gmail password
     * reset keep working unchanged.
     */
    public function qrAccessVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
            'email' => ['required', 'email'],
        ]);

        $record = $this->qrAccessRecord($data['code']);
        $invalidCode = 'This QR code is not valid. Ask the shop for a new pawn ticket.';

        abort_unless($record, 422, $invalidCode);

        if ($record->isLocked()) {
            $minutes = max(1, (int) ceil(now()->diffInSeconds($record->locked_until, false) / 60));

            abort(429, 'Too many incorrect email addresses have been entered for this QR code. Try again in '.$minutes.' minutes.');
        }

        $user = $record->customer?->user;

        // A customer row without an active customer account is not something
        // the scanner should be able to tell apart from an unknown code.
        abort_unless($user && $user->status === 'active' && $user->role === 'customer', 422, $invalidCode);

        if (!hash_equals(strtolower($user->email), strtolower(trim($data['email'])))) {
            $failed = $record->failed_attempts + 1;
            $locked = $failed >= self::QR_MAX_FAILED_ATTEMPTS;

            $record->forceFill([
                'failed_attempts' => $locked ? 0 : $failed,
                'locked_until' => $locked ? now()->addMinutes(self::QR_LOCK_MINUTES) : $record->locked_until,
            ])->save();

            Log::warning('QR portal access refused: the email address did not match the ticket.', [
                'customer_id' => $record->customer_id,
                'ip' => $request->ip(),
                'locked' => $locked,
            ]);

            abort(422, 'That email address does not match this pawn ticket. Enter the address the shop registered for you.');
        }

        $record->forceFill([
            'failed_attempts' => 0,
            'locked_until' => null,
            'last_used_at' => now(),
        ])->save();

        Log::info('QR portal access granted.', [
            'customer_id' => $record->customer_id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'token' => $user->createToken('qr-portal-access')->plainTextToken,
            'role' => $user->role,
            'user' => $user,
        ]);
    }

    /**
     * The live row a scanned code belongs to, or null.
     *
     * Only the hash of the code is stored, so the lookup hashes what was
     * scanned rather than searching for the code itself.
     */
    private function qrAccessRecord(string $code): ?CustomerAccessToken
    {
        $code = trim($code);

        if ($code === '') {
            return null;
        }

        return CustomerAccessToken::with('customer.user')
            ->where('token_hash', hash('sha256', $code))
            ->whereNull('revoked_at')
            ->first();
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

        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => "Created staff account {$user->email}"]);

        return response()->json($user->only(['users_id', 'name', 'email', 'role', 'status']), 201);
    }

    /**
     * Updates one staff or customer account.
     *
     * The admin management modal is limited to changing the account status and,
     * optionally, resetting the password. Name and email must remain locked.
     */
    public function updateUser(Request $request, User $user): JsonResponse
    {
        if (!in_array($user->role, ['staff', 'customer'], true)) {
            return response()->json(['message' => 'Only staff and customer accounts can be updated.'], 403);
        }

        $data = $request->validate([
            'password' => ['nullable', 'string', 'min:8'],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
        ]);

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $user->fill($data)->save();

        $changes = array_filter([
            isset($data['status']) ? "status {$data['status']}" : null,
            isset($data['password']) ? 'password reset' : null,
        ]);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => "Updated {$user->role} account {$user->email}", 'reason' => implode(', ', $changes) ?: null]);

        return response()->json($user->only(['users_id', 'name', 'email', 'role', 'status']));
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
            // The customer is registered either way. Losing the whole
            // registration because the mail server hiccuped would be worse
            // than an activation link the staff can resend.
            $activationEmailSent = MailDelivery::send(
                $user->email,
                new ActivationMail($activationToken, $user->name),
                'Activation',
                ['user_id' => $user->users_id]
            );

            $customer->setAttribute('activation_email_sent', $activationEmailSent);

            return $customer->load('user');
        });

        return response()->json($customer, 201);
    }

    public function items(Request $request): JsonResponse
    {
        $query = Item::with(['customer', 'transactions.renewalRequests', 'valueLogs', 'riskAlerts'])->latest('items_id');
        if ($request->user()->role === 'customer') $query->where('customer_id', optional($request->user()->customerProfile)->customers_id);
        return response()->json($query->get());
    }

    public function forSale(): JsonResponse
    {
        return response()->json(Item::where('status', 'for_sale')->get(['items_id', 'group', 'category', 'custom_item_type', 'description', 'brand_model', 'photo_path', 'sale_price']));
    }

    public function transactions(Request $request): JsonResponse
    {
        $query = Transaction::with(['item', 'customer', 'renewalRequests', 'lockHolder:users_id,name'])->latest('transactions_id');
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
    public function storeTransaction(Request $request, NotificationService $notifications): JsonResponse
    {
        $group = $request->input('group', Item::GROUP_JEWELRY);
        $isJewelry = $group === Item::GROUP_JEWELRY;
        // Jewelry is gold unless the form says silver. Silver purity is a
        // fineness (925, 999) rather than a karat, so the accepted values follow
        // the metal.
        $isSilver = $isJewelry && $request->input('metal_type') === Item::METAL_SILVER;

        // Silver purity goes in fineness; karat is for gold only. A client that
        // still sends the silver fineness as karat is read the same way, so the
        // silver value never reaches the karat column.
        if ($isSilver && ! $request->filled('fineness') && array_key_exists((string) $request->input('karat'), Item::SILVER_PURITY)) {
            $request->merge(['fineness' => (string) $request->input('karat')]);
        }
        if ($isSilver) {
            $request->merge(['karat' => null]);
        }

        // item_type is the name the staff form uses for the item type. The
        // column it is stored in is category, so one fills in for the other
        // when only one of the two was sent.
        if (! $request->filled('category') && $request->filled('item_type')) {
            $request->merge(['category' => $request->input('item_type')]);
        }

        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,customers_id'],
            'group' => ['required', Rule::in([Item::GROUP_JEWELRY, Item::GROUP_WATCH_PHONE, Item::GROUP_BULKY])],
            // The staff form suggests each group's item types but also accepts
            // a custom type typed in by the staff, so any non-empty text is a
            // valid item type. Suggested types still arrive as their key.
            'category' => ['required', 'string', 'max:100'],
            // Kept for older clients that still send the catch-all "others"
            // with the exact type alongside it. No longer required.
            'custom_item_type' => ['nullable', 'string', 'max:100'],
            'description' => ['required', 'string'],
            // Brand or model identifies a watch, cellphone, or bulky item the
            // way karat and weight identify jewelry.
            'brand_model' => [$isJewelry ? 'nullable' : 'required', 'string'],
            'metal_type' => ['nullable', Rule::in([Item::METAL_GOLD, Item::METAL_SILVER])],
            'karat' => [$isJewelry && ! $isSilver ? 'required' : 'nullable', Rule::in(array_map('strval', array_keys(Item::KARAT_PURITY)))],
            'fineness' => [$isSilver ? 'required' : 'nullable', Rule::in(array_map('strval', array_keys(Item::SILVER_PURITY)))],
            'weight_grams' => [$isJewelry ? 'required' : 'nullable', 'numeric', 'gt:0'],
            // Suggested conditions arrive as good, fair, or damaged; the staff
            // may also type a custom condition, which is stored as typed.
            'condition' => ['required', 'string', 'max:100'],
            // Non jewelry has no gold price to compute from, so the appraising
            // staff must type the value in.
            'appraised_value' => [$isJewelry ? 'nullable' : 'required', 'numeric', 'gt:0'],
            // Jewelry may carry a gemstone or diamond. Its value is the staff's
            // own estimate and is required once the box is ticked; the details
            // are a note for reference only.
            'has_gemstone' => ['nullable', 'boolean'],
            'gemstone_value' => ['nullable', 'required_if_accepted:has_gemstone', 'numeric', 'gt:0'],
            // One of Item::GEMSTONE_TYPES, or any other stone the staff typed.
            'gemstone_type' => ['nullable', 'string', 'max:50'],
            'gemstone_details' => ['nullable', 'string', 'max:255'],
            'photo_path' => ['nullable', 'string'],
            // Item photos from intake, each a downscaled JPEG data URL, stored
            // the same way as the customer's valid ID photo.
            'photos' => ['nullable', 'array', 'max:'.Item::MAX_PHOTOS],
            'photos.*' => ['string', 'starts_with:data:image/', 'max:'.self::ITEM_PHOTO_MAX_CHARS],
            // The staff has the final say on value and loan terms. The computed
            // value is only a reference, so no reason is needed to change it and
            // the loan is not forced to match a formula.
            'adjusted_value' => ['nullable', 'numeric', 'gt:0'],
            'adjustment_reason' => ['nullable', 'string'],
            'loan_amount' => ['required', 'numeric', 'gt:0'],
            'loan_to_value_percent' => ['required', 'numeric', 'gt:0'],
            'due_date' => ['required', 'date'],
            'grace_period_days' => ['required', 'integer', 'min:0'],
        ]);

        // Only jewelry is worth what its metal content is worth today: gold from
        // gold_prices, silver from silver_prices. For the other two groups the
        // staff entered value is the item's value.
        $data['metal_type'] = $isSilver ? Item::METAL_SILVER : Item::METAL_GOLD;
        // Each metal keeps only its own purity column filled.
        $data['karat'] = $isJewelry && ! $isSilver ? $data['karat'] : null;
        $data['fineness'] = $isSilver ? $data['fineness'] : null;
        if ($isJewelry) {
            $price = ($isSilver ? SilverPrice::query() : GoldPrice::query())->latest('price_date')->firstOrFail()->price_per_gram;
            $purity = $isSilver ? Item::SILVER_PURITY[$data['fineness']] : Item::KARAT_PURITY[$data['karat']];
            $appraisedValue = $data['weight_grams'] * $purity * $price;
        } else {
            $appraisedValue = $data['appraised_value'];
        }

        // Only jewelry carries a gemstone. For the other groups, and for jewelry
        // without one, the gemstone fields are stored empty.
        $hasGemstone = $isJewelry && ! empty($data['has_gemstone']);
        $data['has_gemstone'] = $isJewelry ? $hasGemstone : null;
        $data['gemstone_value'] = $hasGemstone ? $data['gemstone_value'] : null;
        $data['gemstone_type'] = $hasGemstone && filled($data['gemstone_type'] ?? null) ? trim($data['gemstone_type']) : null;
        $data['gemstone_details'] = $hasGemstone && filled($data['gemstone_details'] ?? null) ? trim($data['gemstone_details']) : null;
        $gemstoneValue = $hasGemstone ? (float) $data['gemstone_value'] : 0.0;

        // The value the staff settled on, when they changed it, is the one the
        // loan is lent against. Otherwise it is the gold (or staff) value plus
        // any gemstone value. The loan can never be more than that.
        $finalValue = (float) ($data['adjusted_value'] ?? ($appraisedValue + $gemstoneValue));
        if ((float) $data['loan_amount'] > $finalValue) {
            throw ValidationException::withMessages([
                'loan_amount' => 'Pawn amount cannot exceed the final appraised value.',
            ]);
        }

        // interest_rate is stored as a fraction per month, matching how redeem()
        // multiplies it against the loan amount. The setting holds percent.
        $interestRate = Item::interestRatePercentForGroup($group) / 100;

        // The photos go into photo_path as a JSON list. The whole insert has to
        // fit in one MySQL packet (1 MB on a stock XAMPP install), so the
        // photos together are capped below that with a message staff can act on.
        $photos = array_values($data['photos'] ?? []);
        unset($data['photos']);
        if ($photos !== []) {
            if (array_sum(array_map('strlen', $photos)) > self::ITEM_PHOTOS_TOTAL_MAX_CHARS) {
                throw ValidationException::withMessages([
                    'photos' => 'The item photos are too large together. Remove a photo or retake it and try again.',
                ]);
            }
            $data['photo_path'] = json_encode($photos, JSON_UNESCAPED_SLASHES);
        }

        $item = Item::create([...$data, 'staff_id' => $request->user()->users_id, 'appraised_value' => $appraisedValue, 'status' => 'active']);
        // Two tickets opened in the same second can draw the same two digits,
        // and ticket_number is unique, so draw again until it is free.
        do {
            $ticketNumber = 'PT-'.now()->format('YmdHis').random_int(10, 99);
        } while (Transaction::where('ticket_number', $ticketNumber)->exists());
        $transaction = Transaction::create(['item_id' => $item->items_id, 'customer_id' => $data['customer_id'], 'ticket_number' => $ticketNumber, 'loan_amount' => $data['loan_amount'], 'interest_rate' => $interestRate, 'loan_to_value_percent' => $data['loan_to_value_percent'], 'due_date' => $data['due_date'], 'grace_period_days' => $data['grace_period_days'], 'status' => 'active']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Created pawn ticket', 'ticket_number' => $transaction->ticket_number, 'reason' => $data['adjustment_reason'] ?? null]);
        $notifications->itemRecorded($item->load('customer'), $transaction);
        return response()->json($transaction->load('item', 'customer'), 201);
    }

    public function redeem(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'payment_method' => ['nullable', 'string', 'max:50'],
            'payment_reference' => ['nullable', 'string', 'max:50'],
            'amount_collected' => ['nullable', 'numeric', 'min:0'],
            'cash_received' => ['nullable', 'numeric', 'min:0'],
        ]);

        abort_unless($transaction->status === 'active' && $request->user()->role === 'staff', 422, 'Pawn transaction cannot be redeemed.');
        $interest = $transaction->interestDue();
        $totalPayable = $transaction->totalPayable();

        $method = trim($data['payment_method'] ?? '') ?: 'Cash';
        $reference = trim($data['payment_reference'] ?? '');
        $isCash = strcasecmp($method, 'Cash') === 0;

        // Money that did not cross the counter leaves a reference behind, and
        // that reference is the shop's only record that it arrived.
        if (! $isCash && $reference === '') {
            throw ValidationException::withMessages([
                'payment_reference' => 'A '.$method.' payment needs its reference number.',
            ]);
        }

        $collected = isset($data['amount_collected']) ? (float) $data['amount_collected'] : $totalPayable;
        $cashReceived = $isCash && isset($data['cash_received']) ? (float) $data['cash_received'] : null;

        // Change cannot come out of money that was never handed over.
        if ($cashReceived !== null && $cashReceived + 0.001 < $collected) {
            throw ValidationException::withMessages([
                'cash_received' => 'The cash received is less than the amount being collected.',
            ]);
        }
        // The code was proof of turning up to pay. That is done, so it is
        // cleared here rather than left to run out on its own.
        $transaction->update([
            'status' => 'redeemed',
            'redeemed_at' => now(),
            'redeemed_by' => $request->user()->users_id,
            'pickup_code' => null,
            'pickup_code_expires_at' => null,
            // The payment is done, so the claim on it ends here too.
            'locked_by' => null,
            'locked_at' => null,
            'payment_method' => $method,
            'payment_reference' => $reference ?: null,
            'amount_collected' => $collected,
            'cash_received' => $cashReceived,
        ]);
        $transaction->item()->update(['status' => 'redeemed']);
        AuditLog::create([
            'user_id' => $request->user()->users_id,
            'action' => 'Processed redemption',
            'ticket_number' => $transaction->ticket_number,
            'reason' => $method.' '.number_format($collected, 2).($reference !== '' ? ' - ref '.$reference : ''),
        ]);
        $notifications->redemptionCompleted($transaction->load('item', 'customer'));
        return response()->json(['transaction' => $transaction->fresh()->load('item', 'customer'), 'principal' => $transaction->loan_amount, 'interest' => $interest, 'total_payable' => $totalPayable, 'receipt_number' => 'RC-'.now()->format('YmdHis')]);
    }

    /**
     * Rough gold or silver value for a visitor on the landing page. No sign in
     * needed.
     *
     * Uses the same formula as a jewelry pawn ticket in storeTransaction():
     * weight in grams x purity x the latest recorded price per gram. Gold reads
     * karat purity and gold_prices; silver reads fineness (925, 999) and
     * silver_prices. metal_type defaults to gold, so older clients that send
     * only a karat are unchanged. Nothing is stored, so the reply is only ever
     * an estimate.
     */
    public function chat(Request $request, ChatAssistantService $assistant): JsonResponse
    {
        $data = $request->validate([
            'messages' => ['required', 'array', 'min:1', 'max:30'],
            'messages.*.role' => ['required', Rule::in(['user', 'assistant'])],
            'messages.*.content' => ['required', 'string', 'max:1000'],
        ]);

        $messages = array_map(fn (array $m) => ['role' => $m['role'], 'content' => $m['content']], $data['messages']);
        abort_unless(end($messages)['role'] === 'user', 422, 'The last message must be from the customer.');

        // A null reply tells the chat to use its offline keyword answer.
        return response()->json(['reply' => $assistant->reply($messages)]);
    }

    public function estimate(Request $request): JsonResponse
    {
        $isSilver = $request->input('metal_type') === Item::METAL_SILVER;
        $purities = $isSilver ? Item::SILVER_PURITY : Item::KARAT_PURITY;

        $data = $request->validate([
            'metal_type' => ['nullable', Rule::in([Item::METAL_GOLD, Item::METAL_SILVER])],
            'karat' => ['required', Rule::in(array_map('strval', array_keys($purities)))],
            'weight_grams' => ['required', 'numeric', 'gt:0', 'max:10000'],
        ]);

        $metal = $isSilver ? 'silver' : 'gold';
        $price = ($isSilver ? SilverPrice::query() : GoldPrice::query())->latest('price_date')->first();
        abort_unless($price, 503, "Today's {$metal} price is not available yet. Please visit the shop for an appraisal.");

        $pricePerGram = (float) $price->price_per_gram;
        $purity = $purities[$data['karat']];

        return response()->json([
            'metal_type' => $metal,
            'karat' => $data['karat'],
            'weight_grams' => (float) $data['weight_grams'],
            'purity' => $purity,
            'price_per_gram' => $pricePerGram,
            'price_date' => $price->price_date->toDateString(),
            'estimate_date' => today()->toDateString(),
            'estimated_value' => round((float) $data['weight_grams'] * $purity * $pricePerGram, 2),
        ]);
    }

    public function goldPrices(): JsonResponse { return response()->json(GoldPrice::orderBy('price_date')->get()); }
    public function silverPrices(): JsonResponse { return response()->json(SilverPrice::orderBy('price_date')->get()); }
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
        $transactions = Transaction::with(['item', 'customer', 'renewalRequests'])
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
            'silver_prices' => SilverPrice::orderByDesc('price_date')->limit(30)->get(),
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
    /**
     * What the signed in staff member has done, and only them.
     *
     * The admin report answers how the shop is doing. This one answers how one
     * person's own shift is going, so every figure is filtered to the caller:
     * pawns they recorded, redemptions they took, renewals they checked. It is
     * never a view of anyone else's work, so no user id is accepted.
     *
     * A pawn is owned through items.staff_id, which is stamped when the ticket
     * is written. A redemption leaves no such column, so it is counted from the
     * caller's own audit rows and the tickets they name.
     */
    public function staffReport(Request $request): JsonResponse
    {
        $userId = $request->user()->users_id;
        $dayStart = now()->startOfDay();
        $monthStart = now()->startOfMonth();

        // Pawn tickets written by this staff member, with the loan on each.
        $pawned = Transaction::query()
            ->whereIn('item_id', Item::where('staff_id', $userId)->select('items_id'))
            ->get(['transactions_id', 'loan_amount', 'created_at']);

        // Redemptions are owned by the column stamped when the payment was
        // taken. Rows from before that column existed were backfilled from the
        // audit trail; one with no audit row belongs to nobody and is counted
        // for nobody, which is the honest answer.
        $redeemed = Transaction::where('redeemed_by', $userId)->get();

        $renewals = RenewalRequest::where('reviewed_by', $userId)->get(['status', 'amount', 'reviewed_at']);
        $confirmedRenewals = $renewals->where('status', 'confirmed');

        $since = fn ($rows, string $field, $from) => $rows->filter(fn ($row) => $row->{$field} !== null && $row->{$field} >= $from);

        return response()->json([
            'staff_name' => $request->user()->name,
            'pawns_recorded' => [
                'today' => $since($pawned, 'created_at', $dayStart)->count(),
                'this_month' => $since($pawned, 'created_at', $monthStart)->count(),
                'total' => $pawned->count(),
            ],
            'pawn_amount' => [
                'today' => round((float) $since($pawned, 'created_at', $dayStart)->sum('loan_amount'), 2),
                'this_month' => round((float) $since($pawned, 'created_at', $monthStart)->sum('loan_amount'), 2),
                'total' => round((float) $pawned->sum('loan_amount'), 2),
            ],
            'redemptions_processed' => [
                'today' => $since($redeemed, 'redeemed_at', $dayStart)->count(),
                'this_month' => $since($redeemed, 'redeemed_at', $monthStart)->count(),
                'total' => $redeemed->count(),
            ],
            'amount_collected' => [
                'today' => round((float) $since($redeemed, 'redeemed_at', $dayStart)->sum(fn (Transaction $row) => $row->totalPayable()), 2),
                'this_month' => round((float) $since($redeemed, 'redeemed_at', $monthStart)->sum(fn (Transaction $row) => $row->totalPayable()), 2),
                'total' => round((float) $redeemed->sum(fn (Transaction $row) => $row->totalPayable()), 2),
            ],
            'renewals_confirmed' => [
                'today' => $since($confirmedRenewals, 'reviewed_at', $dayStart)->count(),
                'this_month' => $since($confirmedRenewals, 'reviewed_at', $monthStart)->count(),
                'total' => $confirmedRenewals->count(),
            ],
            'renewal_amount' => [
                'today' => round((float) $since($confirmedRenewals, 'reviewed_at', $dayStart)->sum('amount'), 2),
                'this_month' => round((float) $since($confirmedRenewals, 'reviewed_at', $monthStart)->sum('amount'), 2),
                'total' => round((float) $confirmedRenewals->sum('amount'), 2),
            ],
            'renewals_rejected' => $renewals->where('status', 'rejected')->count(),
            'customers_registered' => Customer::where('registered_by_staff_id', $userId)->count(),
            // Work this staff member has left open: their own tickets that are
            // now past due, and every renewal still waiting on any staff member.
            'open_pawns' => Transaction::whereIn('item_id', Item::where('staff_id', $userId)->select('items_id'))->where('status', 'active')->count(),
            'overdue_pawns' => Transaction::whereIn('item_id', Item::where('staff_id', $userId)->select('items_id'))
                ->where('status', 'active')
                ->whereDate('due_date', '<', now()->toDateString())
                ->count(),
            'pending_renewals' => RenewalRequest::where('status', 'pending')->count(),
        ]);
    }

    /**
     * The rows behind one figure on the staff report.
     *
     * The tiles answer how many; this answers which ones. Same ownership rules
     * as staffReport, and the same scoping: the caller is always the subject,
     * so no user id is accepted here either.
     */
    public function staffReportBreakdown(Request $request): JsonResponse
    {
        $data = $request->validate([
            'metric' => ['required', Rule::in(['pawns', 'redemptions', 'renewals_confirmed', 'renewals_rejected'])],
            'period' => ['nullable', Rule::in(['today', 'this_month', 'total'])],
        ]);

        $userId = $request->user()->users_id;
        $period = $data['period'] ?? 'this_month';
        $from = match ($period) {
            'today' => now()->startOfDay(),
            'this_month' => now()->startOfMonth(),
            default => null,
        };

        $rows = match ($data['metric']) {
            'pawns' => Transaction::with('item', 'customer')
                ->whereIn('item_id', Item::where('staff_id', $userId)->select('items_id'))
                ->when($from, fn ($query) => $query->where('created_at', '>=', $from))
                ->latest('transactions_id')
                ->limit(self::REPORT_BREAKDOWN_LIMIT)
                ->get()
                ->map(fn (Transaction $row) => [
                    'id' => $row->transactions_id,
                    'date' => $row->created_at?->toIso8601String(),
                    'ticket_number' => $row->ticket_number,
                    'customer' => $row->customer?->name,
                    'item' => $row->item?->description,
                    'amount' => (float) $row->loan_amount,
                    'note' => ucfirst($row->status),
                ]),
            'redemptions' => Transaction::with('item', 'customer')
                ->where('redeemed_by', $userId)
                ->when($from, fn ($query) => $query->where('redeemed_at', '>=', $from))
                ->latest('redeemed_at')
                ->limit(self::REPORT_BREAKDOWN_LIMIT)
                ->get()
                ->map(fn (Transaction $row) => [
                    'id' => $row->transactions_id,
                    'date' => $row->redeemed_at?->toIso8601String(),
                    'ticket_number' => $row->ticket_number,
                    'customer' => $row->customer?->name,
                    'item' => $row->item?->description,
                    'amount' => $row->totalPayable(),
                    'note' => 'Principal '.number_format((float) $row->loan_amount, 2),
                ]),
            default => RenewalRequest::with('transaction.item', 'customer')
                ->where('reviewed_by', $userId)
                ->where('status', $data['metric'] === 'renewals_confirmed' ? 'confirmed' : 'rejected')
                ->when($from, fn ($query) => $query->where('reviewed_at', '>=', $from))
                ->latest('renewal_requests_id')
                ->limit(self::REPORT_BREAKDOWN_LIMIT)
                ->get()
                ->map(fn (RenewalRequest $row) => [
                    'id' => $row->renewal_requests_id,
                    'date' => $row->reviewed_at?->toIso8601String(),
                    'ticket_number' => $row->transaction?->ticket_number,
                    'customer' => $row->customer?->name,
                    'item' => $row->transaction?->item?->description,
                    'amount' => (float) $row->amount,
                    'note' => $row->review_note ?: 'Ref '.$row->gcash_reference_number,
                ]),
        };

        return response()->json(['metric' => $data['metric'], 'period' => $period, 'rows' => $rows->values()->all()]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $limit = min(200, max(1, (int) $request->query('limit', 50)));

        return response()->json(AuditLog::with('user:users_id,name,role')->latest('audit_logs_id')->limit($limit)->get());
    }

    /**
     * The signed in account's own notifications, newest first.
     *
     * Rows are written by the triggers in NotificationService as things happen,
     * so the bell shows the same list to a customer and to staff, each seeing
     * only their own. The unread count rides along so the badge does not need a
     * second call.
     */
    public function notifications(Request $request): JsonResponse
    {
        $userId = $request->user()->users_id;

        $notifications = Notification::where('user_id', $userId)
            ->latest('notifications_id')
            ->limit(self::NOTIFICATION_LIST_LIMIT)
            ->get(['notifications_id', 'type', 'message', 'related_item_id', 'is_read', 'created_at']);

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => Notification::where('user_id', $userId)->where('is_read', false)->count(),
        ]);
    }

    /**
     * Mark one of the caller's own notifications as read.
     *
     * A row belonging to anyone else answers 404: the caller learns nothing
     * about whether that id exists.
     */
    public function markNotificationRead(Request $request, Notification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->users_id, 404);

        $notification->update(['is_read' => true]);

        return response()->json([
            'notification' => $notification->only(['notifications_id', 'type', 'message', 'related_item_id', 'is_read', 'created_at']),
            'unread_count' => Notification::where('user_id', $request->user()->users_id)->where('is_read', false)->count(),
        ]);
    }

    /**
     * The customer says they are ready to redeem an open loan.
     *
     * This only records the request and tells the staff. Nothing about the loan
     * itself changes: the money is still collected in the Redemption tab.
     */
    public function requestRedemption(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        $customerId = optional($request->user()->customerProfile)->customers_id;

        abort_unless($request->user()->role === 'customer' && $transaction->customer_id === $customerId, 404);
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn can be redeemed.');

        $transaction->update(['ready_to_redeem_at' => now()]);
        $notifications->customerReadyToRedeem($transaction->load('item', 'customer'));

        return response()->json($transaction->fresh()->load('item', 'customer'));
    }

    /**
     * A request the customer raises from the Payments screen.
     *
     * Three buttons share this one endpoint. A redemption payment request is
     * the same event as pressing "I'm ready to redeem" on the item, so it runs
     * through the same stamp and the same staff message rather than inventing a
     * second one. An appointment or a renewal has no loan state of its own: it
     * is a message to the counter, so only the staff notification is written.
     */
    public function customerRequest(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['redemption_payment', 'appointment', 'renewal'])],
        ]);

        $customerId = optional($request->user()->customerProfile)->customers_id;

        abort_unless($request->user()->role === 'customer' && $transaction->customer_id === $customerId, 404);
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn can be requested on.');

        $transaction->loadMissing('item', 'customer');

        if ($data['type'] === 'redemption_payment') {
            $transaction->update(['ready_to_redeem_at' => now()]);
            $notifications->customerReadyToRedeem($transaction->fresh()->load('item', 'customer'));
        } elseif ($data['type'] === 'appointment') {
            $notifications->customerRequestedAppointment($transaction);
        } else {
            $notifications->customerRequestedRenewal($transaction);
        }

        return response()->json($transaction->fresh()->load('item', 'customer'));
    }

    /**
     * Claim a pawn so one staff member can take its payment.
     *
     * The claim is decided here rather than in the browser: two terminals can
     * press Process at the same moment, and only the row update that lands
     * first should win. A lock that is already the caller's own is renewed,
     * and one that has timed out is taken over.
     */
    public function lockTransaction(Request $request, Transaction $transaction): JsonResponse
    {
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn can be processed.');

        $userId = $request->user()->users_id;

        /*
          The row is read and written inside one database transaction, holding
          it for update, so two terminals asking at the same moment are decided
          one after the other rather than both being told yes.

          Whether the claim succeeded cannot be read from the number of rows
          written: renewing a lock in the same second writes the same values,
          which counts as no change while being a perfectly good claim.
        */
        $claimed = DB::transaction(function () use ($transaction, $userId) {
            $row = Transaction::where('transactions_id', $transaction->transactions_id)->lockForUpdate()->first();

            if ($row->isLocked() && $row->locked_by !== $userId) {
                return false;
            }

            $row->update(['locked_by' => $userId, 'locked_at' => now()]);

            return true;
        });

        $transaction->refresh()->load('lockHolder:users_id,name');

        if (! $claimed) {
            return response()->json([
                'locked' => true,
                'locked_by_you' => false,
                'locked_by_name' => $transaction->lockHolder?->name,
                'message' => 'This pawn is already being processed by '.($transaction->lockHolder?->name ?? 'another staff member').'.',
            ], 409);
        }

        return response()->json([
            'locked' => true,
            'locked_by_you' => true,
            'locked_by_name' => $transaction->lockHolder?->name,
        ]);
    }

    /**
     * Give up a claim.
     *
     * Only the holder releases their own lock: a staff member closing their own
     * screen must not free a pawn somebody else has since taken over.
     */
    public function unlockTransaction(Request $request, Transaction $transaction): JsonResponse
    {
        Transaction::where('transactions_id', $transaction->transactions_id)
            ->where('locked_by', $request->user()->users_id)
            ->update(['locked_by' => null, 'locked_at' => null]);

        return response()->json(['locked' => false]);
    }

    /**
     * The customer's own pickup code for this pawn, if one is still running.
     *
     * A code that has run out reads the same as no code at all, so the portal
     * offers to make a new one rather than showing something staff will refuse.
     */
    public function pickupCode(Request $request, Transaction $transaction): JsonResponse
    {
        $this->assertOwnOpenPawn($request, $transaction);

        return response()->json($this->pickupCodePayload($transaction));
    }

    /**
     * Make a pickup code, replacing any the pawn already has.
     *
     * Regenerating is how a customer recovers from a code they cannot read or
     * one that ran out, so the old code stops working the moment a new one is
     * written. The code is four digits: it is read aloud at a counter, it only
     * ever matches one open pawn, and it is gone once the pawn is paid.
     */
    public function generatePickupCode(Request $request, Transaction $transaction): JsonResponse
    {
        $this->assertOwnOpenPawn($request, $transaction);

        $transaction->update([
            'pickup_code' => str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT),
            'pickup_code_expires_at' => now()->addHours(Transaction::PICKUP_CODE_HOURS),
        ]);

        return response()->json($this->pickupCodePayload($transaction->fresh()), 201);
    }

    /**
     * Find an open pawn by the pickup code a customer has just read out.
     *
     * Staff type the code; nothing hands them the list of live codes, so the
     * code is still proof that the person at the counter is the one who made
     * it. An expired code, a paid pawn, or a code that never existed all answer
     * the same way: nothing found.
     */
    public function lookupPickupCode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pickup_code' => ['required', 'string', 'size:4', 'regex:/^[0-9]{4}$/'],
        ]);

        $transaction = Transaction::with('item', 'customer')
            ->where('pickup_code', $data['pickup_code'])
            ->where('pickup_code_expires_at', '>', now())
            ->where('status', 'active')
            ->latest('transactions_id')
            ->first();

        if (! $transaction) {
            return response()->json(['transaction_id' => null, 'ticket_number' => null]);
        }

        return response()->json([
            'transaction_id' => $transaction->transactions_id,
            'ticket_number' => $transaction->ticket_number,
            'item_id' => $transaction->item_id,
            'customer_name' => $transaction->customer?->name,
            'expires_at' => $transaction->pickup_code_expires_at?->toIso8601String(),
        ]);
    }

    /** The caller must be the customer on this pawn, and the pawn must be open. */
    private function assertOwnOpenPawn(Request $request, Transaction $transaction): void
    {
        $customerId = optional($request->user()->customerProfile)->customers_id;

        abort_unless($request->user()->role === 'customer' && $transaction->customer_id === $customerId, 404);
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn has a pickup code.');
    }

    /** A pickup code as the customer's own screen reads it. */
    private function pickupCodePayload(Transaction $transaction): array
    {
        $live = $transaction->hasLivePickupCode();

        return [
            'pickup_code' => $live ? $transaction->pickup_code : null,
            'expires_at' => $live ? $transaction->pickup_code_expires_at->toIso8601String() : null,
            'valid_hours' => Transaction::PICKUP_CODE_HOURS,
        ];
    }

    /**
     * What the customer needs to see before paying a renewal online.
     *
     * The renta is computed here rather than in the browser, the same as every
     * other payoff figure, and the GCash number comes from system_settings so
     * the shop can change it without a release.
     */
    public function onlineRenewalInfo(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        $customerId = optional($request->user()->customerProfile)->customers_id;

        abort_unless($request->user()->role === 'customer' && $transaction->customer_id === $customerId, 404);

        return response()->json([
            'transaction_id' => $transaction->transactions_id,
            'ticket_number' => $transaction->ticket_number,
            'renewable' => $transaction->status === 'active',
            'interest_due' => $transaction->interestDue(),
            'due_date' => $transaction->due_date->toDateString(),
            'renewal_term_days' => $notifications->renewalTermDays(),
            'gcash_payment_info' => $notifications->gcashPaymentInfo(),
            'pending_request' => $this->renewalRequestPayload(
                RenewalRequest::with('transaction.item', 'customer')
                    ->where('transaction_id', $transaction->transactions_id)
                    ->where('status', 'pending')
                    ->latest('renewal_requests_id')
                    ->first()
            ),
        ]);
    }

    /**
     * The customer says they have paid the renta through GCash.
     *
     * Nothing about the loan moves here. The shop is not a payment processor:
     * the money was sent from the customer's own GCash app, and this records
     * the reference number so a staff member can check it against the shop's
     * account. The due date is only extended once that check passes.
     */
    public function submitOnlineRenewal(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'gcash_reference_number' => ['required', 'string', 'min:6', 'max:50', 'regex:/^[A-Za-z0-9 -]+$/'],
            // The GCash receipt screenshot, downscaled by the browser. Optional:
            // a customer who cannot attach one still gets to submit.
            'receipt' => ['nullable', 'string', 'starts_with:data:image/', 'max:'.self::RECEIPT_MAX_CHARS],
        ]);

        $customerId = optional($request->user()->customerProfile)->customers_id;

        abort_unless($request->user()->role === 'customer' && $transaction->customer_id === $customerId, 404);
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn can be renewed.');

        $reference = trim($data['gcash_reference_number']);

        // The same reference cannot buy two renewals, here or on any other
        // pawn, and one pending claim at a time keeps the staff list honest.
        abort_if(RenewalRequest::where('gcash_reference_number', $reference)->exists(), 422, 'That GCash reference number has already been submitted.');
        abort_if(
            RenewalRequest::where('transaction_id', $transaction->transactions_id)->where('status', 'pending')->exists(),
            422,
            'A renewal payment for this pawn is already waiting to be checked.'
        );

        $transaction->loadMissing('item', 'customer');
        $amount = $transaction->interestDue();

        $renewal = RenewalRequest::create([
            'transaction_id' => $transaction->transactions_id,
            'customer_id' => $transaction->customer_id,
            'amount' => $amount,
            'gcash_reference_number' => $reference,
            'receipt_path' => $data['receipt'] ?? null,
            'status' => 'pending',
        ]);

        $notifications->customerSubmittedRenewalPayment($transaction, $reference, $amount);

        return response()->json($this->renewalRequestPayload($renewal->fresh()->load('transaction.item', 'customer')), 201);
    }

    /**
     * Renewal payments waiting to be checked, oldest first.
     *
     * Staff work this list against the shop's GCash account, so the oldest
     * claim is the one that has been waiting longest.
     */
    public function renewalRequests(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'confirmed', 'rejected', 'all'])],
        ]);
        $status = $data['status'] ?? 'pending';

        // Pending rows are work, so the oldest is shown first. Any other view
        // is a record of what was decided, which reads newest first.
        $rows = RenewalRequest::with(['transaction.item', 'customer'])
            ->when($status !== 'all', fn ($query) => $query->where('status', $status))
            ->orderBy('renewal_requests_id', $status === 'pending' ? 'asc' : 'desc')
            ->get();

        return response()->json($rows->map(fn (RenewalRequest $row) => $this->renewalRequestPayload($row))->all());
    }

    /**
     * Staff checked the GCash reference and the money is there.
     *
     * The pawn is re-checked here rather than trusted from submission time: a
     * claim can sit in the list long enough for the pawn to fall overdue or be
     * redeemed, and extending a due date in either case would be wrong. The
     * claim is rejected instead, and the customer is told why.
     */
    public function confirmRenewal(Request $request, RenewalRequest $renewalRequest, NotificationService $notifications): JsonResponse
    {
        abort_unless($renewalRequest->status === 'pending', 422, 'This renewal payment has already been reviewed.');

        $transaction = $renewalRequest->transaction()->with('item', 'customer')->firstOrFail();

        if ($transaction->status !== 'active') {
            $reason = 'The pawn is no longer active, so it cannot be extended. Please contact the shop.';
            $this->closeRenewalRequest($renewalRequest, 'rejected', $request->user()->users_id, $reason);
            $notifications->renewalRejected($transaction, $reason);
            AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Auto-rejected GCash renewal', 'ticket_number' => $transaction->ticket_number, 'reason' => 'Pawn no longer active at confirm time']);

            return response()->json([
                'message' => $reason,
                'renewal_request' => $this->renewalRequestPayload($renewalRequest->fresh()->load('transaction.item', 'customer')),
            ], 422);
        }

        // The renta paid settles interest up to today, and the new term runs
        // from the due date being extended, not from today, so a customer who
        // renews early keeps the days they already paid for.
        $termDays = $notifications->renewalTermDays();
        $transaction->update([
            'due_date' => $transaction->due_date->copy()->addDays($termDays),
            'interest_paid_until' => now(),
        ]);

        $this->closeRenewalRequest($renewalRequest, 'confirmed', $request->user()->users_id, null);

        $transaction->refresh()->load('item', 'customer');
        $notifications->renewalConfirmed($transaction);
        AuditLog::create([
            'user_id' => $request->user()->users_id,
            'action' => 'Confirmed GCash renewal',
            'ticket_number' => $transaction->ticket_number,
            'reason' => 'Ref ' . $renewalRequest->gcash_reference_number . ' - new due date ' . $transaction->due_date->toDateString(),
        ]);

        return response()->json([
            'renewal_request' => $this->renewalRequestPayload($renewalRequest->fresh()->load('transaction.item', 'customer')),
            'transaction' => $transaction,
        ]);
    }

    /**
     * Staff could not match the GCash reference to a payment.
     *
     * The loan is untouched. The customer is told to check the number and send
     * it again, so a mistyped reference costs them a resubmission and nothing
     * more.
     */
    public function rejectRenewal(Request $request, RenewalRequest $renewalRequest, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        abort_unless($renewalRequest->status === 'pending', 422, 'This renewal payment has already been reviewed.');

        $reason = trim($data['reason'] ?? '') ?: 'We could not find that GCash reference number. Please double-check it and submit again.';
        $transaction = $renewalRequest->transaction()->with('item', 'customer')->firstOrFail();

        $this->closeRenewalRequest($renewalRequest, 'rejected', $request->user()->users_id, $reason);
        $notifications->renewalRejected($transaction, $reason);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Rejected GCash renewal', 'ticket_number' => $transaction->ticket_number, 'reason' => 'Ref ' . $renewalRequest->gcash_reference_number . ' - ' . $reason]);

        return response()->json($this->renewalRequestPayload($renewalRequest->fresh()->load('transaction.item', 'customer')));
    }

    /** Stamp who reviewed a renewal claim and how it ended. */
    private function closeRenewalRequest(RenewalRequest $renewalRequest, string $status, int $reviewerId, ?string $note): void
    {
        $renewalRequest->update([
            'status' => $status,
            'reviewed_by' => $reviewerId,
            'reviewed_at' => now(),
            'review_note' => $note,
        ]);
    }

    /** One renewal claim, flattened the way both portals read it. */
    private function renewalRequestPayload(?RenewalRequest $renewalRequest): ?array
    {
        if (! $renewalRequest) {
            return null;
        }

        $transaction = $renewalRequest->transaction;

        return [
            'renewal_requests_id' => $renewalRequest->renewal_requests_id,
            'transaction_id' => $renewalRequest->transaction_id,
            'customer_id' => $renewalRequest->customer_id,
            'customer_name' => $renewalRequest->customer?->name,
            'ticket_number' => $transaction?->ticket_number,
            'item_id' => $transaction?->item_id,
            'item_name' => $transaction?->item?->description,
            'due_date' => $transaction?->due_date?->toDateString(),
            // What the due date becomes if this claim is confirmed. Staff read
            // it while reviewing, so the decision is made against the date it
            // actually produces rather than against a term in days.
            'new_due_date' => $transaction?->due_date?->copy()->addDays(app(NotificationService::class)->renewalTermDays())->toDateString(),
            'renewal_term_days' => app(NotificationService::class)->renewalTermDays(),
            'amount' => (float) $renewalRequest->amount,
            'gcash_reference_number' => $renewalRequest->gcash_reference_number,
            'receipt_url' => $renewalRequest->receipt_url,
            'status' => $renewalRequest->status,
            'review_note' => $renewalRequest->review_note,
            'submitted_at' => $renewalRequest->created_at?->toIso8601String(),
            'reviewed_at' => $renewalRequest->reviewed_at?->toIso8601String(),
        ];
    }

    /**
     * Staff accepts a customer's redemption request.
     *
     * The customer is asked to come to the shop; the payment itself still runs
     * through redeem().
     */
    public function confirmRedemptionRequest(Request $request, Transaction $transaction, NotificationService $notifications): JsonResponse
    {
        abort_unless($transaction->status === 'active', 422, 'Only an open pawn can be redeemed.');
        abort_unless($transaction->ready_to_redeem_at !== null, 422, 'This pawn has no redemption request to confirm.');

        $transaction->update(['redemption_confirmed_at' => now()]);
        $notifications->redemptionRequestConfirmed($transaction->load('item', 'customer'));
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Confirmed redemption request', 'ticket_number' => $transaction->ticket_number]);

        return response()->json($transaction->fresh()->load('item', 'customer'));
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
     * Set or change the signed in account's own password.
     *
     * A customer who reached the portal by scanning their pawn ticket has no
     * password at all: the shop created the account, the activation email was
     * never opened, and the QR flow let them in on the registered email
     * address instead. There is nothing for them to state as a current
     * password, so none is asked for, and setting one finishes the activation
     * the email would have.
     *
     * Everyone else states the password they already have, so a screen left
     * open on a counter cannot be used to lock its owner out.
     */
    public function updateMyPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if ($user->is_activated) {
            $current = $data['current_password'] ?? '';

            if ($current === '' || ! Hash::check($current, $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => 'That is not your current password.',
                ]);
            }
        }

        $user->forceFill([
            'password' => Hash::make($data['password']),
            'activation_token' => null,
            'is_activated' => true,
        ])->save();

        // Every other session ends: a new password is how someone takes their
        // account back, and it should not leave the old way in open.
        $current = $request->user()->currentAccessToken();
        $user->tokens()->when($current, fn ($query) => $query->where('id', '!=', $current->id))->delete();

        AuditLog::create(['user_id' => $user->users_id, 'action' => 'Set own password']);

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

        // Renewal income is renta collected without the pawn closing, so it is
        // counted apart from redemptions rather than folded into them.
        $renewalsThisMonth = RenewalRequest::where('status', 'confirmed')->where('reviewed_at', '>=', $monthStart);
        $renewalIncomeThisMonth = (float) (clone $renewalsThisMonth)->sum('amount');
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
            // Gold (or staff) value plus the gemstone value of jewelry with a stone.
            'inventory_value' => round(
                (float) Item::whereIn('status', ['active', 'overdue'])->sum('appraised_value')
                + (float) Item::whereIn('status', ['active', 'overdue'])->where('group', Item::GROUP_JEWELRY)->where('has_gemstone', true)->sum('gemstone_value'),
                2
            ),
            'items_for_sale_value' => round((float) Item::where('status', 'for_sale')->sum('sale_price'), 2),
            'renewals_this_month' => (clone $renewalsThisMonth)->count(),
            'renewal_income_this_month' => round($renewalIncomeThisMonth, 2),
            'renewal_income_total' => round((float) RenewalRequest::where('status', 'confirmed')->sum('amount'), 2),
            'pending_renewals' => RenewalRequest::where('status', 'pending')->count(),
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
    public function saveSetting(Request $request): JsonResponse
    {
        $data = $request->validate(['setting_key' => ['required', 'string'], 'setting_value' => ['required', 'string']]);
        $setting = SystemSetting::updateOrCreate(['setting_key' => $data['setting_key']], ['setting_value' => $data['setting_value']]);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => "Changed setting {$data['setting_key']}", 'reason' => "New value: {$data['setting_value']}"]);

        return response()->json($setting);
    }

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
        abort_unless($item->status === 'forfeited', 422, 'Only expired/unclaimed items can be listed for sale.');
        $data = $request->validate(['sale_price' => ['required', 'numeric', 'gt:0']]);
        $item->update(['sale_price' => $data['sale_price'], 'status' => 'for_sale']);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Listed expired/unclaimed item for sale']);
        return response()->json($item->fresh());
    }

    /**
     * Replace an item's photos with the list sent, in that order. An empty list
     * removes every photo. Staff use this to add or change the pictures a
     * listed item shows on the landing page.
     */
    public function updateItemPhotos(Request $request, Item $item): JsonResponse
    {
        $data = $request->validate([
            'photos' => ['present', 'array', 'max:'.Item::MAX_PHOTOS],
            'photos.*' => ['string', 'starts_with:data:image/', 'max:'.self::ITEM_PHOTO_MAX_CHARS],
        ]);
        $photos = array_values($data['photos']);
        if (array_sum(array_map('strlen', $photos)) > self::ITEM_PHOTOS_TOTAL_MAX_CHARS) {
            throw ValidationException::withMessages([
                'photos' => 'The item photos are too large together. Remove a photo or retake it and try again.',
            ]);
        }
        $item->update(['photo_path' => $photos === [] ? null : json_encode($photos, JSON_UNESCAPED_SLASHES)]);
        AuditLog::create(['user_id' => $request->user()->users_id, 'action' => 'Updated item photos']);
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