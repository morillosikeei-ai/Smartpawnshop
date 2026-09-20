<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who took the redemption payment.
 *
 * Until now the only record of this was the audit row written beside it, so a
 * staff member's own figures had to be inferred from their audit trail. That
 * breaks the moment an audit row is missing: the redemption then counts for
 * nobody. The column makes it a fact on the transaction instead.
 *
 * Existing rows are backfilled from those same audit rows, which is the best
 * evidence there is for a redemption already taken. A redemption with no audit
 * row stays null, and is honestly reported as belonging to no one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->unsignedBigInteger('redeemed_by')->nullable()->after('redeemed_at');
            $table->foreign('redeemed_by')->references('users_id')->on('users')->nullOnDelete();
        });

        // One ticket can carry more than one audit row if a redemption was
        // recorded twice; the earliest one is the person who actually took it.
        DB::table('transactions')->whereNotNull('redeemed_at')->orderBy('transactions_id')->each(function ($transaction) {
            $userId = DB::table('audit_logs')
                ->where('action', 'Processed redemption')
                ->where('ticket_number', $transaction->ticket_number)
                ->orderBy('audit_logs_id')
                ->value('user_id');

            if ($userId) {
                DB::table('transactions')->where('transactions_id', $transaction->transactions_id)->update(['redeemed_by' => $userId]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropForeign(['redeemed_by']);
            $table->dropColumn('redeemed_by');
        });
    }
};
