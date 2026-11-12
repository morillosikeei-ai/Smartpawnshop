<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\GoldPrice;
use App\Models\Item;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The nightly lifecycle reads the gold price gold:update-price recorded; it
 * never saves the current_gold_price fallback setting as the day's price.
 */
class LifecycleGoldPriceTest extends TestCase
{
    use RefreshDatabase;

    private Item $ring;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-10 08:00:00');
        SystemSetting::updateOrCreate(['setting_key' => 'current_gold_price'], ['setting_value' => '3560']);
        GoldPrice::create(['price_date' => '2026-11-09', 'price_per_gram' => 8255.84, 'source' => 'api']);

        $staff = User::create(['name' => 'Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']);
        $user = User::create(['name' => 'Maria', 'email' => 'maria@example.test', 'password' => 'secret-password', 'role' => 'customer', 'status' => 'active']);
        $customer = Customer::create(['user_id' => $user->users_id, 'name' => 'Maria', 'contact_number' => '0917', 'valid_id_type' => 'UMID', 'valid_id_number' => 'X', 'registered_by_staff_id' => $staff->users_id]);
        $this->ring = Item::create(['customer_id' => $customer->customers_id, 'staff_id' => $staff->users_id, 'group' => Item::GROUP_JEWELRY, 'category' => 'ring', 'description' => 'Ring', 'karat' => '24k', 'weight_grams' => 1, 'condition' => 'good', 'appraised_value' => 8000, 'status' => 'active']);
        Transaction::create(['item_id' => $this->ring->items_id, 'customer_id' => $customer->customers_id, 'ticket_number' => 'PT-1', 'loan_amount' => 5000, 'interest_rate' => 0.05, 'loan_to_value_percent' => 70, 'due_date' => '2026-12-31', 'grace_period_days' => 90, 'status' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_it_values_jewelry_at_the_latest_recorded_price_and_records_no_price_of_its_own(): void
    {
        $this->artisan('pawnshop:daily-lifecycle')->assertSuccessful();

        $this->assertSame(1, GoldPrice::count(), 'No row for today: the fallback setting is not saved as a price.');
        $this->assertEqualsWithDelta(8255.84 * $this->ring->karatPurityPercent(), (float) $this->ring->fresh()->appraised_value, 0.01);
    }

    public function test_an_admin_price_is_recorded_as_a_manual_reading(): void
    {
        $this->artisan('pawnshop:daily-lifecycle', ['--price' => 8300])->assertSuccessful();

        $today = GoldPrice::whereDate('price_date', '2026-11-10')->firstOrFail();
        $this->assertEquals(8300, (float) $today->price_per_gram);
        $this->assertSame('manual', $today->source);
    }
}
