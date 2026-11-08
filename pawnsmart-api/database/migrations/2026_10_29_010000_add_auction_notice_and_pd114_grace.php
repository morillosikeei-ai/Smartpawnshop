<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The redemption period and public auction of PD 114 (Pawnshop Regulation Act).
 *
 * - transactions.auction_notice_sent_at: when the written notice that the item
 *   will go to public auction was sent. The daily job only forfeits a pawn
 *   whose notice went out at least auction_notice_days earlier.
 * - items.auction_date / auction_price: the result of the public auction.
 * - grace_period_days becomes 90 (the period after the due date to redeem),
 *   and auction_notice_days (default 7) is added.
 *
 * Existing open pawns only ever gain days: their grace period is raised to 90
 * where it was shorter, so nothing forfeits sooner than it would have.
 * Already forfeited pawns are left as they are.
 */
return new class extends Migration
{
    private const GRACE_DAYS = 90;

    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->timestamp('auction_notice_sent_at')->nullable()->after('grace_period_days');
        });
        Schema::table('items', function (Blueprint $table) {
            $table->date('auction_date')->nullable()->after('sale_price');
            $table->decimal('auction_price', 12, 2)->nullable()->after('auction_date');
        });

        $grace = DB::table('system_settings')->where('setting_key', 'grace_period_days')->value('setting_value');
        if (! is_numeric($grace) || (int) $grace < self::GRACE_DAYS) {
            DB::table('system_settings')->updateOrInsert(['setting_key' => 'grace_period_days'], ['setting_value' => (string) self::GRACE_DAYS, 'updated_at' => now(), 'created_at' => now()]);
        }
        if (! DB::table('system_settings')->where('setting_key', 'auction_notice_days')->exists()) {
            DB::table('system_settings')->insert(['setting_key' => 'auction_notice_days', 'setting_value' => '7', 'created_at' => now(), 'updated_at' => now()]);
        }

        DB::table('transactions')->where('status', 'active')->where('grace_period_days', '<', self::GRACE_DAYS)->update(['grace_period_days' => self::GRACE_DAYS]);
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('auction_notice_sent_at');
        });
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['auction_date', 'auction_price']);
        });
        DB::table('system_settings')->where('setting_key', 'auction_notice_days')->delete();
        // grace_period_days and the pawns' grace periods are left at 90: going
        // back to fewer days could forfeit an item the customer was promised.
    }
};
