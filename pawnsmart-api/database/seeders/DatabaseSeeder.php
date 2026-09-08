<?php

namespace Database\Seeders;

use App\Models\GoldPrice;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::updateOrCreate(['email' => 'admin@smartpawn.ph'], ['name' => 'System Admin', 'password' => Hash::make('admin123'), 'role' => 'admin', 'status' => 'active']);
        User::updateOrCreate(['email' => 'staff@smartpawn.ph'], ['name' => 'Admin Staff', 'password' => Hash::make('staff123'), 'role' => 'staff', 'status' => 'active']);
        GoldPrice::updateOrCreate(['price_date' => today()], ['price_per_gram' => 3560, 'predicted_next_price' => 3560, 'source' => 'manual']);
        // jewelry_watch_phone_rate and bulky_item_rate are monthly interest
        // rates in percent. The rate applied to a transaction depends on the
        // group of the pawned item: jewelry and watches or cellphones share the
        // lower rate, bulky items carry the higher one.
        foreach (['current_gold_price' => '3560', 'risk_threshold_percent' => '10', 'jewelry_watch_phone_rate' => '5', 'bulky_item_rate' => '6', 'default_loan_to_value' => '70', 'loan_term_days' => '60', 'grace_period_days' => '7'] as $key => $value) {
            SystemSetting::updateOrCreate(['setting_key' => $key], ['setting_value' => $value]);
        }
    }
}
