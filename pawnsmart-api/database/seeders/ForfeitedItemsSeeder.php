<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Sample forfeited items listed for sale, so the landing page's
 * "Items for sale" section has something to show.
 *
 * Each item gets a forfeited pawn ticket, the same history a real listed item
 * has. Keyed on ticket number, so running it again updates instead of
 * duplicating.
 *
 * Run: php artisan db:seed --class=ForfeitedItemsSeeder
 */
class ForfeitedItemsSeeder extends Seeder
{
    public function run(): void
    {
        $staff = User::where('role', 'staff')->firstOrFail();

        $user = User::updateOrCreate(['email' => 'sample.customer@smartpawn.ph'], ['name' => 'Sample Customer', 'password' => Hash::make('customer123'), 'role' => 'customer', 'status' => 'active', 'is_activated' => true]);
        $customer = Customer::updateOrCreate(['user_id' => $user->users_id], ['name' => 'Sample Customer', 'contact_number' => '09171234567', 'address' => 'Sample address', 'valid_id_type' => 'National ID', 'valid_id_number' => 'SAMPLE-0001', 'registered_by_staff_id' => $staff->users_id]);

        $items = [
            ['ticket' => 'FF-SAMPLE-001', 'group' => 'jewelry', 'category' => 'necklace', 'description' => '18K Gold Rope Necklace', 'karat' => '18k', 'weight_grams' => 8.5, 'condition' => 'good', 'appraised_value' => 22500, 'loan_amount' => 15750, 'sale_price' => 24000],
            ['ticket' => 'FF-SAMPLE-002', 'group' => 'jewelry', 'category' => 'ring', 'description' => '14K Gold Ring with Small Stone', 'karat' => '14k', 'weight_grams' => 3.2, 'condition' => 'good', 'appraised_value' => 6500, 'loan_amount' => 4550, 'sale_price' => 7200],
            ['ticket' => 'FF-SAMPLE-003', 'group' => 'watch_phone', 'category' => 'cellphone', 'description' => 'iPhone 13 128GB, Midnight', 'brand_model' => 'Apple iPhone 13', 'condition' => 'good', 'appraised_value' => 18000, 'loan_amount' => 12600, 'sale_price' => 19500],
            ['ticket' => 'FF-SAMPLE-004', 'group' => 'watch_phone', 'category' => 'watch', 'description' => 'Seiko 5 Automatic Watch', 'brand_model' => 'Seiko 5 SNK809', 'condition' => 'fair', 'appraised_value' => 4500, 'loan_amount' => 3150, 'sale_price' => 5000],
            ['ticket' => 'FF-SAMPLE-005', 'group' => 'bulky', 'category' => 'laptop', 'description' => 'Lenovo IdeaPad 3, Ryzen 5, 8GB RAM', 'brand_model' => 'Lenovo IdeaPad 3', 'condition' => 'good', 'appraised_value' => 20000, 'loan_amount' => 14000, 'sale_price' => 21500],
            ['ticket' => 'FF-SAMPLE-006', 'group' => 'bulky', 'category' => 'game_console', 'description' => 'PlayStation 5 Disc Edition', 'brand_model' => 'Sony PS5', 'condition' => 'good', 'appraised_value' => 22000, 'loan_amount' => 15400, 'sale_price' => 23500],
        ];

        foreach ($items as $row) {
            $transaction = Transaction::where('ticket_number', $row['ticket'])->first();
            $itemData = [
                'customer_id' => $customer->customers_id,
                'staff_id' => $staff->users_id,
                'group' => $row['group'],
                'category' => $row['category'],
                'description' => $row['description'],
                'brand_model' => $row['brand_model'] ?? null,
                'karat' => $row['karat'] ?? null,
                'weight_grams' => $row['weight_grams'] ?? null,
                'condition' => $row['condition'],
                'appraised_value' => $row['appraised_value'],
                'sale_price' => $row['sale_price'],
                'status' => 'for_sale',
            ];

            $item = $transaction ? tap($transaction->item)->update($itemData) : Item::create($itemData);

            Transaction::updateOrCreate(['ticket_number' => $row['ticket']], [
                'item_id' => $item->items_id,
                'customer_id' => $customer->customers_id,
                'loan_amount' => $row['loan_amount'],
                'interest_rate' => $row['group'] === 'bulky' ? 6 : 5,
                'loan_to_value_percent' => 70,
                'due_date' => now()->subDays(90)->toDateString(),
                'grace_period_days' => 7,
                'status' => 'forfeited',
            ]);
        }
    }
}
