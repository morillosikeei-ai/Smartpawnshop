<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * minimum_interest_days: the fewest days of interest a pawn is charged, even
 * when it is redeemed or renewed sooner (30 = one month). The row is added so
 * the admin sees it in Settings; an existing value is left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! DB::table('system_settings')->where('setting_key', 'minimum_interest_days')->exists()) {
            DB::table('system_settings')->insert([
                'setting_key' => 'minimum_interest_days',
                'setting_value' => '30',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->where('setting_key', 'minimum_interest_days')->delete();
    }
};
