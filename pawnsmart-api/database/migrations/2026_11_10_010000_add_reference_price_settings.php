<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reference prices the admin keeps for items with no market price feed:
 * pearl per gram, and a 1 carat natural diamond. Added empty, so the admin
 * sees them in Settings and fills in the shop's own figures.
 */
return new class extends Migration
{
    private const KEYS = ['pearl_price_per_gram', 'natural_diamond_1ct_price'];

    public function up(): void
    {
        foreach (self::KEYS as $key) {
            if (! DB::table('system_settings')->where('setting_key', $key)->exists()) {
                DB::table('system_settings')->insert(['setting_key' => $key, 'setting_value' => '0', 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->whereIn('setting_key', self::KEYS)->delete();
    }
};
