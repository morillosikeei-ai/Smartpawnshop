<?php

use App\Http\Controllers\ApiController;
use App\Http\Controllers\MediaController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [ApiController::class, 'login']);
// Stored photos, served one by one from the signed links in API responses
// (see App\Support\MediaUrl). The signature is the access check, so an
// <img> tag can load them without the sign in token.
Route::middleware('signed:relative')->group(function () {
    Route::get('/media/items/{item}/{index}', [MediaController::class, 'itemPhoto'])->whereNumber('index')->name('media.item');
    Route::get('/media/customers/{customer}/id', [MediaController::class, 'customerIdPhoto'])->name('media.customer-id');
    Route::get('/media/renewals/{renewalRequest}/receipt', [MediaController::class, 'renewalReceipt'])->name('media.receipt');
});
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
    // Staff correcting a walk-in's details at the counter. The email is the
    // customer's sign-in and is not changed here.
    Route::put('/customers/{customer}', [ApiController::class, 'updateCustomer'])->middleware('role:staff,admin');
    // Face reference for identity checks at redemption. Staff only: it is biometric data.
    Route::get('/customers/{customer}/face', [ApiController::class, 'customerFace'])->middleware('role:staff,admin');
    Route::put('/customers/{customer}/face', [ApiController::class, 'storeCustomerFace'])->middleware('role:staff,admin');
    Route::delete('/customers/{customer}/face', [ApiController::class, 'deleteCustomerFace'])->middleware('role:staff,admin');
    Route::post('/transactions/{transaction}/face-check', [ApiController::class, 'faceCheck'])->middleware('role:staff,admin');
    // The pawn ticket QR code. Staff print it; it carries a random token only.
    Route::post('/customers/{customer}/access-qr', [ApiController::class, 'customerAccessQr'])->middleware('role:staff,admin');
    Route::get('/items', [ApiController::class, 'items']);
    Route::post('/items/{item}/for-sale', [ApiController::class, 'markForSale'])->middleware('role:staff,admin');
    Route::put('/items/{item}/photos', [ApiController::class, 'updateItemPhotos'])->middleware('role:staff,admin');
    Route::post('/items/{item}/sold', [ApiController::class, 'markSold'])->middleware('role:staff,admin');
    // Customers hold an item for sale for two open days; staff see and cancel holds.
    Route::post('/items/{item}/reserve', [ApiController::class, 'reserveItem'])->middleware(['role:customer', 'throttle:10,1']);
    Route::get('/reservations', [ApiController::class, 'reservations']);
    Route::post('/reservations/{reservation}/cancel', [ApiController::class, 'cancelReservation']);
    Route::get('/transactions', [ApiController::class, 'transactions']);
    Route::post('/transactions', [ApiController::class, 'storeTransaction'])->middleware('role:staff,admin');
    Route::post('/transactions/{transaction}/redeem', [ApiController::class, 'redeem'])->middleware('role:staff,admin');
    // The customer raises a redemption request; staff accepts it. The payment
    // itself still runs through /redeem above.
    Route::post('/transactions/{transaction}/ready-to-redeem', [ApiController::class, 'requestRedemption'])->middleware('role:customer');
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
    // The code a customer shows at the countspder. They make and read their own;
    // staff can only look one up by typing it, never list them.
    Route::get('/transactions/{transaction}/pickup-code', [ApiController::class, 'pickupCode'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/pickup-code', [ApiController::class, 'generatePickupCode'])->middleware('role:customer');
    Route::get('/pickup-code/lookup', [ApiController::class, 'lookupPickupCode'])->middleware('role:staff,admin');
    // When the branch is open, and the days it is not. Read by every role:
    // a customer planning a visit and staff answering the phone want the
    // same answer. Only an admin announces a closure.
    Route::get('/shop-schedule', [ApiController::class, 'shopSchedule']);
    Route::post('/shop-closures', [ApiController::class, 'storeShopClosure'])->middleware('role:admin');
    Route::delete('/shop-closures/{shopClosure}', [ApiController::class, 'deleteShopClosure'])->middleware('role:admin');
    // How the redemption went, asked once per pawn and answered by choice.
    Route::get('/feedback/pending', [ApiController::class, 'pendingFeedback'])->middleware('role:customer');
    Route::post('/transactions/{transaction}/feedback', [ApiController::class, 'storeFeedback'])->middleware('role:customer');
    Route::get('/feedback', [ApiController::class, 'feedbackList'])->middleware('role:staff,admin');
    Route::get('/renewal-requests', [ApiController::class, 'renewalRequests'])->middleware('role:staff,admin');
    Route::post('/renewal-requests/{renewalRequest}/confirm', [ApiController::class, 'confirmRenewal'])->middleware('role:staff,admin');
    Route::post('/renewal-requests/{renewalRequest}/reject', [ApiController::class, 'rejectRenewal'])->middleware('role:staff,admin');
    Route::get('/gold-prices', [ApiController::class, 'goldPrices']);
    Route::get('/gold-prices/suggestion', [ApiController::class, 'goldPriceSuggestion']);
    Route::post('/gold-prices', [ApiController::class, 'storeGoldPrice'])->middleware('role:admin');
    Route::get('/silver-prices', [ApiController::class, 'silverPrices']);
    Route::get('/risk-alerts', [ApiController::class, 'riskAlerts']);
    // Read only. The staff dashboard calendar: active pawns by due date, with
    // their open risk level.
    Route::get('/calendar', [ApiController::class, 'calendar'])->middleware('role:staff,admin');
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
