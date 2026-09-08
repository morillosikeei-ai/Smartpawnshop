<?php

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [ApiController::class, 'login']);
Route::get('/items/for-sale', [ApiController::class, 'forSale']);
Route::post('/activate', [ApiController::class, 'activate']);
Route::post('/forgot-password', [ApiController::class, 'forgotPassword'])->middleware('throttle:6,1');
Route::post('/reset-password', [ApiController::class, 'resetPassword'])->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/users', [ApiController::class, 'users'])->middleware('role:admin');
    Route::post('/users', [ApiController::class, 'storeUser'])->middleware('role:admin');
    Route::get('/customers', [ApiController::class, 'customers']);
    Route::post('/customers', [ApiController::class, 'storeCustomer'])->middleware('role:staff,admin');
    Route::get('/items', [ApiController::class, 'items']);
    Route::post('/items/{item}/for-sale', [ApiController::class, 'markForSale'])->middleware('role:staff,admin');
    Route::post('/items/{item}/sold', [ApiController::class, 'markSold'])->middleware('role:staff,admin');
    Route::get('/transactions', [ApiController::class, 'transactions']);
    Route::post('/transactions', [ApiController::class, 'storeTransaction'])->middleware('role:staff,admin');
    Route::post('/transactions/{transaction}/redeem', [ApiController::class, 'redeem'])->middleware('role:staff,admin');
    Route::get('/gold-prices', [ApiController::class, 'goldPrices']);
    Route::get('/gold-prices/suggestion', [ApiController::class, 'goldPriceSuggestion']);
    Route::post('/gold-prices', [ApiController::class, 'storeGoldPrice'])->middleware('role:admin');
    Route::get('/risk-alerts', [ApiController::class, 'riskAlerts']);
    Route::get('/activity-flags', [ApiController::class, 'activityFlags'])->middleware('role:staff,admin');
    Route::post('/activity-flags/{activityFlag}/resolve', [ApiController::class, 'resolveActivityFlag'])->middleware('role:admin');
    Route::get('/dashboard/{role}', [ApiController::class, 'dashboard'])->whereIn('role', ['admin', 'staff', 'customer']);
    Route::get('/notifications', [ApiController::class, 'notifications']);
    Route::get('/me', [ApiController::class, 'me']);
    Route::put('/me', [ApiController::class, 'updateMe']);
    Route::get('/audit-logs', [ApiController::class, 'auditLogs'])->middleware('role:staff,admin');
    Route::get('/reports/summary', [ApiController::class, 'reportSummary'])->middleware('role:admin');
    Route::get('/model-metrics', [ApiController::class, 'modelMetrics'])->middleware('role:staff,admin');
    // Staff read these to price a pawn ticket: gold price, loan to value,
    // term, grace period, and the per group interest rates. Writing stays admin.
    Route::get('/system-settings', [ApiController::class, 'settings'])->middleware('role:staff,admin');
    Route::put('/system-settings', [ApiController::class, 'saveSetting'])->middleware('role:admin');
    Route::post('/logout', function (\Illuminate\Http\Request $request) { $request->user()->currentAccessToken()?->delete(); return response()->json(['message' => 'Logged out']); });
});
