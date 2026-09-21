<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who is currently taking a redemption payment.
 *
 * Two staff on two terminals can open the same pawn and both start counting
 * money for it. The lock says one of them got there first, so the other sees
 * the row is already being handled rather than finding out afterwards.
 *
 * A lock is a claim, not a record: it is cleared on cancel, cleared when the
 * payment goes through, and ignored once it is older than the timeout on the
 * model, so a closed browser never leaves a pawn stuck.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->unsignedBigInteger('locked_by')->nullable()->after('cash_received');
            $table->timestamp('locked_at')->nullable()->after('locked_by');
            $table->foreign('locked_by')->references('users_id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropForeign(['locked_by']);
            $table->dropColumn(['locked_by', 'locked_at']);
        });
    }
};
