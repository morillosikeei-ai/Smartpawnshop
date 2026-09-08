<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

/**
 * Replaces the single global interest rate with one rate per item group, and
 * records the loan-to-value default the New Transaction form reads.
 *
 * default_interest_rate applied one rate to every item. The shop charges a
 * higher rate on bulky items, so the rate now depends on the item's group and
 * that key no longer means anything.
 */
return new class extends Migration
{
    /**
     * The rates in percent per month, keyed by setting.
     */
    private const NEW_SETTINGS = [
        'jewelry_watch_phone_rate' => '5',
        'bulky_item_rate' => '6',
        'default_loan_to_value' => '70',
    ];

    public function up(): void
    {
        foreach (self::NEW_SETTINGS as $key => $value) {
            SystemSetting::firstOrCreate(['setting_key' => $key], ['setting_value' => $value]);
        }

        SystemSetting::where('setting_key', 'default_interest_rate')->delete();
    }

    public function down(): void
    {
        // The old key held a fraction per month. Restore it from the jewelry
        // rate, which is the one it used to apply to every item.
        $jewelryRatePercent = SystemSetting::where('setting_key', 'jewelry_watch_phone_rate')->value('setting_value');

        SystemSetting::updateOrCreate(
            ['setting_key' => 'default_interest_rate'],
            ['setting_value' => (string) ((float) ($jewelryRatePercent ?? 5) / 100)]
        );

        SystemSetting::whereIn('setting_key', array_keys(self::NEW_SETTINGS))->delete();
    }
};
