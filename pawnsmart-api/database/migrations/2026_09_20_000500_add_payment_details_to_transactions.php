<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How a redemption was actually paid.
 *
 * Until now the redemption screen asked for an amount and a method and then
 * threw both away: the row recorded that the pawn closed, never how. A GCash
 * payment has nothing to point at afterwards without its reference, and a cash
 * drawer cannot be reconciled without knowing what was handed over. All four
 * are nullable, because every pawn redeemed before this migration has no
 * answer to give and should not pretend otherwise.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('payment_method', 50)->nullable()->after('redeemed_by');
            $table->string('payment_reference', 50)->nullable()->after('payment_method');
            $table->decimal('amount_collected', 12, 2)->nullable()->after('payment_reference');
            // What the customer handed over in cash. The change given is the
            // difference, so it needs no column of its own.
            $table->decimal('cash_received', 12, 2)->nullable()->after('amount_collected');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn(['payment_method', 'payment_reference', 'amount_collected', 'cash_received']);
        });
    }
};
