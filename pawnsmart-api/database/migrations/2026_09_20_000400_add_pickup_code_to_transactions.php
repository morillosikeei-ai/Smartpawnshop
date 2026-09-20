<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A short code the customer shows at the counter.
 *
 * Staff already find a pawn by ticket number or by name. Neither is quick to
 * read off a phone at a busy counter, and neither proves the person holding it
 * is the one who asked to redeem. A four digit code that the customer
 * generates, that expires in two hours, and that is cleared the moment the
 * redemption is paid, is faster to say out loud and worth nothing afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('pickup_code', 4)->nullable()->after('redemption_confirmed_at');
            $table->timestamp('pickup_code_expires_at')->nullable()->after('pickup_code');
            // Staff look a pawn up by the code alone, so the code is the key.
            $table->index(['pickup_code', 'pickup_code_expires_at']);
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['pickup_code', 'pickup_code_expires_at']);
            $table->dropColumn(['pickup_code', 'pickup_code_expires_at']);
        });
    }
};
