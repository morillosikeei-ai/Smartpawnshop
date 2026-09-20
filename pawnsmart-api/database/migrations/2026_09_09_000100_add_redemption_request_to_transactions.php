<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two steps of a redemption request, before the payment itself.
 *
 * A customer says they are ready to redeem, then staff confirms the request and
 * asks them to come to the shop. Both stamps stay set after the payment, so the
 * request is still readable on a redeemed ticket.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->timestamp('ready_to_redeem_at')->nullable()->after('redeemed_at');
            $table->timestamp('redemption_confirmed_at')->nullable()->after('ready_to_redeem_at');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn(['ready_to_redeem_at', 'redemption_confirmed_at']);
        });
    }
};
