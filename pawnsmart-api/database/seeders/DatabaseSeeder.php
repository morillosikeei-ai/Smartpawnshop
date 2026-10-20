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
        // due_soon_notice_days is how many days before a due date the customer
        // is told. value_change_notice_percent is how far an item's value must
        // move before the daily job writes a message, which keeps the bell from
        // filling up with small gold price steps. redemption_visit_days is how
        // long a confirmed redemption request is held for the customer.
        // renewal_term_days is how many days a confirmed GCash renewal adds to
        // a due date; it is separate from loan_term_days because staff still
        // set a new pawn's due date by hand. gcash_payment_info is the GCash
        // number or account name shown to the customer on the Renew Online
        // panel; the admin can change it from Admin settings.
        foreach (['current_gold_price' => '3560', 'risk_threshold_percent' => '10', 'jewelry_watch_phone_rate' => '5', 'bulky_item_rate' => '6', 'default_loan_to_value' => '70', 'loan_term_days' => '60', 'grace_period_days' => '7', 'due_soon_notice_days' => '5', 'value_change_notice_percent' => '5', 'redemption_visit_days' => '3', 'renewal_term_days' => '60', 'gcash_payment_info' => 'GCash 0970 885 6182', 'shop_open_days' => '1,2,3,4,5,6', 'shop_opens_at' => '09:00', 'shop_closes_at' => '18:00'] as $key => $value) {
            SystemSetting::updateOrCreate(['setting_key' => $key], ['setting_value' => $value]);
        }
    }
}
