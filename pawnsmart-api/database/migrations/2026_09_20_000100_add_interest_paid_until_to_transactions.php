<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where interest starts counting from on a renewed pawn.
 *
 * Interest accrues from the day the pawn was recorded. A renewal is the
 * customer paying the renta owed so far to buy more time, so that renta must
 * stop being owed once it is paid; without this the customer would renew and
 * still see the same amount due. A confirmed renewal stamps this date, and
 * the interest computation counts from here instead of the creation date.
 * Null means nothing has been paid yet, which is every existing pawn.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->timestamp('interest_paid_until')->nullable()->after('redeemed_at');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('interest_paid_until');
        });
    }
};
