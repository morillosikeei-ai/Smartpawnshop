<?php

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [ApiController::class, 'login']);
Route::get('/items/for-sale', [ApiController::class, 'forSale']);
// Public gold value estimate for the landing page. Read only: it computes a
// figure from the latest gold price and never writes to the database.
Route::post('/estimate', [ApiController::class, 'estimate'])->middleware('throttle:30,1');
// FAQ chat answered by Google Gemini. Public, because the chat also runs on the
// landing page; the throttle caps what one visitor can spend.
Route::post('/chat', [ApiController::class, 'chat'])->middleware('throttle:10,1');
Route::post('/activate', [ApiController::class, 'activate']);
Route::post('/forgot-password', [ApiController::class, 'forgotPassword'])->middleware('throttle:6,1');
Route::post('/reset-password', [ApiController::class, 'resetPassword'])->middleware('throttle:6,1');

// Backup portal access from the QR code on a pawn ticket. The scan proves
// nothing on its own: /qr-access/verify issues a session only when the
// registered email address is typed with it. The Gmail password reset above
// is untouched and stays the first way in.
Route::get('/qr-access/{code}', [ApiController::class, 'qrAccessCheck'])->middleware('throttle:20,1')->where('code', '[A-Za-z0-9]+');
Route::post('/qr-access/verify', [ApiController::class, 'qrAccessVerify'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/users', [ApiController::class, 'users'])->middleware('role:admin');
    Route::post('/users', [ApiController::class, 'storeUser'])->middleware('role:admin');
    Route::put('/users/{user}', [ApiController::class, 'updateUser'])->middleware('role:admin');
    Route::get('/customers', [ApiController::class, 'customers']);
    Route::post('/customers', [ApiController::class, 'storeCustomer'])->middleware('role:staff,admin');
    // The pawn ticket QR code. Staff print it; it carries a random token only.
    Route::post('/customers/{customer}/access-qr', [ApiController::class, 'customerAccessQr'])->middleware('role:staff,admin');
    Route::get('/items', [ApiController::class, 'items']);
    Route::post('/items/{item}/for-sale', [ApiController::class, 'markForSale'])->middleware('role:staff,admin');
    Route::put('/items/{item}/photos', [ApiController::class, 'updateItemPhotos'])->middleware('role:staff,admin');
    Route::post('/items/{item}/sold', [ApiController::class, 'markSold'])->middleware('role:staff,admin');
    Route::get('/transactions', [ApiController::class, 'transactions']);
    Route::post('/transactions', [ApiController::class, 'storeTransaction'])->middleware('role:staff,admin');
    Route::post('/transactions/{transaction}/redeem', [ApiController::class, 'redeem'])->middleware('role:staff,admin');
    // The customer raises a redemption request; staff accepts it. The payment
    // itself still runs through /redeem above.
    Route::post('/transactions/{transaction}/ready-to-redeem', [ApiController::class, 'requestRedemption'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/customer-request', [ApiController::class, 'customerRequest'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/confirm-redemption', [ApiController::class, 'confirmRedemptionRequest'])->middleware('role:staff,admin');
    // One staff member at a time takes a payment. The claim is decided by the
    // API, so two terminals pressing Process together cannot both win.
    Route::post('/transactions/{transaction}/lock', [ApiController::class, 'lockTransaction'])->middleware('role:staff,admin');
    Route::post('/transactions/{transaction}/unlock', [ApiController::class, 'unlockTransaction'])->middleware('role:staff,admin');
    // Renewal paid through GCash. The customer pays in their own GCash app
    // and submits the reference number; staff check it against the shop's
    // account before the due date moves.
    Route::get('/transactions/{transaction}/renew-online', [ApiController::class, 'onlineRenewalInfo'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/renew-online', [ApiController::class, 'submitOnlineRenewal'])->middleware('role:customer');
    // The code a customer shows at the counter. They make and read their own;
    // staff can only look one up by typing it, never list them.
    Route::get('/transactions/{transaction}/pickup-code', [ApiController::class, 'pickupCode'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/pickup-code', [ApiController::class, 'generatePickupCode'])->middleware('role:customer');
    Route::get('/pickup-code/lookup', [ApiController::class, 'lookupPickupCode'])->middleware('role:staff,admin');
    Route::get('/renewal-requests', [ApiController::class, 'renewalRequests'])->middleware('role:staff,admin');
    Route::post('/renewal-requests/{renewalRequest}/confirm', [ApiController::class, 'confirmRenewal'])->middleware('role:staff,admin');
    Route::post('/renewal-requests/{renewalRequest}/reject', [ApiController::class, 'rejectRenewal'])->middleware('role:staff,admin');
    Route::get('/gold-prices', [ApiController::class, 'goldPrices']);
    Route::get('/gold-prices/suggestion', [ApiController::class, 'goldPriceSuggestion']);
    Route::post('/gold-prices', [ApiController::class, 'storeGoldPrice'])->middleware('role:admin');
    Route::get('/silver-prices', [ApiController::class, 'silverPrices']);
    Route::get('/risk-alerts', [ApiController::class, 'riskAlerts']);
    Route::get('/activity-flags', [ApiController::class, 'activityFlags'])->middleware('role:staff,admin');
    Route::post('/activity-flags/{activityFlag}/resolve', [ApiController::class, 'resolveActivityFlag'])->middleware('role:admin');
    Route::get('/dashboard/{role}', [ApiController::class, 'dashboard'])->whereIn('role', ['admin', 'staff', 'customer']);
    // Every role reads its own rows only, and can mark only its own read.
    Route::get('/notifications', [ApiController::class, 'notifications']);
    Route::post('/notifications/{notification}/read', [ApiController::class, 'markNotificationRead']);
    Route::get('/me', [ApiController::class, 'me']);
    Route::put('/me', [ApiController::class, 'updateMe']);
    // Set or change your own password. A customer who came in by QR scan has
    // none yet, so none is asked for.
    Route::put('/me/password', [ApiController::class, 'updateMyPassword']);
    Route::get('/audit-logs', [ApiController::class, 'auditLogs'])->middleware('role:staff,admin');
    Route::get('/reports/summary', [ApiController::class, 'reportSummary'])->middleware('role:admin');
    // One staff member's own work. The caller is the subject: no user id is
    // accepted, so this never reads as a view of someone else's shift.
    Route::get('/reports/staff', [ApiController::class, 'staffReport'])->middleware('role:staff,admin');
    Route::get('/reports/staff/breakdown', [ApiController::class, 'staffReportBreakdown'])->middleware('role:staff,admin');
    Route::get('/model-metrics', [ApiController::class, 'modelMetrics'])->middleware('role:staff,admin');
    // Staff read these to price a pawn ticket: gold price, loan to value,
    // term, grace period, and the per group interest rates. Writing stays admin.
    Route::get('/system-settings', [ApiController::class, 'settings'])->middleware('role:staff,admin');
    Route::put('/system-settings', [ApiController::class, 'saveSetting'])->middleware('role:admin');
    Route::post('/logout', function (\Illuminate\Http\Request $request) { $request->user()->currentAccessToken()?->delete(); return response()->json(['message' => 'Logged out']); });
});
